import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "bun:test";
import { resetContextCache } from "../../caching/context-cache";
import type { EmbeddingClient } from "../../embeddings/provider";
import type { IStorageBackend } from "../../storage/interface";
import { benchmarkContextRetrieval } from "../../tools/context";
import type { Memory } from "../../types";
import type { VectorSearchResult, VectorStore } from "../../vectors/interface";

const NOW = Math.floor(Date.now() / 1000);

const TEST_MEMORIES: Memory[] = [
  {
    id: "mem-auth",
    type: "decision",
    title: "JWT Authentication Strategy",
    content:
      "Use JWT access tokens and rotating refresh tokens for API authentication.",
    summary: "JWT with rotating refresh tokens",
    importance: 0.92,
    tags: ["auth", "security"],
    relatedFiles: ["src/auth/jwt.ts"],
    experts: ["auth-team"],
    createdAt: NOW - 1000,
    accessedAt: NOW - 100,
    accessCount: 5,
    needsReview: false,
  },
];

const VECTOR_RESULTS: VectorSearchResult[] = [
  {
    id: "vec-auth",
    memoryId: "mem-auth",
    score: 0.93,
    payload: {
      memoryId: "mem-auth",
      type: "decision",
      title: "JWT Authentication Strategy",
      tags: ["auth", "security"],
      relatedFiles: ["src/auth/jwt.ts"],
      importance: 0.92,
    },
  },
];

const mockEmbeddings: EmbeddingClient = {
  async embed() {
    return [0.1, 0.2, 0.3];
  },
  async embedBatch(texts: string[]) {
    return texts.map(() => [0.1, 0.2, 0.3]);
  },
};

describe("context retrieval benchmark", () => {
  beforeEach(() => {
    resetContextCache();
  });

  it("reports latency, routes, and cache hit/miss mix", async () => {
    const db = new Database(":memory:");
    const memoryMap = new Map(
      TEST_MEMORIES.map((memory) => [memory.id, memory]),
    );

    const storage = {
      getDatabase: () => db,
      getMemoriesByIds: (ids: string[]) =>
        ids
          .map((id) => memoryMap.get(id))
          .filter((memory): memory is Memory => Boolean(memory)),
    } as const;

    const vectors = {
      async search() {
        return VECTOR_RESULTS;
      },
    } as const;

    const result = await benchmarkContextRetrieval(
      {
        queries: ["why did we choose jwt auth strategy"],
        runsPerQuery: 2,
        warmupRuns: 0,
        includeCodeGraph: false,
        includeGraphRAG: false,
        clearCacheFirst: true,
      },
      storage as unknown as IStorageBackend,
      vectors as unknown as VectorStore,
      mockEmbeddings,
      { enabled: true, maxEntries: 100, ttlMs: 60_000 },
    );

    expect(result.totalRuns).toBe(2);
    expect(result.cache.hits).toBe(1);
    expect(result.cache.misses).toBe(1);
    expect(result.routes.some((route) => route.route === "memory")).toBe(true);
    expect(result.stages.length).toBeGreaterThan(0);
    expect(result.stages.some((stage) => stage.stage === "rag")).toBe(true);
    expect(result.stages.some((stage) => stage.stage === "rerank")).toBe(true);
    expect(result.comparison).toBeUndefined();
  });

  it("adds memory-only baseline comparison when requested", async () => {
    const db = new Database(":memory:");
    const memoryMap = new Map(
      TEST_MEMORIES.map((memory) => [memory.id, memory]),
    );

    const storage = {
      getDatabase: () => db,
      getMemoriesByIds: (ids: string[]) =>
        ids
          .map((id) => memoryMap.get(id))
          .filter((memory): memory is Memory => Boolean(memory)),
    } as const;

    const vectors = {
      async search() {
        return VECTOR_RESULTS;
      },
    } as const;

    const result = await benchmarkContextRetrieval(
      {
        queries: ["why did we choose jwt auth strategy"],
        runsPerQuery: 1,
        warmupRuns: 0,
        includeCodeGraph: true,
        includeGraphRAG: true,
        compareAgainstMemoryOnly: true,
        clearCacheFirst: true,
      },
      storage as unknown as IStorageBackend,
      vectors as unknown as VectorStore,
      mockEmbeddings,
      { enabled: true, maxEntries: 100, ttlMs: 60_000 },
    );

    expect(result.comparison).toBeDefined();
    expect(result.comparison?.requested.includeCodeGraph).toBe(true);
    expect(result.comparison?.requested.includeGraphRAG).toBe(true);
    expect(result.comparison?.baseline.includeCodeGraph).toBe(false);
    expect(result.comparison?.baseline.includeGraphRAG).toBe(false);
    expect(result.comparison?.requested.stages.length).toBeGreaterThan(0);
    expect(result.comparison?.baseline.stages.length).toBeGreaterThan(0);
    expect(result.comparison?.overhead.ratios.p95).toBeGreaterThan(0);
  });
});
