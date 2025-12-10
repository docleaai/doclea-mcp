import { randomUUID } from "crypto";
import { z } from "zod";
import type { SQLiteDatabase } from "@/database/sqlite";
import type { EmbeddingClient } from "@/embeddings/provider";
import { type Memory, MemoryTypeSchema } from "@/types";
import type { VectorStore } from "@/vectors/interface";

export const StoreMemoryInputSchema = z.object({
  type: MemoryTypeSchema,
  title: z.string().describe("Short title for the memory"),
  content: z.string().describe("Full content of the memory"),
  summary: z.string().optional().describe("Brief summary"),
  importance: z
    .number()
    .min(0)
    .max(1)
    .default(0.5)
    .describe("Importance score 0-1"),
  tags: z.array(z.string()).default([]).describe("Tags for categorization"),
  relatedFiles: z.array(z.string()).default([]).describe("Related file paths"),
  gitCommit: z.string().optional().describe("Related git commit hash"),
  sourcePr: z.string().optional().describe("Source PR number/link"),
  experts: z.array(z.string()).default([]).describe("Subject matter experts"),
});

export type StoreMemoryInput = z.infer<typeof StoreMemoryInputSchema>;

export async function storeMemory(
  input: StoreMemoryInput,
  db: SQLiteDatabase,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<Memory> {
  const id = `mem_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const qdrantId = `vec_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  // Generate embedding from title + content
  const textToEmbed = `${input.title}\n\n${input.content}`;
  const vector = await embeddings.embed(textToEmbed);

  // Store vector in Qdrant
  await vectors.upsert(qdrantId, vector, {
    memoryId: id,
    type: input.type,
    title: input.title,
    tags: input.tags,
    relatedFiles: input.relatedFiles,
    importance: input.importance,
  });

  // Store metadata in SQLite
  const memory = db.createMemory({
    id,
    qdrantId,
    type: input.type,
    title: input.title,
    content: input.content,
    summary: input.summary,
    importance: input.importance,
    tags: input.tags,
    relatedFiles: input.relatedFiles,
    gitCommit: input.gitCommit,
    sourcePr: input.sourcePr,
    experts: input.experts,
  });

  return memory;
}
