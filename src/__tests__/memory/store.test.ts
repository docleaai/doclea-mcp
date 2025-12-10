/**
 * Tests for storeMemory function helper logic
 * Tests the pure function patterns used in store.ts
 */

import { describe, expect, test } from "bun:test";

describe("storeMemory", () => {
  describe("ID generation", () => {
    function generateMemoryId(): string {
      const uuid = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      return `mem_${uuid}`;
    }

    function generateVectorId(): string {
      const uuid = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      return `vec_${uuid}`;
    }

    test("memory ID has correct prefix", () => {
      const id = generateMemoryId();
      expect(id.startsWith("mem_")).toBe(true);
    });

    test("memory ID has correct length", () => {
      const id = generateMemoryId();
      // "mem_" (4) + 16 chars = 20
      expect(id.length).toBe(20);
    });

    test("vector ID has correct prefix", () => {
      const id = generateVectorId();
      expect(id.startsWith("vec_")).toBe(true);
    });

    test("vector ID has correct length", () => {
      const id = generateVectorId();
      // "vec_" (4) + 16 chars = 20
      expect(id.length).toBe(20);
    });

    test("generated IDs are unique", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateMemoryId());
      }
      expect(ids.size).toBe(100);
    });

    test("ID contains only alphanumeric after prefix", () => {
      const id = generateMemoryId();
      const suffix = id.slice(4);
      expect(/^[a-f0-9]+$/.test(suffix)).toBe(true);
    });
  });

  describe("text embedding preparation", () => {
    function prepareTextForEmbedding(title: string, content: string): string {
      return `${title}\n\n${content}`;
    }

    test("combines title and content with double newline", () => {
      const result = prepareTextForEmbedding("My Title", "My content here");
      expect(result).toBe("My Title\n\nMy content here");
    });

    test("handles empty title", () => {
      const result = prepareTextForEmbedding("", "Content only");
      expect(result).toBe("\n\nContent only");
    });

    test("handles empty content", () => {
      const result = prepareTextForEmbedding("Title only", "");
      expect(result).toBe("Title only\n\n");
    });

    test("handles multiline content", () => {
      const result = prepareTextForEmbedding("Title", "Line 1\nLine 2\nLine 3");
      expect(result).toBe("Title\n\nLine 1\nLine 2\nLine 3");
    });

    test("handles special characters", () => {
      const result = prepareTextForEmbedding(
        "Title with 'quotes'",
        'Content with "double quotes" and <tags>',
      );
      expect(result).toContain("'quotes'");
      expect(result).toContain('"double quotes"');
      expect(result).toContain("<tags>");
    });

    test("handles unicode", () => {
      const result = prepareTextForEmbedding("日本語タイトル", "中文内容");
      expect(result).toBe("日本語タイトル\n\n中文内容");
    });
  });

  describe("vector payload creation", () => {
    interface VectorPayload {
      memoryId: string;
      type: string;
      title: string;
      tags: string[];
      relatedFiles: string[];
      importance: number;
    }

    function createVectorPayload(
      memoryId: string,
      type: string,
      title: string,
      tags: string[],
      relatedFiles: string[],
      importance: number,
    ): VectorPayload {
      return {
        memoryId,
        type,
        title,
        tags,
        relatedFiles,
        importance,
      };
    }

    test("creates payload with all fields", () => {
      const payload = createVectorPayload(
        "mem_123",
        "decision",
        "Use TypeScript",
        ["typescript", "lang"],
        ["src/index.ts"],
        0.8,
      );

      expect(payload.memoryId).toBe("mem_123");
      expect(payload.type).toBe("decision");
      expect(payload.title).toBe("Use TypeScript");
      expect(payload.tags).toEqual(["typescript", "lang"]);
      expect(payload.relatedFiles).toEqual(["src/index.ts"]);
      expect(payload.importance).toBe(0.8);
    });

    test("handles empty arrays", () => {
      const payload = createVectorPayload(
        "mem_123",
        "note",
        "Simple note",
        [],
        [],
        0.5,
      );

      expect(payload.tags).toEqual([]);
      expect(payload.relatedFiles).toEqual([]);
    });

    test("handles minimum importance", () => {
      const payload = createVectorPayload("mem_123", "note", "Low", [], [], 0);
      expect(payload.importance).toBe(0);
    });

    test("handles maximum importance", () => {
      const payload = createVectorPayload("mem_123", "note", "High", [], [], 1);
      expect(payload.importance).toBe(1);
    });
  });

  describe("memory creation data", () => {
    interface MemoryInput {
      id: string;
      qdrantId: string;
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
    }

    function createMemoryData(input: {
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
    }): MemoryInput {
      const id = `mem_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const qdrantId = `vec_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

      return {
        id,
        qdrantId,
        type: input.type,
        title: input.title,
        content: input.content,
        summary: input.summary,
        importance: input.importance ?? 0.5,
        tags: input.tags ?? [],
        relatedFiles: input.relatedFiles ?? [],
        gitCommit: input.gitCommit,
        sourcePr: input.sourcePr,
        experts: input.experts ?? [],
      };
    }

    test("creates memory with required fields", () => {
      const data = createMemoryData({
        type: "decision",
        title: "Test",
        content: "Content",
      });

      expect(data.type).toBe("decision");
      expect(data.title).toBe("Test");
      expect(data.content).toBe("Content");
    });

    test("applies default importance of 0.5", () => {
      const data = createMemoryData({
        type: "note",
        title: "Test",
        content: "Content",
      });

      expect(data.importance).toBe(0.5);
    });

    test("applies empty arrays as defaults", () => {
      const data = createMemoryData({
        type: "note",
        title: "Test",
        content: "Content",
      });

      expect(data.tags).toEqual([]);
      expect(data.relatedFiles).toEqual([]);
      expect(data.experts).toEqual([]);
    });

    test("preserves optional fields when provided", () => {
      const data = createMemoryData({
        type: "solution",
        title: "Test",
        content: "Content",
        summary: "Brief summary",
        gitCommit: "abc123",
        sourcePr: "#42",
      });

      expect(data.summary).toBe("Brief summary");
      expect(data.gitCommit).toBe("abc123");
      expect(data.sourcePr).toBe("#42");
    });

    test("generates unique IDs each call", () => {
      const data1 = createMemoryData({
        type: "note",
        title: "A",
        content: "A",
      });
      const data2 = createMemoryData({
        type: "note",
        title: "B",
        content: "B",
      });

      expect(data1.id).not.toBe(data2.id);
      expect(data1.qdrantId).not.toBe(data2.qdrantId);
    });
  });

  describe("input validation patterns", () => {
    const VALID_TYPES = [
      "decision",
      "solution",
      "pattern",
      "architecture",
      "note",
    ];

    function isValidType(type: string): boolean {
      return VALID_TYPES.includes(type);
    }

    function isValidImportance(importance: number): boolean {
      return importance >= 0 && importance <= 1;
    }

    function isValidTitle(title: string): boolean {
      return title.length > 0;
    }

    test("validates decision type", () => {
      expect(isValidType("decision")).toBe(true);
    });

    test("validates solution type", () => {
      expect(isValidType("solution")).toBe(true);
    });

    test("validates pattern type", () => {
      expect(isValidType("pattern")).toBe(true);
    });

    test("validates architecture type", () => {
      expect(isValidType("architecture")).toBe(true);
    });

    test("validates note type", () => {
      expect(isValidType("note")).toBe(true);
    });

    test("rejects invalid type", () => {
      expect(isValidType("invalid")).toBe(false);
      expect(isValidType("")).toBe(false);
      expect(isValidType("DECISION")).toBe(false);
    });

    test("validates importance at boundaries", () => {
      expect(isValidImportance(0)).toBe(true);
      expect(isValidImportance(0.5)).toBe(true);
      expect(isValidImportance(1)).toBe(true);
    });

    test("rejects out of range importance", () => {
      expect(isValidImportance(-0.1)).toBe(false);
      expect(isValidImportance(1.1)).toBe(false);
      expect(isValidImportance(-1)).toBe(false);
      expect(isValidImportance(2)).toBe(false);
    });

    test("validates non-empty title", () => {
      expect(isValidTitle("A")).toBe(true);
      expect(isValidTitle("Long title here")).toBe(true);
    });

    test("rejects empty title", () => {
      expect(isValidTitle("")).toBe(false);
    });
  });

  describe("tags normalization", () => {
    function normalizeTags(tags: string[]): string[] {
      return tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0);
    }

    test("lowercases tags", () => {
      expect(normalizeTags(["TypeScript", "REACT"])).toEqual([
        "typescript",
        "react",
      ]);
    });

    test("trims whitespace", () => {
      expect(normalizeTags(["  tag1  ", "tag2  "])).toEqual(["tag1", "tag2"]);
    });

    test("filters empty tags", () => {
      expect(normalizeTags(["tag1", "", "  ", "tag2"])).toEqual([
        "tag1",
        "tag2",
      ]);
    });

    test("handles empty array", () => {
      expect(normalizeTags([])).toEqual([]);
    });
  });
});
