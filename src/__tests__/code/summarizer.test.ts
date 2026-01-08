import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type {
  CodeChunk,
  CodeChunkMetadata,
  SupportedLanguage,
} from "../../chunking/code";
import { batchUpdateSummaries } from "../../tools/code/batch-update-summaries";
import { getUnsummarized } from "../../tools/code/get-unsummarized";
import { CodeSummarizer } from "../../tools/code/summarizer";

/**
 * Create CodeChunkMetadata with default values for tests
 */
function createTestMetadata(
  overrides: Partial<CodeChunkMetadata> & {
    name: string | null;
    language: SupportedLanguage;
  },
): CodeChunkMetadata {
  return {
    startLine: 1,
    endLine: 10,
    startByte: 0,
    endByte: 100,
    nodeType: overrides.isFunction
      ? "function_declaration"
      : overrides.isClass
        ? "class_declaration"
        : "unknown",
    parentName: null,
    isFunction: false,
    isClass: false,
    isImport: false,
    ...overrides,
  };
}

describe("CodeSummarizer", () => {
  describe("heuristicSummary", () => {
    it("should extract JSDoc for TypeScript", async () => {
      const summarizer = new CodeSummarizer({ enabled: true });
      const chunk: CodeChunk = {
        content: `/**
 * Process user data and return formatted result
 * @param user The user object
 */
export function processUser(user: User): FormattedUser {
  return { ...user, formatted: true };
}`,
        tokenCount: 50,
        metadata: createTestMetadata({
          name: "processUser",
          language: "typescript",
          isFunction: true,
          isClass: false,
          isImport: false,
        }),
      };

      const result = await summarizer.heuristicSummary(chunk);

      expect(result.summary).toContain("Process user data");
      expect(result.generatedBy).toBe("docstring");
      expect(result.confidence).toBe(0.9);
      expect(result.needsAiSummary).toBe(false);
    });

    it("should extract Python docstrings", async () => {
      const summarizer = new CodeSummarizer({ enabled: true });
      const chunk: CodeChunk = {
        content: `def process_data(data):
    """Process incoming data and return transformed result."""
    return transform(data)`,
        tokenCount: 50,
        metadata: createTestMetadata({
          name: "process_data",
          language: "python",
          isFunction: true,
          isClass: false,
          isImport: false,
        }),
      };

      const result = await summarizer.heuristicSummary(chunk);

      expect(result.summary).toContain("Process incoming data");
      expect(result.generatedBy).toBe("docstring");
      expect(result.confidence).toBe(0.9);
    });

    it("should extract Go doc comments", async () => {
      const summarizer = new CodeSummarizer({ enabled: true });
      const chunk: CodeChunk = {
        content: `// ProcessData handles the incoming data stream
// and returns the transformed result
func ProcessData(data []byte) ([]byte, error) {
    return transform(data)
}`,
        tokenCount: 50,
        metadata: createTestMetadata({
          name: "ProcessData",
          language: "go",
          isFunction: true,
          isClass: false,
          isImport: false,
        }),
      };

      const result = await summarizer.heuristicSummary(chunk);

      expect(result.summary).toContain("ProcessData handles");
      expect(result.generatedBy).toBe("docstring");
      expect(result.confidence).toBe(0.9);
    });

    it("should extract Rust doc comments", async () => {
      const summarizer = new CodeSummarizer({ enabled: true });
      const chunk: CodeChunk = {
        content: `/// Process data and return transformed result
/// Takes a byte slice and returns a new vector
pub fn process_data(data: &[u8]) -> Vec<u8> {
    data.to_vec()
}`,
        tokenCount: 50,
        metadata: createTestMetadata({
          name: "process_data",
          language: "rust",
          isFunction: true,
          isClass: false,
          isImport: false,
        }),
      };

      const result = await summarizer.heuristicSummary(chunk);

      expect(result.summary).toContain("Process data");
      expect(result.generatedBy).toBe("docstring");
      expect(result.confidence).toBe(0.9);
    });

    it("should fall back to first-line comment", async () => {
      const summarizer = new CodeSummarizer({ enabled: true });
      const chunk: CodeChunk = {
        content: `// Helper to format dates consistently
function formatDate(date: Date): string {
  return date.toISOString();
}`,
        tokenCount: 50,
        metadata: createTestMetadata({
          name: "formatDate",
          language: "typescript",
          isFunction: true,
          isClass: false,
          isImport: false,
        }),
      };

      const result = await summarizer.heuristicSummary(chunk);

      expect(result.summary).toContain("Helper to format dates");
      expect(result.generatedBy).toBe("comment");
      expect(result.confidence).toBe(0.7);
    });

    it("should fall back to signature-based summary", async () => {
      const summarizer = new CodeSummarizer({ enabled: true });
      const chunk: CodeChunk = {
        content: `function processData(data: any) {
  return data;
}`,
        tokenCount: 50,
        metadata: createTestMetadata({
          name: "processData",
          language: "typescript",
          isFunction: true,
          isClass: false,
          isImport: false,
        }),
      };

      const result = await summarizer.heuristicSummary(chunk);

      expect(result.summary).toBe("Function processData");
      expect(result.generatedBy).toBe("signature");
      expect(result.confidence).toBe(0.5);
    });

    it("should handle class types", async () => {
      const summarizer = new CodeSummarizer({ enabled: true });
      const chunk: CodeChunk = {
        content: `class UserService {
  getUser() {}
}`,
        tokenCount: 50,
        metadata: createTestMetadata({
          name: "UserService",
          language: "typescript",
          isFunction: false,
          isClass: true,
          isImport: false,
        }),
      };

      const result = await summarizer.heuristicSummary(chunk);

      expect(result.summary).toBe("Class UserService");
      expect(result.generatedBy).toBe("signature");
    });

    it("should return empty when disabled", async () => {
      const summarizer = new CodeSummarizer({ enabled: false });
      const chunk: CodeChunk = {
        content: `/** Some docs */ function test() {}`,
        tokenCount: 50,
        metadata: createTestMetadata({
          name: "test",
          language: "typescript",
          isFunction: true,
          isClass: false,
          isImport: false,
        }),
      };

      const result = await summarizer.summarize(chunk);

      expect(result.summary).toBe("");
      expect(result.confidence).toBe(0);
    });
  });

  describe("hybrid mode", () => {
    it("should flag low-confidence summaries for AI", async () => {
      const summarizer = new CodeSummarizer({
        enabled: true,
        strategy: "hybrid",
        minConfidenceThreshold: 0.6,
      });
      const chunk: CodeChunk = {
        content: `function doSomething() { return true; }`,
        tokenCount: 50,
        metadata: createTestMetadata({
          name: "doSomething",
          language: "typescript",
          isFunction: true,
          isClass: false,
          isImport: false,
        }),
      };

      const result = await summarizer.summarize(chunk);

      expect(result.generatedBy).toBe("signature");
      expect(result.confidence).toBe(0.5);
      expect(result.needsAiSummary).toBe(true);
    });

    it("should not flag high-confidence summaries", async () => {
      const summarizer = new CodeSummarizer({
        enabled: true,
        strategy: "hybrid",
        minConfidenceThreshold: 0.6,
      });
      const chunk: CodeChunk = {
        content: `/**
 * Validates user input for correctness
 */
function validateInput(input: string): boolean {
  return input.length > 0;
}`,
        tokenCount: 50,
        metadata: createTestMetadata({
          name: "validateInput",
          language: "typescript",
          isFunction: true,
          isClass: false,
          isImport: false,
        }),
      };

      const result = await summarizer.summarize(chunk);

      expect(result.generatedBy).toBe("docstring");
      expect(result.confidence).toBe(0.9);
      expect(result.needsAiSummary).toBe(false);
    });

    it("should flag exported functions when preferAiForExported is true", async () => {
      const summarizer = new CodeSummarizer({
        enabled: true,
        strategy: "hybrid",
        preferAiForExported: true,
        minConfidenceThreshold: 0.6,
      });
      const chunk: CodeChunk = {
        content: `/**
 * Core API function
 */
export function apiHandler() {}`,
        tokenCount: 50,
        metadata: createTestMetadata({
          name: "apiHandler",
          language: "typescript",
          isFunction: true,
          isClass: false,
          isImport: false,
          isExported: false, // Will be detected from content
        }),
      };

      const result = await summarizer.summarize(chunk);

      // Even with good docs, exported functions should be flagged
      expect(result.needsAiSummary).toBe(true);
    });

    it("should not flag in heuristic-only mode", async () => {
      const summarizer = new CodeSummarizer({
        enabled: true,
        strategy: "heuristic",
        minConfidenceThreshold: 0.6,
      });
      const chunk: CodeChunk = {
        content: `function doSomething() { return true; }`,
        tokenCount: 50,
        metadata: createTestMetadata({
          name: "doSomething",
          language: "typescript",
          isFunction: true,
          isClass: false,
          isImport: false,
        }),
      };

      const result = await summarizer.summarize(chunk);

      expect(result.needsAiSummary).toBe(false);
    });

    it("should detect public keyword for exported status", async () => {
      const summarizer = new CodeSummarizer({
        enabled: true,
        strategy: "hybrid",
        preferAiForExported: true,
        minConfidenceThreshold: 0.6,
      });
      const chunk: CodeChunk = {
        content: `/**
 * Gets user data
 */
public class UserService {}`,
        tokenCount: 50,
        metadata: createTestMetadata({
          name: "UserService",
          // Using typescript here as the test focuses on public keyword detection, not language-specific parsing
          language: "typescript",
          isFunction: false,
          isClass: true,
          isImport: false,
        }),
      };

      const result = await summarizer.summarize(chunk);

      expect(result.needsAiSummary).toBe(true);
    });

    it("should detect pub keyword for Rust exported status", async () => {
      const summarizer = new CodeSummarizer({
        enabled: true,
        strategy: "hybrid",
        preferAiForExported: true,
        minConfidenceThreshold: 0.6,
      });
      const chunk: CodeChunk = {
        content: `/// Process data
pub fn process() {}`,
        tokenCount: 50,
        metadata: createTestMetadata({
          name: "process",
          language: "rust",
          isFunction: true,
          isClass: false,
          isImport: false,
        }),
      };

      const result = await summarizer.summarize(chunk);

      expect(result.needsAiSummary).toBe(true);
    });
  });
});

