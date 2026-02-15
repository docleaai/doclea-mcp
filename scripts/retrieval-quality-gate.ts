import type { Database } from "bun:sqlite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { resetContextCache } from "../src/caching/context-cache";
import type { EmbeddingClient } from "../src/embeddings/provider";
import { GraphRAGStorage } from "../src/graphrag/graph/graphrag-storage";
import { SqliteStorageBackend } from "../src/storage/sqlite-backend";
import { buildContextWithCache } from "../src/tools/context";
import {
  buildGoldenFixtureSnapshotRows,
  evaluateGoldenQueryGate,
  type GoldenQueryExpectation,
  type GoldenQueryGlobalThresholds,
} from "../src/tools/context-quality-gate";
import { indexGraphEntityVectors } from "../src/tools/graphrag/entity-vectors";
import type { Memory } from "../src/types";
import type {
  VectorPayload,
  VectorSearchFilters,
  VectorSearchResult,
  VectorStore,
} from "../src/vectors/interface";

const QUALITY_FIXTURE_PATH =
  process.env.DOCLEA_QUALITY_FIXTURE_PATH ??
  "documentation/retrieval/golden-queries.json";

const FixtureMemorySchema = z.object({
  id: z.string().min(1),
  type: z.enum(["decision", "solution", "pattern", "architecture", "note"]),
  title: z.string().min(1),
  content: z.string().min(1),
  summary: z.string().optional(),
  importance: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  relatedFiles: z.array(z.string()).optional(),
  experts: z.array(z.string()).optional(),
});

const FixtureGraphEntitySchema = z.object({
  key: z.string().min(1),
  canonicalName: z.string().min(1),
  entityType: z.string().min(1),
  description: z.string().optional(),
  mentionCount: z.number().int().positive().optional(),
  extractionConfidence: z.number().min(0).max(1).optional(),
});

