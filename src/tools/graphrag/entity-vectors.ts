import type { EmbeddingClient } from "@/embeddings/provider";
import type { GraphRAGStorage } from "@/graphrag/graph/graphrag-storage";
import type { Entity } from "@/graphrag/types";
import type { VectorSearchResult, VectorStore } from "@/vectors/interface";

export const GRAPHRAG_ENTITY_VECTOR_TYPE = "graphrag_entity";
export const GRAPHRAG_ENTITY_MEMORY_PREFIX = "graphrag_entity:";
export const GRAPHRAG_REPORT_VECTOR_TYPE = "graphrag_report";

const QUERY_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "be",
  "by",
  "for",
  "from",
  "how",
  "if",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "the",
  "to",
  "what",
  "which",
  "who",
  "with",
]);

const DEFAULT_EMBED_BATCH_SIZE = 32;

export interface GraphEntityVectorIndexResult {
  indexed: number;
  failed: number;
}

export interface GraphEntityVectorIndexOptions {
  entityIds?: string[];
}

export interface GraphEntitySearchHit {
  entityId: string;
  score: number;
  vectorScore?: number;
  lexicalScore?: number;
}

export interface GraphEntitySearchOptions {
  limit?: number;
  minScore?: number;
  minLexicalScore?: number;
  candidatePool?: number;
}

interface CandidateAggregate {
  entity: Entity;
  score: number;
  vectorScore: number;
  lexicalScore: number;
}

function toFixedNumber(value: number, decimals = 4): number {
  return Number(value.toFixed(decimals));
}

function extractQueryTerms(query: string): string[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !QUERY_STOPWORDS.has(term));

  return Array.from(new Set(terms));
}

export function scoreGraphEntityMatch(
  entity: Entity,
  normalizedQuery: string,
  queryTerms: string[],
): number {
  const normalizedName = entity.canonicalName.toLowerCase();
  const description = (entity.description ?? "").toLowerCase();
  const entityText = `${normalizedName} ${description}`;

  let lexicalScore = 0;
  if (normalizedName === normalizedQuery) {
    lexicalScore = 1;
  } else if (
    normalizedName.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedName)
  ) {
    lexicalScore = 0.85;
  } else if (queryTerms.length > 0) {
    const overlap = queryTerms.filter((term) =>
      entityText.includes(term),
    ).length;
    lexicalScore = (overlap / queryTerms.length) * 0.75;
  }

  const mentionBoost = Math.min(0.12, entity.mentionCount / 100);
  const confidenceBoost = Math.min(0.08, entity.extractionConfidence * 0.08);
  return lexicalScore + mentionBoost + confidenceBoost;
}

function buildEntityEmbeddingText(entity: Entity): string {
  const description = entity.description
    ? `Description: ${entity.description}`
    : "";
  const type = `Type: ${entity.entityType}`;
  const metadata = `Mentions: ${entity.mentionCount}`;
  return [entity.canonicalName, type, description, metadata]
    .filter((part) => part.length > 0)
    .join("\n");
}

function getEntityVectorId(entity: Entity): string {
  return `${GRAPHRAG_ENTITY_MEMORY_PREFIX}${entity.id}`;
}

function buildEntityVectorPayload(entity: Entity): {
  memoryId: string;
  type: string;
  title: string;
  tags: string[];
  relatedFiles: string[];
  importance: number;
  content: string;
  entityId: string;
  entityType: string;
  canonicalName: string;
  mentionCount: number;
} {
  const memoryId = `${GRAPHRAG_ENTITY_MEMORY_PREFIX}${entity.id}`;
  return {
    memoryId,
    type: GRAPHRAG_ENTITY_VECTOR_TYPE,
    title: entity.canonicalName,
    tags: ["graphrag", "entity", entity.entityType.toLowerCase()],
    relatedFiles: [],
    importance: Math.min(1, 0.2 + entity.mentionCount / 100),
    content: entity.description ?? entity.canonicalName,
    entityId: entity.id,
    entityType: entity.entityType,
    canonicalName: entity.canonicalName,
    mentionCount: entity.mentionCount,
  };
}

async function embedBatchWithFallback(
  embeddings: EmbeddingClient,
  texts: string[],
): Promise<number[][]> {
  try {
    const batch = await embeddings.embedBatch(texts);
    if (batch.length === texts.length) {
      return batch;
    }
  } catch {
    // Fall through to per-item embedding.
  }

  const vectors: number[][] = [];
  for (const text of texts) {
    vectors.push(await embeddings.embed(text));
  }
  return vectors;
}

function resolveEntityIdFromVectorResult(
  result: VectorSearchResult,
): string | null {
  const payload = result.payload as Record<string, unknown>;
  const payloadEntityId = payload.entityId;
  if (typeof payloadEntityId === "string" && payloadEntityId.length > 0) {
    return payloadEntityId;
  }

  for (const candidate of [result.memoryId, result.id]) {
    if (
      typeof candidate === "string" &&
      candidate.startsWith(GRAPHRAG_ENTITY_MEMORY_PREFIX)
    ) {
      return candidate.slice(GRAPHRAG_ENTITY_MEMORY_PREFIX.length);
    }
  }

  return null;
}

