import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { platform } from "node:os";
import { dirname } from "node:path";
import * as sqliteVec from "sqlite-vec";
import type { SearchFilters } from "@/types";
import type {
  VectorPayload,
  VectorSearchResult,
  VectorStore,
} from "./interface";

// Default vector size for all-MiniLM-L6-v2 (384 dimensions)
// This can be overridden in the constructor for other models
const DEFAULT_VECTOR_SIZE = 384;

export interface SqliteVecConfig {
  dbPath: string;
  tableName?: string;
  vectorSize?: number;
}

/**
 * Embedded vector store using sqlite-vec extension.
 * Provides zero-config vector search without Docker dependencies.
 */
export class SqliteVecStore implements VectorStore {
  private readonly db: Database;
  private readonly tableName: string;
  private readonly vectorSize: number;
  private initialized = false;

  constructor(config: SqliteVecConfig | string) {
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

    // macOS: Set custom SQLite for extension support
    // Apple's bundled SQLite doesn't support extensions
    if (platform() === "darwin") {
      const brewArmPath = "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib";
      const brewIntelPath = "/usr/local/opt/sqlite/lib/libsqlite3.dylib";

      if (existsSync(brewArmPath)) {
        Database.setCustomSQLite(brewArmPath);
      } else if (existsSync(brewIntelPath)) {
        Database.setCustomSQLite(brewIntelPath);
      }
      // If neither exists, we'll try without - will fail with clear error
    }

    this.db = new Database(opts.dbPath, { create: true });

    // Enable WAL mode for better concurrent performance
    this.db.run("PRAGMA journal_mode = WAL");

    // Load sqlite-vec extension
    sqliteVec.load(this.db);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create vector table using vec0 virtual table
    this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tableName}
      USING vec0(
        id TEXT PRIMARY KEY,
        embedding float[${this.vectorSize}]
      )
    `);

    // Create metadata table for payload and filtering
    this.db.run(`
      CREATE TABLE IF NOT EXISTS ${this.tableName}_metadata (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        tags TEXT NOT NULL,
        related_files TEXT NOT NULL,
        importance REAL NOT NULL,
        payload TEXT NOT NULL
      )
    `);

    // Create indexes for efficient filtering
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_type ON ${this.tableName}_metadata(type)`,
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_importance ON ${this.tableName}_metadata(importance)`,
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_${this.tableName}_memory_id ON ${this.tableName}_metadata(memory_id)`,
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

    const embedding = new Float32Array(vector);

    // Use transaction for atomic upsert
    this.db.run("BEGIN");
    try {
      // Delete existing entries if any
      this.db.run(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
      this.db.run(`DELETE FROM ${this.tableName}_metadata WHERE id = ?`, [id]);

      // Insert vector - pass Float32Array directly for bun:sqlite
      this.db
        .prepare(`INSERT INTO ${this.tableName}(id, embedding) VALUES (?, ?)`)
        .run(id, embedding);

      // Insert metadata
      this.db
        .prepare(
          `INSERT INTO ${this.tableName}_metadata(
            id, memory_id, type, title, tags, related_files, importance, payload
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          payload.memoryId,
          payload.type,
          payload.title,
          JSON.stringify(payload.tags),
          JSON.stringify(payload.relatedFiles),
          payload.importance,
          JSON.stringify(payload),
        );

      this.db.run("COMMIT");
      return id;
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
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

    const embedding = new Float32Array(vector);

    // For vec0 virtual tables, we need to use subquery approach for filtering
    // First do KNN search, then filter results
    // This is because vec0 MATCH requires k = ? constraint

    // Step 1: Do KNN search on vec0 table
    const knnQuery = `
      SELECT id, distance
      FROM ${this.tableName}
      WHERE embedding MATCH ?
        AND k = ?
    `;

    // Fetch more results than needed if filters are applied, to account for filtering
    const fetchLimit = filters ? Math.min(limit * 5, 100) : limit;

    const knnRows = this.db
      .prepare(knnQuery)
      .all(embedding, fetchLimit) as Array<{
      id: string;
      distance: number;
    }>;

    if (knnRows.length === 0) {
      return [];
    }

    // Step 2: Get metadata and apply filters
    const ids = knnRows.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");

    // Build filter conditions
    const conditions: string[] = [`id IN (${placeholders})`];
    const params: unknown[] = [...ids];

    if (filters?.type) {
      conditions.push("type = ?");
      params.push(filters.type);
    }

    if (filters?.minImportance !== undefined) {
      conditions.push("importance >= ?");
      params.push(filters.minImportance);
    }

    // Tags filter - check if any tag matches (JSON array stored as text)
    if (filters?.tags && filters.tags.length > 0) {
      const tagConditions = filters.tags.map(() => "tags LIKE ?");
      conditions.push(`(${tagConditions.join(" OR ")})`);
      for (const tag of filters.tags) {
        params.push(`%"${tag}"%`);
      }
    }

    // Related files filter
    if (filters?.relatedFiles && filters.relatedFiles.length > 0) {
      const fileConditions = filters.relatedFiles.map(
        () => "related_files LIKE ?",
      );
      conditions.push(`(${fileConditions.join(" OR ")})`);
      for (const file of filters.relatedFiles) {
        params.push(`%"${file}"%`);
      }
    }

    const metadataQuery = `
      SELECT id, memory_id, payload
      FROM ${this.tableName}_metadata
      WHERE ${conditions.join(" AND ")}
    `;

    const metadataRows = this.db
      .prepare(metadataQuery)
      .all(...(params as (string | number)[])) as Array<{
      id: string;
      memory_id: string;
      payload: string;
    }>;

    // Create a map for quick lookup
    const metadataMap = new Map(metadataRows.map((r) => [r.id, r]));

    // Combine results, maintaining KNN order
    const results: VectorSearchResult[] = [];
    for (const knnRow of knnRows) {
      const metadata = metadataMap.get(knnRow.id);
      if (metadata) {
        results.push({
          id: knnRow.id,
          memoryId: metadata.memory_id,
          // Convert L2 distance to similarity score
          // For normalized vectors: similarity ≈ 1 - (distance / 2)
          score: Math.max(0, 1 - knnRow.distance / 2),
          payload: JSON.parse(metadata.payload) as VectorPayload,
        });
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  async delete(id: string): Promise<boolean> {
    await this.initialize();

    const result = this.db.run(`DELETE FROM ${this.tableName} WHERE id = ?`, [
      id,
    ]);
    this.db.run(`DELETE FROM ${this.tableName}_metadata WHERE id = ?`, [id]);

    return result.changes > 0;
  }

  async deleteByMemoryId(memoryId: string): Promise<boolean> {
    await this.initialize();

    // Get all vector IDs for this memory
    const rows = this.db
      .prepare(`SELECT id FROM ${this.tableName}_metadata WHERE memory_id = ?`)
      .all(memoryId) as Array<{ id: string }>;

    if (rows.length === 0) {
      return false;
    }

    // Delete from both tables
    this.db.run("BEGIN");
    try {
      for (const row of rows) {
        this.db.run(`DELETE FROM ${this.tableName} WHERE id = ?`, [row.id]);
        this.db.run(`DELETE FROM ${this.tableName}_metadata WHERE id = ?`, [
          row.id,
        ]);
      }
      this.db.run("COMMIT");
      return true;
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  async getCollectionInfo(): Promise<{
    vectorsCount: number;
    pointsCount: number;
  }> {
    await this.initialize();

    const result = this.db
      .prepare(`SELECT COUNT(*) as count FROM ${this.tableName}_metadata`)
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
