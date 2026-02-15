#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createVectorStore } from "@/vectors";
import { type ExperimentManager, getExperimentManager } from "./ab-testing";
import { getContextCache } from "./caching";
import { getProjectPath, loadConfigWithAutoDetect } from "./config";
import { TagTaxonomyStorage } from "./database/tag-taxonomy";
import {
  CachedEmbeddingClient,
  createEmbeddingClient,
} from "./embeddings/provider";
import { createStorageBackend } from "./storage/factory";
import type { IStorageBackend } from "./storage/interface";
import { TaxonomyManager } from "./tagging";
import { exportData, importData } from "./tools/backup";
import { importContent, initProject } from "./tools/bootstrap";
import {
  allocateBudget,
  getBudgetPresets,
  getModelWindows,
} from "./tools/budget";
import {
  analyzeImpact,
  batchUpdateSummaries,
  findImplementations,
  getCallGraph,
  getCodeNode,
  getDependencyTree,
  getUnsummarized,
  scanCode,
  stopCodeWatch,
  summarizeCode,
  updateNodeSummary,
} from "./tools/code";
import {
  benchmarkContextRetrieval,
  buildContextWithCache,
} from "./tools/context";
import {
  bulkReviewCrossLayer,
  getCodeForMemory,
  getCrossLayerSuggestions,
  getMemoriesForCode,
  reviewCrossLayerSuggestion,
  suggestRelations,
} from "./tools/cross-layer-relations";
import { mapExpertise, suggestReviewers } from "./tools/expertise";
import {
  generateChangelog,
  generateCommitMessage,
  generatePRDescription,
} from "./tools/git";
import {
  formatStatusResult,
  graphragBuild,
  graphragSearch,
  graphragStatus,
} from "./tools/graphrag";
import {
  deleteMemory,
  getMemory,
  searchMemory,
  storeMemory,
  updateMemory,
} from "./tools/memory";
import {
  approvePendingMemory,
  bulkApprovePendingMemories,
  bulkRejectPendingMemories,
  confirmMemory,
  getReviewQueue,
  getStorageMode,
  listPendingMemories,
  rejectPendingMemory,
  setStorageMode,
} from "./tools/memory/pending";
import { refreshConfidence } from "./tools/memory/refresh";
import { handleStaleness } from "./tools/memory/staleness";
import {
  deleteRelation,
  findPath,
  getRelatedMemories,
  linkMemories,
} from "./tools/memory-relations";
import {
  bulkReview,
  detectRelations,
  getSuggestions,
  reviewSuggestion,
} from "./tools/relation-detection";

// Initialize services
const projectPath = getProjectPath();
const config = await loadConfigWithAutoDetect(projectPath);

// Create storage backend from config
const storage: IStorageBackend = createStorageBackend(
  config.storage,
  projectPath,
);
await storage.initialize();

const vectors = createVectorStore(config.vector, projectPath);

// Create embedding client with caching layer
const baseEmbeddings = createEmbeddingClient(config.embedding);
const modelName =
  config.embedding.provider === "local" ? "local-tei" : config.embedding.model;
const embeddings = new CachedEmbeddingClient(
  baseEmbeddings,
  storage,
  modelName,
);

// Initialize vector store
await vectors.initialize();

// Initialize tag taxonomy with storage
const taxonomyStorage = new TagTaxonomyStorage(storage.getDatabase());
await TaxonomyManager.create(taxonomyStorage);
console.error("[doclea] Tag taxonomy initialized");

// Initialize A/B testing experiment manager (if configured)
let experimentManager: ExperimentManager | null = null;
if (config.abTesting?.enabled) {
  experimentManager = getExperimentManager(config.abTesting);
  await experimentManager.initialize(storage.getDatabase());
  console.error(
    `[doclea] A/B Testing enabled: ${config.abTesting.experiments.length} experiments`,
  );
}

console.log(
  `[doclea] Storage: ${storage.getBackendType()}, Mode: ${storage.getStorageMode()}`,
);

// Create MCP server using new API
const server = new McpServer({
  name: "doclea-mcp",
  version: "0.0.1",
});

// Memory type enum for reuse
const MemoryTypeEnum = z.enum([
  "decision",
  "solution",
  "pattern",
  "architecture",
  "note",
]);

