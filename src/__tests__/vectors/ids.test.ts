/**
 * Tests for vector ID generation and validation patterns
 */

import { describe, expect, test } from "bun:test";

describe("vector IDs", () => {
  describe("qdrant ID generation", () => {
    function generateQdrantId(): string {
      const uuid = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      return `vec_${uuid}`;
    }

    test("starts with vec_ prefix", () => {
      const id = generateQdrantId();
      expect(id.startsWith("vec_")).toBe(true);
    });

    test("has correct length", () => {
      const id = generateQdrantId();
      expect(id).toHaveLength(20); // vec_ (4) + 16 chars
    });

    test("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateQdrantId());
      }
      expect(ids.size).toBe(100);
    });

    test("contains only valid characters", () => {
      const id = generateQdrantId();
      expect(/^vec_[a-f0-9]{16}$/.test(id)).toBe(true);
    });
  });

  describe("qdrant ID validation", () => {
    function isValidQdrantId(id: string): boolean {
      return /^vec_[a-f0-9]{16}$/.test(id);
    }

    test("validates correct ID", () => {
      expect(isValidQdrantId("vec_1234567890abcdef")).toBe(true);
    });

    test("rejects wrong prefix", () => {
      expect(isValidQdrantId("mem_1234567890abcdef")).toBe(false);
    });

    test("rejects short ID", () => {
      expect(isValidQdrantId("vec_1234")).toBe(false);
    });

    test("rejects long ID", () => {
      expect(isValidQdrantId("vec_1234567890abcdef0000")).toBe(false);
    });

    test("rejects uppercase letters", () => {
      expect(isValidQdrantId("vec_1234567890ABCDEF")).toBe(false);
    });

    test("rejects invalid characters", () => {
      expect(isValidQdrantId("vec_1234567890ghijkl")).toBe(false);
    });

    test("rejects empty string", () => {
      expect(isValidQdrantId("")).toBe(false);
    });
  });

  describe("memory ID to qdrant ID mapping", () => {
    interface IdMapping {
      memoryId: string;
      qdrantId: string;
    }

    function createMapping(memoryId: string): IdMapping {
      const uuid = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      return {
        memoryId,
        qdrantId: `vec_${uuid}`,
      };
    }

    function extractMemoryId(mapping: IdMapping): string {
      return mapping.memoryId;
    }

    function extractQdrantId(mapping: IdMapping): string {
      return mapping.qdrantId;
    }

    test("preserves memoryId", () => {
      const mapping = createMapping("mem_abc123");
      expect(extractMemoryId(mapping)).toBe("mem_abc123");
    });

    test("creates valid qdrantId", () => {
      const mapping = createMapping("mem_abc123");
      expect(extractQdrantId(mapping).startsWith("vec_")).toBe(true);
    });

    test("creates unique qdrantIds for same memoryId", () => {
      const mapping1 = createMapping("mem_same");
      const mapping2 = createMapping("mem_same");
      expect(mapping1.qdrantId).not.toBe(mapping2.qdrantId);
    });
  });

  describe("UUID parsing", () => {
    function parseUUID(uuid: string): string {
      return uuid.replace(/-/g, "");
    }

    function truncateUUID(parsed: string, length: number): string {
      return parsed.slice(0, length);
    }

    test("removes dashes from UUID", () => {
      const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
      expect(parseUUID(uuid)).toBe("a1b2c3d4e5f67890abcdef1234567890");
    });

    test("truncates to 16 characters", () => {
      const parsed = "a1b2c3d4e5f67890abcdef1234567890";
      expect(truncateUUID(parsed, 16)).toBe("a1b2c3d4e5f67890");
    });

    test("handles already parsed UUID", () => {
      const uuid = "a1b2c3d4e5f67890";
      expect(parseUUID(uuid)).toBe("a1b2c3d4e5f67890");
    });
  });

  describe("ID type detection", () => {
    type IdType = "memory" | "qdrant" | "unknown";

    function detectIdType(id: string): IdType {
      if (/^mem_[a-f0-9]{16}$/.test(id)) return "memory";
      if (/^vec_[a-f0-9]{16}$/.test(id)) return "qdrant";
      return "unknown";
    }

    test("detects memory ID", () => {
      expect(detectIdType("mem_1234567890abcdef")).toBe("memory");
    });

    test("detects qdrant ID", () => {
      expect(detectIdType("vec_1234567890abcdef")).toBe("qdrant");
    });

    test("returns unknown for invalid ID", () => {
      expect(detectIdType("abc_1234567890abcdef")).toBe("unknown");
    });

    test("returns unknown for empty string", () => {
      expect(detectIdType("")).toBe("unknown");
    });

    test("returns unknown for plain UUID", () => {
      expect(detectIdType("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(
        "unknown",
      );
    });
  });

  describe("bulk ID generation", () => {
    function generateBulkIds(count: number): string[] {
      const ids: string[] = [];
      for (let i = 0; i < count; i++) {
        const uuid = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
        ids.push(`vec_${uuid}`);
      }
      return ids;
    }

    test("generates correct count", () => {
      expect(generateBulkIds(5)).toHaveLength(5);
    });

    test("generates zero IDs", () => {
      expect(generateBulkIds(0)).toHaveLength(0);
    });

    test("all IDs are unique", () => {
      const ids = generateBulkIds(50);
      const unique = new Set(ids);
      expect(unique.size).toBe(50);
    });

    test("all IDs have correct format", () => {
      const ids = generateBulkIds(10);
      ids.forEach((id) => {
        expect(/^vec_[a-f0-9]{16}$/.test(id)).toBe(true);
      });
    });
  });

  describe("ID collision detection", () => {
    function hasCollision(ids: string[]): boolean {
      const seen = new Set<string>();
      for (const id of ids) {
        if (seen.has(id)) return true;
        seen.add(id);
      }
      return false;
    }

    test("detects no collision in unique array", () => {
      expect(hasCollision(["a", "b", "c"])).toBe(false);
    });

    test("detects collision", () => {
      expect(hasCollision(["a", "b", "a"])).toBe(true);
    });

    test("handles empty array", () => {
      expect(hasCollision([])).toBe(false);
    });

    test("handles single item", () => {
      expect(hasCollision(["a"])).toBe(false);
    });
  });
});
