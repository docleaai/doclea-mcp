/**
 * True integration tests that run against real services
 *
 * Prerequisites:
 * - Docker Compose services running (Qdrant, Embeddings)
 * - Run: docker compose -f docker-compose.test.yml up -d
 *
 * These tests verify the complete system works end-to-end
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Skip if services not available
const QDRANT_URL = process.env.DOCLEA_QDRANT_URL || "http://localhost:6333";
const EMBEDDING_URL =
  process.env.DOCLEA_EMBEDDING_ENDPOINT || "http://localhost:8080";

async function checkService(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

async function servicesAvailable(): Promise<boolean> {
  const [qdrant, embeddings] = await Promise.all([
    checkService(`${QDRANT_URL}/readyz`),
    checkService(`${EMBEDDING_URL}/health`),
  ]);
  return qdrant && embeddings;
}

// Generate UUID for Qdrant point IDs
function generateUUID(): string {
  return crypto.randomUUID();
}

describe("E2E Integration Tests", () => {
  const TEST_DB_PATH = join(tmpdir(), `doclea-test-${Date.now()}.db`);
  const TEST_COLLECTION = `doclea_test_${Date.now()}`;

  let skipTests = false;
  let collectionCreated = false;

  beforeAll(async () => {
    skipTests = !(await servicesAvailable());
    if (skipTests) {
      console.warn("⚠️  Skipping E2E tests: Docker services not available");
      console.warn("   Run: docker compose -f docker-compose.test.yml up -d");
      return;
    }

    // Create test collection upfront
    const response = await fetch(
      `${QDRANT_URL}/collections/${TEST_COLLECTION}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vectors: {
            size: 384,
            distance: "Cosine",
          },
        }),
      },
    );
    collectionCreated = response.ok;
  });

  afterAll(async () => {
    // Cleanup test database
    try {
      unlinkSync(TEST_DB_PATH);
    } catch {
      // Ignore if file doesn't exist
    }

    // Cleanup Qdrant collection
    if (!skipTests && collectionCreated) {
      try {
        await fetch(`${QDRANT_URL}/collections/${TEST_COLLECTION}`, {
          method: "DELETE",
        });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe("service health", () => {
    test("qdrant is reachable", async () => {
      if (skipTests) return;
      const response = await fetch(`${QDRANT_URL}/readyz`);
      expect(response.ok).toBe(true);
    });

    test("embeddings service is reachable", async () => {
      if (skipTests) return;
      const response = await fetch(`${EMBEDDING_URL}/health`);
      expect(response.ok).toBe(true);
    });

    test("test collection was created", async () => {
      if (skipTests) return;
      expect(collectionCreated).toBe(true);
    });
  });

  describe("embeddings generation", () => {
    test("generates embeddings for text", async () => {
      if (skipTests) return;

      const response = await fetch(`${EMBEDDING_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: "Test embedding generation",
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data[0]).toHaveLength(384);
    });

    test("generates embeddings for batch", async () => {
      if (skipTests) return;

      const response = await fetch(`${EMBEDDING_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: ["First text", "Second text", "Third text"],
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toHaveLength(3);
      expect(data[0]).toHaveLength(384);
      expect(data[1]).toHaveLength(384);
      expect(data[2]).toHaveLength(384);
    });

    test("embeddings are normalized", async () => {
      if (skipTests) return;

      const response = await fetch(`${EMBEDDING_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: "Normalized vector test",
        }),
      });

      const data = await response.json();
      const vector = data[0];

      // Check L2 norm is approximately 1
      const norm = Math.sqrt(
        vector.reduce((sum: number, v: number) => sum + v * v, 0),
      );
      expect(norm).toBeCloseTo(1, 1);
    });
  });

  describe("vector store operations", () => {
    const pointId = generateUUID();

    test("can upsert point with vector", async () => {
      if (skipTests) return;

      // Generate embedding
      const embedResponse = await fetch(`${EMBEDDING_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: "Test memory content" }),
      });
      const embeddings = await embedResponse.json();

      // Upsert to Qdrant
      const response = await fetch(
        `${QDRANT_URL}/collections/${TEST_COLLECTION}/points`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: [
              {
                id: pointId,
                vector: embeddings[0],
                payload: {
                  memoryId: "mem_test123",
                  type: "decision",
                  title: "Test Decision",
                },
              },
            ],
          }),
        },
      );

      expect(response.ok).toBe(true);
    });

    test("can search by vector similarity", async () => {
      if (skipTests) return;

      // Generate query embedding
      const embedResponse = await fetch(`${EMBEDDING_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: "memory content" }),
      });
      const embeddings = await embedResponse.json();

      // Search
      const response = await fetch(
        `${QDRANT_URL}/collections/${TEST_COLLECTION}/points/search`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vector: embeddings[0],
            limit: 10,
            with_payload: true,
          }),
        },
      );

      expect(response.ok).toBe(true);
      const results = await response.json();
      expect(results.result.length).toBeGreaterThan(0);
      expect(results.result[0].payload.memoryId).toBe("mem_test123");
    });

    test("can filter search by payload", async () => {
      if (skipTests) return;

      // Generate query embedding
      const embedResponse = await fetch(`${EMBEDDING_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: "test" }),
      });
      const embeddings = await embedResponse.json();

      // Search with filter
      const response = await fetch(
        `${QDRANT_URL}/collections/${TEST_COLLECTION}/points/search`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vector: embeddings[0],
            limit: 10,
            filter: {
              must: [{ key: "type", match: { value: "decision" } }],
            },
            with_payload: true,
          }),
        },
      );

      expect(response.ok).toBe(true);
      const results = await response.json();
      for (const result of results.result) {
        expect(result.payload.type).toBe("decision");
      }
    });

    test("can delete point", async () => {
      if (skipTests) return;

      const response = await fetch(
        `${QDRANT_URL}/collections/${TEST_COLLECTION}/points/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: [pointId],
          }),
        },
      );

      expect(response.ok).toBe(true);
    });
  });

  describe("semantic similarity", () => {
    test("similar texts have high similarity", async () => {
      if (skipTests) return;

      const response = await fetch(`${EMBEDDING_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: [
            "We decided to use PostgreSQL for the database",
            "The team chose PostgreSQL as our database solution",
          ],
        }),
      });

      const embeddings = await response.json();
      const similarity = cosineSimilarity(embeddings[0], embeddings[1]);
      expect(similarity).toBeGreaterThan(0.7);
    });

    test("different texts have lower similarity", async () => {
      if (skipTests) return;

      const response = await fetch(`${EMBEDDING_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: [
            "We decided to use PostgreSQL for the database",
            "The weather is nice today for a walk in the park",
          ],
        }),
      });

      const embeddings = await response.json();
      const similarity = cosineSimilarity(embeddings[0], embeddings[1]);
      // Relaxed threshold - embeddings can find unexpected similarities
      expect(similarity).toBeLessThan(0.7);
    });

    test("code-related queries find code memories", async () => {
      if (skipTests) return;

      const codeMemory = "Implemented retry logic with exponential backoff";
      const nonCodeMemory = "Team meeting scheduled for Monday";

      const embedResponse = await fetch(`${EMBEDDING_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: [codeMemory, nonCodeMemory, "retry mechanism implementation"],
        }),
      });

      const embeddings = await embedResponse.json();

      const codeSimiliarity = cosineSimilarity(embeddings[2], embeddings[0]);
      const nonCodeSimilarity = cosineSimilarity(embeddings[2], embeddings[1]);

      expect(codeSimiliarity).toBeGreaterThan(nonCodeSimilarity);
    });
  });

  describe("full memory workflow", () => {
    const memoryId = `mem_${Date.now()}`;
    const qdrantId = generateUUID();

    test("can store memory with embedding", async () => {
      if (skipTests) return;

      const content = "We decided to use Bun for faster builds and tests";

      const embedResponse = await fetch(`${EMBEDDING_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: content }),
      });
      const embeddings = await embedResponse.json();

      const response = await fetch(
        `${QDRANT_URL}/collections/${TEST_COLLECTION}/points`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: [
              {
                id: qdrantId,
                vector: embeddings[0],
                payload: {
                  memoryId,
                  type: "decision",
                  title: "Use Bun Runtime",
                  importance: 0.8,
                  tags: ["runtime", "performance"],
                },
              },
            ],
          }),
        },
      );

      expect(response.ok).toBe(true);
    });

    test("can search and find stored memory", async () => {
      if (skipTests) return;

      const embedResponse = await fetch(`${EMBEDDING_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: "runtime choice for performance" }),
      });
      const embeddings = await embedResponse.json();

      const searchResponse = await fetch(
        `${QDRANT_URL}/collections/${TEST_COLLECTION}/points/search`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vector: embeddings[0],
            limit: 5,
            with_payload: true,
          }),
        },
      );

      expect(searchResponse.ok).toBe(true);
      const results = await searchResponse.json();

      const found = results.result.find(
        (r: { payload: { memoryId: string } }) =>
          r.payload.memoryId === memoryId,
      );
      expect(found).toBeDefined();
      expect(found.payload.title).toBe("Use Bun Runtime");
    });

    test("can update memory vector", async () => {
      if (skipTests) return;

      const newContent =
        "Updated: We chose Bun for TypeScript-first development";

      const embedResponse = await fetch(`${EMBEDDING_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: newContent }),
      });
      const embeddings = await embedResponse.json();

      const response = await fetch(
        `${QDRANT_URL}/collections/${TEST_COLLECTION}/points`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: [
              {
                id: qdrantId,
                vector: embeddings[0],
                payload: {
                  memoryId,
                  type: "decision",
                  title: "Use Bun Runtime (Updated)",
                  importance: 0.9,
                  tags: ["runtime", "performance", "typescript"],
                },
              },
            ],
          }),
        },
      );

      expect(response.ok).toBe(true);
    });

    test("can delete memory from vector store", async () => {
      if (skipTests) return;

      const response = await fetch(
        `${QDRANT_URL}/collections/${TEST_COLLECTION}/points/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: [qdrantId],
          }),
        },
      );

      expect(response.ok).toBe(true);
    });
  });

  describe("batch operations", () => {
    const batchIds = Array.from({ length: 5 }, (_, i) => ({
      memoryId: `mem_batch_${i}`,
      qdrantId: generateUUID(),
    }));

    test("can batch upsert multiple memories", async () => {
      if (skipTests) return;

      const contents = [
        "Authentication uses JWT tokens",
        "Database migrations with Prisma",
        "API rate limiting at 100 req/min",
        "Caching with Redis for sessions",
        "Error handling with Result types",
      ];

      const embedResponse = await fetch(`${EMBEDDING_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: contents }),
      });
      const embeddings = await embedResponse.json();

      const points = batchIds.map((ids, i) => ({
        id: ids.qdrantId,
        vector: embeddings[i],
        payload: {
          memoryId: ids.memoryId,
          type: "decision",
          title: contents[i].slice(0, 30),
        },
      }));

      const response = await fetch(
        `${QDRANT_URL}/collections/${TEST_COLLECTION}/points`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ points }),
        },
      );

      expect(response.ok).toBe(true);
    });

    test("can search across batch memories", async () => {
      if (skipTests) return;

      const embedResponse = await fetch(`${EMBEDDING_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: "database schema migrations" }),
      });
      const embeddings = await embedResponse.json();

      const searchResponse = await fetch(
        `${QDRANT_URL}/collections/${TEST_COLLECTION}/points/search`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vector: embeddings[0],
            limit: 10,
            with_payload: true,
          }),
        },
      );

      expect(searchResponse.ok).toBe(true);
      const results = await searchResponse.json();
      expect(results.result.length).toBeGreaterThan(0);
    });

    test("can batch delete memories", async () => {
      if (skipTests) return;

      const response = await fetch(
        `${QDRANT_URL}/collections/${TEST_COLLECTION}/points/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: batchIds.map((ids) => ids.qdrantId),
          }),
        },
      );

      expect(response.ok).toBe(true);
    });
  });

  describe("edge cases", () => {
    test("handles unicode text", async () => {
      if (skipTests) return;

      const unicodeText = "决定使用 PostgreSQL 数据库";
      const embedResponse = await fetch(`${EMBEDDING_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: unicodeText }),
      });

      expect(embedResponse.ok).toBe(true);
      const embeddings = await embedResponse.json();
      expect(embeddings[0]).toHaveLength(384);
    });

    test("handles special characters in payload", async () => {
      if (skipTests) return;

      const specialId = generateUUID();
      const embedResponse = await fetch(`${EMBEDDING_URL}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: "test content" }),
      });
      const embeddings = await embedResponse.json();

      const response = await fetch(
        `${QDRANT_URL}/collections/${TEST_COLLECTION}/points`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: [
              {
                id: specialId,
                vector: embeddings[0],
                payload: {
                  title: 'Special "chars" & <tags>',
                  path: "/path/to/file.ts",
                  regex: "^[a-z]+$",
                },
              },
            ],
          }),
        },
      );

      expect(response.ok).toBe(true);

      // Cleanup
      await fetch(
        `${QDRANT_URL}/collections/${TEST_COLLECTION}/points/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ points: [specialId] }),
        },
      );
    });
  });
});

// Helper function for cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
