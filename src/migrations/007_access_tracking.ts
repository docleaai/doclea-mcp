/**
 * Access tracking migration
 *
 * Adds access_count column to memories table for usage frequency tracking.
 * Used by the multi-factor relevance scoring system.
 */

import type { Migration, MigrationDatabase } from "./types";

export const migration007AccessTracking: Migration = {
  version: "007",
  name: "access_tracking",
  destructive: false,

  up(db: MigrationDatabase): void {
    // Add access_count column with default 0
    db.exec(`
			ALTER TABLE memories ADD COLUMN access_count INTEGER DEFAULT 0
		`);

    // Create index for efficient sorting by access frequency
    db.exec(`
			CREATE INDEX IF NOT EXISTS idx_memories_access_count
			ON memories(access_count)
		`);
  },

  down(db: MigrationDatabase): void {
    // SQLite doesn't support DROP COLUMN directly before version 3.35.0
    // We need to recreate the table without the column
    // For simplicity, just drop the index - the column will be ignored
    db.exec("DROP INDEX IF EXISTS idx_memories_access_count");

    // Note: To fully remove the column, you'd need to:
    // 1. Create a new table without access_count
    // 2. Copy data from old table
    // 3. Drop old table
    // 4. Rename new table
    // This is left as manual cleanup if needed
  },
};
