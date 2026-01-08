/**
 * In-memory storage backend implementation
 *
 * Uses SQLite's :memory: mode for full SQL compatibility with volatile storage.
 * Data is lost when the process exits - intended for testing and ephemeral use.
 */

import { Database } from "bun:sqlite";
import type { Memory, CreateMemory, UpdateMemory, Document, Chunk } from "@/types";
import { migrations } from "@/migrations";
import type { Migration, MigrationDatabase } from "@/migrations/types";
import type { IStorageBackend } from "./interface";
import type {
  StorageBackendType,
  StorageMode,
  DeleteResult,
  PendingMemory,
  ListMemoriesOptions,
} from "./types";

/**
 * Metadata table name for tracking schema version
 */
const META_TABLE = "_doclea_meta";

/**
 * In-memory storage backend using SQLite :memory: mode
 *
 * This provides full SQL compatibility while keeping data volatile.
 * All existing SQL queries and domain storage classes work unchanged.
 */
export class MemoryStorageBackend implements IStorageBackend {
  private db: Database;
  private mode: StorageMode;
  private closed = false;
  private schemaVersion: string | null = null;

  constructor(mode: StorageMode = "automatic") {
    this.mode = mode;
    this.db = new Database(":memory:");

    // Enable WAL mode (consistent with SQLite backend, though no-op for :memory:)
    this.db.run("PRAGMA journal_mode = WAL");
  }

