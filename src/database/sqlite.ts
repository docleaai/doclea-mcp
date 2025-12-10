import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Chunk,
  CreateMemory,
  Document,
  Memory,
  UpdateMemory,
} from "@/types";

export class SQLiteDatabase {
  private db: Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath, { create: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.initSchema();
  }

  private initSchema(): void {
    // Create memory table
    this.db.run(`
			CREATE TABLE IF NOT EXISTS memories (
				id TEXT PRIMARY KEY,
				type TEXT NOT NULL,
				title TEXT NOT NULL,
				content TEXT NOT NULL,
				summary TEXT,
				importance REAL DEFAULT 0.5,
				tags TEXT DEFAULT '[]',
				related_files TEXT DEFAULT '[]',
				git_commit TEXT,
				source_pr TEXT,
				experts TEXT DEFAULT '[]',
				qdrant_id TEXT,
				created_at INTEGER DEFAULT (unixepoch()),
				accessed_at INTEGER DEFAULT (unixepoch())
			)
		`);

    // Create documents table
    this.db.run(`
			CREATE TABLE IF NOT EXISTS documents (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				content TEXT NOT NULL,
				content_hash TEXT,
				created_at INTEGER DEFAULT (unixepoch()),
				updated_at INTEGER DEFAULT (unixepoch())
			)
		`);

    // Create chunks table
    this.db.run(`
			CREATE TABLE IF NOT EXISTS chunks (
				id TEXT PRIMARY KEY,
				document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
				content TEXT NOT NULL,
				qdrant_id TEXT,
				start_offset INTEGER,
				end_offset INTEGER
			)
		`);

    // Create embedding cache table
    this.db.run(`
			CREATE TABLE IF NOT EXISTS embedding_cache (
				content_hash TEXT PRIMARY KEY,
				embedding TEXT NOT NULL,
				model TEXT NOT NULL,
				created_at INTEGER DEFAULT (unixepoch())
			)
		`);

    // Create indexes
    this.db.run(
      "CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)",
    );
    this.db.run(
      "CREATE INDEX IF NOT EXISTS idx_memories_qdrant ON memories(qdrant_id)",
    );
    this.db.run(
      "CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id)",
    );
    this.db.run(
      "CREATE INDEX IF NOT EXISTS idx_embedding_cache_model ON embedding_cache(model)",
    );
  }

  // Memory operations
  createMemory(
    memory: CreateMemory & { id: string; qdrantId?: string },
  ): Memory {
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

  updateMemory(
    id: string,
    updates: UpdateMemory & { qdrantId?: string },
  ): Memory | null {
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

  deleteMemory(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM memories WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  listMemories(filters?: { type?: string; limit?: number }): Memory[] {
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

  // Document operations
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

  // Chunk operations
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

  // Embedding cache operations
  getCachedEmbedding(contentHash: string, model: string): number[] | null {
    const stmt = this.db.prepare(
      "SELECT embedding FROM embedding_cache WHERE content_hash = ? AND model = ?",
    );
    const row = stmt.get(contentHash, model) as
      | { embedding: string }
      | undefined;
    if (!row) return null;
    return JSON.parse(row.embedding);
  }

  setCachedEmbedding(
    contentHash: string,
    model: string,
    embedding: number[],
  ): void {
    const stmt = this.db.prepare(`
			INSERT OR REPLACE INTO embedding_cache (content_hash, model, embedding, created_at)
			VALUES (?, ?, ?, unixepoch())
		`);
    stmt.run(contentHash, model, JSON.stringify(embedding));
  }

  getCachedEmbeddingsBatch(
    contentHashes: string[],
    model: string,
  ): Map<string, number[]> {
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
      const stmt = this.db.prepare(
        "DELETE FROM embedding_cache WHERE model = ?",
      );
      return stmt.run(model).changes;
    }
    const stmt = this.db.prepare("DELETE FROM embedding_cache");
    return stmt.run().changes;
  }

  // Helpers
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

  close(): void {
    this.db.close();
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
