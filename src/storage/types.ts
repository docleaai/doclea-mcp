/**
 * Storage types and schemas for configurable storage backends
 */

import { z } from "zod";
import type { Memory, CreateMemory, Document, Chunk } from "@/types";

// Storage backend type
export const StorageBackendTypeSchema = z.enum(["sqlite", "memory"]);
export type StorageBackendType = z.infer<typeof StorageBackendTypeSchema>;

// Storage mode - controls when memories are committed
export const StorageModeSchema = z.enum(["manual", "suggested", "automatic"]);
export type StorageMode = z.infer<typeof StorageModeSchema>;

// Extended storage config with backend and mode
export const ExtendedStorageConfigSchema = z.object({
  backend: StorageBackendTypeSchema.default("sqlite"),
  dbPath: z.string().default(".doclea/local.db"),
  mode: StorageModeSchema.default("automatic"),
});
export type ExtendedStorageConfig = z.infer<typeof ExtendedStorageConfigSchema>;

/**
 * Result of a delete operation - includes qdrantId for vector store cleanup
 */
export interface DeleteResult {
  success: boolean;
  qdrantId?: string;
}

/**
 * Pending memory - stored before approval in suggested/manual modes
 */
export interface PendingMemory {
  id: string;
  memoryData: CreateMemory & { id: string; qdrantId: string };
  suggestedAt: number;
  source: "user_store" | "import";
  reason: string;
}

/**
 * Result returned when storing in suggested/manual mode
 */
export interface PendingMemoryResult {
  status: "pending";
  pendingId: string;
  message: string;
}

/**
 * Memory relation record (from memory_relations table)
 */
export interface MemoryRelation {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  confidence: number;
  metadata: string | null;
  created_at: number;
}

/**
 * Cross-layer relation record (from cross_layer_relations table)
 */
export interface CrossLayerRelation {
  id: string;
  memory_id: string;
  code_node_id: string;
  relation_type: string;
  direction: string;
  confidence: number;
  metadata: string | null;
  created_at: number;
}

/**
 * Storage export format for backup/migration
 */
export interface StorageExport {
  version: "1.0.0";
  exportedAt: number;
  backendType: StorageBackendType;
  storageMode: StorageMode;
  schemaVersion: string;
  data: {
    memories: Memory[];
    documents: Document[];
    chunks: Chunk[];
    memoryRelations: MemoryRelation[];
    crossLayerRelations: CrossLayerRelation[];
    pendingMemories: PendingMemory[];
  };
  metadata: {
    totalMemories: number;
    embeddingProvider?: string;
    embeddingModel?: string;
  };
}

/**
 * Import conflict resolution strategy
 */
export type ImportConflictStrategy = "skip" | "overwrite" | "error";

/**
 * Result of an import operation
 */
export interface ImportResult {
  success: boolean;
  imported: {
    memories: number;
    documents: number;
    chunks: number;
    relations: number;
  };
  skipped: number;
  errors: string[];
  reembeddingRequired: boolean;
}

/**
 * Options for listing memories
 */
export interface ListMemoriesOptions {
  type?: string;
  limit?: number;
}