describe("getUnsummarized", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.run(`
			CREATE TABLE IF NOT EXISTS code_nodes (
				id TEXT PRIMARY KEY,
				type TEXT NOT NULL,
				name TEXT NOT NULL,
				file_path TEXT NOT NULL,
				start_line INTEGER,
				end_line INTEGER,
				signature TEXT,
				summary TEXT,
				metadata TEXT DEFAULT '{}',
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			)
		`);

    const now = Math.floor(Date.now() / 1000);

    // Node with good summary
    db.run(
      `INSERT INTO code_nodes (id, type, name, file_path, summary, metadata, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "src/utils.ts:function:formatDate",
        "function",
        "formatDate",
        "src/utils.ts",
        "Formats a date to ISO string",
        JSON.stringify({ summaryGeneratedBy: "ai", summaryConfidence: 0.95 }),
        now,
        now,
      ],
    );

    // Node needing AI (low confidence)
    db.run(
      `INSERT INTO code_nodes (id, type, name, file_path, start_line, end_line, summary, metadata, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "src/utils.ts:function:doSomething",
        "function",
        "doSomething",
        "src/utils.ts",
        1,
        10,
        "Function doSomething",
        JSON.stringify({
          summaryGeneratedBy: "signature",
          summaryConfidence: 0.5,
          needsAiSummary: 1,
        }),
        now,
        now,
      ],
    );

    // Node with no summary
    db.run(
      `INSERT INTO code_nodes (id, type, name, file_path, start_line, end_line, summary, metadata, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "src/api.ts:function:handleRequest",
        "function",
        "handleRequest",
        "src/api.ts",
        1,
        20,
        null,
        JSON.stringify({}),
        now,
        now,
      ],
    );

    // Node with needsAiSummary flag
    db.run(
      `INSERT INTO code_nodes (id, type, name, file_path, start_line, end_line, summary, metadata, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "src/api.ts:class:ApiHandler",
        "class",
        "ApiHandler",
        "src/api.ts",
        21,
        50,
        "Class ApiHandler",
        JSON.stringify({
          summaryGeneratedBy: "signature",
          summaryConfidence: 0.5,
          needsAiSummary: 1,
        }),
        now,
        now,
      ],
    );
  });

  afterEach(() => {
    db.close();
  });

  it("should return nodes needing summaries", async () => {
    const result = await getUnsummarized(
      {
        limit: 10,
        includeCode: false,
        confidenceThreshold: 0.6,
      },
      db,
    );

    expect(result.total).toBe(3);
    expect(result.nodes.length).toBe(3);
  });

  it("should filter by file path", async () => {
    const result = await getUnsummarized(
      {
        filePath: "src/api.ts",
        limit: 10,
        includeCode: false,
        confidenceThreshold: 0.6,
      },
      db,
    );

    expect(result.total).toBe(2);
    expect(result.nodes.every((n) => n.filePath === "src/api.ts")).toBe(true);
  });

  it("should respect limit parameter", async () => {
    const result = await getUnsummarized(
      {
        limit: 2,
        includeCode: false,
        confidenceThreshold: 0.6,
      },
      db,
    );

    expect(result.nodes.length).toBe(2);
    expect(result.total).toBe(3);
  });

  it("should respect confidence threshold", async () => {
    const result = await getUnsummarized(
      {
        limit: 10,
        includeCode: false,
        confidenceThreshold: 0.4,
      },
      db,
    );

    // Nodes returned should either:
    // - have confidence < threshold, OR
    // - have no summary, OR
    // - have needsAiSummary flag set (checked by query)
    // The query uses OR conditions, so all results should meet at least one criteria
    expect(result.nodes.length).toBeGreaterThan(0);
    // Verify nodes with confidence >= threshold still appear if they have needsAiSummary flag
    const lowConfidenceOrNoSummary = result.nodes.filter(
      (n) => n.confidence < 0.4 || !n.currentSummary,
    );
    expect(lowConfidenceOrNoSummary.length).toBeGreaterThanOrEqual(1);
  });

  it("should include metadata in results", async () => {
    const result = await getUnsummarized(
      {
        limit: 10,
        includeCode: false,
        confidenceThreshold: 0.6,
      },
      db,
    );

    const node = result.nodes.find((n) => n.name === "doSomething");
    expect(node).toBeDefined();
    expect(node?.confidence).toBe(0.5);
    expect(node?.currentSummary).toBe("Function doSomething");
  });

  it("should return empty when no nodes need summaries", async () => {
    // Update all nodes to have high confidence
    const now = Math.floor(Date.now() / 1000);
    db.run(
      `UPDATE code_nodes SET summary = 'Good summary', metadata = ? WHERE summary IS NULL OR summary = ''`,
      [JSON.stringify({ summaryGeneratedBy: "ai", summaryConfidence: 0.95 })],
    );
    db.run(`UPDATE code_nodes SET metadata = ?`, [
      JSON.stringify({
        summaryGeneratedBy: "ai",
        summaryConfidence: 0.95,
        needsAiSummary: 0,
      }),
    ]);

    const result = await getUnsummarized(
      {
        limit: 10,
        includeCode: false,
        confidenceThreshold: 0.6,
      },
      db,
    );

    expect(result.total).toBe(0);
    expect(result.message).toContain("No nodes need AI summaries");
  });
});

