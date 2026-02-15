import { Database, type SQLQueryBindings } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import type { EmbeddingClient } from "@/embeddings/provider";
import { GraphRAGStorage } from "@/graphrag/graph/graphrag-storage";
import { migration012GraphRAG } from "@/migrations/012_graphrag";
import type { IStorageBackend } from "@/storage/interface";
import { graphragBuild } from "@/tools/graphrag/build";
import type {
  VectorPayload,
  VectorSearchFilters,
  VectorSearchResult,
  VectorStore,
} from "@/vectors/interface";

interface StoredVector {
  id: string;
  payload: VectorPayload;
  vector: number[];
}

class TrackingVectorStore implements VectorStore {
  private points = new Map<string, StoredVector>();

  async initialize(): Promise<void> {}

  async upsert(
    id: string,
    vector: number[],
    payload: VectorPayload,
  ): Promise<string> {
    this.points.set(id, { id, payload, vector: [...vector] });
    return id;
  }

  async search(
    _vector: number[],
    _filters?: VectorSearchFilters,
    _limit: number = 10,
  ): Promise<VectorSearchResult[]> {
    return [];
  }

  async delete(id: string): Promise<boolean> {
    return this.points.delete(id);
  }

  async deleteByMemoryId(memoryId: string): Promise<boolean> {
    let deleted = false;
    for (const point of this.points.values()) {
      if (point.payload.memoryId === memoryId) {
        this.points.delete(point.id);
        deleted = true;
      }
    }
    return deleted;
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

  has(id: string): boolean {
    return this.points.has(id);
  }

  idsByType(type: string): string[] {
    return Array.from(this.points.values())
      .filter((point) => point.payload.type === type)
      .map((point) => point.id);
  }
}

function buildMemory(id: string, content: string) {
  const now = 1700000000;
  return {
    id,
    type: "note",
    title: `Memory ${id}`,
    content,
    summary: content,
    importance: 0.5,
    tags: [],
    relatedFiles: [],
    experts: [],
    createdAt: now,
    accessedAt: now,
    accessCount: 0,
    needsReview: false,
  };
}

const mockEmbeddings: EmbeddingClient = {
  async embed(text: string): Promise<number[]> {
    const normalized = text.toLowerCase();
    return [
      normalized.includes("react") ? 1 : 0,
      normalized.includes("vue") ? 1 : 0,
      normalized.includes("postgresql") ? 1 : 0,
      normalized.includes("redis") ? 1 : 0,
    ];
  },
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  },
};

