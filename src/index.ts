#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createVectorStore } from "@/vectors";
import { getDbPath, getProjectPath, loadConfig } from "./config";
import { SQLiteDatabase } from "./database/sqlite";
import {
  CachedEmbeddingClient,
  createEmbeddingClient,
} from "./embeddings/provider";
import { importContent, initProject } from "./tools/bootstrap";
import { mapExpertise, suggestReviewers } from "./tools/expertise";
import {
  generateChangelog,
  generateCommitMessage,
  generatePRDescription,
} from "./tools/git";
import {
  deleteMemory,
  getMemory,
  searchMemory,
  storeMemory,
  updateMemory,
} from "./tools/memory";
import {
  scanCode,
  stopCodeWatch,
  getCodeNode,
  updateNodeSummary,
  getCallGraph,
  ScanCodeInputSchema,
  GetCodeNodeInputSchema,
  UpdateNodeSummaryInputSchema,
  GetCallGraphInputSchema,
} from "./tools/code";
import { buildContext, BuildContextInputSchema } from "./tools/context";
import {
  linkMemories,
  getRelatedMemories,
  deleteRelation,
  findPath,
  LinkMemoriesInputSchema,
  GetRelatedMemoriesInputSchema,
  DeleteRelationInputSchema,
  FindPathInputSchema,
} from "./tools/memory-relations";
import {
  allocateBudget,
  getModelWindows,
  getBudgetPresets,
  AllocateBudgetInputSchema,
  GetModelWindowsInputSchema,
  GetBudgetPresetsInputSchema,
} from "./tools/budget";

// Initialize services
const config = loadConfig();
const projectPath = getProjectPath();
const db = new SQLiteDatabase(getDbPath(config));
const vectors = createVectorStore(config.vector, projectPath);

// Create embedding client with caching layer
const baseEmbeddings = createEmbeddingClient(config.embedding);
const modelName =
  config.embedding.provider === "local" ? "local-tei" : config.embedding.model;
const embeddings = new CachedEmbeddingClient(baseEmbeddings, db, modelName);

// Initialize vector store
await vectors.initialize();

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
    const memory = await storeMemory(
      {
        ...args,
        importance: args.importance ?? 0.5,
        tags: args.tags ?? [],
        relatedFiles: args.relatedFiles ?? [],
        experts: args.experts ?? [],
      },
      db,
      vectors,
      embeddings,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(memory, null, 2) }],
    };
  },
);

server.registerTool(
  "doclea_search",
  {
    title: "Search Memories",
    description:
      "Search memories using natural language. Returns relevant decisions, solutions, patterns, and notes.",
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
    const results = await searchMemory(
      { ...args, limit: args.limit ?? 10 },
      db,
      vectors,
      embeddings,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
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
    const memory = getMemory(args, db);
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
    const memory = await updateMemory(args, db, vectors, embeddings);
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
    const deleted = await deleteMemory(args, db, vectors);
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
    const result = await generateCommitMessage(args, db, vectors, embeddings);
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
      db,
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
      db,
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
      db,
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
          "Patterns to exclude (default: node_modules, .git, dist, etc.)",
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
    },
  },
  async (args) => {
    const result = await scanCode(
      {
        patterns: args.patterns,
        exclude: args.exclude,
        incremental: args.incremental ?? true,
        watch: args.watch ?? false,
        extractSummaries: args.extractSummaries ?? true,
      },
      db.getDatabase(),
    );
    return {
      content: [
        { type: "text", text: result.message },
        { type: "text", text: "\n\n" },
        { type: "text", text: JSON.stringify(result.result?.stats, null, 2) },
      ],
    };
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
      db.getDatabase(),
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
        .describe("ID of the code node (e.g., 'src/api.ts:function:getUserData')"),
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
      db.getDatabase(),
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
      nodeId: z
        .string()
        .optional()
        .describe("Node ID to start from"),
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
    },
  },
  async (args) => {
    const result = await getCallGraph(
      {
        nodeId: args.nodeId,
        functionName: args.functionName,
        depth: args.depth ?? 2,
      },
      db.getDatabase(),
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

// Register Context Building tool
server.registerTool(
  "doclea_context",
  {
    title: "Build Context",
    description:
      "Build formatted context from RAG (semantic search) and KAG (code relationships) within a token budget. Returns markdown-formatted context ready for LLM consumption with relevant memories and code graph relationships.",
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
    },
  },
  async (args) => {
    const result = await buildContext(
      {
        query: args.query,
        tokenBudget: args.tokenBudget ?? 4000,
        includeCodeGraph: args.includeCodeGraph ?? true,
        filters: args.filters,
        template: args.template ?? "default",
      },
      db.getDatabase(),
      vectors,
      embeddings,
    );
    return {
      content: [
        { type: "text", text: result.context },
        { type: "text", text: "\n\n---\n\n" },
        { type: "text", text: `**Metadata**: ${JSON.stringify(result.metadata, null, 2)}` },
      ],
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
      db.getDatabase(),
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
      db.getDatabase(),
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
      db.getDatabase(),
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
      db.getDatabase(),
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
							(m) =>
								`- ${m.name}: ${m.contextWindow.toLocaleString()} tokens`,
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

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);

console.error("Doclea MCP server started");