describe("batchUpdateSummaries", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.run(`
			CREATE TABLE IF NOT EXISTS code_nodes (
				id TEXT PRIMARY KEY,
				type TEXT NOT NULL,
				name TEXT NOT NULL,
				file_path TEXT NOT NULL,
				start_line INTEGER,
				end_line INTEGER,
				signature TEXT,
				summary TEXT,
				metadata TEXT DEFAULT '{}',
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			)
		`);

    const now = Math.floor(Date.now() / 1000);

    // Create some nodes that need summaries
    db.run(
      `INSERT INTO code_nodes (id, type, name, file_path, summary, metadata, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "src/utils.ts:function:doSomething",
        "function",
        "doSomething",
        "src/utils.ts",
        "Function doSomething",
        JSON.stringify({
          summaryGeneratedBy: "signature",
          summaryConfidence: 0.5,
          needsAiSummary: 1,
        }),
        now,
        now,
      ],
    );

    db.run(
      `INSERT INTO code_nodes (id, type, name, file_path, summary, metadata, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "src/api.ts:function:handleRequest",
        "function",
        "handleRequest",
        "src/api.ts",
        null,
        JSON.stringify({}),
        now,
        now,
      ],
    );
  });

  afterEach(() => {
    db.close();
  });

  it("should update summaries for multiple nodes", async () => {
    const result = await batchUpdateSummaries(
      {
        summaries: [
          {
            nodeId: "src/utils.ts:function:doSomething",
            summary: "Performs an important operation on the data",
          },
          {
            nodeId: "src/api.ts:function:handleRequest",
            summary:
              "Handles incoming HTTP requests and routes them appropriately",
          },
        ],
      },
      db,
    );

    expect(result.updated).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.message).toContain("Successfully updated 2");
  });

  it("should set metadata correctly", async () => {
    await batchUpdateSummaries(
      {
        summaries: [
          {
            nodeId: "src/utils.ts:function:doSomething",
            summary: "Performs an important operation",
          },
        ],
      },
      db,
    );

    const row = db
      .query("SELECT summary, metadata FROM code_nodes WHERE id = ?")
      .get("src/utils.ts:function:doSomething") as any;

    expect(row.summary).toBe("Performs an important operation");

    const metadata = JSON.parse(row.metadata);
    expect(metadata.summaryGeneratedBy).toBe("ai");
    expect(metadata.summaryConfidence).toBe(0.95);
    expect(metadata.needsAiSummary).toBe(0);
  });

  it("should handle nonexistent nodes gracefully", async () => {
    const result = await batchUpdateSummaries(
      {
        summaries: [
          {
            nodeId: "src/utils.ts:function:doSomething",
            summary: "Valid update",
          },
          {
            nodeId: "nonexistent:function:fake",
            summary: "This should fail",
          },
        ],
      },
      db,
    );

    expect(result.updated).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.message).toContain("1 failed");
  });

  it("should return all failed when no nodes match", async () => {
    const result = await batchUpdateSummaries(
      {
        summaries: [
          {
            nodeId: "nonexistent:function:fake1",
            summary: "This should fail",
          },
          {
            nodeId: "nonexistent:function:fake2",
            summary: "This should also fail",
          },
        ],
      },
      db,
    );

    expect(result.updated).toBe(0);
    expect(result.failed).toBe(2);
  });

  it("should use transactions for efficiency", async () => {
    // Create many nodes
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 20; i++) {
      db.run(
        `INSERT INTO code_nodes (id, type, name, file_path, summary, metadata, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `src/batch.ts:function:func${i}`,
          "function",
          `func${i}`,
          "src/batch.ts",
          null,
          JSON.stringify({}),
          now,
          now,
        ],
      );
    }

    const summaries = Array.from({ length: 20 }, (_, i) => ({
      nodeId: `src/batch.ts:function:func${i}`,
      summary: `Summary for function ${i}`,
    }));

    const result = await batchUpdateSummaries({ summaries }, db);

    expect(result.updated).toBe(20);
    expect(result.failed).toBe(0);

    // Verify all updates were applied
    const count = db
      .query(
        "SELECT COUNT(*) as count FROM code_nodes WHERE summary LIKE 'Summary for function%'",
      )
      .get() as any;
    expect(count.count).toBe(20);
  });
});
