import { z } from "zod";
import type { EmbeddingClient } from "@/embeddings/provider";
import {
  createEmptyBreakdown,
  RelevanceScorer,
  type ScoringConfig,
} from "@/scoring";
import type { IStorageBackend } from "@/storage/interface";
import {
  MemoryTypeSchema,
  type ScoredSearchResult,
  type SearchResult,
} from "@/types";
import type { VectorStore } from "@/vectors/interface";

export const SearchMemoryInputSchema = z.object({
  query: z.string().describe("Natural language search query"),
  type: MemoryTypeSchema.optional().describe("Filter by memory type"),
  tags: z.array(z.string()).optional().describe("Filter by tags (any match)"),
  minImportance: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Minimum importance threshold"),
  relatedFiles: z
    .array(z.string())
    .optional()
    .describe("Filter by related files"),
  limit: z
    .number()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum results to return"),
});

export type SearchMemoryInput = z.infer<typeof SearchMemoryInputSchema>;

/**
 * Search memories with optional multi-factor relevance scoring.
 *
 * When scoring is enabled, fetches more results from vector search,
 * applies multi-factor scoring (semantic, recency, confidence, frequency),
 * re-ranks, and returns top N results with score breakdowns.
 */
export async function searchMemory(
  input: SearchMemoryInput,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
  scoringConfig?: ScoringConfig,
): Promise<ScoredSearchResult[]> {
  // Generate query embedding
  const queryVector = await embeddings.embed(input.query);

  // Determine how many results to fetch from vector search
  const fetchLimit = scoringConfig?.enabled
    ? input.limit * (scoringConfig.searchOverfetch || 3)
    : input.limit;

  // Search vectors with filters
  const vectorResults = await vectors.search(
    queryVector,
    {
      type: input.type,
      tags: input.tags,
      minImportance: input.minImportance,
      relatedFiles: input.relatedFiles,
    },
    fetchLimit,
  );

  if (vectorResults.length === 0) {
    return [];
  }

  // Fetch full memories from SQLite
  const memoryIds = vectorResults.map((r) => r.memoryId);
  const memories = storage.getMemoriesByIds(memoryIds);

  // Map scores to memories
  const scoreMap = new Map(vectorResults.map((r) => [r.memoryId, r.score]));

  // Build initial results
  const results: SearchResult[] = memories
    .map((memory) => ({
      memory,
      score: scoreMap.get(memory.id) ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  // Apply multi-factor scoring if enabled
  if (scoringConfig?.enabled) {
    const scorer = new RelevanceScorer(scoringConfig);
    const now = Math.floor(Date.now() / 1000);
    const scored = scorer.scoreMany(results, now);
    // Return only the requested number of results
    return scored.slice(0, input.limit);
  }

  // Legacy path: return with empty breakdown
  return results.slice(0, input.limit).map((r) => ({
    ...r,
    breakdown: createEmptyBreakdown(r.score),
  }));
}
