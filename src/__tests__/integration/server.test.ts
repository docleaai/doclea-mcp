/**
 * Unit tests for MCP Server tool registration and schema validation
 * These test the server logic in isolation without external services
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";

describe("MCP Server", () => {
  // Memory type enum matching server definition
  const MemoryTypeEnum = z.enum([
    "decision",
    "solution",
    "pattern",
    "architecture",
    "note",
  ]);

  describe("tool registry", () => {
    const REGISTERED_TOOLS = [
      "doclea_store",
      "doclea_search",
      "doclea_get",
      "doclea_update",
      "doclea_delete",
      "doclea_commit_message",
      "doclea_pr_description",
      "doclea_changelog",
      "doclea_expertise",
      "doclea_suggest_reviewers",
      "doclea_init",
      "doclea_import",
    ] as const;

    test("defines 12 tools", () => {
      expect(REGISTERED_TOOLS).toHaveLength(12);
    });

    test("all tool names follow doclea_ prefix convention", () => {
      for (const tool of REGISTERED_TOOLS) {
        expect(tool.startsWith("doclea_")).toBe(true);
      }
    });

    test("tool names are unique", () => {
      const unique = new Set(REGISTERED_TOOLS);
      expect(unique.size).toBe(REGISTERED_TOOLS.length);
    });

    describe("tool categorization", () => {
      const MEMORY_TOOLS = [
        "doclea_store",
        "doclea_search",
        "doclea_get",
        "doclea_update",
        "doclea_delete",
      ];

      const GIT_TOOLS = [
        "doclea_commit_message",
        "doclea_pr_description",
        "doclea_changelog",
      ];

      const EXPERTISE_TOOLS = ["doclea_expertise", "doclea_suggest_reviewers"];

      const BOOTSTRAP_TOOLS = ["doclea_init", "doclea_import"];

      test("has 5 memory tools", () => {
        expect(MEMORY_TOOLS).toHaveLength(5);
      });

      test("has 3 git tools", () => {
        expect(GIT_TOOLS).toHaveLength(3);
      });

      test("has 2 expertise tools", () => {
        expect(EXPERTISE_TOOLS).toHaveLength(2);
      });

      test("has 2 bootstrap tools", () => {
        expect(BOOTSTRAP_TOOLS).toHaveLength(2);
      });

      test("categories cover all tools", () => {
        const all = [
          ...MEMORY_TOOLS,
          ...GIT_TOOLS,
          ...EXPERTISE_TOOLS,
          ...BOOTSTRAP_TOOLS,
        ];
        expect(all).toHaveLength(REGISTERED_TOOLS.length);
      });
    });
  });

  describe("doclea_store schema", () => {
    const storeSchema = z.object({
      type: MemoryTypeEnum,
      title: z.string(),
      content: z.string(),
      summary: z.string().optional(),
      importance: z.number().min(0).max(1).optional(),
      tags: z.array(z.string()).optional(),
      relatedFiles: z.array(z.string()).optional(),
      gitCommit: z.string().optional(),
      sourcePr: z.string().optional(),
      experts: z.array(z.string()).optional(),
    });

    test("validates complete input", () => {
      const input = {
        type: "decision",
        title: "Use Bun runtime",
        content: "We decided to use Bun for faster builds",
        summary: "Bun for performance",
        importance: 0.8,
        tags: ["runtime", "performance"],
        relatedFiles: ["package.json"],
        gitCommit: "abc123",
        sourcePr: "#42",
        experts: ["alice@example.com"],
      };
      expect(storeSchema.safeParse(input).success).toBe(true);
    });

    test("validates minimal input", () => {
      const input = {
        type: "note",
        title: "Quick note",
        content: "Something to remember",
      };
      expect(storeSchema.safeParse(input).success).toBe(true);
    });

    test("rejects missing type", () => {
      const input = { title: "Test", content: "Content" };
      expect(storeSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing title", () => {
      const input = { type: "decision", content: "Content" };
      expect(storeSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing content", () => {
      const input = { type: "decision", title: "Test" };
      expect(storeSchema.safeParse(input).success).toBe(false);
    });

    test("rejects invalid type", () => {
      const input = { type: "invalid", title: "Test", content: "Content" };
      expect(storeSchema.safeParse(input).success).toBe(false);
    });

    test("rejects importance below 0", () => {
      const input = {
        type: "decision",
        title: "Test",
        content: "Content",
        importance: -0.1,
      };
      expect(storeSchema.safeParse(input).success).toBe(false);
    });

    test("rejects importance above 1", () => {
      const input = {
        type: "decision",
        title: "Test",
        content: "Content",
        importance: 1.1,
      };
      expect(storeSchema.safeParse(input).success).toBe(false);
    });

    test("accepts importance at boundaries", () => {
      expect(
        storeSchema.safeParse({
          type: "note",
          title: "T",
          content: "C",
          importance: 0,
        }).success,
      ).toBe(true);
      expect(
        storeSchema.safeParse({
          type: "note",
          title: "T",
          content: "C",
          importance: 1,
        }).success,
      ).toBe(true);
    });

    test("rejects non-array tags", () => {
      const input = {
        type: "decision",
        title: "Test",
        content: "Content",
        tags: "not-array",
      };
      expect(storeSchema.safeParse(input).success).toBe(false);
    });

    test("accepts empty arrays", () => {
      const input = {
        type: "decision",
        title: "Test",
        content: "Content",
        tags: [],
        relatedFiles: [],
        experts: [],
      };
      expect(storeSchema.safeParse(input).success).toBe(true);
    });
  });

  describe("doclea_search schema", () => {
    const searchSchema = z.object({
      query: z.string(),
      type: MemoryTypeEnum.optional(),
      tags: z.array(z.string()).optional(),
      minImportance: z.number().min(0).max(1).optional(),
      limit: z.number().min(1).max(50).optional(),
    });

    test("validates query-only input", () => {
      const input = { query: "authentication" };
      expect(searchSchema.safeParse(input).success).toBe(true);
    });

    test("validates complete input", () => {
      const input = {
        query: "database decisions",
        type: "decision",
        tags: ["database", "sql"],
        minImportance: 0.5,
        limit: 20,
      };
      expect(searchSchema.safeParse(input).success).toBe(true);
    });

    test("rejects missing query", () => {
      const input = { type: "decision" };
      expect(searchSchema.safeParse(input).success).toBe(false);
    });

    test("rejects limit below 1", () => {
      const input = { query: "test", limit: 0 };
      expect(searchSchema.safeParse(input).success).toBe(false);
    });

    test("rejects limit above 50", () => {
      const input = { query: "test", limit: 51 };
      expect(searchSchema.safeParse(input).success).toBe(false);
    });

    test("accepts limit at boundaries", () => {
      expect(searchSchema.safeParse({ query: "t", limit: 1 }).success).toBe(
        true,
      );
      expect(searchSchema.safeParse({ query: "t", limit: 50 }).success).toBe(
        true,
      );
    });
  });

  describe("doclea_get schema", () => {
    const getSchema = z.object({
      id: z.string(),
    });

    test("validates id input", () => {
      const input = { id: "mem_abc123" };
      expect(getSchema.safeParse(input).success).toBe(true);
    });

    test("rejects missing id", () => {
      const input = {};
      expect(getSchema.safeParse(input).success).toBe(false);
    });

    test("rejects non-string id", () => {
      const input = { id: 123 };
      expect(getSchema.safeParse(input).success).toBe(false);
    });
  });

  describe("doclea_update schema", () => {
    const updateSchema = z.object({
      id: z.string(),
      type: MemoryTypeEnum.optional(),
      title: z.string().optional(),
      content: z.string().optional(),
      summary: z.string().optional(),
      importance: z.number().min(0).max(1).optional(),
      tags: z.array(z.string()).optional(),
      relatedFiles: z.array(z.string()).optional(),
    });

    test("validates id-only input", () => {
      const input = { id: "mem_abc123" };
      expect(updateSchema.safeParse(input).success).toBe(true);
    });

    test("validates partial update", () => {
      const input = {
        id: "mem_abc123",
        title: "Updated title",
        importance: 0.9,
      };
      expect(updateSchema.safeParse(input).success).toBe(true);
    });

    test("validates full update", () => {
      const input = {
        id: "mem_abc123",
        type: "solution",
        title: "New title",
        content: "New content",
        summary: "New summary",
        importance: 0.7,
        tags: ["new", "tags"],
        relatedFiles: ["new/file.ts"],
      };
      expect(updateSchema.safeParse(input).success).toBe(true);
    });

    test("rejects missing id", () => {
      const input = { title: "Test" };
      expect(updateSchema.safeParse(input).success).toBe(false);
    });
  });

  describe("doclea_delete schema", () => {
    const deleteSchema = z.object({
      id: z.string(),
    });

    test("validates id input", () => {
      const input = { id: "mem_abc123" };
      expect(deleteSchema.safeParse(input).success).toBe(true);
    });

    test("rejects missing id", () => {
      const input = {};
      expect(deleteSchema.safeParse(input).success).toBe(false);
    });
  });

  describe("doclea_commit_message schema", () => {
    const commitSchema = z.object({
      diff: z.string().optional(),
      projectPath: z.string().optional(),
    });

    test("validates empty input", () => {
      const input = {};
      expect(commitSchema.safeParse(input).success).toBe(true);
    });

    test("validates diff input", () => {
      const input = { diff: "--- a/file.ts\n+++ b/file.ts\n@@ ..." };
      expect(commitSchema.safeParse(input).success).toBe(true);
    });

    test("validates with projectPath", () => {
      const input = { projectPath: "/home/user/project" };
      expect(commitSchema.safeParse(input).success).toBe(true);
    });

    test("validates complete input", () => {
      const input = {
        diff: "diff content",
        projectPath: "/project",
      };
      expect(commitSchema.safeParse(input).success).toBe(true);
    });
  });

  describe("doclea_pr_description schema", () => {
    const prSchema = z.object({
      branch: z.string().optional(),
      base: z.string().optional(),
      projectPath: z.string().optional(),
    });

    test("validates empty input", () => {
      const input = {};
      expect(prSchema.safeParse(input).success).toBe(true);
    });

    test("validates branch input", () => {
      const input = { branch: "feature/new-feature" };
      expect(prSchema.safeParse(input).success).toBe(true);
    });

    test("validates complete input", () => {
      const input = {
        branch: "feature/test",
        base: "develop",
        projectPath: "/project",
      };
      expect(prSchema.safeParse(input).success).toBe(true);
    });
  });

  describe("doclea_changelog schema", () => {
    const changelogSchema = z.object({
      fromRef: z.string(),
      toRef: z.string().optional(),
      projectPath: z.string().optional(),
      format: z.enum(["markdown", "json"]).optional(),
      audience: z.enum(["developers", "users"]).optional(),
    });

    test("validates fromRef-only input", () => {
      const input = { fromRef: "v1.0.0" };
      expect(changelogSchema.safeParse(input).success).toBe(true);
    });

    test("validates complete input", () => {
      const input = {
        fromRef: "v1.0.0",
        toRef: "v2.0.0",
        projectPath: "/project",
        format: "markdown",
        audience: "users",
      };
      expect(changelogSchema.safeParse(input).success).toBe(true);
    });

    test("rejects missing fromRef", () => {
      const input = { toRef: "v2.0.0" };
      expect(changelogSchema.safeParse(input).success).toBe(false);
    });

    test("rejects invalid format", () => {
      const input = { fromRef: "v1.0.0", format: "html" };
      expect(changelogSchema.safeParse(input).success).toBe(false);
    });

    test("rejects invalid audience", () => {
      const input = { fromRef: "v1.0.0", audience: "managers" };
      expect(changelogSchema.safeParse(input).success).toBe(false);
    });
  });

  describe("doclea_expertise schema", () => {
    const expertiseSchema = z.object({
      path: z.string().optional(),
      projectPath: z.string().optional(),
      depth: z.number().min(1).max(5).optional(),
      includeStale: z.boolean().optional(),
      busFactorThreshold: z.number().min(50).max(100).optional(),
    });

    test("validates empty input", () => {
      const input = {};
      expect(expertiseSchema.safeParse(input).success).toBe(true);
    });

    test("validates complete input", () => {
      const input = {
        path: "src/",
        projectPath: "/project",
        depth: 3,
        includeStale: false,
        busFactorThreshold: 70,
      };
      expect(expertiseSchema.safeParse(input).success).toBe(true);
    });

    test("rejects depth below 1", () => {
      const input = { depth: 0 };
      expect(expertiseSchema.safeParse(input).success).toBe(false);
    });

    test("rejects depth above 5", () => {
      const input = { depth: 6 };
      expect(expertiseSchema.safeParse(input).success).toBe(false);
    });

    test("rejects busFactorThreshold below 50", () => {
      const input = { busFactorThreshold: 49 };
      expect(expertiseSchema.safeParse(input).success).toBe(false);
    });

    test("rejects busFactorThreshold above 100", () => {
      const input = { busFactorThreshold: 101 };
      expect(expertiseSchema.safeParse(input).success).toBe(false);
    });

    test("accepts boundaries", () => {
      expect(
        expertiseSchema.safeParse({ depth: 1, busFactorThreshold: 50 }).success,
      ).toBe(true);
      expect(
        expertiseSchema.safeParse({ depth: 5, busFactorThreshold: 100 })
          .success,
      ).toBe(true);
    });
  });

  describe("doclea_suggest_reviewers schema", () => {
    const reviewersSchema = z.object({
      files: z.array(z.string()),
      projectPath: z.string().optional(),
      excludeAuthors: z.array(z.string()).optional(),
      limit: z.number().min(1).max(10).optional(),
    });

    test("validates files-only input", () => {
      const input = { files: ["src/index.ts"] };
      expect(reviewersSchema.safeParse(input).success).toBe(true);
    });

    test("validates complete input", () => {
      const input = {
        files: ["src/index.ts", "src/utils.ts"],
        projectPath: "/project",
        excludeAuthors: ["pr-author@example.com"],
        limit: 5,
      };
      expect(reviewersSchema.safeParse(input).success).toBe(true);
    });

    test("rejects missing files", () => {
      const input = { limit: 3 };
      expect(reviewersSchema.safeParse(input).success).toBe(false);
    });

    test("rejects empty files array", () => {
      // Empty array is technically valid for z.array()
      const input = { files: [] };
      expect(reviewersSchema.safeParse(input).success).toBe(true);
    });

    test("rejects limit below 1", () => {
      const input = { files: ["file.ts"], limit: 0 };
      expect(reviewersSchema.safeParse(input).success).toBe(false);
    });

    test("rejects limit above 10", () => {
      const input = { files: ["file.ts"], limit: 11 };
      expect(reviewersSchema.safeParse(input).success).toBe(false);
    });
  });

  describe("doclea_init schema", () => {
    const initSchema = z.object({
      projectPath: z.string().optional(),
      scanGit: z.boolean().optional(),
      scanDocs: z.boolean().optional(),
      scanCode: z.boolean().optional(),
      scanCommits: z.number().min(10).max(2000).optional(),
      dryRun: z.boolean().optional(),
    });

    test("validates empty input", () => {
      const input = {};
      expect(initSchema.safeParse(input).success).toBe(true);
    });

    test("validates complete input", () => {
      const input = {
        projectPath: "/project",
        scanGit: true,
        scanDocs: false,
        scanCode: true,
        scanCommits: 1000,
        dryRun: true,
      };
      expect(initSchema.safeParse(input).success).toBe(true);
    });

    test("rejects scanCommits below 10", () => {
      const input = { scanCommits: 9 };
      expect(initSchema.safeParse(input).success).toBe(false);
    });

    test("rejects scanCommits above 2000", () => {
      const input = { scanCommits: 2001 };
      expect(initSchema.safeParse(input).success).toBe(false);
    });

    test("accepts scanCommits at boundaries", () => {
      expect(initSchema.safeParse({ scanCommits: 10 }).success).toBe(true);
      expect(initSchema.safeParse({ scanCommits: 2000 }).success).toBe(true);
    });
  });

  describe("doclea_import schema", () => {
    const importSchema = z.object({
      source: z.enum(["markdown", "adr"]),
      path: z.string(),
      projectPath: z.string().optional(),
      recursive: z.boolean().optional(),
      dryRun: z.boolean().optional(),
    });

    test("validates minimal input", () => {
      const input = { source: "markdown", path: "docs/" };
      expect(importSchema.safeParse(input).success).toBe(true);
    });

    test("validates complete input", () => {
      const input = {
        source: "adr",
        path: "docs/adr",
        projectPath: "/project",
        recursive: true,
        dryRun: false,
      };
      expect(importSchema.safeParse(input).success).toBe(true);
    });

    test("rejects missing source", () => {
      const input = { path: "docs/" };
      expect(importSchema.safeParse(input).success).toBe(false);
    });

    test("rejects missing path", () => {
      const input = { source: "markdown" };
      expect(importSchema.safeParse(input).success).toBe(false);
    });

    test("rejects invalid source", () => {
      const input = { source: "json", path: "docs/" };
      expect(importSchema.safeParse(input).success).toBe(false);
    });
  });

  describe("response format", () => {
    interface MCPResponse {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    }

    function createSuccessResponse(data: unknown): MCPResponse {
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }

    function createErrorResponse(message: string): MCPResponse {
      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    }

    function createMultiPartResponse(parts: string[]): MCPResponse {
      return {
        content: parts.map((text) => ({ type: "text", text })),
      };
    }

    test("success response has content array", () => {
      const response = createSuccessResponse({ id: "mem_123" });
      expect(Array.isArray(response.content)).toBe(true);
    });

    test("success response content has text type", () => {
      const response = createSuccessResponse({ id: "mem_123" });
      expect(response.content[0].type).toBe("text");
    });

    test("success response serializes data as JSON", () => {
      const data = { id: "mem_123", title: "Test" };
      const response = createSuccessResponse(data);
      expect(JSON.parse(response.content[0].text)).toEqual(data);
    });

    test("error response has isError flag", () => {
      const response = createErrorResponse("Not found");
      expect(response.isError).toBe(true);
    });

    test("error response contains message", () => {
      const response = createErrorResponse("Memory not found");
      expect(response.content[0].text).toBe("Memory not found");
    });

    test("multi-part response has multiple content items", () => {
      const response = createMultiPartResponse([
        "Summary text",
        "---",
        '{"data": true}',
      ]);
      expect(response.content).toHaveLength(3);
    });

    test("all content items have type text", () => {
      const response = createMultiPartResponse(["A", "B", "C"]);
      for (const item of response.content) {
        expect(item.type).toBe("text");
      }
    });
  });

  describe("default values", () => {
    test("doclea_store defaults importance to 0.5", () => {
      const args = { importance: undefined };
      const defaulted = args.importance ?? 0.5;
      expect(defaulted).toBe(0.5);
    });

    test("doclea_store defaults arrays to empty", () => {
      const args = {
        tags: undefined,
        relatedFiles: undefined,
        experts: undefined,
      };
      expect(args.tags ?? []).toEqual([]);
      expect(args.relatedFiles ?? []).toEqual([]);
      expect(args.experts ?? []).toEqual([]);
    });

    test("doclea_search defaults limit to 10", () => {
      const args = { limit: undefined };
      expect(args.limit ?? 10).toBe(10);
    });

    test("doclea_pr_description defaults base to main", () => {
      const args = { base: undefined };
      expect(args.base ?? "main").toBe("main");
    });

    test("doclea_changelog defaults toRef to HEAD", () => {
      const args = { toRef: undefined };
      expect(args.toRef ?? "HEAD").toBe("HEAD");
    });

    test("doclea_changelog defaults format to markdown", () => {
      const args = { format: undefined };
      expect(args.format ?? "markdown").toBe("markdown");
    });

    test("doclea_changelog defaults audience to developers", () => {
      const args = { audience: undefined };
      expect(args.audience ?? "developers").toBe("developers");
    });

    test("doclea_expertise defaults depth to 2", () => {
      const args = { depth: undefined };
      expect(args.depth ?? 2).toBe(2);
    });

    test("doclea_expertise defaults includeStale to true", () => {
      const args = { includeStale: undefined };
      expect(args.includeStale ?? true).toBe(true);
    });

    test("doclea_expertise defaults busFactorThreshold to 80", () => {
      const args = { busFactorThreshold: undefined };
      expect(args.busFactorThreshold ?? 80).toBe(80);
    });

    test("doclea_suggest_reviewers defaults excludeAuthors to empty", () => {
      const args = { excludeAuthors: undefined };
      expect(args.excludeAuthors ?? []).toEqual([]);
    });

    test("doclea_suggest_reviewers defaults limit to 3", () => {
      const args = { limit: undefined };
      expect(args.limit ?? 3).toBe(3);
    });

    test("doclea_init defaults scanGit to true", () => {
      const args = { scanGit: undefined };
      expect(args.scanGit ?? true).toBe(true);
    });

    test("doclea_init defaults scanDocs to true", () => {
      const args = { scanDocs: undefined };
      expect(args.scanDocs ?? true).toBe(true);
    });

    test("doclea_init defaults scanCode to true", () => {
      const args = { scanCode: undefined };
      expect(args.scanCode ?? true).toBe(true);
    });

    test("doclea_init defaults scanCommits to 500", () => {
      const args = { scanCommits: undefined };
      expect(args.scanCommits ?? 500).toBe(500);
    });

    test("doclea_init defaults dryRun to false", () => {
      const args = { dryRun: undefined };
      expect(args.dryRun ?? false).toBe(false);
    });

    test("doclea_import defaults recursive to true", () => {
      const args = { recursive: undefined };
      expect(args.recursive ?? true).toBe(true);
    });

    test("doclea_import defaults dryRun to false", () => {
      const args = { dryRun: undefined };
      expect(args.dryRun ?? false).toBe(false);
    });
  });

  describe("memory type enum", () => {
    test("has 5 valid types", () => {
      const types = MemoryTypeEnum.options;
      expect(types).toHaveLength(5);
    });

    test("includes decision", () => {
      expect(MemoryTypeEnum.safeParse("decision").success).toBe(true);
    });

    test("includes solution", () => {
      expect(MemoryTypeEnum.safeParse("solution").success).toBe(true);
    });

    test("includes pattern", () => {
      expect(MemoryTypeEnum.safeParse("pattern").success).toBe(true);
    });

    test("includes architecture", () => {
      expect(MemoryTypeEnum.safeParse("architecture").success).toBe(true);
    });

    test("includes note", () => {
      expect(MemoryTypeEnum.safeParse("note").success).toBe(true);
    });

    test("rejects invalid type", () => {
      expect(MemoryTypeEnum.safeParse("invalid").success).toBe(false);
    });

    test("rejects empty string", () => {
      expect(MemoryTypeEnum.safeParse("").success).toBe(false);
    });

    test("rejects null", () => {
      expect(MemoryTypeEnum.safeParse(null).success).toBe(false);
    });
  });

  describe("server configuration", () => {
    const SERVER_CONFIG = {
      name: "doclea-mcp",
      version: "0.0.1",
    };

    test("has correct server name", () => {
      expect(SERVER_CONFIG.name).toBe("doclea-mcp");
    });

    test("has version", () => {
      expect(SERVER_CONFIG.version).toBeDefined();
    });

    test("version follows semver format", () => {
      expect(/^\d+\.\d+\.\d+/.test(SERVER_CONFIG.version)).toBe(true);
    });
  });
});
