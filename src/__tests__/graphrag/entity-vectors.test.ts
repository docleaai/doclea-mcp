import { Database, type SQLQueryBindings } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import type { EmbeddingClient } from "@/embeddings/provider";
import { GraphRAGStorage } from "@/graphrag/graph/graphrag-storage";
import { migration012GraphRAG } from "@/migrations/012_graphrag";
import {
  GRAPHRAG_ENTITY_MEMORY_PREFIX,
  indexGraphEntityVectors,
  searchGraphEntities,
} from "@/tools/graphrag/entity-vectors";
import type {
  VectorPayload,
  VectorSearchFilters,
  VectorSearchResult,
  VectorStore,
} from "@/vectors/interface";

interface StoredVector {
  id: string;
  vector: number[];
  payload: VectorPayload;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

class InMemoryVectorStore implements VectorStore {
  private points = new Map<string, StoredVector>();

  async initialize(): Promise<void> {}

  async upsert(
    id: string,
    vector: number[],
    payload: VectorPayload,
  ): Promise<string> {
    this.points.set(id, {
      id,
      vector: [...vector],
      payload,
    });
    return id;
  }

  async search(
    vector: number[],
    filters?: VectorSearchFilters,
    limit = 10,
  ): Promise<VectorSearchResult[]> {
    const filtered = Array.from(this.points.values()).filter((point) => {
      if (filters?.type && point.payload.type !== filters.type) {
        return false;
      }
      return true;
    });

    return filtered
      .map((point) => ({
        id: point.id,
        memoryId: point.payload.memoryId,
        payload: point.payload,
        score: cosineSimilarity(vector, point.vector),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  async delete(id: string): Promise<boolean> {
    return this.points.delete(id);
  }

  async deleteByMemoryId(memoryId: string): Promise<boolean> {
    let removed = false;
    for (const point of this.points.values()) {
      if (point.payload.memoryId === memoryId) {
        this.points.delete(point.id);
        removed = true;
      }
    }
    return removed;
  }

  async getCollectionInfo(): Promise<{
    vectorsCount: number;
    pointsCount: number;
  }> {
    return {
      vectorsCount: this.points.size,
      pointsCount: this.points.size,
    };
  }
}

function embedText(text: string): number[] {
  const normalized = text.toLowerCase();
  return [
    normalized.includes("auth") ? 1 : 0,
    normalized.includes("token") ? 1 : 0,
    normalized.includes("cache") ? 1 : 0,
    normalized.length / 100,
  ];
}

const mockEmbeddings: EmbeddingClient = {
  async embed(text: string): Promise<number[]> {
    return embedText(text);
  },
  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((text) => embedText(text));
  },
};

describe("GraphRAG entity vectors", () => {
  let db: Database;
  let graphStorage: GraphRAGStorage;
  let vectors: InMemoryVectorStore;
  let authEntityId: string;
  let tokenEntityId: string;

  beforeEach(() => {
    db = new Database(":memory:");

    const migrationDb = {
      run: (sql: string, ...params: SQLQueryBindings[]) =>
        db.query(sql).run(...params),
      exec: (sql: string) => db.exec(sql),
      query: <T = unknown>(sql: string, ...params: SQLQueryBindings[]) =>
        db.query(sql).all(...params) as T[],
      get: <T = unknown>(sql: string, ...params: SQLQueryBindings[]) =>
        db.query(sql).get(...params) as T | undefined,
    };

    migration012GraphRAG.up(migrationDb);
    graphStorage = new GraphRAGStorage(db);
    vectors = new InMemoryVectorStore();

    authEntityId = graphStorage.createEntity({
      canonicalName: "AuthService",
      entityType: "TECHNOLOGY",
      description: "Core authentication service",
      mentionCount: 12,
      extractionConfidence: 0.92,
      firstSeenAt: 1700000000,
      lastSeenAt: 1700000100,
    }).id;

    tokenEntityId = graphStorage.createEntity({
      canonicalName: "TokenValidator",
      entityType: "TECHNOLOGY",
      description: "JWT token validation component",
      mentionCount: 8,
      extractionConfidence: 0.9,
      firstSeenAt: 1700000000,
      lastSeenAt: 1700000100,
    }).id;

    graphStorage.createEntity({
      canonicalName: "CacheLayer",
      entityType: "CONCEPT",
      description: "Handles distributed cache operations",
      mentionCount: 6,
      extractionConfidence: 0.88,
      firstSeenAt: 1700000000,
      lastSeenAt: 1700000100,
    });
  });

  test("indexes entity vectors and writes embedding IDs back to graph storage", async () => {
    const result = await indexGraphEntityVectors(
      graphStorage,
      vectors,
      mockEmbeddings,
    );

    expect(result.failed).toBe(0);
    expect(result.indexed).toBe(3);

    const authEntity = graphStorage.getEntity(authEntityId);
    expect(authEntity?.embeddingId).toBe(
      `${GRAPHRAG_ENTITY_MEMORY_PREFIX}${authEntityId}`,
    );

    const info = await vectors.getCollectionInfo();
    expect(info.pointsCount).toBe(3);
  });

  test("returns vector-ranked entities for semantic GraphRAG search", async () => {
    await indexGraphEntityVectors(graphStorage, vectors, mockEmbeddings);

    const results = await searchGraphEntities(
      "auth token dependency",
      graphStorage,
      vectors,
      mockEmbeddings,
      { limit: 3, minScore: 0.1 },
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.entityId).toBe(authEntityId);

    const authHit = results.find((result) => result.entityId === authEntityId);
    expect(authHit?.vectorScore).toBeDefined();
    expect(results.some((result) => result.entityId === tokenEntityId)).toBe(
      true,
    );
  });

  test("adds lexical fallback candidates that are not yet vector-indexed", async () => {
    await indexGraphEntityVectors(graphStorage, vectors, mockEmbeddings);

    const gatewayId = graphStorage.createEntity({
      canonicalName: "AuthGateway",
      entityType: "TECHNOLOGY",
      description: "Routes auth requests to downstream systems",
      mentionCount: 4,
      extractionConfidence: 0.86,
      firstSeenAt: 1700000200,
      lastSeenAt: 1700000200,
    }).id;

    const results = await searchGraphEntities(
      "auth gateway",
      graphStorage,
      vectors,
      mockEmbeddings,
      { limit: 5, minScore: 0.1 },
    );

    expect(results.some((result) => result.entityId === gatewayId)).toBe(true);
  });
});
