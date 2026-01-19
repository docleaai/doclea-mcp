/**
 * Pending memory tools
 *
 * Tools for managing pending memories in suggested/manual storage modes.
 * Pending memories are stored before approval and only committed to the
 * main store and vector database upon approval.
 */

import { z } from "zod";
import { CodeGraphStorage } from "@/database/code-graph";
import { CrossLayerRelationStorage } from "@/database/cross-layer-relations";
import { CrossLayerSuggestionStorage } from "@/database/cross-layer-suggestions";
import { MemoryRelationStorage } from "@/database/memory-relations";
import { RelationSuggestionStorage } from "@/database/relation-suggestions";
import type { EmbeddingClient } from "@/embeddings/provider";
import { createRelationDetector } from "@/relations";
import { CrossLayerDetector } from "@/relations/cross-layer-detector";
import type { IStorageBackend } from "@/storage/interface";
import type { PendingMemory } from "@/storage/types";
import type { Memory } from "@/types";
import type { VectorStore } from "@/vectors/interface";

// Input schemas
export const ListPendingInputSchema = z.object({});
export type ListPendingInput = z.infer<typeof ListPendingInputSchema>;

export const ApprovePendingInputSchema = z.object({
  pendingId: z.string().describe("ID of the pending memory to approve"),
  // Optional overrides for modification support
  title: z.string().optional().describe("Override the title"),
  content: z.string().optional().describe("Override the content"),
  tags: z.array(z.string()).optional().describe("Override the tags"),
  type: z
    .enum(["decision", "solution", "pattern", "architecture", "note"])
    .optional()
    .describe("Override the type"),
});
export type ApprovePendingInput = z.infer<typeof ApprovePendingInputSchema>;

export interface ApproveModifications {
  title?: string;
  content?: string;
  tags?: string[];
  type?: "decision" | "solution" | "pattern" | "architecture" | "note";
}

export const RejectPendingInputSchema = z.object({
  pendingId: z.string().describe("ID of the pending memory to reject"),
});
export type RejectPendingInput = z.infer<typeof RejectPendingInputSchema>;

export const BulkApprovePendingInputSchema = z.object({
  pendingIds: z
    .array(z.string())
    .optional()
    .describe(
      "IDs of pending memories to approve (if not provided, approves all)",
    ),
  minConfidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Only approve suggestions above this confidence threshold"),
});
export type BulkApprovePendingInput = z.infer<
  typeof BulkApprovePendingInputSchema
>;

export const ReviewQueueInputSchema = z.object({
  limit: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum memories to return"),
});
export type ReviewQueueInput = z.infer<typeof ReviewQueueInputSchema>;

export const ConfirmMemoryInputSchema = z.object({
  memoryId: z.string().describe("ID of the memory to confirm"),
});
export type ConfirmMemoryInput = z.infer<typeof ConfirmMemoryInputSchema>;

export const SetStorageModeInputSchema = z.object({
  mode: z.enum(["manual", "suggested", "automatic"]).describe("Storage mode"),
  autoApproveThreshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Confidence threshold for auto-approval (automatic mode only)"),
});
export type SetStorageModeInput = z.infer<typeof SetStorageModeInputSchema>;

export const BulkRejectPendingInputSchema = z.object({
  pendingIds: z.array(z.string()).describe("IDs of pending memories to reject"),
});
export type BulkRejectPendingInput = z.infer<
  typeof BulkRejectPendingInputSchema
>;

// Result types
export interface ApproveResult {
  success: boolean;
  memory?: Memory;
  error?: string;
}

export interface BulkApproveResult {
  approved: Memory[];
  failed: Array<{ pendingId: string; error: string }>;
}

export interface BulkRejectResult {
  rejected: string[];
  failed: Array<{ pendingId: string; error: string }>;
}

/**
 * List all pending memories
 */
export function listPendingMemories(storage: IStorageBackend): PendingMemory[] {
  return storage.getPendingMemories();
}

/**
 * Approve a pending memory
 *
 * This commits the memory to both SQLite and the vector store:
 * 1. Apply any modifications
 * 2. Generate embedding
 * 3. Store to vector database
 * 4. Store to SQLite
 * 5. Delete from pending
 * 6. Trigger background relation detection
 */
