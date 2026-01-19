/**
 * Storage module - configurable storage backends
 *
 * Provides SQLite (persistent) and in-memory (volatile) storage backends
 * with configurable storage modes (automatic/suggested/manual).
 */

// Factory
export { createStorageBackend, DEFAULT_STORAGE_CONFIG } from "./factory";
// Interface
export type { IStorageBackend } from "./interface";
export { MemoryStorageBackend } from "./memory-backend";

// Implementations
export { SqliteStorageBackend } from "./sqlite-backend";
// Types
export type {
  CreatePendingMemoryInput,
  CrossLayerRelation,
  DeleteResult,
  ExtendedStorageConfig,
  ImportConflictStrategy,
  ImportResult,
  ListMemoriesOptions,
  MemoryRelation,
  PendingMemory,
  PendingMemoryResult,
  StorageBackendType,
  StorageExport,
  StorageMode,
} from "./types";
export {
  ExtendedStorageConfigSchema,
  StorageBackendTypeSchema,
  StorageModeSchema,
} from "./types";
