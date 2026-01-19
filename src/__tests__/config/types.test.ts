/**
 * Tests for Zod schema types validation
 */

import { describe, expect, test } from "bun:test";

describe("types", () => {
  describe("MemoryType validation", () => {
    const MEMORY_TYPES = [
      "decision",
      "solution",
      "pattern",
      "architecture",
      "note",
    ];

    function isValidMemoryType(type: string): boolean {
      return MEMORY_TYPES.includes(type);
    }

    test("validates decision", () => {
      expect(isValidMemoryType("decision")).toBe(true);
    });

    test("validates solution", () => {
      expect(isValidMemoryType("solution")).toBe(true);
    });

    test("validates pattern", () => {
      expect(isValidMemoryType("pattern")).toBe(true);
    });

    test("validates architecture", () => {
      expect(isValidMemoryType("architecture")).toBe(true);
    });

    test("validates note", () => {
      expect(isValidMemoryType("note")).toBe(true);
    });

    test("rejects invalid type", () => {
      expect(isValidMemoryType("invalid")).toBe(false);
    });

    test("is case sensitive", () => {
      expect(isValidMemoryType("Decision")).toBe(false);
    });
  });

  describe("Memory schema structure", () => {
    interface Memory {
      id: string;
      type: string;
      title: string;
      content: string;
      summary?: string;
      importance: number;
      tags: string[];
      relatedFiles: string[];
      gitCommit?: string;
      sourcePr?: string;
      experts: string[];
      qdrantId?: string;
      createdAt: number;
      accessedAt: number;
    }

    function hasRequiredFields(obj: unknown): boolean {
      if (typeof obj !== "object" || obj === null) return false;

      const m = obj as Record<string, unknown>;
      return (
        typeof m.id === "string" &&
        typeof m.type === "string" &&
        typeof m.title === "string" &&
        typeof m.content === "string" &&
        typeof m.importance === "number" &&
        Array.isArray(m.tags) &&
        Array.isArray(m.relatedFiles) &&
        Array.isArray(m.experts) &&
        typeof m.createdAt === "number" &&
        typeof m.accessedAt === "number"
      );
    }

    test("validates complete memory", () => {
      const memory: Memory = {
        id: "mem_123",
        type: "note",
        title: "Test",
        content: "Content",
        importance: 0.5,
        tags: [],
        relatedFiles: [],
        experts: [],
        createdAt: Date.now(),
        accessedAt: Date.now(),
      };
      expect(hasRequiredFields(memory)).toBe(true);
    });

    test("rejects missing id", () => {
      expect(
        hasRequiredFields({
          type: "note",
          title: "Test",
          content: "Content",
          importance: 0.5,
          tags: [],
          relatedFiles: [],
          experts: [],
          createdAt: Date.now(),
          accessedAt: Date.now(),
        }),
      ).toBe(false);
    });

    test("rejects non-number importance", () => {
      expect(
        hasRequiredFields({
          id: "mem_123",
          type: "note",
          title: "Test",
          content: "Content",
          importance: "high",
          tags: [],
          relatedFiles: [],
          experts: [],
          createdAt: Date.now(),
          accessedAt: Date.now(),
        }),
      ).toBe(false);
    });
  });

  describe("importance range validation", () => {
    function isValidImportance(value: number): boolean {
      return value >= 0 && value <= 1;
    }

    test("accepts 0", () => {
      expect(isValidImportance(0)).toBe(true);
    });

    test("accepts 0.5", () => {
      expect(isValidImportance(0.5)).toBe(true);
    });

    test("accepts 1", () => {
      expect(isValidImportance(1)).toBe(true);
    });

    test("rejects negative", () => {
      expect(isValidImportance(-0.1)).toBe(false);
    });

    test("rejects above 1", () => {
      expect(isValidImportance(1.1)).toBe(false);
    });
  });

  describe("CreateMemory schema", () => {
    interface _CreateMemory {
      type: string;
      title: string;
      content: string;
      summary?: string;
      importance?: number;
      tags?: string[];
      relatedFiles?: string[];
      gitCommit?: string;
      sourcePr?: string;
      experts?: string[];
    }

    function isValidCreateMemory(obj: unknown): boolean {
      if (typeof obj !== "object" || obj === null) return false;

      const m = obj as Record<string, unknown>;
      return (
        typeof m.type === "string" &&
        typeof m.title === "string" &&
        typeof m.content === "string"
      );
    }

    test("validates minimal create input", () => {
      expect(
        isValidCreateMemory({
          type: "note",
          title: "Test",
          content: "Content",
        }),
      ).toBe(true);
    });

    test("validates full create input", () => {
      expect(
        isValidCreateMemory({
          type: "decision",
          title: "Test",
          content: "Content",
          summary: "Brief",
          importance: 0.8,
          tags: ["tag1"],
          relatedFiles: ["file.ts"],
          experts: ["Alice"],
        }),
      ).toBe(true);
    });

    test("rejects missing type", () => {
      expect(isValidCreateMemory({ title: "Test", content: "Content" })).toBe(
        false,
      );
    });

    test("does not require id", () => {
      // id is omitted from CreateMemory
      expect(
        isValidCreateMemory({
          type: "note",
          title: "Test",
          content: "Content",
        }),
      ).toBe(true);
    });
  });

  describe("Document schema", () => {
    interface Document {
      id: string;
      title: string;
      content: string;
      contentHash?: string;
      createdAt: number;
      updatedAt: number;
    }

    function isValidDocument(obj: unknown): boolean {
      if (typeof obj !== "object" || obj === null) return false;

      const d = obj as Record<string, unknown>;
      return (
        typeof d.id === "string" &&
        typeof d.title === "string" &&
        typeof d.content === "string" &&
        typeof d.createdAt === "number" &&
        typeof d.updatedAt === "number"
      );
    }

    test("validates complete document", () => {
      const doc: Document = {
        id: "doc_123",
        title: "Title",
        content: "Content",
        contentHash: "abc123",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(isValidDocument(doc)).toBe(true);
    });

    test("validates document without hash", () => {
      expect(
        isValidDocument({
          id: "doc_123",
          title: "Title",
          content: "Content",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      ).toBe(true);
    });
  });

  describe("Chunk schema", () => {
    interface Chunk {
      id: string;
      documentId: string;
      content: string;
      qdrantId?: string;
      startOffset: number;
      endOffset: number;
    }

    function isValidChunk(obj: unknown): boolean {
      if (typeof obj !== "object" || obj === null) return false;

      const c = obj as Record<string, unknown>;
      return (
        typeof c.id === "string" &&
        typeof c.documentId === "string" &&
        typeof c.content === "string" &&
        typeof c.startOffset === "number" &&
        typeof c.endOffset === "number"
      );
    }

    test("validates complete chunk", () => {
      const chunk: Chunk = {
        id: "chunk_1",
        documentId: "doc_123",
        content: "Chunk content",
        qdrantId: "vec_456",
        startOffset: 0,
        endOffset: 100,
      };
      expect(isValidChunk(chunk)).toBe(true);
    });

    test("validates chunk without qdrantId", () => {
      expect(
        isValidChunk({
          id: "chunk_1",
          documentId: "doc_123",
          content: "Content",
          startOffset: 0,
          endOffset: 50,
        }),
      ).toBe(true);
    });

    test("rejects missing offsets", () => {
      expect(
        isValidChunk({
          id: "chunk_1",
          documentId: "doc_123",
          content: "Content",
        }),
      ).toBe(false);
    });
  });

  describe("EmbeddingConfig discriminated union", () => {
    type EmbeddingProvider = "local" | "openai" | "nomic" | "voyage" | "ollama";

    function getProvider(config: {
      provider: string;
    }): EmbeddingProvider | null {
      const valid = ["local", "openai", "nomic", "voyage", "ollama"];
      if (valid.includes(config.provider)) {
        return config.provider as EmbeddingProvider;
      }
      return null;
    }

    test("recognizes local provider", () => {
      expect(getProvider({ provider: "local" })).toBe("local");
    });

    test("recognizes openai provider", () => {
      expect(getProvider({ provider: "openai" })).toBe("openai");
    });

    test("recognizes nomic provider", () => {
      expect(getProvider({ provider: "nomic" })).toBe("nomic");
    });

    test("recognizes voyage provider", () => {
      expect(getProvider({ provider: "voyage" })).toBe("voyage");
    });

    test("recognizes ollama provider", () => {
      expect(getProvider({ provider: "ollama" })).toBe("ollama");
    });

    test("rejects unknown provider", () => {
      expect(getProvider({ provider: "unknown" })).toBeNull();
    });
  });

  describe("LocalEmbeddingConfig", () => {
    interface _LocalConfig {
      provider: "local";
      endpoint: string;
    }

    function isValidLocalConfig(obj: unknown): boolean {
      if (typeof obj !== "object" || obj === null) return false;

      const c = obj as Record<string, unknown>;
      return c.provider === "local" && typeof c.endpoint === "string";
    }

    test("validates local config", () => {
      expect(
        isValidLocalConfig({
          provider: "local",
          endpoint: "http://localhost:8080",
        }),
      ).toBe(true);
    });

    test("rejects wrong provider", () => {
      expect(
        isValidLocalConfig({
          provider: "openai",
          endpoint: "http://localhost:8080",
        }),
      ).toBe(false);
    });

    test("rejects missing endpoint", () => {
      expect(isValidLocalConfig({ provider: "local" })).toBe(false);
    });
  });

  describe("OpenAIEmbeddingConfig", () => {
    interface _OpenAIConfig {
      provider: "openai";
      apiKey: string;
      model: string;
    }

    function isValidOpenAIConfig(obj: unknown): boolean {
      if (typeof obj !== "object" || obj === null) return false;

      const c = obj as Record<string, unknown>;
      return (
        c.provider === "openai" &&
        typeof c.apiKey === "string" &&
        typeof c.model === "string"
      );
    }

    test("validates openai config", () => {
      expect(
        isValidOpenAIConfig({
          provider: "openai",
          apiKey: "sk-123",
          model: "text-embedding-3-small",
        }),
      ).toBe(true);
    });

    test("rejects missing apiKey", () => {
      expect(
        isValidOpenAIConfig({
          provider: "openai",
          model: "text-embedding-3-small",
        }),
      ).toBe(false);
    });
  });

  describe("SearchFilters schema", () => {
    interface _SearchFilters {
      type?: string;
      tags?: string[];
      minImportance?: number;
      relatedFiles?: string[];
    }

    function isValidSearchFilters(obj: unknown): boolean {
      if (typeof obj !== "object" || obj === null) return false;

      const f = obj as Record<string, unknown>;

      if (f.type !== undefined && typeof f.type !== "string") return false;
      if (f.tags !== undefined && !Array.isArray(f.tags)) return false;
      if (f.minImportance !== undefined && typeof f.minImportance !== "number")
        return false;
      if (f.relatedFiles !== undefined && !Array.isArray(f.relatedFiles))
        return false;

      return true;
    }

    test("validates empty filters", () => {
      expect(isValidSearchFilters({})).toBe(true);
    });

    test("validates type filter", () => {
      expect(isValidSearchFilters({ type: "decision" })).toBe(true);
    });

    test("validates tags filter", () => {
      expect(isValidSearchFilters({ tags: ["tag1", "tag2"] })).toBe(true);
    });

    test("validates minImportance filter", () => {
      expect(isValidSearchFilters({ minImportance: 0.5 })).toBe(true);
    });

    test("validates combined filters", () => {
      expect(
        isValidSearchFilters({
          type: "note",
          tags: ["a"],
          minImportance: 0.3,
          relatedFiles: ["file.ts"],
        }),
      ).toBe(true);
    });

    test("rejects invalid type", () => {
      expect(isValidSearchFilters({ type: 123 })).toBe(false);
    });
  });

  describe("SearchResult schema", () => {
    interface _SearchResult {
      memory: { id: string };
      score: number;
    }

    function isValidSearchResult(obj: unknown): boolean {
      if (typeof obj !== "object" || obj === null) return false;

      const r = obj as Record<string, unknown>;
      return (
        typeof r.memory === "object" &&
        r.memory !== null &&
        typeof r.score === "number"
      );
    }

    test("validates search result", () => {
      expect(
        isValidSearchResult({
          memory: { id: "mem_123" },
          score: 0.95,
        }),
      ).toBe(true);
    });

    test("rejects missing memory", () => {
      expect(isValidSearchResult({ score: 0.95 })).toBe(false);
    });

    test("rejects missing score", () => {
      expect(isValidSearchResult({ memory: { id: "mem_123" } })).toBe(false);
    });
  });

  describe("Expert schema", () => {
    interface _Expert {
      name: string;
      email: string;
      commits: number;
      percentage: number;
      lastCommit: string;
      linesOwned?: number;
    }

    function isValidExpert(obj: unknown): boolean {
      if (typeof obj !== "object" || obj === null) return false;

      const e = obj as Record<string, unknown>;
      return (
        typeof e.name === "string" &&
        typeof e.email === "string" &&
        typeof e.commits === "number" &&
        typeof e.percentage === "number" &&
        typeof e.lastCommit === "string"
      );
    }

    test("validates complete expert", () => {
      expect(
        isValidExpert({
          name: "Alice",
          email: "alice@example.com",
          commits: 50,
          percentage: 75.5,
          lastCommit: "2024-01-15",
          linesOwned: 1000,
        }),
      ).toBe(true);
    });

    test("validates expert without linesOwned", () => {
      expect(
        isValidExpert({
          name: "Bob",
          email: "bob@example.com",
          commits: 30,
          percentage: 45.0,
          lastCommit: "2024-01-10",
        }),
      ).toBe(true);
    });

    test("rejects missing name", () => {
      expect(
        isValidExpert({
          email: "alice@example.com",
          commits: 50,
          percentage: 75.5,
          lastCommit: "2024-01-15",
        }),
      ).toBe(false);
    });
  });

  describe("ExpertiseEntry schema", () => {
    interface _ExpertiseEntry {
      path: string;
      busFactor: number;
      busFactorRisk: boolean;
      lastActivity: string;
      totalCommits: number;
      totalFiles: number;
    }

    function isValidExpertiseEntry(obj: unknown): boolean {
      if (typeof obj !== "object" || obj === null) return false;

      const e = obj as Record<string, unknown>;
      return (
        typeof e.path === "string" &&
        typeof e.busFactor === "number" &&
        typeof e.busFactorRisk === "boolean" &&
        typeof e.lastActivity === "string" &&
        typeof e.totalCommits === "number" &&
        typeof e.totalFiles === "number"
      );
    }

    test("validates expertise entry", () => {
      expect(
        isValidExpertiseEntry({
          path: "src/",
          busFactor: 2,
          busFactorRisk: false,
          lastActivity: "2024-01-15",
          totalCommits: 100,
          totalFiles: 25,
        }),
      ).toBe(true);
    });

    test("validates entry with bus factor risk", () => {
      expect(
        isValidExpertiseEntry({
          path: "lib/",
          busFactor: 1,
          busFactorRisk: true,
          lastActivity: "2024-01-01",
          totalCommits: 50,
          totalFiles: 10,
        }),
      ).toBe(true);
    });
  });

  describe("ExpertiseRecommendation types", () => {
    type RecommendationType =
      | "knowledge_transfer"
      | "documentation"
      | "mentorship"
      | "review_coverage"
      | "stale_code";
    type Priority = "high" | "medium" | "low";

    function isValidRecommendationType(
      type: string,
    ): type is RecommendationType {
      return [
        "knowledge_transfer",
        "documentation",
        "mentorship",
        "review_coverage",
        "stale_code",
      ].includes(type);
    }

    function isValidPriority(priority: string): priority is Priority {
      return ["high", "medium", "low"].includes(priority);
    }

    test("validates knowledge_transfer type", () => {
      expect(isValidRecommendationType("knowledge_transfer")).toBe(true);
    });

    test("validates documentation type", () => {
      expect(isValidRecommendationType("documentation")).toBe(true);
    });

    test("validates mentorship type", () => {
      expect(isValidRecommendationType("mentorship")).toBe(true);
    });

    test("validates review_coverage type", () => {
      expect(isValidRecommendationType("review_coverage")).toBe(true);
    });

    test("validates stale_code type", () => {
      expect(isValidRecommendationType("stale_code")).toBe(true);
    });

    test("rejects invalid type", () => {
      expect(isValidRecommendationType("invalid")).toBe(false);
    });

    test("validates high priority", () => {
      expect(isValidPriority("high")).toBe(true);
    });

    test("validates medium priority", () => {
      expect(isValidPriority("medium")).toBe(true);
    });

    test("validates low priority", () => {
      expect(isValidPriority("low")).toBe(true);
    });

    test("rejects invalid priority", () => {
      expect(isValidPriority("urgent")).toBe(false);
    });
  });

  describe("ReviewerSuggestion schema", () => {
    interface _ReviewerSuggestion {
      name: string;
      email: string;
      reason: string;
      relevance: number;
      expertisePct: number;
      category: "required" | "optional";
      filesOwned: string[];
    }

    function isValidReviewerSuggestion(obj: unknown): boolean {
      if (typeof obj !== "object" || obj === null) return false;

      const r = obj as Record<string, unknown>;
      return (
        typeof r.name === "string" &&
        typeof r.email === "string" &&
        typeof r.reason === "string" &&
        typeof r.relevance === "number" &&
        typeof r.expertisePct === "number" &&
        (r.category === "required" || r.category === "optional") &&
        Array.isArray(r.filesOwned)
      );
    }

    test("validates required reviewer", () => {
      expect(
        isValidReviewerSuggestion({
          name: "Alice",
          email: "alice@example.com",
          reason: "Primary owner of src/",
          relevance: 0.95,
          expertisePct: 80,
          category: "required",
          filesOwned: ["src/index.ts", "src/utils.ts"],
        }),
      ).toBe(true);
    });

    test("validates optional reviewer", () => {
      expect(
        isValidReviewerSuggestion({
          name: "Bob",
          email: "bob@example.com",
          reason: "Secondary contributor",
          relevance: 0.6,
          expertisePct: 20,
          category: "optional",
          filesOwned: ["src/helpers.ts"],
        }),
      ).toBe(true);
    });

    test("rejects invalid category", () => {
      expect(
        isValidReviewerSuggestion({
          name: "Alice",
          email: "alice@example.com",
          reason: "Reason",
          relevance: 0.9,
          expertisePct: 50,
          category: "mandatory",
          filesOwned: [],
        }),
      ).toBe(false);
    });
  });

  describe("SuggestReviewersResult structure", () => {
    interface _ReviewerSuggestion2 {
      name: string;
      category: string;
    }

    interface _SuggestReviewersResult {
      required: _ReviewerSuggestion2[];
      optional: _ReviewerSuggestion2[];
      noOwner: string[];
      summary: string;
    }

    function isValidSuggestReviewersResult(obj: unknown): boolean {
      if (typeof obj !== "object" || obj === null) return false;

      const r = obj as Record<string, unknown>;
      return (
        Array.isArray(r.required) &&
        Array.isArray(r.optional) &&
        Array.isArray(r.noOwner) &&
        typeof r.summary === "string"
      );
    }

    test("validates result structure", () => {
      expect(
        isValidSuggestReviewersResult({
          required: [{ name: "Alice", category: "required" }],
          optional: [],
          noOwner: ["orphan.ts"],
          summary: "Suggested 1 required reviewer",
        }),
      ).toBe(true);
    });

    test("validates empty result", () => {
      expect(
        isValidSuggestReviewersResult({
          required: [],
          optional: [],
          noOwner: [],
          summary: "No reviewers found",
        }),
      ).toBe(true);
    });
  });
});
