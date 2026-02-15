import { Database, type SQLQueryBindings } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import type { EmbeddingClient } from "@/embeddings/provider";
import { GraphRAGStorage } from "@/graphrag/graph/graphrag-storage";
import { migration012GraphRAG } from "@/migrations/012_graphrag";
import type { IStorageBackend } from "@/storage/interface";
import { graphragSearch } from "@/tools/graphrag/search";
import type { VectorStore } from "@/vectors/interface";

const mockEmbeddings: EmbeddingClient = {
  async embed() {
    return [0.2, 0.4, 0.6];
  },
  async embedBatch(texts: string[]) {
    return texts.map(() => [0.2, 0.4, 0.6]);
  },
};

describe("graphragSearch", () => {
  let db: Database;
  let graph: GraphRAGStorage;

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
    graph = new GraphRAGStorage(db);
  });

  test("global mode resolves report vector hits by payload.reportId", async () => {
    const community = graph.createCommunity({
      level: 1,
      entityCount: 0,
      createdAt: 1700000000,
      updatedAt: 1700000000,
    });

    const report = graph.createReport({
      id: "report-auth-1",
      communityId: community.id,
      title: "Authentication Community",
      summary: "AuthService and TokenValidator form the auth core.",
      fullContent: "Detailed auth community report.",
      keyFindings: ["AuthService depends on TokenValidator"],
      embeddingId: "graphrag_report_report-auth-1",
      createdAt: 1700000010,
    });

    const mockVectors: VectorStore = {
      async search() {
        return [
          {
            id: "vec-1",
            memoryId: "vec-1",
            score: 0.91,
            payload: {
              memoryId: "vec-1",
              type: "graphrag_report",
              title: "Authentication Community",
              tags: ["graphrag", "community", "report"],
              relatedFiles: [],
              importance: 0.5,
              reportId: report.id,
            },
          },
        ];
      },
    } as unknown as VectorStore;

    const storage = {
      getDatabase: () => db,
    } as unknown as IStorageBackend;

    const result = await graphragSearch(
      {
        query: "authentication architecture",
        mode: "global",
        limit: 5,
        communityLevel: 1,
        maxIterations: 3,
        maxDepth: 2,
      },
      storage,
      mockEmbeddings,
      mockVectors,
    );

    expect(result.mode).toBe("global");
    if (result.mode !== "global") return;

    expect(result.result.sourceCommunities.length).toBe(1);
    expect(result.result.sourceCommunities[0]?.report.id).toBe(report.id);
  });
});
