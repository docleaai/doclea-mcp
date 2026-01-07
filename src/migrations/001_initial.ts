/**
 * Initial schema migration
 *
 * This migration creates the base schema for Doclea.
 * It matches the existing schema in sqlite.ts for backwards compatibility.
 */

import type { Migration, MigrationDatabase } from "./types";

export const migration001Initial: Migration = {
  version: "001",
  name: "initial_schema",
  destructive: false,

  up(db: MigrationDatabase): void {
    // Create memories table
    db.exec(`
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
    db.exec(`
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
    db.exec(`
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
    db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_cache (
        content_hash TEXT PRIMARY KEY,
        embedding TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);

    // Create indexes
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_memories_qdrant ON memories(qdrant_id)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_embedding_cache_model ON embedding_cache(model)",
    );
  },

  down(db: MigrationDatabase): void {
    // Drop tables in reverse order of creation (respecting foreign keys)
    db.exec("DROP TABLE IF EXISTS embedding_cache");
    db.exec("DROP TABLE IF EXISTS chunks");
    db.exec("DROP TABLE IF EXISTS documents");
    db.exec("DROP TABLE IF EXISTS memories");
  },
};