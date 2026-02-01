/**
 * Tests for vector ID generation and validation patterns
 *
 * IDs use nanoid for URL-safe, collision-resistant generation.
 * Format: prefix + nanoid(16) = 20 characters total
 * Nanoid alphabet: A-Za-z0-9_- (URL-safe)
 */

import { describe, expect, test } from "bun:test";
import { nanoid } from "nanoid";

/**
 * Nanoid character set: A-Za-z0-9_-
 * This is different from UUID hex (a-f0-9)
 */
const NANOID_PATTERN = /^[A-Za-z0-9_-]+$/;

describe("vector IDs", () => {
  describe("qdrant ID generation", () => {
    function generateQdrantId(): string {
      return `vec_${nanoid(16)}`;
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

    test("contains only valid nanoid characters after prefix", () => {
      const id = generateQdrantId();
      const suffix = id.slice(4); // Remove vec_ prefix
      expect(NANOID_PATTERN.test(suffix)).toBe(true);
    });

    test("full ID matches expected pattern", () => {
      const id = generateQdrantId();
      expect(/^vec_[A-Za-z0-9_-]{16}$/.test(id)).toBe(true);
    });
  });

  describe("qdrant ID validation", () => {
    function isValidQdrantId(id: string): boolean {
      return /^vec_[A-Za-z0-9_-]{16}$/.test(id);
    }

    test("validates correct ID with lowercase", () => {
      expect(isValidQdrantId("vec_abcdefghijklmnop")).toBe(true);
    });

    test("validates correct ID with uppercase", () => {
      expect(isValidQdrantId("vec_ABCDEFGHIJKLMNOP")).toBe(true);
    });

    test("validates correct ID with numbers", () => {
      expect(isValidQdrantId("vec_1234567890123456")).toBe(true);
    });

    test("validates correct ID with mixed case and special chars", () => {
      expect(isValidQdrantId("vec_aB1-cD2_eF3-gH4_")).toBe(true);
    });

    test("validates ID with underscore and hyphen", () => {
      expect(isValidQdrantId("vec_a_b-c_d-e_f-g_h-")).toBe(true);
    });

    test("rejects wrong prefix", () => {
      expect(isValidQdrantId("mem_abcdefghijklmnop")).toBe(false);
    });

    test("rejects short ID", () => {
      expect(isValidQdrantId("vec_1234")).toBe(false);
    });

    test("rejects long ID", () => {
      expect(isValidQdrantId("vec_12345678901234567890")).toBe(false);
    });

    test("rejects invalid characters", () => {
      expect(isValidQdrantId("vec_abc!def@ghi#jkl$")).toBe(false);
    });

    test("rejects empty string", () => {
      expect(isValidQdrantId("")).toBe(false);
    });
  });

  describe("memory ID generation and validation", () => {
    function generateMemoryId(): string {
      return `mem_${nanoid(16)}`;
    }

    function isValidMemoryId(id: string): boolean {
      return /^mem_[A-Za-z0-9_-]{16}$/.test(id);
    }

    test("generates ID with correct prefix", () => {
      const id = generateMemoryId();
      expect(id.startsWith("mem_")).toBe(true);
    });

    test("generates ID with correct length", () => {
      const id = generateMemoryId();
      expect(id).toHaveLength(20); // mem_ (4) + 16 chars
    });

    test("validates generated ID", () => {
      const id = generateMemoryId();
      expect(isValidMemoryId(id)).toBe(true);
    });
  });

  describe("pending memory ID generation and validation", () => {
    function generatePendingId(): string {
      return `pnd_${nanoid(16)}`;
    }

    function isValidPendingId(id: string): boolean {
      return /^pnd_[A-Za-z0-9_-]{16}$/.test(id);
    }

    test("generates ID with correct prefix", () => {
      const id = generatePendingId();
      expect(id.startsWith("pnd_")).toBe(true);
    });

    test("generates ID with correct length", () => {
      const id = generatePendingId();
      expect(id).toHaveLength(20); // pnd_ (4) + 16 chars
    });

    test("validates generated ID", () => {
      const id = generatePendingId();
      expect(isValidPendingId(id)).toBe(true);
    });
  });

  describe("relation ID generation (full nanoid)", () => {
    function generateRelationId(): string {
      return nanoid(21); // Default nanoid length
    }

    function isValidRelationId(id: string): boolean {
      return /^[A-Za-z0-9_-]{21}$/.test(id);
    }

    test("generates ID with correct length", () => {
      const id = generateRelationId();
      expect(id).toHaveLength(21);
    });

    test("contains only valid nanoid characters", () => {
      const id = generateRelationId();
      expect(NANOID_PATTERN.test(id)).toBe(true);
    });

    test("validates generated ID", () => {
      const id = generateRelationId();
      expect(isValidRelationId(id)).toBe(true);
    });

    test("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateRelationId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("memory ID to qdrant ID mapping", () => {
    interface IdMapping {
      memoryId: string;
      qdrantId: string;
    }

    function createMapping(memoryId: string): IdMapping {
      return {
        memoryId,
        qdrantId: `vec_${nanoid(16)}`,
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

  describe("ID type detection", () => {
    type IdType = "memory" | "qdrant" | "pending" | "relation" | "unknown";

    function detectIdType(id: string): IdType {
      if (/^mem_[A-Za-z0-9_-]{16}$/.test(id)) return "memory";
      if (/^vec_[A-Za-z0-9_-]{16}$/.test(id)) return "qdrant";
      if (/^pnd_[A-Za-z0-9_-]{16}$/.test(id)) return "pending";
      if (/^[A-Za-z0-9_-]{21}$/.test(id)) return "relation";
      return "unknown";
    }

    test("detects memory ID", () => {
      expect(detectIdType(`mem_${nanoid(16)}`)).toBe("memory");
    });

    test("detects qdrant ID", () => {
      expect(detectIdType(`vec_${nanoid(16)}`)).toBe("qdrant");
    });

    test("detects pending ID", () => {
      expect(detectIdType(`pnd_${nanoid(16)}`)).toBe("pending");
    });

    test("detects relation ID (21 char nanoid)", () => {
      expect(detectIdType(nanoid(21))).toBe("relation");
    });

    test("returns unknown for invalid prefix", () => {
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
        ids.push(`vec_${nanoid(16)}`);
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
        expect(/^vec_[A-Za-z0-9_-]{16}$/.test(id)).toBe(true);
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

  describe("nanoid vs UUID comparison", () => {
    test("nanoid is shorter than UUID", () => {
      const nid = nanoid(21);
      const uuid = crypto.randomUUID();
      expect(nid.length).toBeLessThan(uuid.length);
    });

    test("nanoid uses URL-safe alphabet including dashes", () => {
      // nanoid alphabet is: A-Za-z0-9_-
      // Unlike UUID which only uses lowercase hex (a-f0-9)
      // nanoid can contain uppercase, underscore, and hyphen
      const nid = nanoid(21);
      expect(NANOID_PATTERN.test(nid)).toBe(true);
      // Verify each character is in the URL-safe alphabet
      for (const char of nid) {
        expect(/[A-Za-z0-9_-]/.test(char)).toBe(true);
      }
    });

    test("nanoid is URL-safe", () => {
      const nid = nanoid(21);
      // URL-safe means only alphanumeric, underscore, and hyphen
      expect(/^[A-Za-z0-9_-]+$/.test(nid)).toBe(true);
    });
  });
});
