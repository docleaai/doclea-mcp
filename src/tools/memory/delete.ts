import { z } from "zod";
import type { SQLiteDatabase } from "@/database/sqlite";
import type { VectorStore } from "@/vectors/interface";

export const DeleteMemoryInputSchema = z.object({
  id: z.string().describe("Memory ID to delete"),
});

export type DeleteMemoryInput = z.infer<typeof DeleteMemoryInputSchema>;

export async function deleteMemory(
  input: DeleteMemoryInput,
  db: SQLiteDatabase,
  vectors: VectorStore,
): Promise<boolean> {
  const existing = db.getMemory(input.id);
  if (!existing) {
    return false;
  }

  // Delete from Qdrant first
  if (existing.qdrantId) {
    await vectors.delete(existing.qdrantId);
  }

  // Delete from SQLite
  return db.deleteMemory(input.id);
}