  async initialize(): Promise<void> {
    // Create meta table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS ${META_TABLE} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);

    // Create migrations tracking table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS _doclea_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER DEFAULT (unixepoch())
      )
    `);

    // Run all migrations
    const migrationDb = this.createMigrationDb();
    const sortedMigrations = [...migrations].sort((a, b) =>
      a.version.localeCompare(b.version),
    );

    for (const migration of sortedMigrations) {
      try {
        this.db.run("BEGIN TRANSACTION");
        migration.up(migrationDb);

        // Record migration
        this.db.run(
          `INSERT OR REPLACE INTO _doclea_migrations (version, name, applied_at) VALUES (?, ?, unixepoch())`,
          [migration.version, migration.name],
        );

        // Update schema version
        this.db.run(
          `INSERT OR REPLACE INTO ${META_TABLE} (key, value, updated_at) VALUES ('schema_version', ?, unixepoch())`,
          [migration.version],
        );

        this.schemaVersion = migration.version;
        this.db.run("COMMIT");
      } catch (error) {
        this.db.run("ROLLBACK");
        throw new Error(
          `Migration ${migration.version} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    console.log("[doclea] In-memory backend initialized (data will not persist)");
  }

  /**
   * Create a MigrationDatabase wrapper for migrations
   */
  private createMigrationDb(): MigrationDatabase {
    return {
      run: (sql: string, ...params: unknown[]) => {
        if (params.length > 0) {
          // @ts-expect-error - Variadic params not compatible with bun:sqlite types
          this.db.run(sql, params);
        } else {
          this.db.run(sql);
        }
      },
      exec: (sql: string) => {
        this.db.exec(sql);
      },
      query: <T = unknown>(sql: string, ...params: unknown[]): T[] => {
        if (params.length > 0) {
          // @ts-expect-error - Variadic params not compatible with bun:sqlite types
          return this.db.prepare(sql).all(params) as T[];
        }
        return this.db.prepare(sql).all() as T[];
      },
      get: <T = unknown>(sql: string, ...params: unknown[]): T | undefined => {
        if (params.length > 0) {
          // @ts-expect-error - Variadic params not compatible with bun:sqlite types
          return this.db.prepare(sql).get(params) as T | undefined;
        }
        return this.db.prepare(sql).get() as T | undefined;
      },
    };
  }

  getStorageMode(): StorageMode {
    return this.mode;
  }

  setStorageMode(mode: StorageMode): void {
    this.mode = mode;
  }

  getBackendType(): StorageBackendType {
    return "memory";
  }

  isClosed(): boolean {
    return this.closed;
  }

  getDatabase(): Database {
    if (this.closed) {
      throw new Error("Storage backend is closed");
    }
    return this.db;
  }

  getSchemaVersion(): string | null {
    return this.schemaVersion;
  }

  close(): void {
    if (!this.closed) {
      console.warn("[doclea] Closing in-memory backend - all data will be lost");
      this.db.close();
      this.closed = true;
    }
  }

  // ============================================
  // Memory Operations
  // ============================================

  createMemory(memory: CreateMemory & { id: string; qdrantId?: string }): Memory {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(`
      INSERT INTO memories (
        id, type, title, content, summary, importance, tags, related_files,
        git_commit, source_pr, experts, qdrant_id, created_at, accessed_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      memory.id,
      memory.type,
      memory.title,
      memory.content,
      memory.summary ?? null,
      memory.importance ?? 0.5,
      JSON.stringify(memory.tags ?? []),
      JSON.stringify(memory.relatedFiles ?? []),
      memory.gitCommit ?? null,
      memory.sourcePr ?? null,
      JSON.stringify(memory.experts ?? []),
      memory.qdrantId ?? null,
      now,
      now,
    );

    const created = this.getMemory(memory.id);
    if (!created) {
      throw new Error(`Failed to create memory with id ${memory.id}`);
    }
    return created;
  }

  getMemory(id: string): Memory | null {
    const stmt = this.db.prepare("SELECT * FROM memories WHERE id = ?");
    const row = stmt.get(id) as MemoryRow | undefined;
    return row ? this.rowToMemory(row) : null;
  }

  getMemoryByQdrantId(qdrantId: string): Memory | null {
    const stmt = this.db.prepare("SELECT * FROM memories WHERE qdrant_id = ?");
    const row = stmt.get(qdrantId) as MemoryRow | undefined;
    return row ? this.rowToMemory(row) : null;
  }

  updateMemory(id: string, updates: UpdateMemory & { qdrantId?: string }): Memory | null {
    const existing = this.getMemory(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.type !== undefined) {
      fields.push("type = ?");
      values.push(updates.type);
    }
    if (updates.title !== undefined) {
      fields.push("title = ?");
      values.push(updates.title);
    }
    if (updates.content !== undefined) {
      fields.push("content = ?");
      values.push(updates.content);
    }
    if (updates.summary !== undefined) {
      fields.push("summary = ?");
      values.push(updates.summary);
    }
    if (updates.importance !== undefined) {
      fields.push("importance = ?");
      values.push(updates.importance);
    }
    if (updates.tags !== undefined) {
      fields.push("tags = ?");
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.relatedFiles !== undefined) {
      fields.push("related_files = ?");
      values.push(JSON.stringify(updates.relatedFiles));
    }
    if (updates.gitCommit !== undefined) {
      fields.push("git_commit = ?");
      values.push(updates.gitCommit);
    }
    if (updates.sourcePr !== undefined) {
      fields.push("source_pr = ?");
      values.push(updates.sourcePr);
    }
    if (updates.experts !== undefined) {
      fields.push("experts = ?");
      values.push(JSON.stringify(updates.experts));
    }
    if (updates.qdrantId !== undefined) {
      fields.push("qdrant_id = ?");
      values.push(updates.qdrantId);
    }

    if (fields.length === 0) return existing;

    fields.push("accessed_at = ?");
    values.push(Math.floor(Date.now() / 1000));
    values.push(id);

    const stmt = this.db.prepare(
      `UPDATE memories SET ${fields.join(", ")} WHERE id = ?`,
    );
    stmt.run(...values);

    return this.getMemory(id);
  }

  deleteMemory(id: string): DeleteResult {
    // Get qdrantId before deletion for vector store cleanup
    const existing = this.getMemory(id);
    if (!existing) {
      return { success: false };
    }

    const qdrantId = existing.qdrantId;

    const stmt = this.db.prepare("DELETE FROM memories WHERE id = ?");
    const result = stmt.run(id);

    return {
      success: result.changes > 0,
      qdrantId,
    };
  }

  listMemories(filters?: ListMemoriesOptions): Memory[] {
    let query = "SELECT * FROM memories";
    const params: (string | number)[] = [];

    if (filters?.type) {
      query += " WHERE type = ?";
      params.push(filters.type);
    }

    query += " ORDER BY accessed_at DESC";

    if (filters?.limit) {
      query += " LIMIT ?";
      params.push(filters.limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as MemoryRow[];
    return rows.map((row) => this.rowToMemory(row));
  }

  getMemoriesByIds(ids: string[]): Memory[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const stmt = this.db.prepare(
      `SELECT * FROM memories WHERE id IN (${placeholders})`,
    );
    const rows = stmt.all(...ids) as MemoryRow[];
    return rows.map((row) => this.rowToMemory(row));
  }

  findByRelatedFiles(files: string[], excludeId?: string): Memory[] {
    if (files.length === 0) return [];

    const placeholders = files.map(() => "?").join(", ");
    let query = `
      SELECT DISTINCT m.* FROM memories m, json_each(m.related_files) AS rf
      WHERE rf.value IN (${placeholders})
    `;
    const params: (string | number)[] = [...files];

    if (excludeId) {
      query += " AND m.id != ?";
      params.push(excludeId);
    }

    query += " ORDER BY m.accessed_at DESC LIMIT 100";

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as MemoryRow[];
    return rows.map((row) => this.rowToMemory(row));
  }

  findByTimeRange(startTime: number, endTime: number, excludeId?: string): Memory[] {
    let query = "SELECT * FROM memories WHERE created_at >= ? AND created_at <= ?";
    const params: (string | number)[] = [startTime, endTime];

    if (excludeId) {
      query += " AND id != ?";
      params.push(excludeId);
    }

    query += " ORDER BY created_at DESC LIMIT 100";

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as MemoryRow[];
    return rows.map((row) => this.rowToMemory(row));
  }

  searchByTags(tags: string[], excludeId?: string): Memory[] {
    if (tags.length === 0) return [];

    const placeholders = tags.map(() => "?").join(", ");
    let query = `
      SELECT DISTINCT m.* FROM memories m, json_each(m.tags) AS t
      WHERE LOWER(t.value) IN (${placeholders})
    `;
    const params: (string | number)[] = tags.map((t) => t.toLowerCase());

    if (excludeId) {
      query += " AND m.id != ?";
      params.push(excludeId);
    }

    query += " ORDER BY m.accessed_at DESC LIMIT 100";

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as MemoryRow[];
    return rows.map((row) => this.rowToMemory(row));
  }

  // ============================================
  // Document/Chunk Operations
  // ============================================

  createDocument(doc: Omit<Document, "createdAt" | "updatedAt">): Document {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(`
      INSERT INTO documents (id, title, content, content_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(doc.id, doc.title, doc.content, doc.contentHash ?? null, now, now);
    const created = this.getDocument(doc.id);
    if (!created) {
      throw new Error(`Failed to create document with id ${doc.id}`);
    }
    return created;
  }

  getDocument(id: string): Document | null {
    const stmt = this.db.prepare("SELECT * FROM documents WHERE id = ?");
    const row = stmt.get(id) as DocumentRow | undefined;
    return row ? this.rowToDocument(row) : null;
  }

  createChunk(chunk: Chunk): Chunk {
    const stmt = this.db.prepare(`
      INSERT INTO chunks (id, document_id, content, qdrant_id, start_offset, end_offset)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      chunk.id,
      chunk.documentId,
      chunk.content,
      chunk.qdrantId ?? null,
      chunk.startOffset,
      chunk.endOffset,
    );
    return chunk;
  }

  getChunksByDocument(documentId: string): Chunk[] {
    const stmt = this.db.prepare("SELECT * FROM chunks WHERE document_id = ?");
    const rows = stmt.all(documentId) as ChunkRow[];
    return rows.map((row) => this.rowToChunk(row));
  }

  // ============================================
  // Embedding Cache Operations
  // ============================================

  getCachedEmbedding(contentHash: string, model: string): number[] | null {
    const stmt = this.db.prepare(
      "SELECT embedding FROM embedding_cache WHERE content_hash = ? AND model = ?",
    );
    const row = stmt.get(contentHash, model) as { embedding: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.embedding);
  }

  setCachedEmbedding(contentHash: string, model: string, embedding: number[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO embedding_cache (content_hash, model, embedding, created_at)
      VALUES (?, ?, ?, unixepoch())
    `);
    stmt.run(contentHash, model, JSON.stringify(embedding));
  }

  getCachedEmbeddingsBatch(contentHashes: string[], model: string): Map<string, number[]> {
    if (contentHashes.length === 0) return new Map();

    const placeholders = contentHashes.map(() => "?").join(", ");
    const stmt = this.db.prepare(
      `SELECT content_hash, embedding FROM embedding_cache WHERE content_hash IN (${placeholders}) AND model = ?`,
    );
    const rows = stmt.all(...contentHashes, model) as Array<{
      content_hash: string;
      embedding: string;
    }>;

    const result = new Map<string, number[]>();
    for (const row of rows) {
      result.set(row.content_hash, JSON.parse(row.embedding));
    }
    return result;
  }

  clearEmbeddingCache(model?: string): number {
    if (model) {
      const stmt = this.db.prepare("DELETE FROM embedding_cache WHERE model = ?");
      return stmt.run(model).changes;
    }
    const stmt = this.db.prepare("DELETE FROM embedding_cache");
    return stmt.run().changes;
  }

  // ============================================
  // Pending Memory Operations
  // ============================================

  createPendingMemory(pending: PendingMemory): PendingMemory {
    const stmt = this.db.prepare(`
      INSERT INTO pending_memories (id, memory_data, qdrant_id, suggested_at, source, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      pending.id,
      JSON.stringify(pending.memoryData),
      pending.memoryData.qdrantId,
      pending.suggestedAt,
      pending.source,
      pending.reason,
    );
    return pending;
  }

  getPendingMemory(id: string): PendingMemory | null {
    const stmt = this.db.prepare("SELECT * FROM pending_memories WHERE id = ?");
    const row = stmt.get(id) as PendingMemoryRow | undefined;
    return row ? this.rowToPendingMemory(row) : null;
  }

  getPendingMemories(): PendingMemory[] {
    const stmt = this.db.prepare("SELECT * FROM pending_memories ORDER BY suggested_at DESC");
    const rows = stmt.all() as PendingMemoryRow[];
    return rows.map((row) => this.rowToPendingMemory(row));
  }

  deletePendingMemory(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM pending_memories WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ============================================
  // Row Conversion Helpers
  // ============================================

  private rowToMemory(row: MemoryRow): Memory {
    return {
      id: row.id,
      type: row.type as Memory["type"],
      title: row.title,
      content: row.content,
      summary: row.summary ?? undefined,
      importance: row.importance,
      tags: JSON.parse(row.tags),
      relatedFiles: JSON.parse(row.related_files),
      gitCommit: row.git_commit ?? undefined,
      sourcePr: row.source_pr ?? undefined,
      experts: JSON.parse(row.experts),
      qdrantId: row.qdrant_id ?? undefined,
      createdAt: row.created_at,
      accessedAt: row.accessed_at,
    };
  }

  private rowToDocument(row: DocumentRow): Document {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      contentHash: row.content_hash ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToChunk(row: ChunkRow): Chunk {
    return {
      id: row.id,
      documentId: row.document_id,
      content: row.content,
      qdrantId: row.qdrant_id ?? undefined,
      startOffset: row.start_offset,
      endOffset: row.end_offset,
    };
  }

  private rowToPendingMemory(row: PendingMemoryRow): PendingMemory {
    return {
      id: row.id,
      memoryData: JSON.parse(row.memory_data),
      suggestedAt: row.suggested_at,
      source: row.source as PendingMemory["source"],
      reason: row.reason,
    };
  }
}

// Row types for SQLite
interface MemoryRow {
  id: string;
  type: string;
  title: string;
  content: string;
  summary: string | null;
  importance: number;
  tags: string;
  related_files: string;
  git_commit: string | null;
  source_pr: string | null;
  experts: string;
  qdrant_id: string | null;
  created_at: number;
  accessed_at: number;
}

interface DocumentRow {
  id: string;
  title: string;
  content: string;
  content_hash: string | null;
  created_at: number;
  updated_at: number;
}

interface ChunkRow {
  id: string;
  document_id: string;
  content: string;
  qdrant_id: string | null;
  start_offset: number;
  end_offset: number;
}

interface PendingMemoryRow {
  id: string;
  memory_data: string;
  qdrant_id: string;
  suggested_at: number;
  source: string;
  reason: string;
}
