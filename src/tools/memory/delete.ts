import { z } from "zod";
import type { IStorageBackend } from "@/storage/interface";
import type { VectorStore } from "@/vectors/interface";

export const DeleteMemoryInputSchema = z.object({
  id: z.string().describe("Memory ID to delete"),
});

export type DeleteMemoryInput = z.infer<typeof DeleteMemoryInputSchema>;

export async function deleteMemory(
  input: DeleteMemoryInput,
  storage: IStorageBackend,
  vectors: VectorStore,
): Promise<boolean> {
  // Delete from SQLite (returns qdrantId for vector cleanup)
  const result = storage.deleteMemory(input.id);
  if (!result.success) {
    return false;
  }

  // Delete from vector store
  if (result.qdrantId) {
    await vectors.delete(result.qdrantId);
  }

  return true;
}
