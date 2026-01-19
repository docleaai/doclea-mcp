/**
 * Tests for updateMemory function helper logic
 * Tests the pure function patterns used in update.ts
 */

import { describe, expect, test } from "bun:test";

describe("updateMemory", () => {
  describe("re-embedding decision", () => {
    function needsReembedding(
      titleChanged: boolean,
      contentChanged: boolean,
    ): boolean {
      return titleChanged || contentChanged;
    }

    test("needs re-embedding when title changed", () => {
      expect(needsReembedding(true, false)).toBe(true);
    });

    test("needs re-embedding when content changed", () => {
      expect(needsReembedding(false, true)).toBe(true);
    });

    test("needs re-embedding when both changed", () => {
      expect(needsReembedding(true, true)).toBe(true);
    });

    test("does not need re-embedding when neither changed", () => {
      expect(needsReembedding(false, false)).toBe(false);
    });
  });

  describe("payload update decision", () => {
    interface UpdateInput {
      type?: string;
      tags?: string[];
      relatedFiles?: string[];
      importance?: number;
    }

    function needsPayloadUpdate(input: UpdateInput): boolean {
      return (
        input.type !== undefined ||
        input.tags !== undefined ||
        input.relatedFiles !== undefined ||
        input.importance !== undefined
      );
    }

    test("needs update when type changes", () => {
      expect(needsPayloadUpdate({ type: "decision" })).toBe(true);
    });

    test("needs update when tags change", () => {
      expect(needsPayloadUpdate({ tags: ["new"] })).toBe(true);
    });

    test("needs update when relatedFiles change", () => {
      expect(needsPayloadUpdate({ relatedFiles: ["file.ts"] })).toBe(true);
    });

    test("needs update when importance changes", () => {
      expect(needsPayloadUpdate({ importance: 0.8 })).toBe(true);
    });

    test("does not need update when nothing changes", () => {
      expect(needsPayloadUpdate({})).toBe(false);
    });

    test("handles importance of 0 (falsy value)", () => {
      expect(needsPayloadUpdate({ importance: 0 })).toBe(true);
    });
  });

  describe("field merging", () => {
    interface Existing {
      title: string;
      content: string;
      type: string;
      tags: string[];
      importance: number;
    }

    interface Updates {
      title?: string;
      content?: string;
      type?: string;
      tags?: string[];
      importance?: number;
    }

    function mergeFields(existing: Existing, updates: Updates): Existing {
      return {
        title: updates.title ?? existing.title,
        content: updates.content ?? existing.content,
        type: updates.type ?? existing.type,
        tags: updates.tags ?? existing.tags,
        importance: updates.importance ?? existing.importance,
      };
    }

    const existing: Existing = {
      title: "Original Title",
      content: "Original Content",
      type: "note",
      tags: ["original"],
      importance: 0.5,
    };

    test("preserves existing when no updates", () => {
      const result = mergeFields(existing, {});
      expect(result).toEqual(existing);
    });

    test("updates title only", () => {
      const result = mergeFields(existing, { title: "New Title" });
      expect(result.title).toBe("New Title");
      expect(result.content).toBe("Original Content");
    });

    test("updates content only", () => {
      const result = mergeFields(existing, { content: "New Content" });
      expect(result.content).toBe("New Content");
      expect(result.title).toBe("Original Title");
    });

    test("updates type", () => {
      const result = mergeFields(existing, { type: "decision" });
      expect(result.type).toBe("decision");
    });

    test("replaces tags array", () => {
      const result = mergeFields(existing, { tags: ["new1", "new2"] });
      expect(result.tags).toEqual(["new1", "new2"]);
    });

    test("updates importance", () => {
      const result = mergeFields(existing, { importance: 0.9 });
      expect(result.importance).toBe(0.9);
    });

    test("updates multiple fields", () => {
      const result = mergeFields(existing, {
        title: "New",
        importance: 0.8,
      });
      expect(result.title).toBe("New");
      expect(result.importance).toBe(0.8);
      expect(result.content).toBe("Original Content");
    });
  });

  describe("text preparation for re-embedding", () => {
    function prepareUpdatedText(
      existingTitle: string,
      existingContent: string,
      newTitle?: string,
      newContent?: string,
    ): string {
      const title = newTitle ?? existingTitle;
      const content = newContent ?? existingContent;
      return `${title}\n\n${content}`;
    }

    test("uses new title and content", () => {
      const result = prepareUpdatedText(
        "Old",
        "Old content",
        "New",
        "New content",
      );
      expect(result).toBe("New\n\nNew content");
    });

    test("uses new title with existing content", () => {
      const result = prepareUpdatedText("Old", "Old content", "New", undefined);
      expect(result).toBe("New\n\nOld content");
    });

    test("uses existing title with new content", () => {
      const result = prepareUpdatedText(
        "Old",
        "Old content",
        undefined,
        "New content",
      );
      expect(result).toBe("Old\n\nNew content");
    });

    test("uses all existing when no updates", () => {
      const result = prepareUpdatedText(
        "Old",
        "Old content",
        undefined,
        undefined,
      );
      expect(result).toBe("Old\n\nOld content");
    });
  });

  describe("payload preparation", () => {
    interface Existing {
      id: string;
      type: string;
      title: string;
      tags: string[];
      relatedFiles: string[];
      importance: number;
    }

    interface Updates {
      type?: string;
      title?: string;
      tags?: string[];
      relatedFiles?: string[];
      importance?: number;
    }

    interface Payload {
      memoryId: string;
      type: string;
      title: string;
      tags: string[];
      relatedFiles: string[];
      importance: number;
    }

    function prepareUpdatedPayload(
      existing: Existing,
      updates: Updates,
    ): Payload {
      return {
        memoryId: existing.id,
        type: updates.type ?? existing.type,
        title: updates.title ?? existing.title,
        tags: updates.tags ?? existing.tags,
        relatedFiles: updates.relatedFiles ?? existing.relatedFiles,
        importance: updates.importance ?? existing.importance,
      };
    }

    const existing: Existing = {
      id: "mem_123",
      type: "note",
      title: "Test",
      tags: ["a"],
      relatedFiles: ["file.ts"],
      importance: 0.5,
    };

    test("preserves memory ID", () => {
      const payload = prepareUpdatedPayload(existing, {});
      expect(payload.memoryId).toBe("mem_123");
    });

    test("updates type in payload", () => {
      const payload = prepareUpdatedPayload(existing, { type: "decision" });
      expect(payload.type).toBe("decision");
    });

    test("updates tags in payload", () => {
      const payload = prepareUpdatedPayload(existing, { tags: ["x", "y"] });
      expect(payload.tags).toEqual(["x", "y"]);
    });

    test("preserves existing when no updates", () => {
      const payload = prepareUpdatedPayload(existing, {});
      expect(payload.type).toBe("note");
      expect(payload.tags).toEqual(["a"]);
    });
  });

  describe("update extraction", () => {
    interface Input {
      id: string;
      title?: string;
      content?: string;
      type?: string;
    }

    function extractUpdates(input: Input): Omit<Input, "id"> {
      const { id: _id, ...updates } = input;
      return updates;
    }

    test("removes id from input", () => {
      const input: Input = { id: "mem_123", title: "New Title" };
      const updates = extractUpdates(input);
      expect("id" in updates).toBe(false);
      expect(updates.title).toBe("New Title");
    });

    test("preserves all update fields", () => {
      const input: Input = {
        id: "mem_123",
        title: "Title",
        content: "Content",
        type: "decision",
      };
      const updates = extractUpdates(input);
      expect(updates).toEqual({
        title: "Title",
        content: "Content",
        type: "decision",
      });
    });

    test("handles minimal input", () => {
      const input: Input = { id: "mem_123" };
      const updates = extractUpdates(input);
      expect(updates).toEqual({});
    });
  });

  describe("qdrant ID check", () => {
    function hasQdrantId(memory: { qdrantId?: string }): boolean {
      return memory.qdrantId !== undefined && memory.qdrantId !== null;
    }

    test("returns true when qdrantId exists", () => {
      expect(hasQdrantId({ qdrantId: "vec_123" })).toBe(true);
    });

    test("returns false when qdrantId is undefined", () => {
      expect(hasQdrantId({ qdrantId: undefined })).toBe(false);
    });

    test("returns false when qdrantId is missing", () => {
      expect(hasQdrantId({})).toBe(false);
    });
  });

  describe("change detection", () => {
    function fieldChanged<T>(
      newValue: T | undefined,
      existingValue: T,
    ): boolean {
      return newValue !== undefined && newValue !== existingValue;
    }

    test("detects string change", () => {
      expect(fieldChanged("new", "old")).toBe(true);
    });

    test("no change when undefined", () => {
      expect(fieldChanged(undefined, "old")).toBe(false);
    });

    test("no change when same value", () => {
      expect(fieldChanged("same", "same")).toBe(false);
    });

    test("detects number change", () => {
      expect(fieldChanged(0.8, 0.5)).toBe(true);
    });

    test("no change for same number", () => {
      expect(fieldChanged(0.5, 0.5)).toBe(false);
    });
  });
});
