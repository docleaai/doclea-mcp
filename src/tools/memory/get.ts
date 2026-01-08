import { z } from "zod";
import type { IStorageBackend } from "@/storage/interface";
import type { Memory } from "@/types";

export const GetMemoryInputSchema = z.object({
  id: z.string().describe("Memory ID to retrieve"),
  /** If true, don't increment access count (for internal use) */
  skipAccessTracking: z.boolean().optional(),
});

export type GetMemoryInput = z.infer<typeof GetMemoryInputSchema>;

/**
 * Get a memory by ID.
 *
 * By default, increments the access count for usage frequency tracking.
 * Pass skipAccessTracking=true to avoid incrementing (for internal use).
 */
export function getMemory(
  input: GetMemoryInput,
  storage: IStorageBackend,
): Memory | null {
  const memory = storage.getMemory(input.id);

  // Increment access count for usage frequency tracking
  if (memory && !input.skipAccessTracking) {
    storage.incrementAccessCount(input.id);
  }

  return memory;
}
