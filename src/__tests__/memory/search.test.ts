/**
 * Tests for searchMemory function helper logic
 * Tests the pure function patterns used in search.ts
 */

import { describe, expect, test } from "bun:test";

describe("searchMemory", () => {
  describe("filter building", () => {
    interface SearchFilters {
      type?: string;
      tags?: string[];
      minImportance?: number;
      relatedFiles?: string[];
    }

    function buildFilters(input: {
      type?: string;
      tags?: string[];
      minImportance?: number;
      relatedFiles?: string[];
    }): SearchFilters {
      const filters: SearchFilters = {};

      if (input.type !== undefined) {
        filters.type = input.type;
      }
      if (input.tags !== undefined && input.tags.length > 0) {
        filters.tags = input.tags;
      }
      if (input.minImportance !== undefined) {
        filters.minImportance = input.minImportance;
      }
      if (input.relatedFiles !== undefined && input.relatedFiles.length > 0) {
        filters.relatedFiles = input.relatedFiles;
      }

      return filters;
    }

    test("builds empty filters when no input", () => {
      const filters = buildFilters({});
      expect(filters).toEqual({});
    });

    test("includes type filter", () => {
      const filters = buildFilters({ type: "decision" });
      expect(filters.type).toBe("decision");
    });

    test("includes tags filter", () => {
      const filters = buildFilters({ tags: ["typescript", "api"] });
      expect(filters.tags).toEqual(["typescript", "api"]);
    });

    test("excludes empty tags array", () => {
      const filters = buildFilters({ tags: [] });
      expect(filters.tags).toBeUndefined();
    });

    test("includes minImportance filter", () => {
      const filters = buildFilters({ minImportance: 0.7 });
      expect(filters.minImportance).toBe(0.7);
    });

    test("includes relatedFiles filter", () => {
      const filters = buildFilters({ relatedFiles: ["src/index.ts"] });
      expect(filters.relatedFiles).toEqual(["src/index.ts"]);
    });

    test("excludes empty relatedFiles array", () => {
      const filters = buildFilters({ relatedFiles: [] });
      expect(filters.relatedFiles).toBeUndefined();
    });

    test("combines multiple filters", () => {
      const filters = buildFilters({
        type: "pattern",
        tags: ["react"],
        minImportance: 0.5,
        relatedFiles: ["src/App.tsx"],
      });

      expect(filters.type).toBe("pattern");
      expect(filters.tags).toEqual(["react"]);
      expect(filters.minImportance).toBe(0.5);
      expect(filters.relatedFiles).toEqual(["src/App.tsx"]);
    });
  });

  describe("result mapping", () => {
    interface VectorResult {
      memoryId: string;
      score: number;
    }

    interface Memory {
      id: string;
      title: string;
      content: string;
      type: string;
    }

    interface SearchResult {
      memory: Memory;
      score: number;
    }

    function mapResultsToMemories(
      vectorResults: VectorResult[],
      memories: Memory[],
    ): SearchResult[] {
      const scoreMap = new Map(vectorResults.map((r) => [r.memoryId, r.score]));

      return memories
        .map((memory) => ({
          memory,
          score: scoreMap.get(memory.id) ?? 0,
        }))
        .sort((a, b) => b.score - a.score);
    }

    test("maps scores to memories", () => {
      const vectorResults: VectorResult[] = [
        { memoryId: "mem_1", score: 0.9 },
        { memoryId: "mem_2", score: 0.7 },
      ];
      const memories: Memory[] = [
        { id: "mem_1", title: "First", content: "Content 1", type: "note" },
        { id: "mem_2", title: "Second", content: "Content 2", type: "note" },
      ];

      const results = mapResultsToMemories(vectorResults, memories);

      expect(results[0].memory.id).toBe("mem_1");
      expect(results[0].score).toBe(0.9);
      expect(results[1].memory.id).toBe("mem_2");
      expect(results[1].score).toBe(0.7);
    });

    test("sorts by score descending", () => {
      const vectorResults: VectorResult[] = [
        { memoryId: "mem_1", score: 0.5 },
        { memoryId: "mem_2", score: 0.9 },
        { memoryId: "mem_3", score: 0.7 },
      ];
      const memories: Memory[] = [
        { id: "mem_1", title: "A", content: "A", type: "note" },
        { id: "mem_2", title: "B", content: "B", type: "note" },
        { id: "mem_3", title: "C", content: "C", type: "note" },
      ];

      const results = mapResultsToMemories(vectorResults, memories);

      expect(results[0].score).toBe(0.9);
      expect(results[1].score).toBe(0.7);
      expect(results[2].score).toBe(0.5);
    });

    test("handles missing scores with default 0", () => {
      const vectorResults: VectorResult[] = [{ memoryId: "mem_1", score: 0.8 }];
      const memories: Memory[] = [
        { id: "mem_1", title: "A", content: "A", type: "note" },
        { id: "mem_2", title: "B", content: "B", type: "note" },
      ];

      const results = mapResultsToMemories(vectorResults, memories);

      expect(results[0].score).toBe(0.8);
      expect(results[1].score).toBe(0);
    });

    test("handles empty results", () => {
      const results = mapResultsToMemories([], []);
      expect(results).toEqual([]);
    });

    test("handles equal scores", () => {
      const vectorResults: VectorResult[] = [
        { memoryId: "mem_1", score: 0.8 },
        { memoryId: "mem_2", score: 0.8 },
      ];
      const memories: Memory[] = [
        { id: "mem_1", title: "A", content: "A", type: "note" },
        { id: "mem_2", title: "B", content: "B", type: "note" },
      ];

      const results = mapResultsToMemories(vectorResults, memories);

      expect(results.length).toBe(2);
      expect(results[0].score).toBe(0.8);
      expect(results[1].score).toBe(0.8);
    });
  });

  describe("limit validation", () => {
    function validateLimit(limit: number | undefined): number {
      const defaultLimit = 10;
      const minLimit = 1;
      const maxLimit = 50;

      if (limit === undefined) return defaultLimit;
      return Math.max(minLimit, Math.min(maxLimit, limit));
    }

    test("uses default limit when undefined", () => {
      expect(validateLimit(undefined)).toBe(10);
    });

    test("accepts valid limit", () => {
      expect(validateLimit(5)).toBe(5);
      expect(validateLimit(25)).toBe(25);
    });

    test("clamps to minimum", () => {
      expect(validateLimit(0)).toBe(1);
      expect(validateLimit(-5)).toBe(1);
    });

    test("clamps to maximum", () => {
      expect(validateLimit(100)).toBe(50);
      expect(validateLimit(51)).toBe(50);
    });

    test("accepts boundary values", () => {
      expect(validateLimit(1)).toBe(1);
      expect(validateLimit(50)).toBe(50);
    });
  });

  describe("memory ID extraction", () => {
    function extractMemoryIds(
      vectorResults: Array<{ memoryId: string }>,
    ): string[] {
      return vectorResults.map((r) => r.memoryId);
    }

    test("extracts IDs from results", () => {
      const results = [
        { memoryId: "mem_1", score: 0.9 },
        { memoryId: "mem_2", score: 0.8 },
      ];

      expect(extractMemoryIds(results)).toEqual(["mem_1", "mem_2"]);
    });

    test("handles empty results", () => {
      expect(extractMemoryIds([])).toEqual([]);
    });

    test("preserves order", () => {
      const results = [
        { memoryId: "mem_3" },
        { memoryId: "mem_1" },
        { memoryId: "mem_2" },
      ];

      expect(extractMemoryIds(results)).toEqual(["mem_3", "mem_1", "mem_2"]);
    });
  });

  describe("score normalization", () => {
    function normalizeScore(score: number): number {
      return Math.max(0, Math.min(1, score));
    }

    test("passes through valid scores", () => {
      expect(normalizeScore(0.5)).toBe(0.5);
      expect(normalizeScore(0)).toBe(0);
      expect(normalizeScore(1)).toBe(1);
    });

    test("clamps negative scores to 0", () => {
      expect(normalizeScore(-0.5)).toBe(0);
      expect(normalizeScore(-1)).toBe(0);
    });

    test("clamps scores above 1 to 1", () => {
      expect(normalizeScore(1.5)).toBe(1);
      expect(normalizeScore(2)).toBe(1);
    });
  });

  describe("empty result handling", () => {
    function handleEmptyResults<T>(results: T[]): T[] {
      if (results.length === 0) {
        return [];
      }
      return results;
    }

    test("returns empty array for empty input", () => {
      expect(handleEmptyResults([])).toEqual([]);
    });

    test("returns input for non-empty array", () => {
      const input = [{ id: "1" }, { id: "2" }];
      expect(handleEmptyResults(input)).toBe(input);
    });
  });

  describe("query preprocessing", () => {
    function preprocessQuery(query: string): string {
      return query.trim();
    }

    test("trims whitespace", () => {
      expect(preprocessQuery("  query  ")).toBe("query");
    });

    test("preserves internal spaces", () => {
      expect(preprocessQuery("multi word query")).toBe("multi word query");
    });

    test("handles empty query", () => {
      expect(preprocessQuery("")).toBe("");
    });

    test("handles whitespace only", () => {
      expect(preprocessQuery("   ")).toBe("");
    });
  });

  describe("tag matching", () => {
    function matchesAnyTag(
      memoryTags: string[],
      filterTags: string[],
    ): boolean {
      if (filterTags.length === 0) return true;
      return filterTags.some((tag) => memoryTags.includes(tag));
    }

    test("matches when memory has filter tag", () => {
      expect(matchesAnyTag(["a", "b", "c"], ["b"])).toBe(true);
    });

    test("matches when any filter tag present", () => {
      expect(matchesAnyTag(["a", "b"], ["c", "d", "a"])).toBe(true);
    });

    test("does not match when no tags overlap", () => {
      expect(matchesAnyTag(["a", "b"], ["c", "d"])).toBe(false);
    });

    test("matches all when filter is empty", () => {
      expect(matchesAnyTag(["a", "b"], [])).toBe(true);
    });

    test("does not match when memory has no tags", () => {
      expect(matchesAnyTag([], ["a"])).toBe(false);
    });
  });

  describe("importance filtering", () => {
    function meetsImportanceThreshold(
      importance: number,
      minImportance?: number,
    ): boolean {
      if (minImportance === undefined) return true;
      return importance >= minImportance;
    }

    test("passes when no threshold", () => {
      expect(meetsImportanceThreshold(0.3, undefined)).toBe(true);
    });

    test("passes when above threshold", () => {
      expect(meetsImportanceThreshold(0.8, 0.5)).toBe(true);
    });

    test("passes when equal to threshold", () => {
      expect(meetsImportanceThreshold(0.5, 0.5)).toBe(true);
    });

    test("fails when below threshold", () => {
      expect(meetsImportanceThreshold(0.3, 0.5)).toBe(false);
    });

    test("handles zero threshold", () => {
      expect(meetsImportanceThreshold(0, 0)).toBe(true);
    });

    test("handles max threshold", () => {
      expect(meetsImportanceThreshold(1, 1)).toBe(true);
      expect(meetsImportanceThreshold(0.99, 1)).toBe(false);
    });
  });

  describe("file matching", () => {
    function matchesAnyFile(
      memoryFiles: string[],
      filterFiles: string[],
    ): boolean {
      if (filterFiles.length === 0) return true;
      return filterFiles.some((file) => memoryFiles.includes(file));
    }

    test("matches when memory has filter file", () => {
      expect(matchesAnyFile(["src/a.ts", "src/b.ts"], ["src/a.ts"])).toBe(true);
    });

    test("matches when any filter file present", () => {
      expect(
        matchesAnyFile(["src/a.ts"], ["src/x.ts", "src/a.ts", "src/y.ts"]),
      ).toBe(true);
    });

    test("does not match when no files overlap", () => {
      expect(matchesAnyFile(["src/a.ts"], ["src/b.ts"])).toBe(false);
    });

    test("matches all when filter is empty", () => {
      expect(matchesAnyFile(["src/a.ts"], [])).toBe(true);
    });

    test("does not match when memory has no files", () => {
      expect(matchesAnyFile([], ["src/a.ts"])).toBe(false);
    });
  });
});
