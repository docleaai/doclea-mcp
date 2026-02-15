import { Database, type SQLQueryBindings } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { resetContextCache } from "../../caching/context-cache";
import type { EmbeddingClient } from "../../embeddings/provider";
import { GraphRAGStorage } from "../../graphrag/graph/graphrag-storage";
import { migration012GraphRAG } from "../../migrations/012_graphrag";
import type { IStorageBackend } from "../../storage/interface";
import { buildContextWithCache } from "../../tools/context";
import type { VectorStore } from "../../vectors/interface";

const mockEmbeddings: EmbeddingClient = {
  async embed() {
    return [0.2, 0.4, 0.6];
  },
  async embedBatch(texts: string[]) {
    return texts.map(() => [0.2, 0.4, 0.6]);
  },
};

const mockVectors: VectorStore = {
  async search() {
    return [];
  },
} as unknown as VectorStore;

describe("context GraphRAG integration", () => {
  let db: Database;
  let graph: GraphRAGStorage;

  beforeEach(() => {
    resetContextCache();
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
    graph = new GraphRAGStorage(db);

    const authService = graph.createEntity({
      canonicalName: "AuthService",
      entityType: "TECHNOLOGY",
      description: "Main authentication service",
      mentionCount: 12,
      extractionConfidence: 0.94,
      firstSeenAt: 1700000000,
      lastSeenAt: 1700000100,
    });

    const tokenValidator = graph.createEntity({
      canonicalName: "TokenValidator",
      entityType: "TECHNOLOGY",
      description: "Validates JWT tokens",
      mentionCount: 8,
      extractionConfidence: 0.9,
      firstSeenAt: 1700000000,
      lastSeenAt: 1700000100,
    });

    graph.createRelationship({
      sourceEntityId: authService.id,
      targetEntityId: tokenValidator.id,
      relationshipType: "depends_on",
      description: "AuthService uses TokenValidator",
      strength: 8,
      createdAt: 1700000200,
    });

    const community = graph.createCommunity({
      level: 1,
      parentId: undefined,
      entityCount: 0,
      resolution: 1,
      modularity: 0.72,
      createdAt: 1700000000,
      updatedAt: 1700000000,
    });

    graph.addEntityToCommunity(community.id, authService.id);
    graph.addEntityToCommunity(community.id, tokenValidator.id);

    graph.createReport({
      communityId: community.id,
      title: "Authentication Cluster",
      summary: "Authentication flow centers on AuthService and TokenValidator.",
      fullContent: "Detailed report content",
      keyFindings: ["AuthService depends on TokenValidator"],
      createdAt: 1700000300,
    });

    graph.linkEntityToMemory(
      authService.id,
      "mem-auth-1",
      "Auth service note",
      0.95,
    );
    graph.linkEntityToMemory(
      tokenValidator.id,
      "mem-auth-2",
      "Token validator note",
      0.9,
    );
  });

  test("includes GraphRAG sections in built context", async () => {
    const storage = {
      getDatabase: () => db,
      getMemoriesByIds: () => [],
    } as unknown as IStorageBackend;

    const result = await buildContextWithCache(
      {
        query: "What does AuthService depend on?",
        tokenBudget: 4000,
        includeCodeGraph: false,
        includeGraphRAG: true,
        includeEvidence: true,
        template: "default",
      },
      storage,
      mockVectors,
      mockEmbeddings,
      { enabled: true, maxEntries: 50, ttlMs: 60_000 },
    );

    expect(result.context).toContain("Knowledge Graph Insights");
    expect(result.context).toContain("AuthService");
    expect(result.metadata.graphragSections).toBeGreaterThan(0);

    const graphEvidence = result.evidence?.find(
      (item) => item.source === "graphrag",
    );
    expect(graphEvidence).toBeDefined();
    expect(graphEvidence?.graph?.entityId).toBeDefined();
    expect(graphEvidence?.graph?.sourceMemoryIds.length).toBeGreaterThan(0);
  });
});
