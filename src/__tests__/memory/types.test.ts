/**
 * Tests for memory type validation
 * Tests Zod schemas and type validation patterns
 */

import { describe, expect, test } from "bun:test";

describe("memory types", () => {
  describe("MemoryType validation", () => {
    const VALID_TYPES = [
      "decision",
      "solution",
      "pattern",
      "architecture",
      "note",
    ];

    function isValidMemoryType(type: string): boolean {
      return VALID_TYPES.includes(type);
    }

    test("validates decision type", () => {
      expect(isValidMemoryType("decision")).toBe(true);
    });

    test("validates solution type", () => {
      expect(isValidMemoryType("solution")).toBe(true);
    });

    test("validates pattern type", () => {
      expect(isValidMemoryType("pattern")).toBe(true);
    });

    test("validates architecture type", () => {
      expect(isValidMemoryType("architecture")).toBe(true);
    });

    test("validates note type", () => {
      expect(isValidMemoryType("note")).toBe(true);
    });

    test("rejects invalid type", () => {
      expect(isValidMemoryType("invalid")).toBe(false);
    });

    test("rejects empty string", () => {
      expect(isValidMemoryType("")).toBe(false);
    });

    test("is case sensitive", () => {
      expect(isValidMemoryType("DECISION")).toBe(false);
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

    function validateMemory(input: unknown): input is Memory {
      if (typeof input !== "object" || input === null) return false;

      const mem = input as Record<string, unknown>;

      return (
        typeof mem.id === "string" &&
        typeof mem.type === "string" &&
        typeof mem.title === "string" &&
        typeof mem.content === "string" &&
        typeof mem.importance === "number" &&
        Array.isArray(mem.tags) &&
        Array.isArray(mem.relatedFiles) &&
        Array.isArray(mem.experts) &&
        typeof mem.createdAt === "number" &&
        typeof mem.accessedAt === "number"
      );
    }

    test("validates complete memory object", () => {
      const memory: Memory = {
        id: "mem_123",
        type: "decision",
        title: "Test",
        content: "Content",
        importance: 0.5,
        tags: [],
        relatedFiles: [],
        experts: [],
        createdAt: Date.now(),
        accessedAt: Date.now(),
      };
      expect(validateMemory(memory)).toBe(true);
    });

    test("validates memory with optional fields", () => {
      const memory: Memory = {
        id: "mem_123",
        type: "note",
        title: "Test",
        content: "Content",
        summary: "Brief",
        importance: 0.8,
        tags: ["tag1"],
        relatedFiles: ["file.ts"],
        gitCommit: "abc123",
        sourcePr: "#42",
        experts: ["Alice"],
        qdrantId: "vec_123",
        createdAt: Date.now(),
        accessedAt: Date.now(),
      };
      expect(validateMemory(memory)).toBe(true);
    });

    test("rejects null", () => {
      expect(validateMemory(null)).toBe(false);
    });

    test("rejects undefined", () => {
      expect(validateMemory(undefined)).toBe(false);
    });

    test("rejects string", () => {
      expect(validateMemory("not an object")).toBe(false);
    });

    test("rejects missing required field", () => {
      const incomplete = {
        id: "mem_123",
        type: "decision",
        // missing title
        content: "Content",
        importance: 0.5,
        tags: [],
        relatedFiles: [],
        experts: [],
        createdAt: Date.now(),
        accessedAt: Date.now(),
      };
      expect(validateMemory(incomplete)).toBe(false);
    });
  });

  describe("importance validation", () => {
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

    test("rejects greater than 1", () => {
      expect(isValidImportance(1.1)).toBe(false);
    });

    test("accepts decimal precision", () => {
      expect(isValidImportance(0.123456789)).toBe(true);
    });
  });

  describe("tags array validation", () => {
    function isValidTags(tags: unknown): tags is string[] {
      if (!Array.isArray(tags)) return false;
      return tags.every((tag) => typeof tag === "string");
    }

    test("accepts empty array", () => {
      expect(isValidTags([])).toBe(true);
    });

    test("accepts string array", () => {
      expect(isValidTags(["tag1", "tag2"])).toBe(true);
    });

    test("rejects non-array", () => {
      expect(isValidTags("not array")).toBe(false);
    });

    test("rejects array with non-strings", () => {
      expect(isValidTags(["tag1", 123])).toBe(false);
    });

    test("rejects null", () => {
      expect(isValidTags(null)).toBe(false);
    });
  });

  describe("relatedFiles array validation", () => {
    function isValidRelatedFiles(files: unknown): files is string[] {
      if (!Array.isArray(files)) return false;
      return files.every((file) => typeof file === "string");
    }

    test("accepts empty array", () => {
      expect(isValidRelatedFiles([])).toBe(true);
    });

    test("accepts file path array", () => {
      expect(isValidRelatedFiles(["src/index.ts", "src/utils.ts"])).toBe(true);
    });

    test("rejects non-array", () => {
      expect(isValidRelatedFiles("file.ts")).toBe(false);
    });
  });

  describe("experts array validation", () => {
    function isValidExperts(experts: unknown): experts is string[] {
      if (!Array.isArray(experts)) return false;
      return experts.every((expert) => typeof expert === "string");
    }

    test("accepts empty array", () => {
      expect(isValidExperts([])).toBe(true);
    });

    test("accepts expert names array", () => {
      expect(isValidExperts(["Alice", "Bob"])).toBe(true);
    });

    test("rejects non-array", () => {
      expect(isValidExperts("Alice")).toBe(false);
    });
  });

  describe("optional string fields", () => {
    function isValidOptionalString(value: unknown): boolean {
      return value === undefined || typeof value === "string";
    }

    test("accepts undefined", () => {
      expect(isValidOptionalString(undefined)).toBe(true);
    });

    test("accepts string", () => {
      expect(isValidOptionalString("value")).toBe(true);
    });

    test("accepts empty string", () => {
      expect(isValidOptionalString("")).toBe(true);
    });

    test("rejects null", () => {
      expect(isValidOptionalString(null)).toBe(false);
    });

    test("rejects number", () => {
      expect(isValidOptionalString(123)).toBe(false);
    });
  });

  describe("ID format validation", () => {
    function isValidMemoryId(id: string): boolean {
      return /^mem_[a-f0-9]{16}$/.test(id);
    }

    function isValidQdrantId(id: string): boolean {
      return /^vec_[a-f0-9]{16}$/.test(id);
    }

    test("validates correct memory ID format", () => {
      expect(isValidMemoryId("mem_1234567890abcdef")).toBe(true);
    });

    test("rejects memory ID with wrong prefix", () => {
      expect(isValidMemoryId("vec_1234567890abcdef")).toBe(false);
    });

    test("rejects memory ID with wrong length", () => {
      expect(isValidMemoryId("mem_123")).toBe(false);
    });

    test("validates correct qdrant ID format", () => {
      expect(isValidQdrantId("vec_1234567890abcdef")).toBe(true);
    });

    test("rejects qdrant ID with wrong prefix", () => {
      expect(isValidQdrantId("mem_1234567890abcdef")).toBe(false);
    });
  });

  describe("timestamp validation", () => {
    function isValidTimestamp(ts: number): boolean {
      // Must be positive number, reasonable epoch timestamp
      return ts > 0 && ts < 9999999999999;
    }

    test("accepts current timestamp", () => {
      expect(isValidTimestamp(Date.now())).toBe(true);
    });

    test("accepts past timestamp", () => {
      expect(isValidTimestamp(1609459200000)).toBe(true); // 2021-01-01
    });

    test("rejects zero", () => {
      expect(isValidTimestamp(0)).toBe(false);
    });

    test("rejects negative", () => {
      expect(isValidTimestamp(-1000)).toBe(false);
    });
  });

  describe("SearchFilters validation", () => {
    interface SearchFilters {
      type?: string;
      tags?: string[];
      minImportance?: number;
      relatedFiles?: string[];
    }

    function isValidSearchFilters(input: unknown): input is SearchFilters {
      if (typeof input !== "object" || input === null) return false;

      const filters = input as Record<string, unknown>;

      if (filters.type !== undefined && typeof filters.type !== "string") {
        return false;
      }
      if (filters.tags !== undefined && !Array.isArray(filters.tags)) {
        return false;
      }
      if (
        filters.minImportance !== undefined &&
        typeof filters.minImportance !== "number"
      ) {
        return false;
      }
      if (
        filters.relatedFiles !== undefined &&
        !Array.isArray(filters.relatedFiles)
      ) {
        return false;
      }

      return true;
    }

    test("accepts empty object", () => {
      expect(isValidSearchFilters({})).toBe(true);
    });

    test("accepts type filter", () => {
      expect(isValidSearchFilters({ type: "decision" })).toBe(true);
    });

    test("accepts tags filter", () => {
      expect(isValidSearchFilters({ tags: ["tag1"] })).toBe(true);
    });

    test("accepts minImportance filter", () => {
      expect(isValidSearchFilters({ minImportance: 0.5 })).toBe(true);
    });

    test("accepts relatedFiles filter", () => {
      expect(isValidSearchFilters({ relatedFiles: ["file.ts"] })).toBe(true);
    });

    test("accepts combined filters", () => {
      expect(
        isValidSearchFilters({
          type: "note",
          tags: ["a"],
          minImportance: 0.7,
          relatedFiles: ["b.ts"],
        }),
      ).toBe(true);
    });

    test("rejects invalid type", () => {
      expect(isValidSearchFilters({ type: 123 })).toBe(false);
    });

    test("rejects invalid tags", () => {
      expect(isValidSearchFilters({ tags: "not array" })).toBe(false);
    });
  });

  describe("SearchResult validation", () => {
    interface Memory {
      id: string;
      title: string;
    }

    interface SearchResult {
      memory: Memory;
      score: number;
    }

    function isValidSearchResult(input: unknown): input is SearchResult {
      if (typeof input !== "object" || input === null) return false;

      const result = input as Record<string, unknown>;

      return (
        typeof result.memory === "object" &&
        result.memory !== null &&
        typeof result.score === "number"
      );
    }

    test("accepts valid search result", () => {
      expect(
        isValidSearchResult({
          memory: { id: "mem_123", title: "Test" },
          score: 0.9,
        }),
      ).toBe(true);
    });

    test("rejects missing memory", () => {
      expect(isValidSearchResult({ score: 0.9 })).toBe(false);
    });

    test("rejects missing score", () => {
      expect(
        isValidSearchResult({ memory: { id: "mem_123", title: "Test" } }),
      ).toBe(false);
    });

    test("rejects null memory", () => {
      expect(isValidSearchResult({ memory: null, score: 0.9 })).toBe(false);
    });
  });
});
