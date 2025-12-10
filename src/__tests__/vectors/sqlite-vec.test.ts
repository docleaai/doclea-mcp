/**
 * Tests for SqliteVecStore
 * Tests vector storage, search, and filtering with sqlite-vec extension
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { VectorPayload } from "@/vectors/interface";
import { SqliteVecStore } from "@/vectors/sqlite-vec";

const VECTOR_SIZE = 384; // all-MiniLM-L6-v2 dimension

function createMockPayload(
  overrides: Partial<VectorPayload> = {},
): VectorPayload {
  return {
    memoryId: "mem_123",
    type: "decision",
    title: "Test Memory",
    tags: ["test", "example"],
    relatedFiles: ["src/index.ts"],
    importance: 0.8,
    ...overrides,
  };
}

function createRandomVector(size: number = VECTOR_SIZE): number[] {
  return Array.from({ length: size }, () => Math.random() * 2 - 1);
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map((v) => v / magnitude);
}

describe("SqliteVecStore", () => {
  let store: SqliteVecStore;

  beforeEach(async () => {
    // Use in-memory database for tests
    store = new SqliteVecStore({ dbPath: ":memory:", vectorSize: VECTOR_SIZE });
    await store.initialize();
  });

  afterEach(() => {
    store.close();
  });

  describe("initialization", () => {
    test("creates tables on initialize", async () => {
      const newStore = new SqliteVecStore({ dbPath: ":memory:" });
      await newStore.initialize();
      // Should not throw
      const info = await newStore.getCollectionInfo();
      expect(info.vectorsCount).toBe(0);
      newStore.close();
    });

    test("is idempotent", async () => {
      await store.initialize();
      await store.initialize();
      // Should not throw
      const info = await store.getCollectionInfo();
      expect(info.vectorsCount).toBe(0);
    });
  });

  describe("upsert", () => {
    test("inserts new vector", async () => {
      const vector = normalizeVector(createRandomVector());
      const payload = createMockPayload();

      const id = await store.upsert("vec_1", vector, payload);

      expect(id).toBe("vec_1");
      const info = await store.getCollectionInfo();
      expect(info.vectorsCount).toBe(1);
    });

    test("updates existing vector", async () => {
      const vector1 = normalizeVector(createRandomVector());
      const vector2 = normalizeVector(createRandomVector());
      const payload1 = createMockPayload({ title: "First" });
      const payload2 = createMockPayload({ title: "Second" });

      await store.upsert("vec_1", vector1, payload1);
      await store.upsert("vec_1", vector2, payload2);

      const info = await store.getCollectionInfo();
      expect(info.vectorsCount).toBe(1);

      // Search should return updated payload
      const results = await store.search(vector2, undefined, 1);
      expect(results[0].payload.title).toBe("Second");
    });

    test("throws on dimension mismatch", async () => {
      const wrongVector = createRandomVector(512);
      const payload = createMockPayload();

      expect(store.upsert("vec_1", wrongVector, payload)).rejects.toThrow(
        /dimension mismatch/,
      );
    });

    test("stores multiple vectors", async () => {
      for (let i = 0; i < 10; i++) {
        const vector = normalizeVector(createRandomVector());
        const payload = createMockPayload({ memoryId: `mem_${i}` });
        await store.upsert(`vec_${i}`, vector, payload);
      }

      const info = await store.getCollectionInfo();
      expect(info.vectorsCount).toBe(10);
    });
  });

  describe("search", () => {
    test("finds similar vectors", async () => {
      const targetVector = normalizeVector(createRandomVector());
      const payload = createMockPayload();

      await store.upsert("vec_1", targetVector, payload);

      const results = await store.search(targetVector, undefined, 1);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("vec_1");
      expect(results[0].score).toBeGreaterThan(0.9); // Same vector should have high score
    });

    test("returns empty array when no matches", async () => {
      const vector = normalizeVector(createRandomVector());
      const results = await store.search(vector, undefined, 10);
      expect(results).toHaveLength(0);
    });

    test("respects limit parameter", async () => {
      for (let i = 0; i < 10; i++) {
        const vector = normalizeVector(createRandomVector());
        const payload = createMockPayload({ memoryId: `mem_${i}` });
        await store.upsert(`vec_${i}`, vector, payload);
      }

      const queryVector = normalizeVector(createRandomVector());
      const results = await store.search(queryVector, undefined, 5);

      expect(results).toHaveLength(5);
    });

    test("orders by similarity (distance)", async () => {
      // Create a reference vector
      const baseVector = normalizeVector(createRandomVector());

      // Create vectors at different distances
      const closeVector = baseVector.slice();
      closeVector[0] += 0.1;
      const normalizedClose = normalizeVector(closeVector);

      const farVector = baseVector.slice();
      farVector[0] += 0.5;
      farVector[1] += 0.5;
      const normalizedFar = normalizeVector(farVector);

      await store.upsert(
        "vec_close",
        normalizedClose,
        createMockPayload({ title: "Close" }),
      );
      await store.upsert(
        "vec_far",
        normalizedFar,
        createMockPayload({ title: "Far" }),
      );

      const results = await store.search(baseVector, undefined, 2);

      expect(results).toHaveLength(2);
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    test("throws on dimension mismatch", async () => {
      const wrongVector = createRandomVector(512);
      expect(store.search(wrongVector)).rejects.toThrow(/dimension mismatch/);
    });
  });

  describe("search with filters", () => {
    beforeEach(async () => {
      // Set up test data with different types and importance
      await store.upsert(
        "vec_decision",
        normalizeVector(createRandomVector()),
        createMockPayload({
          memoryId: "m1",
          type: "decision",
          importance: 0.9,
        }),
      );
      await store.upsert(
        "vec_pattern",
        normalizeVector(createRandomVector()),
        createMockPayload({ memoryId: "m2", type: "pattern", importance: 0.5 }),
      );
      await store.upsert(
        "vec_note",
        normalizeVector(createRandomVector()),
        createMockPayload({ memoryId: "m3", type: "note", importance: 0.3 }),
      );
    });

    test("filters by type", async () => {
      const queryVector = normalizeVector(createRandomVector());
      const results = await store.search(queryVector, { type: "decision" }, 10);

      expect(results).toHaveLength(1);
      expect(results[0].payload.type).toBe("decision");
    });

    test("filters by minImportance", async () => {
      const queryVector = normalizeVector(createRandomVector());
      const results = await store.search(
        queryVector,
        { minImportance: 0.5 },
        10,
      );

      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(result.payload.importance).toBeGreaterThanOrEqual(0.5);
      }
    });

    test("filters by tags", async () => {
      // Add specific tags
      await store.upsert(
        "vec_api",
        normalizeVector(createRandomVector()),
        createMockPayload({ memoryId: "m4", tags: ["api", "rest"] }),
      );

      const queryVector = normalizeVector(createRandomVector());
      const results = await store.search(queryVector, { tags: ["api"] }, 10);

      expect(results.length).toBeGreaterThanOrEqual(1);
      const apiResult = results.find((r) => r.id === "vec_api");
      expect(apiResult).toBeDefined();
    });

    test("filters by relatedFiles", async () => {
      await store.upsert(
        "vec_auth",
        normalizeVector(createRandomVector()),
        createMockPayload({
          memoryId: "m5",
          relatedFiles: ["src/auth/login.ts"],
        }),
      );

      const queryVector = normalizeVector(createRandomVector());
      const results = await store.search(
        queryVector,
        { relatedFiles: ["src/auth/login.ts"] },
        10,
      );

      expect(results.length).toBeGreaterThanOrEqual(1);
      const authResult = results.find((r) => r.id === "vec_auth");
      expect(authResult).toBeDefined();
    });

    test("combines multiple filters", async () => {
      const queryVector = normalizeVector(createRandomVector());
      const results = await store.search(
        queryVector,
        { type: "decision", minImportance: 0.8 },
        10,
      );

      expect(results).toHaveLength(1);
      expect(results[0].payload.type).toBe("decision");
      expect(results[0].payload.importance).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe("delete", () => {
    test("deletes existing vector", async () => {
      const vector = normalizeVector(createRandomVector());
      await store.upsert("vec_1", vector, createMockPayload());

      const deleted = await store.delete("vec_1");

      expect(deleted).toBe(true);
      const info = await store.getCollectionInfo();
      expect(info.vectorsCount).toBe(0);
    });

    test("returns false for non-existent vector", async () => {
      const deleted = await store.delete("vec_nonexistent");
      expect(deleted).toBe(false);
    });

    test("deletes both vector and metadata", async () => {
      const vector = normalizeVector(createRandomVector());
      await store.upsert("vec_1", vector, createMockPayload());
      await store.delete("vec_1");

      // Search should not find deleted vector
      const results = await store.search(vector, undefined, 10);
      expect(results).toHaveLength(0);
    });
  });

  describe("deleteByMemoryId", () => {
    test("deletes all vectors for memory", async () => {
      const memoryId = "mem_target";

      // Create multiple vectors for same memory
      await store.upsert(
        "vec_1",
        normalizeVector(createRandomVector()),
        createMockPayload({ memoryId }),
      );
      await store.upsert(
        "vec_2",
        normalizeVector(createRandomVector()),
        createMockPayload({ memoryId }),
      );
      await store.upsert(
        "vec_other",
        normalizeVector(createRandomVector()),
        createMockPayload({ memoryId: "mem_other" }),
      );

      const deleted = await store.deleteByMemoryId(memoryId);

      expect(deleted).toBe(true);
      const info = await store.getCollectionInfo();
      expect(info.vectorsCount).toBe(1); // Only vec_other remains
    });

    test("returns false for non-existent memoryId", async () => {
      const deleted = await store.deleteByMemoryId("mem_nonexistent");
      expect(deleted).toBe(false);
    });
  });

  describe("getCollectionInfo", () => {
    test("returns zero for empty store", async () => {
      const info = await store.getCollectionInfo();
      expect(info.vectorsCount).toBe(0);
      expect(info.pointsCount).toBe(0);
    });

    test("returns correct count after inserts", async () => {
      for (let i = 0; i < 5; i++) {
        await store.upsert(
          `vec_${i}`,
          normalizeVector(createRandomVector()),
          createMockPayload({ memoryId: `mem_${i}` }),
        );
      }

      const info = await store.getCollectionInfo();
      expect(info.vectorsCount).toBe(5);
      expect(info.pointsCount).toBe(5);
    });

    test("updates count after delete", async () => {
      await store.upsert(
        "vec_1",
        normalizeVector(createRandomVector()),
        createMockPayload(),
      );
      await store.upsert(
        "vec_2",
        normalizeVector(createRandomVector()),
        createMockPayload(),
      );
      await store.delete("vec_1");

      const info = await store.getCollectionInfo();
      expect(info.vectorsCount).toBe(1);
    });
  });

  describe("constructor options", () => {
    test("accepts string path", async () => {
      const newStore = new SqliteVecStore(":memory:");
      await newStore.initialize();
      const info = await newStore.getCollectionInfo();
      expect(info.vectorsCount).toBe(0);
      newStore.close();
    });

    test("uses custom table name", async () => {
      const newStore = new SqliteVecStore({
        dbPath: ":memory:",
        tableName: "custom_vectors",
      });
      await newStore.initialize();
      await newStore.upsert(
        "vec_1",
        normalizeVector(createRandomVector()),
        createMockPayload(),
      );
      const info = await newStore.getCollectionInfo();
      expect(info.vectorsCount).toBe(1);
      newStore.close();
    });

    test("uses custom vector size", async () => {
      const newStore = new SqliteVecStore({
        dbPath: ":memory:",
        vectorSize: 768,
      });
      await newStore.initialize();

      const vector768 = normalizeVector(createRandomVector(768));
      await newStore.upsert("vec_1", vector768, createMockPayload());

      const info = await newStore.getCollectionInfo();
      expect(info.vectorsCount).toBe(1);
      newStore.close();
    });
  });

  describe("payload serialization", () => {
    test("preserves all payload fields", async () => {
      const payload = createMockPayload({
        memoryId: "mem_special",
        type: "architecture",
        title: 'Complex Title with "quotes"',
        tags: ["tag1", "tag2", "tag3"],
        relatedFiles: ["src/a.ts", "src/b.ts"],
        importance: 0.95,
      });

      await store.upsert(
        "vec_1",
        normalizeVector(createRandomVector()),
        payload,
      );
      const results = await store.search(
        normalizeVector(createRandomVector()),
        undefined,
        1,
      );

      expect(results[0].payload).toEqual(payload);
    });

    test("handles empty arrays", async () => {
      const payload = createMockPayload({
        tags: [],
        relatedFiles: [],
      });

      await store.upsert(
        "vec_1",
        normalizeVector(createRandomVector()),
        payload,
      );
      const results = await store.search(
        normalizeVector(createRandomVector()),
        undefined,
        1,
      );

      expect(results[0].payload.tags).toEqual([]);
      expect(results[0].payload.relatedFiles).toEqual([]);
    });

    test("handles unicode in payload", async () => {
      const payload = createMockPayload({
        title:
          "Unicode: \u4e2d\u6587, \u0420\u0443\u0441\u0441\u043a\u0438\u0439, \ud83d\ude80",
      });

      await store.upsert(
        "vec_1",
        normalizeVector(createRandomVector()),
        payload,
      );
      const results = await store.search(
        normalizeVector(createRandomVector()),
        undefined,
        1,
      );

      expect(results[0].payload.title).toBe(payload.title);
    });
  });

  describe("score calculation", () => {
    test("identical vectors have score close to 1", async () => {
      const vector = normalizeVector(createRandomVector());
      await store.upsert("vec_1", vector, createMockPayload());

      const results = await store.search(vector, undefined, 1);
      expect(results[0].score).toBeGreaterThan(0.99);
    });

    test("scores are in valid range [0, 1]", async () => {
      for (let i = 0; i < 10; i++) {
        await store.upsert(
          `vec_${i}`,
          normalizeVector(createRandomVector()),
          createMockPayload({ memoryId: `mem_${i}` }),
        );
      }

      const queryVector = normalizeVector(createRandomVector());
      const results = await store.search(queryVector, undefined, 10);

      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });
  });
});
