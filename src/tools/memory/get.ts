import { z } from "zod";
import type { SQLiteDatabase } from "@/database/sqlite";
import type { Memory } from "@/types";

export const GetMemoryInputSchema = z.object({
  id: z.string().describe("Memory ID to retrieve"),
});

export type GetMemoryInput = z.infer<typeof GetMemoryInputSchema>;

export function getMemory(
  input: GetMemoryInput,
  db: SQLiteDatabase,
): Memory | null {
  return db.getMemory(input.id);
}
