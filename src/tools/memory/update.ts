import { z } from "zod";
import type { EmbeddingClient } from "@/embeddings/provider";
import type { IStorageBackend } from "@/storage/interface";
import { type Memory, MemoryTypeSchema } from "@/types";
import type { VectorStore } from "@/vectors/interface";

export const UpdateMemoryInputSchema = z.object({
  id: z.string().describe("Memory ID to update"),
  type: MemoryTypeSchema.optional().describe("New memory type"),
  title: z.string().optional().describe("New title"),
  content: z.string().optional().describe("New content"),
  summary: z.string().optional().describe("New summary"),
  importance: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("New importance score"),
  tags: z.array(z.string()).optional().describe("New tags"),
  relatedFiles: z.array(z.string()).optional().describe("New related files"),
  gitCommit: z.string().optional().describe("New git commit"),
  sourcePr: z.string().optional().describe("New source PR"),
  experts: z.array(z.string()).optional().describe("New experts"),
});

export type UpdateMemoryInput = z.infer<typeof UpdateMemoryInputSchema>;

export async function updateMemory(
  input: UpdateMemoryInput,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<Memory | null> {
  const existing = storage.getMemory(input.id);
  if (!existing) {
    return null;
  }

  // If title or content changed, re-embed and update vector
  if (input.title !== undefined || input.content !== undefined) {
    const newTitle = input.title ?? existing.title;
    const newContent = input.content ?? existing.content;
    const textToEmbed = `${newTitle}\n\n${newContent}`;
    const vector = await embeddings.embed(textToEmbed);

    if (existing.qdrantId) {
      await vectors.upsert(existing.qdrantId, vector, {
        memoryId: existing.id,
        type: input.type ?? existing.type,
        title: newTitle,
        tags: input.tags ?? existing.tags,
        relatedFiles: input.relatedFiles ?? existing.relatedFiles,
        importance: input.importance ?? existing.importance,
      });
    }
  } else if (
    input.type ||
    input.tags ||
    input.relatedFiles ||
    input.importance !== undefined
  ) {
    // Update payload without re-embedding
    if (existing.qdrantId) {
      const currentVector = await embeddings.embed(
        `${existing.title}\n\n${existing.content}`,
      );
      await vectors.upsert(existing.qdrantId, currentVector, {
        memoryId: existing.id,
        type: input.type ?? existing.type,
        title: existing.title,
        tags: input.tags ?? existing.tags,
        relatedFiles: input.relatedFiles ?? existing.relatedFiles,
        importance: input.importance ?? existing.importance,
      });
    }
  }

  // Update SQLite
  const { id, ...updates } = input;
  return storage.updateMemory(id, updates);
}
