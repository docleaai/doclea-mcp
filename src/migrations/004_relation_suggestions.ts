/**
 * Relation suggestions migration
 *
 * Creates schema for storing suggested relationships between memories.
 * The detector generates suggestions based on semantic similarity, keyword overlap,
 * file overlap, and temporal proximity. High-confidence suggestions are auto-approved.
 */

import type { Migration, MigrationDatabase } from "./types";

export const migration004RelationSuggestions: Migration = {
  version: "004",
  name: "relation_suggestions",
  destructive: false,

  up(db: MigrationDatabase): void {
    // Create relation_suggestions table
    db.exec(`
			CREATE TABLE IF NOT EXISTS relation_suggestions (
				id TEXT PRIMARY KEY,
				source_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
				target_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
				suggested_type TEXT NOT NULL,
				confidence REAL NOT NULL,
				reason TEXT NOT NULL,
				detection_method TEXT NOT NULL,
				status TEXT DEFAULT 'pending',
				created_at INTEGER DEFAULT (unixepoch()),
				reviewed_at INTEGER,
				UNIQUE(source_id, target_id, detection_method)
			)
		`);

    // Create indexes for efficient queries
    db.exec(`
			CREATE INDEX IF NOT EXISTS idx_suggestions_status
			ON relation_suggestions(status)
		`);

    db.exec(`
			CREATE INDEX IF NOT EXISTS idx_suggestions_source
			ON relation_suggestions(source_id)
		`);

    db.exec(`
			CREATE INDEX IF NOT EXISTS idx_suggestions_created
			ON relation_suggestions(created_at)
		`);

    // Composite index for filtering by source and status
    db.exec(`
			CREATE INDEX IF NOT EXISTS idx_suggestions_source_status
			ON relation_suggestions(source_id, status)
		`);
  },

  down(db: MigrationDatabase): void {
    db.exec("DROP TABLE IF EXISTS relation_suggestions");
  },
};
