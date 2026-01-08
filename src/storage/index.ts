/**
 * Storage module - configurable storage backends
 *
 * Provides SQLite (persistent) and in-memory (volatile) storage backends
 * with configurable storage modes (automatic/suggested/manual).
 */

// Interface
export type { IStorageBackend } from "./interface";

// Types
export type {
  StorageBackendType,
  StorageMode,
  ExtendedStorageConfig,
  DeleteResult,
  PendingMemory,
  PendingMemoryResult,
  MemoryRelation,
  CrossLayerRelation,
  StorageExport,
  ImportConflictStrategy,
  ImportResult,
  ListMemoriesOptions,
} from "./types";

export {
  StorageBackendTypeSchema,
  StorageModeSchema,
  ExtendedStorageConfigSchema,
} from "./types";

// Implementations
export { SqliteStorageBackend } from "./sqlite-backend";
export { MemoryStorageBackend } from "./memory-backend";

// Factory
export { createStorageBackend, DEFAULT_STORAGE_CONFIG } from "./factory";
