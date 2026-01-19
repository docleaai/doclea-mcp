/**
 * Tag Taxonomy Storage
 *
 * SQLite persistence layer for custom tag definitions.
 * Implements TaxonomyStorage interface for TaxonomyManager.
 */

import type { Database } from "bun:sqlite";
import type { TaxonomyStorage } from "../tagging/taxonomy";
import type { TagCategory, TagDefinition } from "../tagging/types";

/**
 * Database row shape for tag_taxonomy table
 */
interface TagTaxonomyRow {
  canonical: string;
  aliases: string; // JSON array
  category: string;
  parent: string | null;
  description: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Storage layer for custom tag taxonomy definitions
 */
export class TagTaxonomyStorage implements TaxonomyStorage {
  constructor(private db: Database) {}

  /**
   * Get all custom tags from database
   */
  getAllCustomTags(): TagDefinition[] {
    const stmt = this.db.prepare(
      "SELECT * FROM tag_taxonomy ORDER BY canonical",
    );
    const rows = stmt.all() as TagTaxonomyRow[];
    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Get a specific tag by canonical name
   */
  getTag(canonical: string): TagDefinition | null {
    const stmt = this.db.prepare(
      "SELECT * FROM tag_taxonomy WHERE canonical = ?",
    );
    const row = stmt.get(canonical.toLowerCase()) as TagTaxonomyRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  /**
   * Insert or update a custom tag
   */
  upsertTag(tag: TagDefinition): void {
    const stmt = this.db.prepare(`
			INSERT INTO tag_taxonomy (canonical, aliases, category, parent, description, updated_at)
			VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(canonical) DO UPDATE SET
				aliases = excluded.aliases,
				category = excluded.category,
				parent = excluded.parent,
				description = excluded.description,
				updated_at = excluded.updated_at
		`);

    stmt.run(
      tag.canonical.toLowerCase(),
      JSON.stringify(tag.aliases),
      tag.category,
      tag.parent || null,
      tag.description || null,
      Math.floor(Date.now() / 1000), // Unix timestamp in seconds
    );
  }

  /**
   * Delete a custom tag
   */
  deleteTag(canonical: string): boolean {
    const stmt = this.db.prepare(
      "DELETE FROM tag_taxonomy WHERE canonical = ?",
    );
    const result = stmt.run(canonical.toLowerCase());
    return result.changes > 0;
  }

  /**
   * Get tags by category
   */
  getTagsByCategory(category: TagCategory): TagDefinition[] {
    const stmt = this.db.prepare(
      "SELECT * FROM tag_taxonomy WHERE category = ? ORDER BY canonical",
    );
    const rows = stmt.all(category) as TagTaxonomyRow[];
    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Get child tags for a parent
   */
  getChildTags(parent: string): TagDefinition[] {
    const stmt = this.db.prepare(
      "SELECT * FROM tag_taxonomy WHERE parent = ? ORDER BY canonical",
    );
    const rows = stmt.all(parent.toLowerCase()) as TagTaxonomyRow[];
    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Get tag count by category
   */
  getTagCountByCategory(): Record<string, number> {
    const stmt = this.db.prepare(`
			SELECT category, COUNT(*) as count
			FROM tag_taxonomy
			GROUP BY category
		`);
    const rows = stmt.all() as Array<{ category: string; count: number }>;

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.category] = row.count;
    }
    return result;
  }

  /**
   * Check if a tag exists
   */
  hasTag(canonical: string): boolean {
    const stmt = this.db.prepare(
      "SELECT 1 FROM tag_taxonomy WHERE canonical = ? LIMIT 1",
    );
    const result = stmt.get(canonical.toLowerCase());
    return !!result;
  }

  /**
   * Search tags by partial canonical match
   */
  searchTags(query: string, limit = 20): TagDefinition[] {
    const stmt = this.db.prepare(`
			SELECT * FROM tag_taxonomy
			WHERE canonical LIKE ?
			ORDER BY canonical
			LIMIT ?
		`);
    const rows = stmt.all(
      `%${query.toLowerCase()}%`,
      limit,
    ) as TagTaxonomyRow[];
    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Bulk insert tags (for import)
   */
  bulkInsert(tags: TagDefinition[]): number {
    const stmt = this.db.prepare(`
			INSERT INTO tag_taxonomy (canonical, aliases, category, parent, description, updated_at)
			VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(canonical) DO UPDATE SET
				aliases = excluded.aliases,
				category = excluded.category,
				parent = excluded.parent,
				description = excluded.description,
				updated_at = excluded.updated_at
		`);

    let inserted = 0;
    const now = Math.floor(Date.now() / 1000);

    const transaction = this.db.transaction(() => {
      for (const tag of tags) {
        stmt.run(
          tag.canonical.toLowerCase(),
          JSON.stringify(tag.aliases),
          tag.category,
          tag.parent || null,
          tag.description || null,
          now,
        );
        inserted++;
      }
    });

    transaction();
    return inserted;
  }

  /**
   * Clear all custom tags
   */
  clear(): number {
    const stmt = this.db.prepare("DELETE FROM tag_taxonomy");
    const result = stmt.run();
    return result.changes;
  }

  /**
   * Map database row to TagDefinition
   */
  private mapRow(row: TagTaxonomyRow): TagDefinition {
    return {
      canonical: row.canonical,
      aliases: JSON.parse(row.aliases) as string[],
      category: row.category as TagCategory,
      parent: row.parent || undefined,
      description: row.description || undefined,
      source: "custom",
    };
  }
}