const FixtureGraphEntityMemorySchema = z.object({
  entityKey: z.string().min(1),
  memoryId: z.string().min(1),
  mentionText: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const FixtureGraphRelationshipSchema = z.object({
  sourceKey: z.string().min(1),
  targetKey: z.string().min(1),
  relationshipType: z.string().min(1),
  description: z.string().optional(),
  strength: z.number().min(1).max(10).optional(),
});

const FixtureGraphCommunitySchema = z.object({
  key: z.string().min(1),
  level: z.number().int().nonnegative(),
  entityKeys: z.array(z.string()).default([]),
  reportTitle: z.string().optional(),
  reportSummary: z.string().optional(),
  reportContent: z.string().optional(),
});

const GoldenQueryExpectationSchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  expectedMemoryIds: z.array(z.string()).optional(),
  expectedEntityIds: z.array(z.string()).optional(),
  expectedEntityNames: z.array(z.string()).optional(),
  recallK: z.number().int().positive().optional(),
  minMemoryRecall: z.number().min(0).max(1).optional(),
  minEntityRecall: z.number().min(0).max(1).optional(),
  minPrecisionAtK: z.number().min(0).max(1).optional(),
  includeCodeGraph: z.boolean().optional(),
  includeGraphRAG: z.boolean().optional(),
  tokenBudget: z.number().int().positive().optional(),
  template: z.enum(["default", "compact", "detailed"]).optional(),
  filters: z
    .object({
      type: z
        .enum(["decision", "solution", "pattern", "architecture", "note"])
        .optional(),
      tags: z.array(z.string()).optional(),
      minImportance: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

const GoldenFixtureSchema = z.object({
  version: z.number().int().positive(),
  description: z.string().optional(),
  defaults: z
    .object({
      includeCodeGraph: z.boolean().optional(),
      includeGraphRAG: z.boolean().optional(),
      tokenBudget: z.number().int().positive().optional(),
      template: z.enum(["default", "compact", "detailed"]).optional(),
      recallK: z.number().int().positive().optional(),
      minMemoryRecall: z.number().min(0).max(1).optional(),
      minEntityRecall: z.number().min(0).max(1).optional(),
      minPrecisionAtK: z.number().min(0).max(1).optional(),
    })
    .optional(),
  memories: z.array(FixtureMemorySchema).min(1),
  graph: z
    .object({
      entities: z.array(FixtureGraphEntitySchema).default([]),
      entityMemories: z.array(FixtureGraphEntityMemorySchema).default([]),
      relationships: z.array(FixtureGraphRelationshipSchema).default([]),
      communities: z.array(FixtureGraphCommunitySchema).default([]),
    })
    .optional(),
  queries: z.array(GoldenQueryExpectationSchema).min(1),
});

type GoldenFixture = z.infer<typeof GoldenFixtureSchema>;

const EMBED_DIMENSIONS = 96;

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  return raw.toLowerCase() === "true";
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
}

function embedTextDeterministically(text: string): number[] {
  const vector = new Array<number>(EMBED_DIMENSIONS).fill(0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    const hash = hashToken(token);
    const index = hash % EMBED_DIMENSIONS;
    const boost = 1 + Math.min(5, token.length) * 0.1;
    vector[index] += boost;
  }

  return normalizeVector(vector);
}

class DeterministicEmbeddingClient implements EmbeddingClient {
  async embed(text: string): Promise<number[]> {
    return embedTextDeterministically(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((text) => embedTextDeterministically(text));
  }
}

interface StoredVector {
  vector: number[];
  payload: VectorPayload;
}

class InMemoryVectorStore implements VectorStore {
  private vectors = new Map<string, StoredVector>();

  async initialize(): Promise<void> {
    // No-op.
  }

  async upsert(
    id: string,
    vector: number[],
    payload: VectorPayload,
  ): Promise<string> {
    this.vectors.set(id, { vector, payload });
    return id;
  }

  async search(
    vector: number[],
    filters?: VectorSearchFilters,
    limit = 10,
  ): Promise<VectorSearchResult[]> {
    const queryVector = normalizeVector([...vector]);

    const scored: VectorSearchResult[] = [];
    for (const [id, item] of this.vectors.entries()) {
      if (!this.matchesFilters(item.payload, filters)) {
        continue;
      }

      const score = this.cosineSimilarity(
        queryVector,
        normalizeVector(item.vector),
      );
      scored.push({
        id,
        memoryId: item.payload.memoryId,
        score: Math.max(0, Number(score.toFixed(6))),
        payload: item.payload,
      });
    }

    scored.sort((left, right) => right.score - left.score);
    return scored.slice(0, Math.max(1, limit));
  }

  async delete(id: string): Promise<boolean> {
    return this.vectors.delete(id);
  }

  async deleteByMemoryId(memoryId: string): Promise<boolean> {
    let deleted = false;
    for (const [id, item] of this.vectors.entries()) {
      if (item.payload.memoryId === memoryId) {
        this.vectors.delete(id);
        deleted = true;
      }
    }
    return deleted;
  }

  async getCollectionInfo(): Promise<{
    vectorsCount: number;
    pointsCount: number;
  }> {
    const count = this.vectors.size;
    return { vectorsCount: count, pointsCount: count };
  }

  private matchesFilters(
    payload: VectorPayload,
    filters?: VectorSearchFilters,
  ): boolean {
    if (!filters) {
      return true;
    }

    if (filters.type && payload.type !== filters.type) {
      return false;
    }

    if (
      filters.minImportance !== undefined &&
      payload.importance < filters.minImportance
    ) {
      return false;
    }

    if (filters.tags && filters.tags.length > 0) {
      const payloadTags = new Set(payload.tags);
      const hasAllTags = filters.tags.every((tag) => payloadTags.has(tag));
      if (!hasAllTags) {
        return false;
      }
    }

    if (filters.relatedFiles && filters.relatedFiles.length > 0) {
      const payloadFiles = new Set(payload.relatedFiles);
      const hasAnyFile = filters.relatedFiles.some((file) =>
        payloadFiles.has(file),
      );
      if (!hasAnyFile) {
        return false;
      }
    }

    return true;
  }

  private cosineSimilarity(left: number[], right: number[]): number {
    let dot = 0;
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      dot += left[i]! * right[i]!;
    }
    return dot;
  }
}

function loadFixture(filePath: string): GoldenFixture {
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(
      `Golden fixture not found at ${resolvedPath}. Set DOCLEA_QUALITY_FIXTURE_PATH to override.`,
    );
  }

  const parsed = JSON.parse(readFileSync(resolvedPath, "utf-8"));
  return GoldenFixtureSchema.parse(parsed);
}

function toCreateMemory(memory: z.infer<typeof FixtureMemorySchema>): Memory {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: memory.id,
    type: memory.type,
    title: memory.title,
    content: memory.content,
    summary: memory.summary,
    importance: memory.importance ?? 0.5,
    tags: memory.tags ?? [],
    relatedFiles: memory.relatedFiles ?? [],
    experts: memory.experts ?? [],
    createdAt: now,
    accessedAt: now,
    accessCount: 0,
    needsReview: false,
  };
}

function buildMemoryVectorPayload(memory: Memory): VectorPayload {
  return {
    memoryId: memory.id,
    type: memory.type,
    title: memory.title,
    tags: memory.tags ?? [],
    relatedFiles: memory.relatedFiles ?? [],
    importance: memory.importance ?? 0.5,
    content: `${memory.summary ?? ""}\n${memory.content}`,
  };
}

function getGoldenThresholds(
  fixture: GoldenFixture,
): GoldenQueryGlobalThresholds {
  const defaults = fixture.defaults;
  const recallK = parseIntEnv(
    "DOCLEA_QUALITY_GATE_RECALL_K",
    defaults?.recallK ?? 6,
  );

  const minMemoryRecall =
    parseFloatEnv("DOCLEA_QUALITY_GATE_MIN_MEMORY_RECALL") ??
    defaults?.minMemoryRecall ??
    1;

  const minEntityRecall =
    parseFloatEnv("DOCLEA_QUALITY_GATE_MIN_ENTITY_RECALL") ??
    defaults?.minEntityRecall ??
    1;

  const minPrecisionAtK =
    parseFloatEnv("DOCLEA_QUALITY_GATE_MIN_PRECISION_AT_K") ??
    defaults?.minPrecisionAtK;

  return {
    recallK: Math.max(1, recallK),
    minMemoryRecall: Math.max(0, Math.min(1, minMemoryRecall)),
    minEntityRecall: Math.max(0, Math.min(1, minEntityRecall)),
    ...(minPrecisionAtK === undefined
      ? {}
      : {
          minPrecisionAtK: Math.max(0, Math.min(1, minPrecisionAtK)),
        }),
  };
}

function updateFixtureExpectedHits(
  filePath: string,
  fixture: GoldenFixture,
  rows: Array<{
    queryId: string;
    expectedMemoryIds: string[];
    expectedEntityNames: string[];
  }>,
): void {
  const rowByQueryId = new Map(rows.map((row) => [row.queryId, row]));

  const updatedQueries = fixture.queries.map((query) => {
    const row = rowByQueryId.get(query.id);
    if (!row) {
      return query;
    }

    return {
      ...query,
      expectedMemoryIds: row.expectedMemoryIds,
      expectedEntityNames: row.expectedEntityNames,
    };
  });

  const updated = {
    ...fixture,
    queries: updatedQueries,
  };

  writeFileSync(
    resolve(filePath),
    `${JSON.stringify(updated, null, 2)}\n`,
    "utf-8",
  );
}

function toLowercaseMap(
  entries: Array<{ id: string; name: string }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of entries) {
    map[entry.id.toLowerCase()] = entry.name.toLowerCase();
  }
  return map;
}

