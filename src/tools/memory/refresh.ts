/**
 * Refresh confidence decay tool
 *
 * Resets the decay anchor for a memory, optionally updating its importance.
 * This allows users to "refresh" a memory's relevance after confirming it's
 * still valid/useful.
 */

import { z } from "zod";
import { calculateDecayedConfidenceScore } from "@/scoring/factors/confidence";
import type { ConfidenceDecayConfig } from "@/scoring/types";
import type { IStorageBackend } from "@/storage/interface";

/**
 * Input schema for refresh confidence tool
 */
export const RefreshConfidenceInputSchema = z.object({
  memoryId: z.string().describe("ID of the memory to refresh"),
  newImportance: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Optionally update the importance value (0-1)"),
});
export type RefreshConfidenceInput = z.infer<
  typeof RefreshConfidenceInputSchema
>;

/**
 * Result of refresh operation
 */
export interface RefreshConfidenceResult {
  success: boolean;
  memoryId: string;
  before: {
    importance: number;
    lastRefreshedAt: number | null | undefined;
    effectiveConfidence?: number;
  };
  after: {
    importance: number;
    lastRefreshedAt: number;
    effectiveConfidence?: number;
  };
  message: string;
}

/**
 * Refresh a memory's confidence decay anchor.
 *
 * This resets the decay calculation to start from "now", effectively restoring
 * the memory's confidence to its importance value. Optionally also updates
 * the importance.
 *
 * @param input - Input parameters
 * @param storage - Storage backend
 * @param decayConfig - Optional decay config for calculating effective confidence
 * @returns Result with before/after confidence values
 */
export function refreshConfidence(
  input: RefreshConfidenceInput,
  storage: IStorageBackend,
  decayConfig?: ConfidenceDecayConfig,
): RefreshConfidenceResult {
  const { memoryId, newImportance } = input;

  // Get the memory before refresh
  const beforeMemory = storage.getMemory(memoryId);
  if (!beforeMemory) {
    return {
      success: false,
      memoryId,
      before: { importance: 0, lastRefreshedAt: null },
      after: { importance: 0, lastRefreshedAt: 0 },
      message: `Memory ${memoryId} not found`,
    };
  }

  const now = Math.floor(Date.now() / 1000);

  // Calculate effective confidence before refresh (if decay config provided)
  let beforeEffectiveConfidence: number | undefined;
  if (decayConfig?.enabled) {
    beforeEffectiveConfidence = calculateDecayedConfidenceScore(
      beforeMemory,
      decayConfig,
      now,
    );
  }

  // Refresh the memory
  const afterMemory = storage.refreshMemory(memoryId, newImportance);
  if (!afterMemory) {
    return {
      success: false,
      memoryId,
      before: {
        importance: beforeMemory.importance,
        lastRefreshedAt: beforeMemory.lastRefreshedAt,
        effectiveConfidence: beforeEffectiveConfidence,
      },
      after: { importance: 0, lastRefreshedAt: 0 },
      message: `Failed to refresh memory ${memoryId}`,
    };
  }

  // Calculate effective confidence after refresh
  let afterEffectiveConfidence: number | undefined;
  if (decayConfig?.enabled) {
    afterEffectiveConfidence = calculateDecayedConfidenceScore(
      afterMemory,
      decayConfig,
      now,
    );
  }

  const importanceChanged =
    newImportance !== undefined && newImportance !== beforeMemory.importance;
  const messageParts = [`Memory ${memoryId} refreshed.`];

  if (importanceChanged) {
    messageParts.push(
      `Importance updated: ${beforeMemory.importance.toFixed(2)} → ${afterMemory.importance.toFixed(2)}.`,
    );
  }

  if (
    beforeEffectiveConfidence !== undefined &&
    afterEffectiveConfidence !== undefined
  ) {
    messageParts.push(
      `Effective confidence: ${beforeEffectiveConfidence.toFixed(2)} → ${afterEffectiveConfidence.toFixed(2)}.`,
    );
  }

  return {
    success: true,
    memoryId,
    before: {
      importance: beforeMemory.importance,
      lastRefreshedAt: beforeMemory.lastRefreshedAt,
      effectiveConfidence: beforeEffectiveConfidence,
    },
    after: {
      importance: afterMemory.importance,
      lastRefreshedAt: afterMemory.lastRefreshedAt!,
      effectiveConfidence: afterEffectiveConfidence,
    },
    message: messageParts.join(" "),
  };
}
