import type { SearchFilters } from "@/types";

export interface VectorPayload {
  memoryId: string;
  type: string;
  title: string;
  tags: string[];
  relatedFiles: string[];
  importance: number;
  [key: string]: unknown;
}

export interface VectorSearchResult {
  id: string;
  memoryId: string;
  score: number;
  payload: VectorPayload;
}

/**
 * Abstract interface for vector storage backends.
 * Implementations: QdrantVectorStore (Docker), LibSqlVectorStore (embedded)
 */
export interface VectorStore {
  /**
   * Initialize the vector store (create tables, collections, indexes)
   */
  initialize(): Promise<void>;

  /**
   * Insert or update a vector with payload
   */
  upsert(id: string, vector: number[], payload: VectorPayload): Promise<string>;

  /**
   * Search for similar vectors with optional filters
   */
  search(
    vector: number[],
    filters?: SearchFilters,
    limit?: number,
  ): Promise<VectorSearchResult[]>;

  /**
   * Delete a vector by ID
   */
  delete(id: string): Promise<boolean>;

  /**
   * Delete all vectors associated with a memory ID
   */
  deleteByMemoryId(memoryId: string): Promise<boolean>;

  /**
   * Get collection/table statistics
   */
  getCollectionInfo(): Promise<{ vectorsCount: number; pointsCount: number }>;

  /**
   * Close the connection (optional - for embedded stores)
   */
  close?(): void;
}