describe("graphragBuild incremental indexing + vector GC", () => {
  let db: Database;
  let vectors: TrackingVectorStore;
  let memoryMap: Map<string, ReturnType<typeof buildMemory>>;
  let storage: IStorageBackend;

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

    vectors = new TrackingVectorStore();
    memoryMap = new Map<string, ReturnType<typeof buildMemory>>();

    storage = {
      getDatabase: () => db,
      listMemories: () => Array.from(memoryMap.values()),
      getMemoriesByIds: (ids: string[]) =>
        ids
          .map((id) => memoryMap.get(id))
          .filter((memory): memory is ReturnType<typeof buildMemory> =>
            Boolean(memory),
          ),
    } as unknown as IStorageBackend;
  });

  test("reprocesses targeted memories and garbage-collects orphaned entity vectors", async () => {
    memoryMap.set("m1", buildMemory("m1", "React integrates with Redis."));

    const firstBuild = await graphragBuild(
      {
        reindexAll: false,
        generateReports: false,
        communityLevels: 1,
      },
      storage,
      mockEmbeddings,
      vectors,
    );

    expect(firstBuild.entitiesExtracted).toBeGreaterThan(0);
    expect(firstBuild.entityVectorsIndexed).toBeGreaterThan(0);
    expect(firstBuild.noOp).toBe(false);
    expect(firstBuild.communityRebuildSkipped).toBe(false);
    expect(firstBuild.reportGenerationSkipped).toBe(true);
    expect(firstBuild.memoriesProcessed).toBe(1);
    expect(firstBuild.memoriesSkipped).toBe(0);

    const graphBefore = new GraphRAGStorage(db);
    const reactBefore = graphBefore.getEntityByName("React");
    expect(reactBefore?.embeddingId).toBeDefined();
    const oldReactVectorId = reactBefore?.embeddingId as string;
    expect(vectors.has(oldReactVectorId)).toBe(true);

    memoryMap.set("m1", buildMemory("m1", "Vue integrates with PostgreSQL."));

    const secondBuild = await graphragBuild(
      {
        memoryIds: ["m1"],
        reindexAll: false,
        generateReports: false,
        communityLevels: 1,
      },
      storage,
      mockEmbeddings,
      vectors,
    );

    expect(secondBuild.entityVectorsDeleted).toBeGreaterThan(0);
    expect(vectors.has(oldReactVectorId)).toBe(false);
    expect(secondBuild.noOp).toBe(false);
    expect(secondBuild.communityRebuildSkipped).toBe(false);
    expect(secondBuild.reportGenerationSkipped).toBe(true);
    expect(secondBuild.memoriesProcessed).toBe(1);
    expect(secondBuild.memoriesSkipped).toBe(0);

    const graphAfter = new GraphRAGStorage(db);
    expect(graphAfter.getEntityByName("React")).toBeNull();
    expect(graphAfter.getEntityByName("Vue")).not.toBeNull();
  });

  test("garbage-collects stale report vectors when graph changes trigger community rebuild", async () => {
    const graph = new GraphRAGStorage(db);
    const seededCommunity = graph.createCommunity({
      level: 1,
      entityCount: 0,
      createdAt: 1700000000,
      updatedAt: 1700000000,
    });
    const seededReport = graph.createReport({
      id: "seed-report-1",
      communityId: seededCommunity.id,
      title: "Seeded Community",
      summary: "Seeded summary",
      fullContent: "Seeded report body",
      embeddingId: "graphrag_report_seed-report-1",
      createdAt: 1700000000,
    });

    await vectors.upsert(
      seededReport.embeddingId as string,
      [0.1, 0.2, 0.3, 0.4],
      {
        memoryId: seededReport.embeddingId as string,
        type: "graphrag_report",
        title: seededReport.title,
        tags: ["graphrag", "community", "report"],
        relatedFiles: [],
        importance: 0.5,
        reportId: seededReport.id,
        communityId: seededCommunity.id,
      },
    );

    expect(vectors.has(seededReport.embeddingId as string)).toBe(true);
    memoryMap.set("m1", buildMemory("m1", "React integrates with Redis."));

    const build = await graphragBuild(
      {
        reindexAll: false,
        generateReports: false,
        communityLevels: 1,
      },
      storage,
      mockEmbeddings,
      vectors,
    );

    expect(build.reportVectorsDeleted).toBeGreaterThan(0);
    expect(vectors.has(seededReport.embeddingId as string)).toBe(false);
    expect(build.noOp).toBe(false);
    expect(build.communityRebuildSkipped).toBe(false);
    expect(build.reportGenerationSkipped).toBe(true);
    expect(build.memoriesProcessed).toBe(1);
    expect(build.memoriesSkipped).toBe(0);
  });

  test("marks full incremental reruns as no-op when memories are already indexed", async () => {
    memoryMap.set("m1", buildMemory("m1", "React integrates with Redis."));

    const firstBuild = await graphragBuild(
      {
        reindexAll: false,
        generateReports: false,
        communityLevels: 1,
      },
      storage,
      mockEmbeddings,
      vectors,
    );
    expect(firstBuild.noOp).toBe(false);

    const secondBuild = await graphragBuild(
      {
        reindexAll: false,
        generateReports: true,
        communityLevels: 1,
      },
      storage,
      mockEmbeddings,
      vectors,
    );

    expect(secondBuild.noOp).toBe(true);
    expect(secondBuild.entitiesExtracted).toBe(0);
    expect(secondBuild.relationshipsExtracted).toBe(0);
    expect(secondBuild.entityVectorsIndexed).toBe(0);
    expect(secondBuild.communityRebuildSkipped).toBe(true);
    expect(secondBuild.reportGenerationSkipped).toBe(true);
    expect(secondBuild.memoriesProcessed).toBe(0);
    expect(secondBuild.memoriesSkipped).toBe(1);
  });
});
