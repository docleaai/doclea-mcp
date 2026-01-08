/**
 * Pending memory tools
 *
 * Tools for managing pending memories in suggested/manual storage modes.
 * Pending memories are stored before approval and only committed to the
 * main store and vector database upon approval.
 */

import { z } from "zod";
import type { Memory } from "@/types";
import type { IStorageBackend } from "@/storage/interface";
import type { PendingMemory } from "@/storage/types";
import type { VectorStore } from "@/vectors/interface";
import type { EmbeddingClient } from "@/embeddings/provider";
import { MemoryRelationStorage } from "@/database/memory-relations";
import { RelationSuggestionStorage } from "@/database/relation-suggestions";
import { createRelationDetector } from "@/relations";
import { CodeGraphStorage } from "@/database/code-graph";
import { CrossLayerRelationStorage } from "@/database/cross-layer-relations";
import { CrossLayerSuggestionStorage } from "@/database/cross-layer-suggestions";
import { CrossLayerDetector } from "@/relations/cross-layer-detector";

// Input schemas
export const ListPendingInputSchema = z.object({});
export type ListPendingInput = z.infer<typeof ListPendingInputSchema>;

export const ApprovePendingInputSchema = z.object({
  pendingId: z.string().describe("ID of the pending memory to approve"),
});
export type ApprovePendingInput = z.infer<typeof ApprovePendingInputSchema>;

export const RejectPendingInputSchema = z.object({
  pendingId: z.string().describe("ID of the pending memory to reject"),
});
export type RejectPendingInput = z.infer<typeof RejectPendingInputSchema>;

export const BulkApprovePendingInputSchema = z.object({
  pendingIds: z.array(z.string()).describe("IDs of pending memories to approve"),
});
export type BulkApprovePendingInput = z.infer<typeof BulkApprovePendingInputSchema>;

export const BulkRejectPendingInputSchema = z.object({
  pendingIds: z.array(z.string()).describe("IDs of pending memories to reject"),
});
export type BulkRejectPendingInput = z.infer<typeof BulkRejectPendingInputSchema>;

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
 * 1. Generate embedding
 * 2. Store to vector database
 * 3. Store to SQLite
 * 4. Delete from pending
 * 5. Trigger background relation detection
 */
export async function approvePendingMemory(
  pendingId: string,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<ApproveResult> {
  const pending = storage.getPendingMemory(pendingId);
  if (!pending) {
    return { success: false, error: "Pending memory not found" };
  }

  try {
    // 1. Generate embedding
    const text = `${pending.memoryData.title}\n\n${pending.memoryData.content}`;
    const vector = await embeddings.embed(text);

    // 2. Store to vector database
    await vectors.upsert(pending.memoryData.qdrantId, vector, {
      memoryId: pending.memoryData.id,
      type: pending.memoryData.type,
      title: pending.memoryData.title,
      tags: pending.memoryData.tags ?? [],
      relatedFiles: pending.memoryData.relatedFiles ?? [],
      importance: pending.memoryData.importance ?? 0.5,
    });

    // 3. Store to SQLite
    const memory = storage.createMemory(pending.memoryData);

    // 4. Delete from pending
    storage.deletePendingMemory(pendingId);

    // 5. Trigger background relation detection
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
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[doclea] Failed to approve pending memory ${pendingId}:`, errorMessage);
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
 * Bulk approve pending memories
 */
export async function bulkApprovePendingMemories(
  pendingIds: string[],
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<BulkApproveResult> {
  const approved: Memory[] = [];
  const failed: Array<{ pendingId: string; error: string }> = [];

  for (const pendingId of pendingIds) {
    const result = await approvePendingMemory(pendingId, storage, vectors, embeddings);
    if (result.success && result.memory) {
      approved.push(result.memory);
    } else {
      failed.push({ pendingId, error: result.error ?? "Unknown error" });
    }
  }

  return { approved, failed };
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
    const suggestionStorage = new RelationSuggestionStorage(rawDb, relationStorage);

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
    const suggestionStorage = new CrossLayerSuggestionStorage(rawDb, relationStorage);

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
