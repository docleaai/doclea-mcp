/**
 * Review status migration
 *
 * Adds needs_review column to memories table for auto-stored memories
 * that require user confirmation. Used by the approval workflow in
 * automatic storage mode.
 */

import type { Migration, MigrationDatabase } from "./types";

export const migration010ReviewStatus: Migration = {
  version: "010",
  name: "review_status",
  destructive: false,

  up(db: MigrationDatabase): void {
    // Add needs_review column with default false (0)
    // In automatic mode, memories can be flagged for review
    db.exec(`
      ALTER TABLE memories ADD COLUMN needs_review INTEGER DEFAULT 0
    `);

    // Create index for efficient querying of memories needing review
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memories_needs_review
      ON memories(needs_review) WHERE needs_review = 1
    `);
  },

  down(db: MigrationDatabase): void {
    // Drop the index
    db.exec("DROP INDEX IF EXISTS idx_memories_needs_review");

    // Note: SQLite doesn't support DROP COLUMN directly before version 3.35.0
    // The column will be ignored if not used
  },
};
