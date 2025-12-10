import { z } from "zod";
import type { SQLiteDatabase } from "@/database/sqlite";
import type { EmbeddingClient } from "@/embeddings/provider";
import { MemoryTypeSchema, type SearchResult } from "@/types";
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

export async function searchMemory(
  input: SearchMemoryInput,
  db: SQLiteDatabase,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<SearchResult[]> {
  // Generate query embedding
  const queryVector = await embeddings.embed(input.query);

  // Search vectors with filters
  const vectorResults = await vectors.search(
    queryVector,
    {
      type: input.type,
      tags: input.tags,
      minImportance: input.minImportance,
      relatedFiles: input.relatedFiles,
    },
    input.limit,
  );

  if (vectorResults.length === 0) {
    return [];
  }

  // Fetch full memories from SQLite
  const memoryIds = vectorResults.map((r) => r.memoryId);
  const memories = db.getMemoriesByIds(memoryIds);

  // Map scores to memories
  const scoreMap = new Map(vectorResults.map((r) => [r.memoryId, r.score]));

  return memories
    .map((memory) => ({
      memory,
      score: scoreMap.get(memory.id) ?? 0,
    }))
    .sort((a, b) => b.score - a.score);
}