// Register Memory tools
server.registerTool(
  "doclea_store",
  {
    title: "Store Memory",
    description:
      "Store a memory (decision, solution, pattern, architecture note, or general note) with semantic search capability",
    inputSchema: {
      type: MemoryTypeEnum.describe("Type of memory"),
      title: z.string().describe("Short title for the memory"),
      content: z.string().describe("Full content of the memory"),
      summary: z.string().optional().describe("Brief summary"),
      importance: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Importance score 0-1"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
      relatedFiles: z
        .array(z.string())
        .optional()
        .describe("Related file paths"),
      gitCommit: z.string().optional().describe("Related git commit hash"),
      sourcePr: z.string().optional().describe("Source PR number/link"),
      experts: z
        .array(z.string())
        .optional()
        .describe("Subject matter experts"),
    },
  },
  async (args) => {
    const result = await storeMemory(
      {
        ...args,
        importance: args.importance ?? 0.5,
        tags: args.tags ?? [],
        relatedFiles: args.relatedFiles ?? [],
        experts: args.experts ?? [],
      },
      storage,
      vectors,
      embeddings,
    );

    // Handle both committed and pending results
    if (result.status === "committed") {
      return {
        content: [
          { type: "text", text: JSON.stringify(result.memory, null, 2) },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "pending",
                pendingId: result.pendingId,
                message: result.message,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  },
);

server.registerTool(
  "doclea_search",
  {
    title: "Search Memories",
    description:
      "Search memories using natural language. Returns compact results with id, title, type, score, and preview. Use doclea_get with the memory ID to fetch full content.",
    inputSchema: {
      query: z.string().describe("Natural language search query"),
      type: MemoryTypeEnum.optional().describe("Filter by memory type"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Filter by tags (any match)"),
      minImportance: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum importance threshold"),
      limit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum results (default: 10)"),
    },
  },
  async (args) => {
    const startTime = performance.now();

    // Get scoring config from A/B testing (if enabled)
    const { scoringConfig, assignment } = experimentManager
      ? await experimentManager.getScoringConfigForRequest(args.query)
      : { scoringConfig: undefined, assignment: null };

    const results = await searchMemory(
      { ...args, limit: args.limit ?? 10 },
      storage,
      vectors,
      embeddings,
      scoringConfig,
    );

    // Record A/B testing metrics
    if (experimentManager && assignment) {
      const latencyMs = performance.now() - startTime;
      const topScore = results.length > 0 ? results[0].score : undefined;
      await experimentManager.recordMetrics(
        assignment,
        args.query,
        latencyMs,
        results.length,
        topScore,
      );
    }

    // Return compact results - just enough to identify and decide
    const compactResults = results.map((r) => {
      const preview =
        r.memory.summary ||
        (r.memory.content.length > 150
          ? `${r.memory.content.slice(0, 150)}...`
          : r.memory.content);
      return {
        id: r.memory.id,
        type: r.memory.type,
        title: r.memory.title,
        score: Math.round(r.score * 100) / 100,
        preview,
        tags: r.memory.tags,
      };
    });

    return {
      content: [
        { type: "text", text: JSON.stringify(compactResults, null, 2) },
      ],
    };
  },
);

server.registerTool(
  "doclea_get",
  {
    title: "Get Memory",
    description: "Get a specific memory by ID",
    inputSchema: {
      id: z.string().describe("Memory ID"),
    },
  },
  async (args) => {
    const memory = getMemory(args, storage);
    if (!memory) {
      return {
        content: [{ type: "text", text: "Memory not found" }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(memory, null, 2) }],
    };
  },
);

server.registerTool(
  "doclea_update",
  {
    title: "Update Memory",
    description: "Update an existing memory",
    inputSchema: {
      id: z.string().describe("Memory ID to update"),
      type: MemoryTypeEnum.optional(),
      title: z.string().optional(),
      content: z.string().optional(),
      summary: z.string().optional(),
      importance: z.number().min(0).max(1).optional(),
      tags: z.array(z.string()).optional(),
      relatedFiles: z.array(z.string()).optional(),
    },
  },
  async (args) => {
    const memory = await updateMemory(args, storage, vectors, embeddings);
    if (!memory) {
      return {
        content: [{ type: "text", text: "Memory not found" }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(memory, null, 2) }],
    };
  },
);

server.registerTool(
  "doclea_delete",
  {
    title: "Delete Memory",
    description: "Delete a memory by ID",
    inputSchema: {
      id: z.string().describe("Memory ID to delete"),
    },
  },
  async (args) => {
    const deleted = await deleteMemory(args, storage, vectors);
    return {
      content: [
        {
          type: "text",
          text: deleted ? "Deleted successfully" : "Memory not found",
        },
      ],
    };
  },
);

// Register Git tools
server.registerTool(
  "doclea_commit_message",
  {
    title: "Generate Commit Message",
    description:
      "Generate a conventional commit message from staged changes or provided diff",
    inputSchema: {
      diff: z
        .string()
        .optional()
        .describe("Git diff to analyze. Uses staged changes if not provided."),
      projectPath: z.string().optional().describe("Project path"),
    },
  },
  async (args) => {
    const result = await generateCommitMessage(
      args,
      storage,
      vectors,
      embeddings,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "doclea_pr_description",
  {
    title: "Generate PR Description",
    description:
      "Generate a PR description from branch changes with context from memories and reviewer suggestions",
    inputSchema: {
      branch: z.string().optional().describe("Current branch name"),
      base: z.string().optional().describe("Base branch to compare against"),
      projectPath: z.string().optional().describe("Project path"),
    },
  },
  async (args) => {
    const result = await generatePRDescription(
      {
        ...args,
        base: args.base ?? "main",
      },
      storage,
      vectors,
      embeddings,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "doclea_changelog",
  {
    title: "Generate Changelog",
    description:
      "Generate a changelog between two git refs. Supports developer (technical) and user (friendly) formats with automatic version detection and issue extraction.",
    inputSchema: {
      fromRef: z.string().describe("Starting git ref (tag, commit, branch)"),
      toRef: z.string().optional().describe("Ending git ref (default: HEAD)"),
      projectPath: z.string().optional().describe("Project path"),
      format: z
        .enum(["markdown", "json"])
        .optional()
        .describe("Output format (default: markdown)"),
      audience: z
        .enum(["developers", "users"])
        .optional()
        .describe(
          "Target audience - developers get technical details, users get friendly summaries (default: developers)",
        ),
    },
  },
  async (args) => {
    const result = await generateChangelog({
      ...args,
      toRef: args.toRef ?? "HEAD",
      format: args.format ?? "markdown",
      audience: args.audience ?? "developers",
    });

    // Return markdown or full JSON based on format
    if (args.format === "json") {
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
    return { content: [{ type: "text", text: result.markdown }] };
  },
);

// Register Expertise tools
server.registerTool(
  "doclea_expertise",
  {
    title: "Map Expertise",
    description:
      "Map codebase expertise from git history. Shows who knows what, identifies bus factor risks, and provides actionable recommendations for knowledge transfer.",
    inputSchema: {
      path: z.string().optional().describe("Specific path to analyze"),
      projectPath: z.string().optional().describe("Project path"),
      depth: z
        .number()
        .min(1)
        .max(5)
        .optional()
        .describe("Directory depth to analyze (default: 2)"),
      includeStale: z
        .boolean()
        .optional()
        .describe(
          "Include paths with no recent activity >6 months (default: true)",
        ),
      busFactorThreshold: z
        .number()
        .min(50)
        .max(100)
        .optional()
        .describe("Percentage threshold for bus factor risk (default: 80)"),
    },
  },
  async (args) => {
    const result = await mapExpertise({
      ...args,
      depth: args.depth ?? 2,
      includeStale: args.includeStale ?? true,
      busFactorThreshold: args.busFactorThreshold ?? 80,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "doclea_suggest_reviewers",
  {
    title: "Suggest Reviewers",
    description:
      "Suggest PR reviewers based on file expertise and ownership. Returns required reviewers (primary experts) and optional reviewers (secondary contributors), with explanations for each suggestion. Also identifies files with no clear owner.",
    inputSchema: {
      files: z.array(z.string()).describe("List of changed files"),
      projectPath: z.string().optional().describe("Project path"),
      excludeAuthors: z
        .array(z.string())
        .optional()
        .describe("Authors to exclude (e.g., PR author)"),
      limit: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum reviewers to suggest (default: 3)"),
    },
  },
  async (args) => {
    const result = await suggestReviewers({
      ...args,
      excludeAuthors: args.excludeAuthors ?? [],
      limit: args.limit ?? 3,
    });
    // Return the summary for quick view, full JSON for structured access
    return {
      content: [
        { type: "text", text: result.summary },
        { type: "text", text: "\n\n---\n\n" },
        { type: "text", text: JSON.stringify(result, null, 2) },
      ],
    };
  },
);

// Register Bootstrap tools
server.registerTool(
  "doclea_init",
  {
    title: "Initialize Doclea",
    description:
      "Initialize Doclea for a project. Scans codebase, git history, and docs to bootstrap memories. Detects project stack (framework, database, auth, testing) and extracts decisions from commits.",
    inputSchema: {
      projectPath: z.string().optional().describe("Project path"),
      scanGit: z.boolean().optional().describe("Scan git history"),
      scanDocs: z.boolean().optional().describe("Scan markdown files"),
      scanCode: z.boolean().optional().describe("Scan code for patterns"),
      scanCommits: z
        .number()
        .min(10)
        .max(2000)
        .optional()
        .describe("Number of commits to scan (default: 500)"),
      dryRun: z.boolean().optional().describe("Preview without storing"),
    },
  },
  async (args) => {
    const result = await initProject(
      {
        ...args,
        scanGit: args.scanGit ?? true,
        scanDocs: args.scanDocs ?? true,
        scanCode: args.scanCode ?? true,
        scanCommits: args.scanCommits ?? 500,
        dryRun: args.dryRun ?? false,
      },
      storage,
      vectors,
      embeddings,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "doclea_import",
  {
    title: "Import Content",
    description:
      "Import content from markdown files or ADRs (Architecture Decision Records)",
    inputSchema: {
      source: z.enum(["markdown", "adr"]).describe("Import source type"),
      path: z.string().describe("Path to import from"),
      projectPath: z.string().optional().describe("Project path"),
      recursive: z
        .boolean()
        .optional()
        .describe("Recursively scan directories"),
      dryRun: z.boolean().optional().describe("Preview without storing"),
    },
  },
  async (args) => {
    const result = await importContent(
      {
        ...args,
        recursive: args.recursive ?? true,
        dryRun: args.dryRun ?? false,
      },
      storage,
      vectors,
      embeddings,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

// Register Code Scanning tools
server.registerTool(
  "doclea_scan_code",
  {
    title: "Scan Code",
    description:
      "Scan source code to build a knowledge graph (KAG) of functions, classes, interfaces, and their relationships. Supports incremental updates and optional file watching. Extracts heuristic summaries from JSDoc/docstrings automatically.",
    inputSchema: {
      patterns: z
        .array(z.string())
        .optional()
        .describe(
          "Glob patterns to scan (default: **/*.{ts,tsx,js,jsx,py,go,rs})",
        ),
      exclude: z
        .array(z.string())
        .optional()
        .describe(
          "Patterns to exclude. Defaults: node_modules, .git, dist, build, .next, coverage, .turbo, .cache, *.d.ts, *.min.js, lock files, etc.",
        ),
      incremental: z
        .boolean()
        .default(true)
        .describe("Only scan changed files (true) or full scan (false)"),
      watch: z
        .boolean()
        .default(false)
        .describe("Start file watcher for continuous updates"),
      extractSummaries: z
        .boolean()
        .default(true)
        .describe("Extract summaries from JSDoc/docstrings"),
      batchSize: z
        .number()
        .default(50)
        .describe(
          "Number of files to process per batch (default: 50). Lower for large repos to prevent timeout.",
        ),
      maxFiles: z
        .number()
        .optional()
        .describe("Maximum files to scan (for testing on huge repos)"),
      projectPath: z
        .string()
        .optional()
        .describe(
          "Project root path to scan. Defaults to the initialized project path.",
        ),
    },
  },
  async (args) => {
    try {
      // Use provided projectPath or the initialized project path
      const scanPath = args.projectPath || projectPath;
      console.log(`[doclea_scan_code] Using project path: ${scanPath}`);
      const result = await scanCode(
        {
          patterns: args.patterns,
          exclude: args.exclude,
          incremental: args.incremental ?? true,
          watch: args.watch ?? false,
          extractSummaries: args.extractSummaries ?? true,
          batchSize: args.batchSize ?? 50,
          maxFiles: args.maxFiles ?? 500, // Default limit to prevent timeouts
          projectPath: scanPath,
          useScip: true,
        },
        storage.getDatabase(),
        vectors,
        embeddings,
      );
      return {
        content: [
          { type: "text", text: result.message },
          { type: "text", text: "\n\n" },
          { type: "text", text: JSON.stringify(result.result?.stats, null, 2) },
        ],
      };
    } catch (error) {
      console.error("[doclea_scan_code] Error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Scan failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "doclea_stop_watch",
  {
    title: "Stop Code Watcher",
    description: "Stop the file watcher started by doclea_scan_code",
    inputSchema: {},
  },
  async () => {
    const result = await stopCodeWatch();
    return {
      content: [{ type: "text", text: result.message }],
    };
  },
);

server.registerTool(
  "doclea_get_code_node",
  {
    title: "Get Code Node",
    description:
      "Get code nodes (functions, classes, interfaces) by ID, name, or file path. Returns detailed information including signature, summary, and location.",
    inputSchema: {
      nodeId: z
        .string()
        .optional()
        .describe("Node ID (e.g., 'src/api.ts:function:getUserData')"),
      name: z
        .string()
        .optional()
        .describe("Search by node name (e.g., 'getUserData')"),
      filePath: z.string().optional().describe("Get all nodes from a file"),
    },
  },
  async (args) => {
    const result = await getCodeNode(
      {
        nodeId: args.nodeId,
        name: args.name,
        filePath: args.filePath,
      },
      storage.getDatabase(),
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n" },
        { type: "text", text: JSON.stringify(result.nodes, null, 2) },
      ],
    };
  },
);

server.registerTool(
  "doclea_update_code_summary",
  {
    title: "Update Code Summary",
    description:
      "Update the summary for a code node with an AI-generated summary. This allows the LLM client to provide enhanced summaries beyond the heuristic extraction.",
    inputSchema: {
      nodeId: z
        .string()
        .describe(
          "ID of the code node (e.g., 'src/api.ts:function:getUserData')",
        ),
      summary: z
        .string()
        .describe("AI-generated summary provided by the LLM client"),
    },
  },
  async (args) => {
    const result = await updateNodeSummary(
      {
        nodeId: args.nodeId,
        summary: args.summary,
      },
      storage.getDatabase(),
    );
    if (!result.success) {
      return {
        content: [{ type: "text", text: result.message }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: result.message }],
    };
  },
);

server.registerTool(
  "doclea_call_graph",
  {
    title: "Get Call Graph",
    description:
      "Get the call graph for a function or class. Shows what calls this node and what it calls, up to a specified depth. Useful for understanding code dependencies and impact analysis.",
    inputSchema: {
      nodeId: z.string().optional().describe("Node ID to start from"),
      functionName: z
        .string()
        .optional()
        .describe("Function name to search for"),
      depth: z
        .number()
        .min(1)
        .max(5)
        .default(2)
        .describe("How many levels deep to traverse"),
      direction: z
        .enum(["outgoing", "incoming", "both"])
        .default("both")
        .describe(
          "Direction: 'outgoing' (what this calls), 'incoming' (what calls this), 'both'",
        ),
    },
  },
  async (args) => {
    const result = await getCallGraph(
      {
        nodeId: args.nodeId,
        functionName: args.functionName,
        depth: args.depth ?? 2,
        direction: args.direction ?? "both",
      },
      storage.getDatabase(),
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n" },
        { type: "text", text: JSON.stringify(result.graph, null, 2) },
      ],
    };
  },
);

server.registerTool(
  "doclea_find_implementations",
  {
    title: "Find Implementations",
    description:
      "Find all classes that implement a given interface. Useful for understanding polymorphism and interface usage across the codebase.",
    inputSchema: {
      interfaceName: z
        .string()
        .describe("Name of the interface to find implementations for"),
      interfaceId: z
        .string()
        .optional()
        .describe("Direct interface node ID if known"),
    },
  },
  async (args) => {
    const result = await findImplementations(
      {
        interfaceName: args.interfaceName,
        interfaceId: args.interfaceId,
      },
      storage.getDatabase(),
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n" },
        { type: "text", text: JSON.stringify(result.implementations, null, 2) },
      ],
    };
  },
);

server.registerTool(
  "doclea_dependency_tree",
  {
    title: "Get Dependency Tree",
    description:
      "Show the import dependency tree for a module. Can show what a module imports, what imports the module, or both directions.",
    inputSchema: {
      modulePath: z.string().optional().describe("File path of the module"),
      moduleId: z.string().optional().describe("Module node ID if known"),
      depth: z
        .number()
        .min(1)
        .max(10)
        .default(3)
        .describe("How many levels deep to traverse"),
      direction: z
        .enum(["imports", "importedBy", "both"])
        .default("imports")
        .describe(
          "Direction: 'imports' (what this imports), 'importedBy' (what imports this), 'both'",
        ),
    },
  },
  async (args) => {
    const result = await getDependencyTree(
      {
        modulePath: args.modulePath,
        moduleId: args.moduleId,
        depth: args.depth ?? 3,
        direction: args.direction ?? "imports",
      },
      storage.getDatabase(),
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n" },
        { type: "text", text: JSON.stringify(result.tree, null, 2) },
      ],
    };
  },
);

server.registerTool(
  "doclea_impact_analysis",
  {
    title: "Analyze Impact",
    description:
      "Analyze what would break if a node is changed. Shows all dependent nodes, the type of dependency, and severity of potential breaking changes. Answers 'what breaks if I change this?'",
    inputSchema: {
      nodeId: z.string().optional().describe("Node ID to analyze impact for"),
      functionName: z
        .string()
        .optional()
        .describe("Function/class name to analyze"),
      depth: z
        .number()
        .min(1)
        .max(5)
        .default(3)
        .describe("How many levels deep to analyze"),
    },
  },
  async (args) => {
    const result = await analyzeImpact(
      {
        nodeId: args.nodeId,
        functionName: args.functionName,
        depth: args.depth ?? 3,
      },
      storage.getDatabase(),
    );
    const breakingChangesText =
      result.result.breakingChanges.length > 0
        ? `\n\n**Breaking Changes:**\n${result.result.breakingChanges
            .map(
              (c) =>
                `- [${c.severity.toUpperCase()}] ${c.node.name}: ${c.reason}`,
            )
            .join("\n")}`
        : "";
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: breakingChangesText },
        { type: "text", text: "\n\n---\n\n" },
        { type: "text", text: JSON.stringify(result.result, null, 2) },
      ],
    };
  },
);

// Register Code Summary tools
server.registerTool(
  "doclea_summarize_code",
  {
    title: "Summarize Code",
    description:
      "Run heuristic summarization on code files and identify nodes that need AI-generated summaries. Returns a list of nodes with their code for the host LLM to generate summaries. Use batch_update_summaries to store the generated summaries.",
    inputSchema: {
      filePath: z.string().optional().describe("Specific file to process"),
      directory: z
        .string()
        .optional()
        .describe("Directory to scan for code files"),
      patterns: z
        .array(z.string())
        .optional()
        .describe("Glob patterns for files (e.g., ['**/*.ts', '**/*.js'])"),
      strategy: z
        .enum(["heuristic", "hybrid"])
        .default("hybrid")
        .describe(
          "Strategy: 'heuristic' (extract from docs only) or 'hybrid' (extract + flag for AI)",
        ),
      forceRegenerate: z
        .boolean()
        .default(false)
        .describe("Regenerate existing summaries"),
      preferAiForExported: z
        .boolean()
        .default(true)
        .describe("Flag exported/public APIs for AI summarization"),
    },
  },
  async (args) => {
    const result = await summarizeCode(
      {
        filePath: args.filePath,
        directory: args.directory,
        patterns: args.patterns,
        strategy: args.strategy ?? "hybrid",
        forceRegenerate: args.forceRegenerate ?? false,
        preferAiForExported: args.preferAiForExported ?? true,
      },
      storage.getDatabase(),
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n**Stats:**\n" },
        { type: "text", text: JSON.stringify(result.stats, null, 2) },
        ...(result.needsAiSummary.length > 0
          ? [
              {
                type: "text" as const,
                text: "\n\n**Nodes Needing AI Summary:**\n",
              },
              {
                type: "text" as const,
                text: JSON.stringify(result.needsAiSummary, null, 2),
              },
            ]
          : []),
      ],
    };
  },
);

server.registerTool(
  "doclea_get_unsummarized",
  {
    title: "Get Unsummarized Nodes",
    description:
      "Get code nodes that need AI-generated summaries. Returns nodes with their code content for the host LLM to analyze and generate summaries. Use batch_update_summaries to store the results.",
    inputSchema: {
      filePath: z.string().optional().describe("Filter by file path"),
      limit: z
        .number()
        .min(1)
        .max(50)
        .default(10)
        .describe("Max nodes to return (default: 10)"),
      includeCode: z
        .boolean()
        .default(true)
        .describe("Include code content for AI summarization"),
      confidenceThreshold: z
        .number()
        .min(0)
        .max(1)
        .default(0.6)
        .describe("Return nodes with confidence below this threshold"),
    },
  },
  async (args) => {
    const result = await getUnsummarized(
      {
        filePath: args.filePath,
        limit: args.limit ?? 10,
        includeCode: args.includeCode ?? true,
        confidenceThreshold: args.confidenceThreshold ?? 0.6,
      },
      storage.getDatabase(),
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: `\nTotal needing summaries: ${result.total}` },
        { type: "text", text: "\n\n**Nodes:**\n" },
        { type: "text", text: JSON.stringify(result.nodes, null, 2) },
      ],
    };
  },
);

server.registerTool(
  "doclea_batch_update_summaries",
  {
    title: "Batch Update Summaries",
    description:
      "Update summaries for multiple code nodes at once. Use this after generating AI summaries for nodes returned by doclea_summarize_code or doclea_get_unsummarized.",
    inputSchema: {
      summaries: z
        .array(
          z.object({
            nodeId: z.string().describe("Node ID to update"),
            summary: z.string().describe("AI-generated summary"),
          }),
        )
        .min(1)
        .max(50)
        .describe("Array of node summaries to update (1-50 items)"),
    },
  },
  async (args) => {
    const result = await batchUpdateSummaries(
      {
        summaries: args.summaries,
      },
      storage.getDatabase(),
    );
    return {
      content: [{ type: "text", text: result.message }],
    };
  },
);

// Register Context Building tool
server.registerTool(
  "doclea_context",
  {
    title: "Build Context",
    description:
      "Build formatted context from RAG (semantic search), KAG (code relationships), and GraphRAG (entity/community graph) within a token budget. Returns markdown-formatted context ready for LLM consumption.",
    inputSchema: {
      query: z.string().describe("Search query to find relevant context"),
      tokenBudget: z
        .number()
        .min(100)
        .max(100000)
        .default(4000)
        .describe("Maximum tokens for assembled context"),
      includeCodeGraph: z
        .boolean()
        .default(true)
        .describe("Include code relationships from KAG"),
      includeGraphRAG: z
        .boolean()
        .default(true)
        .describe("Include GraphRAG entity and community relationships"),
      filters: z
        .object({
          type: z
            .enum(["decision", "solution", "pattern", "architecture", "note"])
            .optional(),
          tags: z.array(z.string()).optional(),
          minImportance: z.number().min(0).max(1).optional(),
        })
        .optional()
        .describe("Filters for memory search"),
      template: z
        .enum(["default", "compact", "detailed"])
        .default("default")
        .describe("Output format template"),
      includeEvidence: z
        .boolean()
        .default(false)
        .describe(
          "Include section-level evidence explaining why each chunk was selected",
        ),
    },
  },
  async (args) => {
    const result = await buildContextWithCache(
      {
        query: args.query,
        tokenBudget: args.tokenBudget ?? 4000,
        includeCodeGraph: args.includeCodeGraph ?? true,
        includeGraphRAG: args.includeGraphRAG ?? true,
        filters: args.filters,
        template: args.template ?? "default",
        includeEvidence: args.includeEvidence ?? false,
      },
      storage,
      vectors,
      embeddings,
      config.cache,
      config.scoring,
    );

    const content = [
      { type: "text" as const, text: result.context },
      { type: "text" as const, text: "\n\n---\n\n" },
      {
        type: "text" as const,
        text: `**Metadata**: ${JSON.stringify(result.metadata, null, 2)}`,
      },
    ];

    if (args.includeEvidence && result.evidence) {
      content.push({ type: "text" as const, text: "\n\n**Evidence**:\n" });
      content.push({
        type: "text" as const,
        text: JSON.stringify(result.evidence, null, 2),
      });
    }

    return {
      content,
    };
  },
);

// Register Memory Relationship tools
server.registerTool(
  "doclea_link_memories",
  {
    title: "Link Memories",
    description:
      "Create a typed relationship between two memories. Enables knowledge graph traversal and advanced context building through memory connections.",
    inputSchema: {
      sourceId: z.string().describe("Source memory ID"),
      targetId: z.string().describe("Target memory ID"),
      type: z
        .enum([
          "references",
          "implements",
          "extends",
          "related_to",
          "supersedes",
          "requires",
        ])
        .describe("Type of relationship"),
      weight: z
        .number()
        .min(0)
        .max(1)
        .default(1.0)
        .describe("Relationship strength (0-1)"),
      metadata: z
        .record(z.string(), z.any())
        .optional()
        .describe("Optional metadata about the relationship"),
    },
  },
  async (args) => {
    const result = await linkMemories(
      {
        sourceId: args.sourceId,
        targetId: args.targetId,
        type: args.type,
        weight: args.weight ?? 1.0,
        metadata: args.metadata,
      },
      storage.getDatabase(),
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n" },
        { type: "text", text: JSON.stringify(result.relation, null, 2) },
      ],
    };
  },
);

server.registerTool(
  "doclea_get_related",
  {
    title: "Get Related Memories",
    description:
      "Get memories related to a given memory through the knowledge graph. Traverses typed relationships up to specified depth.",
    inputSchema: {
      memoryId: z.string().describe("Memory ID to find relations for"),
      depth: z
        .number()
        .min(1)
        .max(5)
        .default(2)
        .describe("How many relationship hops to traverse"),
      relationTypes: z
        .array(
          z.enum([
            "references",
            "implements",
            "extends",
            "related_to",
            "supersedes",
            "requires",
          ]),
        )
        .optional()
        .describe("Filter by specific relation types"),
      direction: z
        .enum(["outgoing", "incoming", "both"])
        .default("both")
        .describe("Direction of relationships to follow"),
    },
  },
  async (args) => {
    const result = await getRelatedMemories(
      {
        memoryId: args.memoryId,
        depth: args.depth ?? 2,
        relationTypes: args.relationTypes,
        direction: args.direction ?? "both",
      },
      storage.getDatabase(),
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n" },
        { type: "text", text: JSON.stringify(result.graph, null, 2) },
      ],
    };
  },
);

server.registerTool(
  "doclea_find_path",
  {
    title: "Find Path Between Memories",
    description:
      "Find the shortest path between two memories in the knowledge graph. Useful for understanding how concepts are connected.",
    inputSchema: {
      sourceId: z.string().describe("Starting memory ID"),
      targetId: z.string().describe("Target memory ID"),
      maxDepth: z
        .number()
        .min(1)
        .max(10)
        .default(5)
        .describe("Maximum path length to search"),
    },
  },
  async (args) => {
    const result = await findPath(
      {
        sourceId: args.sourceId,
        targetId: args.targetId,
        maxDepth: args.maxDepth ?? 5,
      },
      storage.getDatabase(),
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n" },
        {
          type: "text",
          text: result.path
            ? `Path: ${result.path.join(" → ")}`
            : "No path found",
        },
      ],
    };
  },
);

server.registerTool(
  "doclea_unlink_memories",
  {
    title: "Unlink Memories",
    description: "Delete a relationship between two memories",
    inputSchema: {
      relationId: z.string().describe("Relationship ID to delete"),
    },
  },
  async (args) => {
    const result = await deleteRelation(
      {
        relationId: args.relationId,
      },
      storage.getDatabase(),
    );
    return {
      content: [{ type: "text", text: result.message }],
    };
  },
);

// Register Token Budget tools
server.registerTool(
  "doclea_allocate_budget",
  {
    title: "Allocate Token Budget",
    description:
      "Allocate token budget across categories (system, context, user, response) for optimal LLM usage. Supports model presets, custom ratios, and constraints. Returns allocation with warnings about budget limits.",
    inputSchema: {
      totalBudget: z
        .number()
        .min(100)
        .optional()
        .describe("Total token budget (or use modelName)"),
      modelName: z
        .enum([
          "gpt-4-turbo",
          "gpt-4",
          "gpt-3.5-turbo",
          "claude-opus",
          "claude-sonnet",
          "claude-haiku",
          "llama-3-70b",
          "llama-3-8b",
          "mistral-medium",
          "mixtral-8x7b",
        ])
        .optional()
        .describe("Model name (auto-detects context window)"),
      preset: z
        .enum(["balanced", "contextHeavy", "conservative", "chat"])
        .default("balanced")
        .describe("Budget allocation preset"),
      customRatios: z
        .object({
          system: z.number().min(0).max(1).optional(),
          context: z.number().min(0).max(1).optional(),
          user: z.number().min(0).max(1).optional(),
          response: z.number().min(0).max(1).optional(),
        })
        .optional()
        .describe("Custom ratios (must sum to 1.0)"),
      minimums: z
        .object({
          system: z.number().min(0).optional(),
          context: z.number().min(0).optional(),
          user: z.number().min(0).optional(),
          response: z.number().min(0).optional(),
        })
        .optional()
        .describe("Minimum tokens per category"),
      maximums: z
        .object({
          system: z.number().min(0).optional(),
          context: z.number().min(0).optional(),
          user: z.number().min(0).optional(),
          response: z.number().min(0).optional(),
        })
        .optional()
        .describe("Maximum tokens per category"),
    },
  },
  async (args) => {
    const result = await allocateBudget({
      totalBudget: args.totalBudget,
      modelName: args.modelName,
      preset: args.preset ?? "balanced",
      customRatios: args.customRatios,
      minimums: args.minimums,
      maximums: args.maximums,
    });
    return {
      content: [
        {
          type: "text",
          text: `**Budget Allocation (${result.config.preset})**\n\n`,
        },
        {
          type: "text",
          text: `Total: ${result.config.totalBudget.toLocaleString()} tokens\n\n`,
        },
        {
          type: "text",
          text: `**Allocated:**\n- System: ${result.allocation.allocated.system.toLocaleString()} tokens (${Math.round(result.config.ratios.system * 100)}%)\n- Context: ${result.allocation.allocated.context.toLocaleString()} tokens (${Math.round(result.config.ratios.context * 100)}%)\n- User: ${result.allocation.allocated.user.toLocaleString()} tokens (${Math.round(result.config.ratios.user * 100)}%)\n- Response: ${result.allocation.allocated.response.toLocaleString()} tokens (${Math.round(result.config.ratios.response * 100)}%)\n\n`,
        },
        {
          type: "text",
          text: `Utilization: ${(result.allocation.utilization * 100).toFixed(1)}%\n`,
        },
        {
          type: "text",
          text:
            result.allocation.warnings.length > 0
              ? `\n**Warnings:**\n${result.allocation.warnings.map((w) => `- ${w}`).join("\n")}\n`
              : "",
        },
        { type: "text", text: "\n\n---\n\n" },
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

server.registerTool(
  "doclea_model_windows",
  {
    title: "Get Model Context Windows",
    description:
      "Get available model context window sizes. Useful for understanding token limits when allocating budgets.",
    inputSchema: {},
  },
  async () => {
    const result = await getModelWindows({});
    return {
      content: [
        {
          type: "text",
          text: "**Available Model Context Windows:**\n\n",
        },
        {
          type: "text",
          text: result.models
            .map(
              (m) => `- ${m.name}: ${m.contextWindow.toLocaleString()} tokens`,
            )
            .join("\n"),
        },
        { type: "text", text: "\n\n---\n\n" },
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

server.registerTool(
  "doclea_budget_presets",
  {
    title: "Get Budget Presets",
    description:
      "Get available budget allocation presets with example allocations for a given total budget. Shows balanced, context-heavy, conservative, and chat-optimized configurations.",
    inputSchema: {
      totalBudget: z
        .number()
        .min(100)
        .default(100000)
        .describe("Total token budget"),
    },
  },
  async (args) => {
    const result = await getBudgetPresets({
      totalBudget: args.totalBudget ?? 100000,
    });

    const formatPreset = (
      name: string,
      data: {
        ratios: Record<string, number>;
        allocation: { allocated: Record<string, number> };
      },
    ) => {
      return `**${name}**
- System: ${data.allocation.allocated.system.toLocaleString()} tokens (${Math.round(data.ratios.system * 100)}%)
- Context: ${data.allocation.allocated.context.toLocaleString()} tokens (${Math.round(data.ratios.context * 100)}%)
- User: ${data.allocation.allocated.user.toLocaleString()} tokens (${Math.round(data.ratios.user * 100)}%)
- Response: ${data.allocation.allocated.response.toLocaleString()} tokens (${Math.round(data.ratios.response * 100)}%)`;
    };

    return {
      content: [
        {
          type: "text",
          text: `**Budget Presets** (${args.totalBudget?.toLocaleString() ?? "100,000"} tokens)\n\n`,
        },
        {
          type: "text",
          text: formatPreset("Balanced", result.presets.balanced),
        },
        { type: "text", text: "\n\n" },
        {
          type: "text",
          text: formatPreset("Context-Heavy", result.presets.contextHeavy),
        },
        { type: "text", text: "\n\n" },
        {
          type: "text",
          text: formatPreset("Conservative", result.presets.conservative),
        },
        { type: "text", text: "\n\n" },
        {
          type: "text",
          text: formatPreset("Chat", result.presets.chat),
        },
        { type: "text", text: "\n\n---\n\n" },
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

// Register Relation Detection tools
server.registerTool(
  "doclea_detect_relations",
  {
    title: "Detect Relations",
    description:
      "Automatically detect and suggest relationships between memories using semantic similarity, keyword overlap, file path overlap, and temporal proximity. High-confidence relations (≥0.85) are auto-approved; medium-confidence (0.6-0.85) stored as suggestions.",
    inputSchema: {
      memoryId: z.string().describe("Memory ID to detect relations for"),
      semanticThreshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum semantic similarity (default: 0.75)"),
      autoApproveThreshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Confidence threshold for auto-approval (default: 0.85)"),
    },
  },
  async (args) => {
    const result = await detectRelations(
      {
        memoryId: args.memoryId,
        semanticThreshold: args.semanticThreshold,
        autoApproveThreshold: args.autoApproveThreshold,
      },
      storage,
      vectors,
      embeddings,
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n" },
        { type: "text", text: JSON.stringify(result.result, null, 2) },
      ],
    };
  },
);

server.registerTool(
  "doclea_get_suggestions",
  {
    title: "Get Relation Suggestions",
    description:
      "Get pending relation suggestions for review. Filter by source/target memory, detection method, or minimum confidence.",
    inputSchema: {
      sourceId: z.string().optional().describe("Filter by source memory ID"),
      targetId: z.string().optional().describe("Filter by target memory ID"),
      detectionMethod: z
        .enum(["semantic", "keyword", "file_overlap", "temporal"])
        .optional()
        .describe("Filter by detection method"),
      minConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum confidence score"),
      limit: z.number().min(1).max(100).default(20).describe("Maximum results"),
      offset: z.number().min(0).default(0).describe("Offset for pagination"),
    },
  },
  async (args) => {
    const result = await getSuggestions(
      {
        sourceId: args.sourceId,
        targetId: args.targetId,
        detectionMethod: args.detectionMethod,
        minConfidence: args.minConfidence,
        limit: args.limit ?? 20,
        offset: args.offset ?? 0,
      },
      storage.getDatabase(),
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n" },
        { type: "text", text: JSON.stringify(result.suggestions, null, 2) },
      ],
    };
  },
);

server.registerTool(
  "doclea_review_suggestion",
  {
    title: "Review Relation Suggestion",
    description:
      "Approve or reject a single relation suggestion. Approved suggestions create relations; rejected suggestions are marked as such.",
    inputSchema: {
      suggestionId: z.string().describe("Suggestion ID to review"),
      action: z.enum(["approve", "reject"]).describe("Action to take"),
    },
  },
  async (args) => {
    const result = await reviewSuggestion(
      {
        suggestionId: args.suggestionId,
        action: args.action,
      },
      storage.getDatabase(),
    );
    return {
      content: [{ type: "text", text: result.message }],
    };
  },
);

server.registerTool(
  "doclea_bulk_review",
  {
    title: "Bulk Review Suggestions",
    description:
      "Approve or reject multiple relation suggestions at once. Useful for quickly processing batches of suggestions.",
    inputSchema: {
      suggestionIds: z
        .array(z.string())
        .min(1)
        .describe("Suggestion IDs to review"),
      action: z.enum(["approve", "reject"]).describe("Action to take for all"),
    },
  },
  async (args) => {
    const result = await bulkReview(
      {
        suggestionIds: args.suggestionIds,
        action: args.action,
      },
      storage.getDatabase(),
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n" },
        {
          type: "text",
          text: JSON.stringify(
            {
              processed: result.processed,
              relationsCreated: result.relationsCreated,
              failed: result.failed,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// Register Cross-Layer Relation tools
server.registerTool(
  "doclea_suggest_relations",
  {
    title: "Suggest Cross-Layer Relations",
    description:
      "Detect and suggest relationships between code and memory entities. Use entityType='memory' to find code that a memory documents, or entityType='code' to find memories that code implements.",
    inputSchema: {
      entityId: z.string().describe("ID of the entity (memory or code node)"),
      entityType: z.enum(["code", "memory"]).describe("Type of entity"),
      relationTypes: z
        .array(z.enum(["documents", "addresses", "exemplifies"]))
        .optional()
        .describe("Filter by relation types"),
      minConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum confidence threshold (default: 0.6)"),
    },
  },
  async (args) => {
    const result = await suggestRelations(
      {
        entityId: args.entityId,
        entityType: args.entityType,
        relationTypes: args.relationTypes,
        minConfidence: args.minConfidence ?? 0.6,
      },
      storage,
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n" },
        { type: "text", text: JSON.stringify(result.result, null, 2) },
      ],
    };
  },
);

server.registerTool(
  "doclea_get_code_for_memory",
  {
    title: "Get Code for Memory",
    description:
      "Get code nodes related to a memory through cross-layer relations (documents, addresses, exemplifies).",
    inputSchema: {
      memoryId: z.string().describe("Memory ID to get code for"),
      relationType: z
        .enum(["documents", "addresses", "exemplifies"])
        .optional()
        .describe("Filter by relation type"),
    },
  },
  async (args) => {
    const result = await getCodeForMemory(
      {
        memoryId: args.memoryId,
        relationType: args.relationType,
      },
      storage.getDatabase(),
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n" },
        { type: "text", text: JSON.stringify(result.relations, null, 2) },
      ],
    };
  },
);

server.registerTool(
  "doclea_get_memories_for_code",
  {
    title: "Get Memories for Code",
    description:
      "Get memories related to a code node through cross-layer relations.",
    inputSchema: {
      codeNodeId: z.string().describe("Code node ID to get memories for"),
      relationType: z
        .enum(["documents", "addresses", "exemplifies"])
        .optional()
        .describe("Filter by relation type"),
    },
  },
  async (args) => {
    const result = await getMemoriesForCode(
      {
        codeNodeId: args.codeNodeId,
        relationType: args.relationType,
      },
      storage.getDatabase(),
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n" },
        { type: "text", text: JSON.stringify(result.relations, null, 2) },
      ],
    };
  },
);

server.registerTool(
  "doclea_get_cross_layer_suggestions",
  {
    title: "Get Cross-Layer Suggestions",
    description:
      "Get pending cross-layer relation suggestions for review. Filter by memory, code node, or detection method.",
    inputSchema: {
      memoryId: z.string().optional().describe("Filter by memory ID"),
      codeNodeId: z.string().optional().describe("Filter by code node ID"),
      detectionMethod: z
        .enum(["code_reference", "file_path_match", "keyword_match"])
        .optional()
        .describe("Filter by detection method"),
      minConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum confidence score"),
      limit: z.number().min(1).max(100).optional().describe("Maximum results"),
      offset: z.number().min(0).optional().describe("Offset for pagination"),
    },
  },
  async (args) => {
    const result = await getCrossLayerSuggestions(
      {
        memoryId: args.memoryId,
        codeNodeId: args.codeNodeId,
        detectionMethod: args.detectionMethod,
        minConfidence: args.minConfidence,
        limit: args.limit ?? 20,
        offset: args.offset ?? 0,
      },
      storage.getDatabase(),
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n" },
        { type: "text", text: JSON.stringify(result.suggestions, null, 2) },
      ],
    };
  },
);

server.registerTool(
  "doclea_review_cross_layer_suggestion",
  {
    title: "Review Cross-Layer Suggestion",
    description:
      "Approve or reject a single cross-layer relation suggestion. Approved suggestions create relations.",
    inputSchema: {
      suggestionId: z.string().describe("Suggestion ID to review"),
      action: z.enum(["approve", "reject"]).describe("Action to take"),
    },
  },
  async (args) => {
    const result = await reviewCrossLayerSuggestion(
      {
        suggestionId: args.suggestionId,
        action: args.action,
      },
      storage.getDatabase(),
    );
    return {
      content: [{ type: "text", text: result.message }],
    };
  },
);

server.registerTool(
  "doclea_bulk_review_cross_layer",
  {
    title: "Bulk Review Cross-Layer Suggestions",
    description:
      "Approve or reject multiple cross-layer relation suggestions at once.",
    inputSchema: {
      suggestionIds: z
        .array(z.string())
        .min(1)
        .describe("Suggestion IDs to review"),
      action: z.enum(["approve", "reject"]).describe("Action to take for all"),
    },
  },
  async (args) => {
    const result = await bulkReviewCrossLayer(
      {
        suggestionIds: args.suggestionIds,
        action: args.action,
      },
      storage.getDatabase(),
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n" },
        {
          type: "text",
          text: JSON.stringify(
            {
              processed: result.processed,
              relationsCreated: result.relationsCreated,
              failed: result.failed,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ============================================
// Pending Memory Tools (for suggested/manual modes)
// ============================================

server.registerTool(
  "doclea_list_pending",
  {
    title: "List Pending Memories",
    description:
      "List all pending memories waiting for approval (only in suggested/manual mode)",
    inputSchema: {},
  },
  async () => {
    const pending = listPendingMemories(storage);
    const mode = getStorageMode(storage);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              mode,
              count: pending.length,
              pending: pending.map((p) => ({
                id: p.id,
                title: p.memoryData.title,
                type: p.memoryData.type,
                suggestedAt: p.suggestedAt,
                source: p.source,
                reason: p.reason,
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.registerTool(
  "doclea_approve_pending",
  {
    title: "Approve Pending Memory",
    description:
      "Approve a pending memory, committing it to storage and vector database. Optionally override title, content, tags, or type.",
    inputSchema: {
      pendingId: z.string().describe("ID of the pending memory to approve"),
      title: z.string().optional().describe("Override the title"),
      content: z.string().optional().describe("Override the content"),
      tags: z.array(z.string()).optional().describe("Override the tags"),
      type: z
        .enum(["decision", "solution", "pattern", "architecture", "note"])
        .optional()
        .describe("Override the type"),
    },
  },
  async (args) => {
    const modifications = {
      title: args.title,
      content: args.content,
      tags: args.tags,
      type: args.type,
    };
    // Only pass modifications if any are provided
    const hasModifications = Object.values(modifications).some(
      (v) => v !== undefined,
    );
    const result = await approvePendingMemory(
      args.pendingId,
      storage,
      vectors,
      embeddings,
      hasModifications ? modifications : undefined,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "doclea_reject_pending",
  {
    title: "Reject Pending Memory",
    description: "Reject a pending memory, discarding it",
    inputSchema: {
      pendingId: z.string().describe("ID of the pending memory to reject"),
    },
  },
  async (args) => {
    const success = rejectPendingMemory(args.pendingId, storage);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success, pendingId: args.pendingId }, null, 2),
        },
      ],
    };
  },
);

server.registerTool(
  "doclea_bulk_approve_pending",
  {
    title: "Bulk Approve Pending Memories",
    description:
      "Approve multiple pending memories at once. If no IDs provided, approves all pending. Can filter by minimum confidence threshold.",
    inputSchema: {
      pendingIds: z
        .array(z.string())
        .optional()
        .describe(
          "IDs of pending memories to approve (if not provided, approves all)",
        ),
      minConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe(
          "Only approve suggestions with importance >= this threshold (0-1)",
        ),
    },
  },
  async (args) => {
    const result = await bulkApprovePendingMemories(
      storage,
      vectors,
      embeddings,
      args.pendingIds,
      args.minConfidence,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "doclea_bulk_reject_pending",
  {
    title: "Bulk Reject Pending Memories",
    description: "Reject multiple pending memories at once",
    inputSchema: {
      pendingIds: z
        .array(z.string())
        .describe("IDs of pending memories to reject"),
    },
  },
  async (args) => {
    const result = bulkRejectPendingMemories(args.pendingIds, storage);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "doclea_get_storage_mode",
  {
    title: "Get Storage Mode",
    description:
      "Get the current storage mode (automatic, suggested, or manual)",
    inputSchema: {},
  },
  async () => {
    const mode = getStorageMode(storage);
    const backend = storage.getBackendType();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ mode, backend }, null, 2),
        },
      ],
    };
  },
);

server.registerTool(
  "doclea_set_storage_mode",
  {
    title: "Set Storage Mode",
    description:
      "Change the storage mode at runtime. In automatic mode, optionally set a confidence threshold for auto-approval.",
    inputSchema: {
      mode: z
        .enum(["manual", "suggested", "automatic"])
        .describe(
          "New storage mode: manual (explicit only), suggested (approval required), automatic (auto-store)",
        ),
      autoApproveThreshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe(
          "In automatic mode, memories with importance >= this threshold are auto-approved without review (0-1)",
        ),
    },
  },
  async (args) => {
    setStorageMode(storage, args.mode);

    let description = "";
    switch (args.mode) {
      case "manual":
        description = "Memories are only stored when explicitly requested.";
        break;
      case "suggested":
        description =
          "System suggests memories for your approval before storing.";
        break;
      case "automatic":
        description = `System stores memories automatically.${
          args.autoApproveThreshold
            ? ` High confidence (≥${(args.autoApproveThreshold * 100).toFixed(0)}%) are auto-approved.`
            : " All are marked for review."
        }`;
        break;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              mode: args.mode,
              autoApproveThreshold: args.autoApproveThreshold,
              description,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ============================================
// Review Queue Tools (for automatic mode)
// ============================================

server.registerTool(
  "doclea_review_queue",
  {
    title: "Review Queue",
    description:
      "View auto-stored memories that are pending review. These are memories stored in automatic mode that may need confirmation.",
    inputSchema: {
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum memories to return (default: 20)"),
    },
  },
  async (args) => {
    const memories = getReviewQueue(storage, args.limit ?? 20);

    if (memories.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                count: 0,
                message:
                  "No memories pending review. All auto-stored memories have been reviewed.",
                memories: [],
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              count: memories.length,
              message: `${memories.length} memories pending review`,
              memories: memories.map((m) => ({
                id: m.id,
                title: m.title,
                type: m.type,
                importance: m.importance,
                tags: m.tags,
                createdAt: m.createdAt,
                contentPreview:
                  m.content.slice(0, 200) +
                  (m.content.length > 200 ? "..." : ""),
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.registerTool(
  "doclea_confirm",
  {
    title: "Confirm Memory",
    description:
      "Confirm an auto-stored memory is useful. Removes it from the review queue.",
    inputSchema: {
      memoryId: z.string().describe("ID of the memory to confirm"),
    },
  },
  async (args) => {
    const result = confirmMemory(storage, args.memoryId);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ...result,
              memoryId: args.memoryId,
              message: result.success
                ? `Memory ${args.memoryId} confirmed and removed from review queue.`
                : `Failed to confirm memory: ${result.error}`,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ============================================
// Confidence Refresh Tool
// ============================================

server.registerTool(
  "doclea_refresh_confidence",
  {
    title: "Refresh Confidence",
    description:
      "Refresh a memory's confidence decay anchor. Resets decay to start from now, restoring confidence to its importance value. Optionally update the importance. Use this when a memory is still relevant but has decayed over time.",
    inputSchema: {
      memoryId: z.string().describe("ID of the memory to refresh"),
      newImportance: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Optionally update the importance value (0-1)"),
    },
  },
  async (args) => {
    // Get decay config from scoring config if available
    const decayConfig = config.scoring?.confidenceDecay;

    const result = refreshConfidence(
      {
        memoryId: args.memoryId,
        newImportance: args.newImportance,
      },
      storage,
      decayConfig,
    );

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: !result.success,
    };
  },
);

// ============================================
// Staleness Detection Tool
// ============================================

server.registerTool(
  "doclea_staleness",
  {
    title: "Detect Memory Staleness",
    description:
      "Detect stale memories using multiple strategies: time decay (180 days), git file changes, related memory updates, and superseded status. Actions: 'check' single memory, 'scan' multiple memories, 'refresh' reset decay anchor.",
    inputSchema: {
      action: z
        .enum(["check", "scan", "refresh"])
        .describe(
          "Action: 'check' single memory, 'scan' multiple memories, 'refresh' reset decay",
        ),
      memoryId: z
        .string()
        .optional()
        .describe("Memory ID (required for check/refresh actions)"),
      type: z
        .string()
        .optional()
        .describe("Filter by memory type (for scan action)"),
      limit: z
        .number()
        .min(1)
        .max(500)
        .optional()
        .describe("Maximum memories to scan (default: 100)"),
      offset: z.number().min(0).optional().describe("Pagination offset"),
      minScore: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum staleness score to include (0-1)"),
      newImportance: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("New importance value for refresh action (0-1)"),
    },
  },
  async (args) => {
    const decayConfig = config.scoring?.confidenceDecay;

    const result = await handleStaleness(
      {
        action: args.action,
        memoryId: args.memoryId,
        type: args.type,
        limit: args.limit ?? 100,
        offset: args.offset ?? 0,
        minScore: args.minScore,
        newImportance: args.newImportance,
      },
      storage,
      undefined, // Use default staleness config
      decayConfig,
    );

    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n---\n\n" },
        { type: "text", text: JSON.stringify(result.result, null, 2) },
      ],
    };
  },
);

// ============================================
// Export/Import Tools
// ============================================

server.registerTool(
  "doclea_export",
  {
    title: "Export Data",
    description: "Export all memories, documents, and relations to a JSON file",
    inputSchema: {
      outputPath: z.string().describe("Path to write the export file"),
      includeRelations: z
        .boolean()
        .optional()
        .describe("Include memory and cross-layer relations (default: true)"),
      includePending: z
        .boolean()
        .optional()
        .describe("Include pending memories (default: true)"),
    },
  },
  async (args) => {
    const result = exportData(
      {
        outputPath: args.outputPath,
        includeRelations: args.includeRelations ?? true,
        includePending: args.includePending ?? true,
      },
      storage,
      config.embedding,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "doclea_restore",
  {
    title: "Restore Backup",
    description:
      "Restore memories, documents, and relations from a JSON export file",
    inputSchema: {
      inputPath: z.string().describe("Path to the export file to import"),
      conflictStrategy: z
        .enum(["skip", "overwrite", "error"])
        .optional()
        .describe("How to handle conflicts (default: skip)"),
      reembed: z
        .boolean()
        .optional()
        .describe("Re-generate embeddings (default: false)"),
      importRelations: z
        .boolean()
        .optional()
        .describe("Import relations (default: true)"),
      importPending: z
        .boolean()
        .optional()
        .describe("Import pending memories (default: true)"),
    },
  },
  async (args) => {
    const result = await importData(
      {
        inputPath: args.inputPath,
        conflictStrategy: args.conflictStrategy ?? "skip",
        reembed: args.reembed ?? false,
        importRelations: args.importRelations ?? true,
        importPending: args.importPending ?? true,
      },
      storage,
      args.reembed ? vectors : undefined,
      args.reembed ? embeddings : undefined,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ============================================
// Cache & A/B Testing Management Tools
// ============================================

server.registerTool(
  "doclea_retrieval_benchmark",
  {
    title: "Benchmark Retrieval",
    description:
      "Benchmark context retrieval performance across representative queries. Returns latency percentiles, per-stage timings, route distribution, and cache hit rate.",
    inputSchema: {
      queries: z
        .array(z.string())
        .min(1)
        .max(50)
        .optional()
        .describe(
          "Queries to benchmark. Uses a built-in representative set when omitted.",
        ),
      runsPerQuery: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe("Measured runs per query (default: 3)"),
      warmupRuns: z
        .number()
        .min(0)
        .max(10)
        .optional()
        .describe("Warm-up runs per query before timing (default: 1)"),
      tokenBudget: z
        .number()
        .min(100)
        .max(100000)
        .optional()
        .describe("Token budget used during context building (default: 4000)"),
      includeCodeGraph: z
        .boolean()
        .optional()
        .describe(
          "Include code-graph retrieval during benchmark (default: true)",
        ),
      includeGraphRAG: z
        .boolean()
        .optional()
        .describe(
          "Include GraphRAG retrieval during benchmark (default: true)",
        ),
      template: z
        .enum(["default", "compact", "detailed"])
        .optional()
        .describe("Context output format template (default: compact)"),
      clearCacheFirst: z
        .boolean()
        .optional()
        .describe(
          "Clear context cache before benchmark starts (default: true)",
        ),
      compareAgainstMemoryOnly: z
        .boolean()
        .optional()
        .describe(
          "Also run memory-only baseline and include overhead ratios (default: false)",
        ),
    },
  },
  async (args) => {
    const result = await benchmarkContextRetrieval(
      {
        queries: args.queries,
        runsPerQuery: args.runsPerQuery,
        warmupRuns: args.warmupRuns,
        tokenBudget: args.tokenBudget,
        includeCodeGraph: args.includeCodeGraph,
        includeGraphRAG: args.includeGraphRAG,
        template: args.template,
        clearCacheFirst: args.clearCacheFirst,
        compareAgainstMemoryOnly: args.compareAgainstMemoryOnly,
      },
      storage,
      vectors,
      embeddings,
      config.cache,
      config.scoring,
    );

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "doclea_cache_stats",
  {
    title: "Get Cache Stats",
    description:
      "Get context cache statistics including hit rate, misses, and current entry count",
    inputSchema: {},
  },
  async () => {
    const cache = getContextCache();
    const stats = cache.getStats();
    const config = cache.getConfig();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              enabled: config.enabled,
              config: {
                maxEntries: config.maxEntries,
                ttlMs: config.ttlMs,
              },
              stats: {
                hits: stats.hits,
                misses: stats.misses,
                hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
                currentEntries: stats.currentEntries,
                evictions: stats.evictions,
                invalidations: stats.invalidations,
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.registerTool(
  "doclea_cache_clear",
  {
    title: "Clear Cache",
    description: "Clear the context cache and optionally reset statistics",
    inputSchema: {
      resetStats: z
        .boolean()
        .optional()
        .describe("Also reset statistics counters (default: false)"),
    },
  },
  async (args) => {
    const cache = getContextCache();
    const entriesBefore = cache.getStats().currentEntries;
    cache.clear();
    if (args.resetStats) {
      cache.resetStats();
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              entriesCleared: entriesBefore,
              statsReset: args.resetStats ?? false,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.registerTool(
  "doclea_experiment_status",
  {
    title: "Get Experiment Status",
    description:
      "Get A/B testing status including active experiments and metrics buffer status",
    inputSchema: {},
  },
  async () => {
    if (!experimentManager) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                enabled: false,
                message: "A/B testing is not configured",
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    const status = experimentManager.getStatus();
    const experiments = experimentManager.getAllExperiments();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              enabled: status.enabled,
              metricsEnabled: status.metricsEnabled,
              activeExperiment: status.activeExperiment
                ? {
                    id: status.activeExperiment.id,
                    name: status.activeExperiment.name,
                    variants: status.activeExperiment.variants.map((v) => ({
                      id: v.id,
                      name: v.name,
                      weight: v.weight,
                    })),
                  }
                : null,
              totalExperiments: status.totalExperiments,
              metricsBuffer: status.bufferStatus,
              experiments: experiments.map((exp) => ({
                id: exp.id,
                name: exp.name,
                enabled: exp.enabled,
                assignmentStrategy: exp.assignmentStrategy,
                variantCount: exp.variants.length,
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.registerTool(
  "doclea_experiment_metrics",
  {
    title: "Export Experiment Metrics",
    description:
      "Export metrics for an A/B testing experiment. Returns aggregated stats or raw samples.",
    inputSchema: {
      experimentId: z.string().describe("Experiment ID to get metrics for"),
      format: z
        .enum(["aggregated", "raw"])
        .default("aggregated")
        .describe("Output format"),
      limit: z
        .number()
        .min(1)
        .max(10000)
        .optional()
        .describe("Max raw samples (default: 1000)"),
      since: z
        .number()
        .optional()
        .describe("Only include metrics after this timestamp (ms)"),
    },
  },
  async (args) => {
    if (!experimentManager) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: "A/B testing is not configured",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    const experiment = experimentManager.getExperiment(args.experimentId);
    if (!experiment) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: `Experiment '${args.experimentId}' not found`,
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    if (args.format === "raw") {
      const samples = experimentManager.getMetricsSamples(
        args.experimentId,
        args.limit ?? 1000,
        args.since,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                experimentId: args.experimentId,
                experimentName: experiment.name,
                format: "raw",
                sampleCount: samples.length,
                samples,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Aggregated format
    const metrics = experimentManager.getExperimentMetrics(
      args.experimentId,
      args.since,
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              experimentId: args.experimentId,
              experimentName: experiment.name,
              format: "aggregated",
              variants: metrics.map((m) => ({
                variantId: m.variantId,
                requestCount: m.requestCount,
                avgLatencyMs: m.avgLatencyMs.toFixed(2),
                p50LatencyMs: m.p50LatencyMs.toFixed(2),
                p95LatencyMs: m.p95LatencyMs.toFixed(2),
                p99LatencyMs: m.p99LatencyMs.toFixed(2),
                avgResultCount: m.avgResultCount.toFixed(2),
                avgTopScore: m.avgTopScore.toFixed(4),
                periodStart: m.periodStart,
                periodEnd: m.periodEnd,
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ============================================================================
// GraphRAG Tools
// ============================================================================

server.registerTool(
  "doclea_graphrag_build",
  {
    title: "Build GraphRAG Knowledge Graph",
    description:
      "Build or update the GraphRAG knowledge graph from memories. Extracts entities, relationships, and detects communities.",
    inputSchema: {
      memoryIds: z
        .array(z.string())
        .optional()
        .describe("Specific memory IDs to process (default: all)"),
      reindexAll: z
        .boolean()
        .optional()
        .describe("Clear existing graph and rebuild from scratch"),
      generateReports: z
        .boolean()
        .optional()
        .describe("Generate community reports after building"),
      communityLevels: z
        .number()
        .min(1)
        .max(5)
        .optional()
        .describe("Number of community hierarchy levels (1-5)"),
    },
  },
  async (args) => {
    const result = await graphragBuild(
      {
        memoryIds: args.memoryIds,
        reindexAll: args.reindexAll ?? false,
        generateReports: args.generateReports ?? true,
        communityLevels: args.communityLevels ?? 3,
      },
      storage,
      embeddings,
      vectors,
    );

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "doclea_graphrag_search",
  {
    title: "Search GraphRAG Knowledge Graph",
    description:
      "Search the knowledge graph using local (entity-centric), global (community-centric), or drift (iterative) modes.",
    inputSchema: {
      query: z.string().describe("Search query"),
      mode: z
        .enum(["local", "global", "drift"])
        .optional()
        .describe("Search mode: local, global, or drift"),
      limit: z.number().min(1).max(100).optional().describe("Maximum results"),
      communityLevel: z
        .number()
        .min(0)
        .max(5)
        .optional()
        .describe("Community level for global search"),
      maxIterations: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum iterations for drift search"),
      maxDepth: z
        .number()
        .min(1)
        .max(5)
        .optional()
        .describe("Graph traversal depth for local search"),
    },
  },
  async (args) => {
    const result = await graphragSearch(
      {
        query: args.query,
        mode: args.mode ?? "local",
        limit: args.limit ?? 20,
        communityLevel: args.communityLevel ?? 1,
        maxIterations: args.maxIterations ?? 3,
        maxDepth: args.maxDepth ?? 2,
      },
      storage,
      embeddings,
      vectors,
    );

    // Format result based on mode
    let formattedResult: string;
    if (result.mode === "local") {
      const { entities, relationships, totalExpanded } = result.result;
      formattedResult = JSON.stringify(
        {
          mode: "local",
          totalEntities: entities.length,
          totalExpanded,
          entities: entities.slice(0, args.limit ?? 20).map((e) => ({
            name: e.entity.canonicalName,
            type: e.entity.entityType,
            score: Math.round(e.relevanceScore * 100) / 100,
            depth: e.depth,
            mentions: e.entity.mentionCount,
            description: e.entity.description,
          })),
          relationships: relationships.slice(0, 10).map((r) => ({
            type: r.relationshipType,
            strength: r.strength,
            description: r.description,
          })),
        },
        null,
        2,
      );
    } else if (result.mode === "global") {
      const { answer, sourceCommunities, tokenUsage } = result.result;
      formattedResult = JSON.stringify(
        {
          mode: "global",
          answer,
          sources: sourceCommunities.map((s) => ({
            title: s.report.title,
            relevance: Math.round(s.relevanceScore * 100) / 100,
            summary: s.report.summary,
          })),
          tokenUsage,
        },
        null,
        2,
      );
    } else {
      const { entities, iterations, hypotheses, converged } = result.result;
      formattedResult = JSON.stringify(
        {
          mode: "drift",
          converged,
          iterations,
          hypothesesGenerated: hypotheses.length,
          totalEntities: entities.length,
          entities: entities.slice(0, args.limit ?? 20).map((e) => ({
            name: e.entity.canonicalName,
            type: e.entity.entityType,
            score: Math.round(e.relevanceScore * 100) / 100,
          })),
          lastHypothesis: hypotheses[hypotheses.length - 1]?.slice(0, 300),
        },
        null,
        2,
      );
    }

    return {
      content: [{ type: "text", text: formattedResult }],
    };
  },
);

server.registerTool(
  "doclea_graphrag_status",
  {
    title: "GraphRAG Status",
    description: "Get statistics about the GraphRAG knowledge graph.",
    inputSchema: {
      includeGraphStats: z
        .boolean()
        .optional()
        .describe("Include detailed graph statistics"),
      includeTopEntities: z
        .boolean()
        .optional()
        .describe("Include list of top entities"),
      topEntitiesLimit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .describe("Number of top entities to return"),
    },
  },
  async (args) => {
    const result = graphragStatus(
      {
        includeGraphStats: args.includeGraphStats ?? true,
        includeTopEntities: args.includeTopEntities ?? true,
        topEntitiesLimit: args.topEntitiesLimit ?? 10,
      },
      storage,
    );

    return {
      content: [{ type: "text", text: formatStatusResult(result) }],
    };
  },
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);

console.error("Doclea MCP server started");