function printFailureReport(
  failedQueries: ReturnType<typeof evaluateGoldenQueryGate>["queries"],
): void {
  console.error("[doclea] Retrieval quality gate failed.");

  for (const query of failedQueries) {
    if (query.passed) {
      continue;
    }

    console.error(`\nQuery ${query.queryId}: ${query.query}`);
    console.error(`Reasons: ${query.failureReasons.join("; ")}`);
    console.error(
      `Memory expected=${JSON.stringify(query.memory.expected)} retrievedTopK=${JSON.stringify(query.memory.retrievedTopK)} missing=${JSON.stringify(query.memory.missing)}`,
    );
    console.error(
      `Entity expected=${JSON.stringify(query.entity.expected)} retrievedTopK=${JSON.stringify(query.entity.retrievedTopK)} missing=${JSON.stringify(query.entity.missing)}`,
    );
  }
}

async function main(): Promise<void> {
  const fixturePath = resolve(QUALITY_FIXTURE_PATH);
  const fixture = loadFixture(fixturePath);
  const thresholds = getGoldenThresholds(fixture);

  const storage = new SqliteStorageBackend(":memory:");
  await storage.initialize();

  const vectors = new InMemoryVectorStore();
  await vectors.initialize();

  const embeddings = new DeterministicEmbeddingClient();

  const defaultIncludeCodeGraph =
    fixture.defaults?.includeCodeGraph ??
    parseBoolEnv("DOCLEA_QUALITY_GATE_INCLUDE_CODE_GRAPH", false);
  const defaultIncludeGraphRAG =
    fixture.defaults?.includeGraphRAG ??
    parseBoolEnv("DOCLEA_QUALITY_GATE_INCLUDE_GRAPHRAG", true);
  const defaultTokenBudget =
    fixture.defaults?.tokenBudget ??
    parseIntEnv("DOCLEA_QUALITY_GATE_TOKEN_BUDGET", 4000);
  const defaultTemplate = fixture.defaults?.template ?? "compact";

  resetContextCache();

  try {
    for (const fixtureMemory of fixture.memories) {
      const memory = toCreateMemory(fixtureMemory);
      storage.createMemory({
        id: memory.id,
        type: memory.type,
        title: memory.title,
        content: memory.content,
        summary: memory.summary,
        importance: memory.importance,
        tags: memory.tags,
        relatedFiles: memory.relatedFiles,
        experts: memory.experts,
      });

      const embeddingText = [memory.title, memory.summary ?? "", memory.content]
        .filter((part) => part.length > 0)
        .join("\n");

      const vector = await embeddings.embed(embeddingText);
      await vectors.upsert(
        `memory:${memory.id}`,
        vector,
        buildMemoryVectorPayload(memory),
      );
    }

    const graphStorage = new GraphRAGStorage(storage.getDatabase() as Database);
    const entityKeyToId = new Map<string, string>();
    const entityNames: Array<{ id: string; name: string }> = [];

    for (const entityFixture of fixture.graph?.entities ?? []) {
      const created = graphStorage.createEntity({
        canonicalName: entityFixture.canonicalName,
        entityType: entityFixture.entityType,
        description: entityFixture.description,
        mentionCount: entityFixture.mentionCount ?? 1,
        extractionConfidence: entityFixture.extractionConfidence ?? 1,
      });
      entityKeyToId.set(entityFixture.key, created.id);
      entityNames.push({ id: created.id, name: created.canonicalName });
    }

    for (const link of fixture.graph?.entityMemories ?? []) {
      const entityId = entityKeyToId.get(link.entityKey);
      if (!entityId) {
        throw new Error(
          `Unknown entityKey in entityMemories: ${link.entityKey}`,
        );
      }
      graphStorage.linkEntityToMemory(
        entityId,
        link.memoryId,
        link.mentionText ?? link.entityKey,
        link.confidence ?? 0.9,
      );
    }

    for (const relationship of fixture.graph?.relationships ?? []) {
      const sourceEntityId = entityKeyToId.get(relationship.sourceKey);
      const targetEntityId = entityKeyToId.get(relationship.targetKey);
      if (!sourceEntityId || !targetEntityId) {
        throw new Error(
          `Unknown entity key in relationship: ${relationship.sourceKey} -> ${relationship.targetKey}`,
        );
      }

      graphStorage.createRelationship({
        sourceEntityId,
        targetEntityId,
        relationshipType: relationship.relationshipType,
        description: relationship.description,
        strength: relationship.strength ?? 8,
        createdAt: Math.floor(Date.now() / 1000),
      });
    }

    for (const communityFixture of fixture.graph?.communities ?? []) {
      const community = graphStorage.createCommunity({
        level: communityFixture.level,
        parentId: null,
        entityCount: 0,
        resolution: null,
        modularity: null,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      });

      for (const entityKey of communityFixture.entityKeys) {
        const entityId = entityKeyToId.get(entityKey);
        if (entityId) {
          graphStorage.addEntityToCommunity(community.id, entityId);
        }
      }

      if (communityFixture.reportSummary) {
        graphStorage.createReport({
          communityId: community.id,
          title:
            communityFixture.reportTitle ??
            `Community ${communityFixture.key} report`,
          summary: communityFixture.reportSummary,
          fullContent:
            communityFixture.reportContent ?? communityFixture.reportSummary,
        });
      }
    }

    if ((fixture.graph?.entities.length ?? 0) > 0) {
      await indexGraphEntityVectors(graphStorage, vectors, embeddings);
    }

    const queryEvidence = [] as Array<{
      expectation: GoldenQueryExpectation;
      evidence: NonNullable<
        Awaited<ReturnType<typeof buildContextWithCache>>["evidence"]
      >;
    }>;

    for (const query of fixture.queries) {
      const result = await buildContextWithCache(
        {
          query: query.query,
          tokenBudget: query.tokenBudget ?? defaultTokenBudget,
          includeCodeGraph: query.includeCodeGraph ?? defaultIncludeCodeGraph,
          includeGraphRAG: query.includeGraphRAG ?? defaultIncludeGraphRAG,
          includeEvidence: true,
          template: query.template ?? defaultTemplate,
          filters: query.filters,
        },
        storage,
        vectors,
        embeddings,
        {
          enabled: true,
          maxEntries: 100,
          ttlMs: 60_000,
        },
      );

      queryEvidence.push({
        expectation: query,
        evidence: result.evidence ?? [],
      });
    }

    const report = evaluateGoldenQueryGate({
      queries: queryEvidence,
      defaults: thresholds,
      entityNameById: toLowercaseMap(entityNames),
    });

    console.log(
      JSON.stringify(
        {
          fixturePath,
          version: fixture.version,
          passed: report.passed,
          totalQueries: report.totalQueries,
          failedQueries: report.failedQueries,
          averages: report.averages,
          thresholds,
        },
        null,
        2,
      ),
    );

    const shouldUpdateFixture = parseBoolEnv(
      "DOCLEA_QUALITY_GATE_UPDATE_FIXTURE",
      false,
    );
    if (shouldUpdateFixture) {
      const snapshotRows = buildGoldenFixtureSnapshotRows(report);
      updateFixtureExpectedHits(fixturePath, fixture, snapshotRows);
      console.log(`[doclea] Updated fixture expected hits at ${fixturePath}`);
    }

    if (!report.passed) {
      printFailureReport(report.queries);
      process.exitCode = 1;
      return;
    }

    console.log(
      `[doclea] Retrieval quality gate passed for ${report.passedQueries}/${report.totalQueries} golden queries`,
    );
  } finally {
    storage.close();
  }
}

await main();
