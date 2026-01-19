import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "libsql";
import type { SearchFilters } from "@/types";
import type {
  VectorPayload,
  VectorSearchResult,
  VectorStore,
} from "./interface";

// Default vector size for all-MiniLM-L6-v2 (384 dimensions)
const DEFAULT_VECTOR_SIZE = 384;

export interface LibSqlVectorConfig {
  dbPath: string;
  tableName?: string;
  vectorSize?: number;
}

/**
 * Embedded vector store using libSQL's native vector support.
 * Uses F32_BLOB column type and DiskANN indexing via libsql_vector_idx.
 * No extensions required - vectors are built into libSQL.
 */
export class LibSqlVectorStore implements VectorStore {
  private readonly db: InstanceType<typeof Database>;
  private readonly tableName: string;
  private readonly vectorSize: number;
  private initialized = false;

  constructor(config: LibSqlVectorConfig | string) {
    const opts =
      typeof config === "string"
        ? {
            dbPath: config,
            tableName: "vector_memories",
            vectorSize: DEFAULT_VECTOR_SIZE,
          }
        : {
            dbPath: config.dbPath,
            tableName: config.tableName ?? "vector_memories",
            vectorSize: config.vectorSize ?? DEFAULT_VECTOR_SIZE,
          };

    this.tableName = opts.tableName;
    this.vectorSize = opts.vectorSize;

    // Ensure directory exists
    if (opts.dbPath !== ":memory:") {
      const dir = dirname(opts.dbPath);
      if (dir && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(opts.dbPath);

    // Enable WAL mode for better concurrent performance
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create table with native vector column (F32_BLOB)
    // libSQL's F32_BLOB stores 32-bit float vectors natively
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        embedding F32_BLOB(${this.vectorSize}),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        tags TEXT NOT NULL,
        related_files TEXT NOT NULL,
        importance REAL NOT NULL,
        payload TEXT NOT NULL
      )
    `);

    // Create vector index using DiskANN algorithm with cosine metric
    // This enables efficient approximate nearest neighbor search
    try {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS ${this.tableName}_vec_idx
        ON ${this.tableName} (libsql_vector_idx(embedding, 'metric=cosine'))
      `);
    } catch (error) {
      // Index might already exist with different parameters
      // This is fine - the index will still work
      if (
        !(error instanceof Error) ||
        !error.message.includes("already exists")
      ) {
        throw error;
      }
    }

    // Create indexes for efficient filtering
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_type ON ${this.tableName}(type)`,
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_importance ON ${this.tableName}(importance)`,
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_memory_id ON ${this.tableName}(memory_id)`,
    );

    this.initialized = true;
  }

  async upsert(
    id: string,
    vector: number[],
    payload: VectorPayload,
  ): Promise<string> {
    await this.initialize();

    // Validate vector size
    if (vector.length !== this.vectorSize) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.vectorSize}, got ${vector.length}`,
      );
    }

    // Convert vector to libSQL format: vector('[1.0, 2.0, 3.0]')
    const vectorStr = `[${vector.join(",")}]`;

    // Use INSERT OR REPLACE for atomic upsert
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ${this.tableName} (
        id, memory_id, embedding, type, title, tags, related_files, importance, payload
      ) VALUES (
        ?, ?, vector(?), ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      id,
      payload.memoryId,
      vectorStr,
      payload.type,
      payload.title,
      JSON.stringify(payload.tags),
      JSON.stringify(payload.relatedFiles),
      payload.importance,
      JSON.stringify(payload),
    );

    return id;
  }

  async search(
    vector: number[],
    filters?: SearchFilters,
    limit: number = 10,
  ): Promise<VectorSearchResult[]> {
    await this.initialize();

    // Validate vector size
    if (vector.length !== this.vectorSize) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.vectorSize}, got ${vector.length}`,
      );
    }

    // Convert vector to libSQL format
    const vectorStr = `[${vector.join(",")}]`;

    // Fetch more results than needed if filters are applied, to account for post-filtering
    const fetchLimit = filters ? Math.min(limit * 5, 100) : limit;

    // Use vector_top_k virtual table for KNN search
    // Then join with the main table to get full data
    // Distance must be calculated manually with vector_distance_cos()
    const knnQuery = `
      SELECT
        v.id,
        v.memory_id,
        v.type,
        v.title,
        v.tags,
        v.related_files,
        v.importance,
        v.payload,
        vector_distance_cos(v.embedding, vector(?)) AS distance
      FROM vector_top_k('${this.tableName}_vec_idx', vector(?), ?) AS vt
      JOIN ${this.tableName} AS v ON v.rowid = vt.id
      ORDER BY distance ASC
    `;

    const rows = this.db
      .prepare(knnQuery)
      .all(vectorStr, vectorStr, fetchLimit) as Array<{
      id: string;
      memory_id: string;
      type: string;
      title: string;
      tags: string;
      related_files: string;
      importance: number;
      payload: string;
      distance: number;
    }>;

    if (rows.length === 0) {
      return [];
    }

    // Apply filters and convert to results
    const results: VectorSearchResult[] = [];

    for (const row of rows) {
      // Apply type filter
      if (filters?.type && row.type !== filters.type) {
        continue;
      }

      // Apply importance filter
      if (
        filters?.minImportance !== undefined &&
        row.importance < filters.minImportance
      ) {
        continue;
      }

      // Apply tags filter
      if (filters?.tags && filters.tags.length > 0) {
        const rowTags = JSON.parse(row.tags) as string[];
        const hasMatchingTag = filters.tags.some((tag) =>
          rowTags.includes(tag),
        );
        if (!hasMatchingTag) {
          continue;
        }
      }

      // Apply related files filter
      if (filters?.relatedFiles && filters.relatedFiles.length > 0) {
        const rowFiles = JSON.parse(row.related_files) as string[];
        const hasMatchingFile = filters.relatedFiles.some((file) =>
          rowFiles.includes(file),
        );
        if (!hasMatchingFile) {
          continue;
        }
      }

      // Convert cosine distance to similarity score
      // Cosine distance is in [0, 2], where 0 = identical, 2 = opposite
      // Convert to score in [0, 1] where 1 = identical
      const score = Math.max(0, 1 - row.distance / 2);

      results.push({
        id: row.id,
        memoryId: row.memory_id,
        score,
        payload: JSON.parse(row.payload) as VectorPayload,
      });

      if (results.length >= limit) {
        break;
      }
    }

    return results;
  }

  async delete(id: string): Promise<boolean> {
    await this.initialize();

    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE id = ?`)
      .run(id);
    return result.changes > 0;
  }

  async deleteByMemoryId(memoryId: string): Promise<boolean> {
    await this.initialize();

    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE memory_id = ?`)
      .run(memoryId);
    return result.changes > 0;
  }

  async getCollectionInfo(): Promise<{
    vectorsCount: number;
    pointsCount: number;
  }> {
    await this.initialize();

    const result = this.db
      .prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`)
      .get() as { count: number };

    return {
      vectorsCount: result.count,
      pointsCount: result.count,
    };
  }

  close(): void {
    this.db.close();
  }
}
