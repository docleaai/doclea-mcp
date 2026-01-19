/**
 * Memory relationships migration
 *
 * Creates schema for linking memories with typed relationships.
 * Enables knowledge graph traversal and advanced context building.
 */

import type { Migration, MigrationDatabase } from "./types";

export const migration003MemoryRelations: Migration = {
  version: "003",
  name: "memory_relations",
  destructive: false,

  up(db: MigrationDatabase): void {
    // Create memory_relations table
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_relations (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        metadata TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(source_id, target_id, type)
      )
    `);

    // Create indexes for efficient graph queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memory_relations_source
      ON memory_relations(source_id)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memory_relations_target
      ON memory_relations(target_id)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memory_relations_type
      ON memory_relations(type)
    `);

    // Composite index for common query pattern
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memory_relations_source_type
      ON memory_relations(source_id, type)
    `);
  },

  down(db: MigrationDatabase): void {
    // Drop table
    db.exec("DROP TABLE IF EXISTS memory_relations");
  },
};
