import { z } from "zod";
import type { IStorageBackend } from "@/storage/interface";
import type { Memory } from "@/types";

export const GetMemoryInputSchema = z.object({
  id: z.string().describe("Memory ID to retrieve"),
});

export type GetMemoryInput = z.infer<typeof GetMemoryInputSchema>;

export function getMemory(
  input: GetMemoryInput,
  storage: IStorageBackend,
): Memory | null {
  return storage.getMemory(input.id);
}