export async function approvePendingMemory(
  pendingId: string,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
  modifications?: ApproveModifications,
): Promise<ApproveResult> {
  const pending = storage.getPendingMemory(pendingId);
  if (!pending) {
    return { success: false, error: "Pending memory not found" };
  }

  try {
    // 1. Apply modifications if provided
    const memoryData = { ...pending.memoryData };
    if (modifications) {
      if (modifications.title !== undefined) {
        memoryData.title = modifications.title;
      }
      if (modifications.content !== undefined) {
        memoryData.content = modifications.content;
      }
      if (modifications.tags !== undefined) {
        memoryData.tags = modifications.tags;
      }
      if (modifications.type !== undefined) {
        memoryData.type = modifications.type;
      }
    }

    // 2. Generate embedding (use potentially modified content)
    const text = `${memoryData.title}\n\n${memoryData.content}`;
    const vector = await embeddings.embed(text);

    // 3. Store to vector database
    await vectors.upsert(memoryData.qdrantId, vector, {
      memoryId: memoryData.id,
      type: memoryData.type,
      title: memoryData.title,
      tags: memoryData.tags ?? [],
      relatedFiles: memoryData.relatedFiles ?? [],
      importance: memoryData.importance ?? 0.5,
    });

    // 4. Store to SQLite
    const memory = storage.createMemory(memoryData);

    // 5. Delete from pending
    storage.deletePendingMemory(pendingId);

    // 6. Trigger background relation detection
    detectRelationsAsync(memory, storage, vectors, embeddings).catch((err) =>
      console.error("[doclea] Relation detection failed:", err),
    );

    detectCrossLayerAsync(memory, storage).catch((err) =>
      console.error("[doclea] Cross-layer detection failed:", err),
    );

    console.log(`[doclea] Approved pending memory ${pendingId} → ${memory.id}`);
    return { success: true, memory };
  } catch (error) {
    // Don't delete pending on failure - let user retry
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[doclea] Failed to approve pending memory ${pendingId}:`,
      errorMessage,
    );
    return { success: false, error: errorMessage };
  }
}

/**
 * Reject a pending memory (discard it)
 */
export function rejectPendingMemory(
  pendingId: string,
  storage: IStorageBackend,
): boolean {
  const deleted = storage.deletePendingMemory(pendingId);
  if (deleted) {
    console.log(`[doclea] Rejected pending memory ${pendingId}`);
  }
  return deleted;
}

/**
 * Bulk approve pending memories with optional confidence threshold
 */
export async function bulkApprovePendingMemories(
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
  pendingIds?: string[],
  minConfidence?: number,
): Promise<BulkApproveResult & { skipped: number }> {
  const approved: Memory[] = [];
  const failed: Array<{ pendingId: string; error: string }> = [];
  let skipped = 0;

  // Get all pending if no specific IDs provided
  const allPending = storage.getPendingMemories();
  const targetIds = pendingIds ?? allPending.map((p) => p.id);

  for (const pendingId of targetIds) {
    const pending = storage.getPendingMemory(pendingId);
    if (!pending) {
      failed.push({ pendingId, error: "Pending memory not found" });
      continue;
    }

    // Check confidence threshold if specified
    // Note: confidence would need to be stored in pending memory metadata
    // For now, we use importance as a proxy for confidence
    if (minConfidence !== undefined) {
      const confidence = pending.memoryData.importance ?? 0.5;
      if (confidence < minConfidence) {
        skipped++;
        continue;
      }
    }

    const result = await approvePendingMemory(
      pendingId,
      storage,
      vectors,
      embeddings,
    );
    if (result.success && result.memory) {
      approved.push(result.memory);
    } else {
      failed.push({ pendingId, error: result.error ?? "Unknown error" });
    }
  }

  return { approved, failed, skipped };
}

/**
 * Bulk reject pending memories
 */
export function bulkRejectPendingMemories(
  pendingIds: string[],
  storage: IStorageBackend,
): BulkRejectResult {
  const rejected: string[] = [];
  const failed: Array<{ pendingId: string; error: string }> = [];

  for (const pendingId of pendingIds) {
    const deleted = storage.deletePendingMemory(pendingId);
    if (deleted) {
      rejected.push(pendingId);
    } else {
      failed.push({ pendingId, error: "Pending memory not found" });
    }
  }

  return { rejected, failed };
}

/**
 * Get current storage mode
 */
export function getStorageMode(storage: IStorageBackend): string {
  return storage.getStorageMode();
}

/**
 * Set storage mode (runtime change)
 */
export function setStorageMode(
  storage: IStorageBackend,
  mode: "manual" | "suggested" | "automatic",
): void {
  storage.setStorageMode(mode);
  console.log(`[doclea] Storage mode changed to: ${mode}`);
}

// ============================================
// Review Queue Operations (for automatic mode)
// ============================================

/**
 * Get memories that need review (auto-stored in automatic mode)
 */
export function getReviewQueue(storage: IStorageBackend, limit = 20): Memory[] {
  return storage.getMemoriesNeedingReview(limit);
}

/**
 * Confirm an auto-stored memory (mark as reviewed/approved)
 */
export function confirmMemory(
  storage: IStorageBackend,
  memoryId: string,
): { success: boolean; error?: string } {
  const memory = storage.getMemory(memoryId);
  if (!memory) {
    return { success: false, error: "Memory not found" };
  }

  const confirmed = storage.confirmMemory(memoryId);
  if (confirmed) {
    console.log(`[doclea] Confirmed memory ${memoryId}`);
    return { success: true };
  }
  return { success: false, error: "Failed to confirm memory" };
}

/**
 * Mark a memory for review (used when storing with lower confidence)
 */
export function markMemoryForReview(
  storage: IStorageBackend,
  memoryId: string,
): boolean {
  return storage.markForReview(memoryId);
}

// ============================================
// Internal async helpers (copied from store.ts pattern)
// ============================================

/**
 * Async helper for non-blocking relation detection
 */
async function detectRelationsAsync(
  memory: Memory,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<void> {
  try {
    const rawDb = storage.getDatabase();
    const relationStorage = new MemoryRelationStorage(rawDb);
    const suggestionStorage = new RelationSuggestionStorage(
      rawDb,
      relationStorage,
    );

    // Create a compatible db object for the detector
    const dbCompat = {
      getMemory: (id: string) => storage.getMemory(id),
      getMemoriesByIds: (ids: string[]) => storage.getMemoriesByIds(ids),
      findByRelatedFiles: (files: string[], excludeId?: string) =>
        storage.findByRelatedFiles(files, excludeId),
      findByTimeRange: (start: number, end: number, excludeId?: string) =>
        storage.findByTimeRange(start, end, excludeId),
      searchByTags: (tags: string[], excludeId?: string) =>
        storage.searchByTags(tags, excludeId),
      listMemories: (filters?: { type?: string; limit?: number }) =>
        storage.listMemories(filters),
      getDatabase: () => storage.getDatabase(),
    };

    const detector = createRelationDetector(
      dbCompat as any,
      relationStorage,
      suggestionStorage,
      vectors,
      embeddings,
    );

    const result = await detector.detectRelationsForMemory(memory);

    if (result.autoApproved.length > 0 || result.suggestions.length > 0) {
      console.log(
        `[doclea] Relation detection for ${memory.id}: ${result.autoApproved.length} auto-approved, ${result.suggestions.length} suggestions`,
      );
    }
  } catch (error) {
    console.warn("[doclea] Relation detection error:", error);
  }
}

/**
 * Async helper for non-blocking cross-layer detection
 */
async function detectCrossLayerAsync(
  memory: Memory,
  storage: IStorageBackend,
): Promise<void> {
  try {
    const rawDb = storage.getDatabase();
    const codeGraph = new CodeGraphStorage(rawDb);
    const relationStorage = new CrossLayerRelationStorage(rawDb);
    const suggestionStorage = new CrossLayerSuggestionStorage(
      rawDb,
      relationStorage,
    );

    // Create a compatible db object for the detector
    const dbCompat = {
      getMemory: (id: string) => storage.getMemory(id),
      getDatabase: () => storage.getDatabase(),
    };

    const detector = new CrossLayerDetector(
      dbCompat as any,
      codeGraph,
      relationStorage,
      suggestionStorage,
    );

    const result = await detector.detectForMemory(memory);

    if (result.autoApproved.length > 0 || result.suggestions.length > 0) {
      console.log(
        `[doclea] Cross-layer detection for ${memory.id}: ${result.autoApproved.length} auto-approved, ${result.suggestions.length} suggestions`,
      );
    }
  } catch (error) {
    console.warn("[doclea] Cross-layer detection error:", error);
  }
}