export async function indexGraphEntityVectors(
  graphStorage: GraphRAGStorage,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
  options: GraphEntityVectorIndexOptions = {},
): Promise<GraphEntityVectorIndexResult> {
  const entities =
    options.entityIds && options.entityIds.length > 0
      ? Array.from(new Set(options.entityIds))
          .map((id) => graphStorage.getEntity(id))
          .filter((entity): entity is Entity => entity !== null)
      : graphStorage.listEntities({});
  if (entities.length === 0) {
    return { indexed: 0, failed: 0 };
  }

  let indexed = 0;
  let failed = 0;

  for (let i = 0; i < entities.length; i += DEFAULT_EMBED_BATCH_SIZE) {
    const batch = entities.slice(i, i + DEFAULT_EMBED_BATCH_SIZE);
    const texts = batch.map((entity) => buildEntityEmbeddingText(entity));

    let embeddingsBatch: number[][];
    try {
      embeddingsBatch = await embedBatchWithFallback(embeddings, texts);
    } catch {
      failed += batch.length;
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const entity = batch[j];
      const embedding = embeddingsBatch[j];
      if (!embedding || embedding.length === 0) {
        failed += 1;
        continue;
      }

      const vectorId = getEntityVectorId(entity);
      const payload = buildEntityVectorPayload(entity);

      try {
        if (entity.embeddingId && entity.embeddingId !== vectorId) {
          await vectors.delete(entity.embeddingId);
        }

        const upsertedId = await vectors.upsert(vectorId, embedding, payload);
        if (entity.embeddingId !== upsertedId) {
          graphStorage.updateEntity(entity.id, { embeddingId: upsertedId });
        }
        indexed += 1;
      } catch {
        failed += 1;
      }
    }
  }

  return { indexed, failed };
}

export async function searchGraphEntities(
  query: string,
  graphStorage: GraphRAGStorage,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
  options: GraphEntitySearchOptions = {},
): Promise<GraphEntitySearchHit[]> {
  const limit = Math.max(1, options.limit ?? 20);
  const minScore = options.minScore ?? 0.15;
  const minLexicalScore = options.minLexicalScore ?? 0.2;
  const candidatePool = Math.max(options.candidatePool ?? 500, limit * 6);

  const normalizedQuery = query.toLowerCase().trim();
  const queryTerms = extractQueryTerms(query);
  const candidates = new Map<string, CandidateAggregate>();

  const upsertCandidate = (
    entity: Entity,
    vectorScore: number | null,
    lexicalScore: number | null,
  ): void => {
    const safeVector = Math.max(0, vectorScore ?? 0);
    const safeLexical = Math.max(0, lexicalScore ?? 0);

    const fusedScore =
      safeVector > 0 && safeLexical > 0
        ? Math.min(1, safeVector * 0.72 + safeLexical * 0.28)
        : safeVector > 0
          ? safeVector
          : safeLexical;

    const existing = candidates.get(entity.id);
    if (!existing) {
      candidates.set(entity.id, {
        entity,
        score: fusedScore,
        vectorScore: safeVector,
        lexicalScore: safeLexical,
      });
      return;
    }

    existing.vectorScore = Math.max(existing.vectorScore, safeVector);
    existing.lexicalScore = Math.max(existing.lexicalScore, safeLexical);
    existing.score = Math.max(existing.score, fusedScore);
  };

  try {
    const queryEmbedding = await embeddings.embed(query);
    const vectorResults = await vectors.search(
      queryEmbedding,
      {
        type: GRAPHRAG_ENTITY_VECTOR_TYPE,
      },
      Math.max(limit * 4, 24),
    );

    for (const result of vectorResults) {
      const entityId = resolveEntityIdFromVectorResult(result);
      if (!entityId) {
        continue;
      }

      const entity = graphStorage.getEntity(entityId);
      if (!entity) {
        continue;
      }

      const lexicalScore = scoreGraphEntityMatch(
        entity,
        normalizedQuery,
        queryTerms,
      );
      upsertCandidate(entity, result.score, lexicalScore);
    }
  } catch (error) {
    console.warn("[doclea] GraphRAG entity vector search failed:", error);
  }

  const lexicalEntities = graphStorage.listEntities({ limit: candidatePool });
  for (const entity of lexicalEntities) {
    const lexicalScore = scoreGraphEntityMatch(
      entity,
      normalizedQuery,
      queryTerms,
    );
    if (lexicalScore < minLexicalScore) {
      continue;
    }

    const existing = candidates.get(entity.id);
    upsertCandidate(entity, existing?.vectorScore ?? null, lexicalScore);
  }

  return Array.from(candidates.values())
    .filter(
      (candidate) =>
        candidate.score >= minScore || candidate.vectorScore >= minScore,
    )
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.vectorScore !== left.vectorScore) {
        return right.vectorScore - left.vectorScore;
      }
      return right.entity.mentionCount - left.entity.mentionCount;
    })
    .slice(0, limit)
    .map((candidate) => ({
      entityId: candidate.entity.id,
      score: toFixedNumber(candidate.score),
      vectorScore:
        candidate.vectorScore > 0
          ? toFixedNumber(candidate.vectorScore)
          : undefined,
      lexicalScore:
        candidate.lexicalScore > 0
          ? toFixedNumber(candidate.lexicalScore)
          : undefined,
    }));
}
