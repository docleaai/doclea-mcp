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

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);

console.error("Doclea MCP server started");
