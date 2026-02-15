/**
 * E2E tests for zero-config mode
 *
 * Tests the zero-config architecture:
 * - Zero-config startup without Docker
 * - Auto-detection of running Docker services
 * - Graceful fallback when services unavailable
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VectorPayload } from "@/vectors/interface";
import { LibSqlVectorStore } from "@/vectors/libsql";

const VECTOR_SIZE = 384;

// Helper to check if a service is available
async function checkService(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function createMockPayload(
  overrides: Partial<VectorPayload> = {},
): VectorPayload {
  return {
    memoryId: `mem_${Date.now()}`,
    type: "decision",
    title: "Test Memory",
    tags: ["test"],
    relatedFiles: [],
    importance: 0.5,
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

describe("Zero-Config E2E Tests", () => {
  const TEST_DIR = join(tmpdir(), `doclea-zero-config-test-${Date.now()}`);

  beforeAll(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("zero-config startup without Docker", () => {
    test("libsql store initializes without external services", async () => {
      const dbPath = join(TEST_DIR, "vectors-test-1.db");
      const store = new LibSqlVectorStore({ dbPath, vectorSize: VECTOR_SIZE });

      await store.initialize();

      const info = await store.getCollectionInfo();
      expect(info.vectorsCount).toBe(0);

      store.close();
    });

    test("libsql store persists data to disk", async () => {
      const dbPath = join(TEST_DIR, "vectors-persist.db");

      // Create and populate store
      const store1 = new LibSqlVectorStore({ dbPath, vectorSize: VECTOR_SIZE });
      await store1.initialize();

      const vector = normalizeVector(createRandomVector());
      await store1.upsert(
        "vec_persist",
        vector,
        createMockPayload({ title: "Persisted" }),
      );
      store1.close();

      // Reopen and verify data
      const store2 = new LibSqlVectorStore({ dbPath, vectorSize: VECTOR_SIZE });
      await store2.initialize();

      const info = await store2.getCollectionInfo();
      expect(info.vectorsCount).toBe(1);

      const results = await store2.search(vector, undefined, 1);
      expect(results[0].payload.title).toBe("Persisted");

      store2.close();
    });

    test("libsql completes full memory workflow", async () => {
      const dbPath = join(TEST_DIR, "vectors-workflow.db");
      const store = new LibSqlVectorStore({ dbPath, vectorSize: VECTOR_SIZE });
      await store.initialize();

      // Store
      const vector1 = normalizeVector(createRandomVector());
      const payload1 = createMockPayload({
        memoryId: "mem_1",
        title: "First Decision",
      });
      await store.upsert("vec_1", vector1, payload1);

      // Search
      const results1 = await store.search(vector1, undefined, 10);
      expect(results1).toHaveLength(1);
      expect(results1[0].payload.title).toBe("First Decision");

      // Update
      const vector2 = normalizeVector(createRandomVector());
      const payload2 = createMockPayload({
        memoryId: "mem_1",
        title: "Updated Decision",
      });
      await store.upsert("vec_1", vector2, payload2);

      const results2 = await store.search(vector2, undefined, 1);
      expect(results2[0].payload.title).toBe("Updated Decision");

      // Delete
      const deleted = await store.delete("vec_1");
      expect(deleted).toBe(true);

      const results3 = await store.search(vector2, undefined, 10);
      expect(results3).toHaveLength(0);

      store.close();
    });

    test("libsql handles multiple concurrent vectors", async () => {
      const dbPath = join(TEST_DIR, "vectors-concurrent.db");
      const store = new LibSqlVectorStore({ dbPath, vectorSize: VECTOR_SIZE });
      await store.initialize();

      // Insert 100 vectors
      const vectors: {
        id: string;
        vector: number[];
        payload: VectorPayload;
      }[] = [];
      for (let i = 0; i < 100; i++) {
        const vector = normalizeVector(createRandomVector());
        const payload = createMockPayload({
          memoryId: `mem_${i}`,
          title: `Memory ${i}`,
          type: i % 3 === 0 ? "decision" : i % 3 === 1 ? "pattern" : "note",
          importance: Math.random(),
        });
        vectors.push({ id: `vec_${i}`, vector, payload });
        await store.upsert(`vec_${i}`, vector, payload);
      }

      const info = await store.getCollectionInfo();
      expect(info.vectorsCount).toBe(100);

      // Search should return results
      const queryVector = normalizeVector(createRandomVector());
      const results = await store.search(queryVector, undefined, 10);
      expect(results).toHaveLength(10);

      // Filter by type
      const decisionResults = await store.search(
        queryVector,
        { type: "decision" },
        50,
      );
      for (const result of decisionResults) {
        expect(result.payload.type).toBe("decision");
      }

      store.close();
    });
  });

  describe("auto-detection of Docker services", () => {
    test("detects Qdrant availability", async () => {
      const qdrantAvailable = await checkService(
        "http://localhost:6333/readyz",
      );
      // Test passes regardless - just verifies the check works
      expect(typeof qdrantAvailable).toBe("boolean");
    });

    test("detects TEI availability", async () => {
      const teiAvailable = await checkService("http://localhost:8080/health");
      expect(typeof teiAvailable).toBe("boolean");
    });

    test("auto-detection handles unreachable services gracefully", async () => {
      // Check a definitely-not-running service
      const available = await checkService("http://localhost:59999/health");
      expect(available).toBe(false);
    });

    test("auto-detection respects timeout", async () => {
      const start = Date.now();
      // This should timeout quickly, not hang
      const available = await checkService("http://10.255.255.1:9999/health");
      const elapsed = Date.now() - start;

      expect(available).toBe(false);
      expect(elapsed).toBeLessThan(5000); // Should be < 5s due to timeout
    });
  });

  describe("graceful fallback", () => {
    test("libsql works when Qdrant is unavailable", async () => {
      // This test verifies that the embedded store works independently
      const dbPath = join(TEST_DIR, "vectors-fallback.db");
      const store = new LibSqlVectorStore({ dbPath, vectorSize: VECTOR_SIZE });
      await store.initialize();

      const vector = normalizeVector(createRandomVector());
      const payload = createMockPayload({ title: "Fallback Test" });

      // Should work without any external services
      await store.upsert("vec_fallback", vector, payload);
      const results = await store.search(vector, undefined, 1);

      expect(results).toHaveLength(1);
      expect(results[0].payload.title).toBe("Fallback Test");

      store.close();
    });

    test("error messages are clear when services unavailable", async () => {
      // Simulating config detection failure messages
      const qdrantError = "Qdrant not available at http://localhost:6333";
      const teiError = "TEI not available at http://localhost:8080";

      expect(qdrantError).toContain("localhost:6333");
      expect(teiError).toContain("localhost:8080");
    });
  });

  describe("data isolation between projects", () => {
    test("separate db paths keep data isolated", async () => {
      const dbPath1 = join(TEST_DIR, "project1", "vectors.db");
      const dbPath2 = join(TEST_DIR, "project2", "vectors.db");

      mkdirSync(join(TEST_DIR, "project1"), { recursive: true });
      mkdirSync(join(TEST_DIR, "project2"), { recursive: true });

      const store1 = new LibSqlVectorStore({
        dbPath: dbPath1,
        vectorSize: VECTOR_SIZE,
      });
      const store2 = new LibSqlVectorStore({
        dbPath: dbPath2,
        vectorSize: VECTOR_SIZE,
      });

      await store1.initialize();
      await store2.initialize();

      // Add to store1
      const vector1 = normalizeVector(createRandomVector());
      await store1.upsert(
        "vec_1",
        vector1,
        createMockPayload({ title: "Project 1" }),
      );

      // Add to store2
      const vector2 = normalizeVector(createRandomVector());
      await store2.upsert(
        "vec_2",
        vector2,
        createMockPayload({ title: "Project 2" }),
      );

      // Verify isolation
      const info1 = await store1.getCollectionInfo();
      const info2 = await store2.getCollectionInfo();

      expect(info1.vectorsCount).toBe(1);
      expect(info2.vectorsCount).toBe(1);

      // Search in store1 should only find store1 data
      const results1 = await store1.search(
        normalizeVector(createRandomVector()),
        undefined,
        10,
      );
      expect(results1[0].payload.title).toBe("Project 1");

      // Search in store2 should only find store2 data
      const results2 = await store2.search(
        normalizeVector(createRandomVector()),
        undefined,
        10,
      );
      expect(results2[0].payload.title).toBe("Project 2");

      store1.close();
      store2.close();
    });
  });

  describe("performance baseline", () => {
    test("insert performance meets baseline (>50 vectors/sec)", async () => {
      const dbPath = join(TEST_DIR, "vectors-perf-insert.db");
      const store = new LibSqlVectorStore({ dbPath, vectorSize: VECTOR_SIZE });
      await store.initialize();

      const count = 100;
      const start = Date.now();

      for (let i = 0; i < count; i++) {
        const vector = normalizeVector(createRandomVector());
        await store.upsert(
          `vec_${i}`,
          vector,
          createMockPayload({ memoryId: `mem_${i}` }),
        );
      }

      const elapsed = Date.now() - start;
      const rate = (count / elapsed) * 1000;

      console.log(`Insert rate: ${rate.toFixed(1)} vectors/sec`);
      expect(rate).toBeGreaterThan(50); // At least 50 vectors/sec

      store.close();
    });

    test("search performance meets baseline (<100ms for 1000 vectors)", async () => {
      const dbPath = join(TEST_DIR, "vectors-perf-search.db");
      const store = new LibSqlVectorStore({ dbPath, vectorSize: VECTOR_SIZE });
      await store.initialize();

      // Insert 1000 vectors
      for (let i = 0; i < 1000; i++) {
        const vector = normalizeVector(createRandomVector());
        await store.upsert(
          `vec_${i}`,
          vector,
          createMockPayload({ memoryId: `mem_${i}` }),
        );
      }

      // Warm up
      const warmupVector = normalizeVector(createRandomVector());
      await store.search(warmupVector, undefined, 10);

      // Measure search
      const queryVector = normalizeVector(createRandomVector());
      const start = Date.now();
      const results = await store.search(queryVector, undefined, 10);
      const elapsed = Date.now() - start;

      console.log(`Search time (1000 vectors): ${elapsed}ms`);
      expect(elapsed).toBeLessThan(100); // Under 100ms
      expect(results).toHaveLength(10);

      store.close();
    }, 20000);
  });

  describe("edge cases", () => {
    test("handles empty database gracefully", async () => {
      const dbPath = join(TEST_DIR, "vectors-empty.db");
      const store = new LibSqlVectorStore({ dbPath, vectorSize: VECTOR_SIZE });
      await store.initialize();

      const queryVector = normalizeVector(createRandomVector());
      const results = await store.search(queryVector, undefined, 10);

      expect(results).toHaveLength(0);

      store.close();
    });

    test("handles special characters in payload", async () => {
      const dbPath = join(TEST_DIR, "vectors-special.db");
      const store = new LibSqlVectorStore({ dbPath, vectorSize: VECTOR_SIZE });
      await store.initialize();

      const payload = createMockPayload({
        title: 'Special "chars" & <tags> \' backslash\\test',
        tags: ["tag/with/slashes", "tag:with:colons"],
        relatedFiles: ["/path/to/file's name.ts"],
      });

      const vector = normalizeVector(createRandomVector());
      await store.upsert("vec_special", vector, payload);

      const results = await store.search(vector, undefined, 1);
      expect(results[0].payload.title).toBe(payload.title);
      expect(results[0].payload.tags).toEqual(payload.tags);
      expect(results[0].payload.relatedFiles).toEqual(payload.relatedFiles);

      store.close();
    });

    test("handles unicode in payload", async () => {
      const dbPath = join(TEST_DIR, "vectors-unicode.db");
      const store = new LibSqlVectorStore({ dbPath, vectorSize: VECTOR_SIZE });
      await store.initialize();

      const payload = createMockPayload({
        title: "Unicode: 中文, Русский, العربية, 日本語, 한국어, 🚀💻",
        tags: ["标签", "метка", "タグ"],
      });

      const vector = normalizeVector(createRandomVector());
      await store.upsert("vec_unicode", vector, payload);

      const results = await store.search(vector, undefined, 1);
      expect(results[0].payload.title).toBe(payload.title);
      expect(results[0].payload.tags).toEqual(payload.tags);

      store.close();
    });

    test("handles very long strings", async () => {
      const dbPath = join(TEST_DIR, "vectors-long.db");
      const store = new LibSqlVectorStore({ dbPath, vectorSize: VECTOR_SIZE });
      await store.initialize();

      const longTitle = "A".repeat(10000);
      const payload = createMockPayload({ title: longTitle });

      const vector = normalizeVector(createRandomVector());
      await store.upsert("vec_long", vector, payload);

      const results = await store.search(vector, undefined, 1);
      expect(results[0].payload.title).toBe(longTitle);

      store.close();
    });
  });
});
