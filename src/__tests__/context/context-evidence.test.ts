import { beforeEach, describe, expect, it } from "bun:test";
import { resetContextCache } from "../../caching/context-cache";
import type { EmbeddingClient } from "../../embeddings/provider";
import type { IStorageBackend } from "../../storage/interface";
import { buildContextWithCache } from "../../tools/context";
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
  {
    id: "mem-cache",
    type: "pattern",
    title: "Response Caching Pattern",
    content: "Use cache-aside with Redis for expensive read operations.",
    summary: "Cache-aside pattern for reads",
    importance: 0.74,
    tags: ["cache", "performance"],
    relatedFiles: ["src/cache/service.ts"],
    experts: ["platform-team"],
    createdAt: NOW - 2000,
    accessedAt: NOW - 300,
    accessCount: 3,
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
  {
    id: "vec-cache",
    memoryId: "mem-cache",
    score: 0.78,
    payload: {
      memoryId: "mem-cache",
      type: "pattern",
      title: "Response Caching Pattern",
      tags: ["cache", "performance"],
      relatedFiles: ["src/cache/service.ts"],
      importance: 0.74,
    },
  },
];

function createMockStorage(memories: Memory[]): IStorageBackend {
  const memoryMap = new Map(memories.map((memory) => [memory.id, memory]));
  return {
    getMemoriesByIds(ids: string[]) {
      return ids
        .map((id) => memoryMap.get(id))
        .filter((memory): memory is Memory => Boolean(memory));
    },
  } as unknown as IStorageBackend;
}

function createMockVectors(results: VectorSearchResult[]): VectorStore {
  return {
    async search() {
      return results;
    },
  } as unknown as VectorStore;
}

const mockEmbeddings: EmbeddingClient = {
  async embed() {
    return [0.1, 0.2, 0.3];
  },
  async embedBatch(texts: string[]) {
    return texts.map(() => [0.1, 0.2, 0.3]);
  },
};

describe("context evidence", () => {
  beforeEach(() => {
    resetContextCache();
  });

  it("returns structured evidence when includeEvidence is enabled", async () => {
    const result = await buildContextWithCache(
      {
        query: "auth decision strategy",
        tokenBudget: 4000,
        includeCodeGraph: false,
        includeGraphRAG: false,
        template: "default",
        includeEvidence: true,
      },
      createMockStorage(TEST_MEMORIES),
      createMockVectors(VECTOR_RESULTS),
      mockEmbeddings,
      { enabled: true, maxEntries: 50, ttlMs: 60_000 },
    );

    expect(result.evidence).toBeDefined();
    expect(result.evidence?.length).toBe(2);
    expect(result.evidence?.every((item) => item.source === "rag")).toBe(true);
    expect(result.evidence?.every((item) => item.included)).toBe(true);
    expect(result.evidence?.[0]?.memory?.id).toBe("mem-auth");
    expect(result.evidence?.[0]?.reason).toContain("semantic score");
    expect(result.evidence?.[0]?.queryTerms.length).toBeGreaterThan(0);
  });

  it("marks sections excluded by budget pressure", async () => {
    const result = await buildContextWithCache(
      {
        query: "auth decision strategy",
        tokenBudget: 100,
        includeCodeGraph: false,
        includeGraphRAG: false,
        template: "default",
        includeEvidence: true,
      },
      createMockStorage(TEST_MEMORIES),
      createMockVectors(VECTOR_RESULTS),
      mockEmbeddings,
      { enabled: true, maxEntries: 50, ttlMs: 60_000 },
    );

    expect(result.metadata.sectionsIncluded).toBe(0);
    expect(result.evidence).toBeDefined();
    expect(result.evidence?.length).toBeGreaterThan(0);
    expect(result.evidence?.every((item) => !item.included)).toBe(true);
    expect(
      result.evidence?.every((item) => item.exclusionReason === "token_budget"),
    ).toBe(true);
  });

  it("keeps evidence-mode cache entries isolated from standard mode", async () => {
    const storage = createMockStorage(TEST_MEMORIES);
    const vectors = createMockVectors(VECTOR_RESULTS);
    const cacheConfig = { enabled: true, maxEntries: 50, ttlMs: 60_000 };

    const withoutEvidence = await buildContextWithCache(
      {
        query: "auth decision strategy",
        tokenBudget: 4000,
        includeCodeGraph: false,
        includeGraphRAG: false,
        template: "default",
        includeEvidence: false,
      },
      storage,
      vectors,
      mockEmbeddings,
      cacheConfig,
    );

    expect(withoutEvidence.metadata.cacheHit).toBe(false);
    expect(withoutEvidence.evidence).toBeUndefined();

    const withEvidenceFirst = await buildContextWithCache(
      {
        query: "auth decision strategy",
        tokenBudget: 4000,
        includeCodeGraph: false,
        includeGraphRAG: false,
        template: "default",
        includeEvidence: true,
      },
      storage,
      vectors,
      mockEmbeddings,
      cacheConfig,
    );

    expect(withEvidenceFirst.metadata.cacheHit).toBe(false);
    expect(withEvidenceFirst.evidence?.length).toBeGreaterThan(0);

    const withEvidenceSecond = await buildContextWithCache(
      {
        query: "auth decision strategy",
        tokenBudget: 4000,
        includeCodeGraph: false,
        includeGraphRAG: false,
        template: "default",
        includeEvidence: true,
      },
      storage,
      vectors,
      mockEmbeddings,
      cacheConfig,
    );

    expect(withEvidenceSecond.metadata.cacheHit).toBe(true);
    expect(withEvidenceSecond.evidence?.length).toBeGreaterThan(0);
  });
});
