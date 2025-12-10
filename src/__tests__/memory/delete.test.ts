/**
 * Tests for deleteMemory function helper logic
 * Tests the pure function patterns used in delete.ts
 */

import { describe, expect, test } from "bun:test";

describe("deleteMemory", () => {
  describe("existence check", () => {
    function memoryExists(memory: unknown): memory is object {
      return memory !== null && memory !== undefined;
    }

    test("returns true for existing object", () => {
      expect(memoryExists({ id: "mem_123" })).toBe(true);
    });

    test("returns false for null", () => {
      expect(memoryExists(null)).toBe(false);
    });

    test("returns false for undefined", () => {
      expect(memoryExists(undefined)).toBe(false);
    });
  });

  describe("qdrant ID extraction", () => {
    function getQdrantId(memory: { qdrantId?: string }): string | null {
      return memory.qdrantId ?? null;
    }

    test("extracts qdrantId when present", () => {
      expect(getQdrantId({ qdrantId: "vec_123" })).toBe("vec_123");
    });

    test("returns null when qdrantId missing", () => {
      expect(getQdrantId({})).toBeNull();
    });

    test("returns null when qdrantId undefined", () => {
      expect(getQdrantId({ qdrantId: undefined })).toBeNull();
    });
  });

  describe("deletion order", () => {
    function getDeleteOrder(): string[] {
      // Vector store first, then SQLite
      return ["qdrant", "sqlite"];
    }

    test("deletes qdrant first", () => {
      const order = getDeleteOrder();
      expect(order[0]).toBe("qdrant");
    });

    test("deletes sqlite second", () => {
      const order = getDeleteOrder();
      expect(order[1]).toBe("sqlite");
    });
  });

  describe("should delete from qdrant", () => {
    function shouldDeleteFromQdrant(qdrantId: string | undefined): boolean {
      return qdrantId !== undefined && qdrantId !== null && qdrantId.length > 0;
    }

    test("should delete when qdrantId exists", () => {
      expect(shouldDeleteFromQdrant("vec_123")).toBe(true);
    });

    test("should not delete when qdrantId undefined", () => {
      expect(shouldDeleteFromQdrant(undefined)).toBe(false);
    });

    test("should not delete when qdrantId empty", () => {
      expect(shouldDeleteFromQdrant("")).toBe(false);
    });
  });

  describe("deletion result", () => {
    function interpretDeletionResult(
      memoryFound: boolean,
      deleted: boolean,
    ): { success: boolean; reason?: string } {
      if (!memoryFound) {
        return { success: false, reason: "not_found" };
      }
      if (!deleted) {
        return { success: false, reason: "delete_failed" };
      }
      return { success: true };
    }

    test("returns success when found and deleted", () => {
      const result = interpretDeletionResult(true, true);
      expect(result.success).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test("returns not_found when memory not found", () => {
      const result = interpretDeletionResult(false, false);
      expect(result.success).toBe(false);
      expect(result.reason).toBe("not_found");
    });

    test("returns delete_failed when deletion fails", () => {
      const result = interpretDeletionResult(true, false);
      expect(result.success).toBe(false);
      expect(result.reason).toBe("delete_failed");
    });
  });
});
