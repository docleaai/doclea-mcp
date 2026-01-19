/**
 * Pending memories migration
 *
 * Creates schema for storing pending memories in suggested/manual storage modes.
 * Pending memories are stored here before user approval, then moved to the
 * main memories table and vector store upon approval.
 */

import type { Migration, MigrationDatabase } from "./types";

export const migration006PendingMemories: Migration = {
  version: "006",
  name: "pending_memories",
  destructive: false,

  up(db: MigrationDatabase): void {
    // Create pending_memories table
    db.exec(`
			CREATE TABLE IF NOT EXISTS pending_memories (
				id TEXT PRIMARY KEY,
				memory_data TEXT NOT NULL,
				qdrant_id TEXT NOT NULL,
				suggested_at INTEGER NOT NULL,
				source TEXT NOT NULL,
				reason TEXT NOT NULL
			)
		`);

    // Create index for efficient queries by suggested_at
    db.exec(`
			CREATE INDEX IF NOT EXISTS idx_pending_memories_suggested_at
			ON pending_memories(suggested_at)
		`);

    // Create index for source filtering
    db.exec(`
			CREATE INDEX IF NOT EXISTS idx_pending_memories_source
			ON pending_memories(source)
		`);
  },

  down(db: MigrationDatabase): void {
    db.exec("DROP TABLE IF EXISTS pending_memories");
  },
};
