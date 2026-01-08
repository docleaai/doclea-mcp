/**
 * Storage backend interface
 *
 * Defines the contract for storage backends (SQLite, in-memory).
 * All implementations must provide these methods for memory/document
 * storage and management.
 */

import type { Database } from "bun:sqlite";
import type {
  Chunk,
  CreateMemory,
  Document,
  Memory,
  UpdateMemory,
} from "@/types";
import type {
  CreatePendingMemoryInput,
  DeleteResult,
  ListMemoriesOptions,
  PendingMemory,
  StorageBackendType,
  StorageMode,
} from "./types";

/**
 * Storage backend interface
 *
 * Provides abstraction over SQLite (persistent) and in-memory storage.
 * Domain storage classes access the raw database via getDatabase().
 */
export interface IStorageBackend {
  /**
   * Initialize the storage backend (run migrations, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Get the current storage mode
   */
  getStorageMode(): StorageMode;

  /**
   * Set the storage mode (for runtime changes)
   */
  setStorageMode(mode: StorageMode): void;

  /**
   * Get the backend type
   */
  getBackendType(): StorageBackendType;

  /**
   * Check if the backend has been closed
   */
  isClosed(): boolean;

  // ============================================
  // Memory Operations
  // ============================================

  /**
   * Create a new memory
   */
  createMemory(
    memory: CreateMemory & { id: string; qdrantId?: string },
  ): Memory;

  /**
   * Get a memory by ID
   */
  getMemory(id: string): Memory | null;

  /**
   * Get a memory by its Qdrant/vector ID
   */
  getMemoryByQdrantId(qdrantId: string): Memory | null;

  /**
   * Update a memory
   */
  updateMemory(
    id: string,
    updates: UpdateMemory & { qdrantId?: string },
  ): Memory | null;

  /**
   * Delete a memory - returns qdrantId for vector store cleanup
   */
  deleteMemory(id: string): DeleteResult;

  /**
   * List memories with optional filters
   */
  listMemories(filters?: ListMemoriesOptions): Memory[];

  /**
   * Get multiple memories by IDs
   */
  getMemoriesByIds(ids: string[]): Memory[];

  /**
   * Find memories that reference any of the given files
   */
  findByRelatedFiles(files: string[], excludeId?: string): Memory[];

  /**
   * Find memories created within a time range
   */
  findByTimeRange(
    startTime: number,
    endTime: number,
    excludeId?: string,
  ): Memory[];

  /**
   * Search memories by tags
   */
  searchByTags(tags: string[], excludeId?: string): Memory[];

  /**
   * Increment the access count for a memory (atomic operation).
   * Also updates accessed_at timestamp.
   * Used by multi-factor relevance scoring for usage frequency tracking.
   */
  incrementAccessCount(id: string): boolean;

  // ============================================
  // Document/Chunk Operations
  // ============================================

  /**
   * Create a document
   */
  createDocument(doc: Omit<Document, "createdAt" | "updatedAt">): Document;

  /**
   * Get a document by ID
   */
  getDocument(id: string): Document | null;

  /**
   * Create a chunk
   */
  createChunk(chunk: Chunk): Chunk;

  /**
   * Get all chunks for a document
   */
  getChunksByDocument(documentId: string): Chunk[];

  // ============================================
  // Embedding Cache Operations
  // ============================================

  /**
   * Get a cached embedding by content hash and model
   */
  getCachedEmbedding(contentHash: string, model: string): number[] | null;

  /**
   * Store an embedding in the cache
   */
  setCachedEmbedding(
    contentHash: string,
    model: string,
    embedding: number[],
  ): void;

  /**
   * Get multiple cached embeddings in batch
   */
  getCachedEmbeddingsBatch(
    contentHashes: string[],
    model: string,
  ): Map<string, number[]>;

  /**
   * Clear the embedding cache (optionally for a specific model)
   */
  clearEmbeddingCache(model?: string): number;

  // ============================================
  // Pending Memory Operations (for suggested/manual modes)
  // ============================================

  /**
   * Create a pending memory (not yet committed)
   * Automatically generates id and suggestedAt timestamp
   */
  createPendingMemory(input: CreatePendingMemoryInput): PendingMemory;

  /**
   * Get a pending memory by ID
   */
  getPendingMemory(id: string): PendingMemory | null;

  /**
   * Get all pending memories
   */
  getPendingMemories(): PendingMemory[];

  /**
   * Delete a pending memory (after approval or rejection)
   */
  deletePendingMemory(id: string): boolean;

  // ============================================
  // Schema/Metadata Operations
  // ============================================

  /**
   * Get the current schema version
   */
  getSchemaVersion(): string | null;

  /**
   * Get the underlying database instance (for domain storage classes)
   *
   * Domain classes like CodeGraphStorage, MemoryRelationStorage use raw SQL
   * and need direct database access.
   */
  getDatabase(): Database;

  /**
   * Close the storage backend
   */
  close(): void;
}
