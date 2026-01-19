/**
 * Tag taxonomy migration
 *
 * Creates the tag_taxonomy table for storing custom tag definitions.
 * Built-in tags are loaded from code, custom tags are persisted here.
 */

import type { Migration, MigrationDatabase } from "./types";

export const migration008TagTaxonomy: Migration = {
  version: "008",
  name: "tag_taxonomy",
  destructive: false,

  up(db: MigrationDatabase): void {
    // Create tag_taxonomy table for custom tag definitions
    db.exec(`
			CREATE TABLE IF NOT EXISTS tag_taxonomy (
				canonical TEXT PRIMARY KEY,
				aliases TEXT NOT NULL DEFAULT '[]',
				category TEXT NOT NULL,
				parent TEXT,
				description TEXT,
				created_at INTEGER DEFAULT (unixepoch()),
				updated_at INTEGER DEFAULT (unixepoch())
			)
		`);

    // Index for querying by category
    db.exec(`
			CREATE INDEX IF NOT EXISTS idx_tag_taxonomy_category
			ON tag_taxonomy(category)
		`);

    // Index for querying child tags
    db.exec(`
			CREATE INDEX IF NOT EXISTS idx_tag_taxonomy_parent
			ON tag_taxonomy(parent)
		`);
  },

  down(db: MigrationDatabase): void {
    db.exec("DROP INDEX IF EXISTS idx_tag_taxonomy_parent");
    db.exec("DROP INDEX IF EXISTS idx_tag_taxonomy_category");
    db.exec("DROP TABLE IF EXISTS tag_taxonomy");
  },
};
