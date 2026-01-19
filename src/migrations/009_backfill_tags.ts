/**
 * Tag backfill migration
 *
 * Normalizes existing tags in memories.tags column to use canonical forms.
 * This is a data migration that runs after 008_tag_taxonomy schema migration.
 *
 * Examples of normalization:
 * - ["ts", "postgres"] → ["typescript", "postgresql"]
 * - ["TypeScript", "REACT"] → ["typescript", "react"]
 * - ["ts", "typescript", "TS"] → ["typescript"] (deduplication)
 */

import { BUILT_IN_TAXONOMY } from "../tagging/built-in-taxonomy";
import type { Migration, MigrationDatabase } from "./types";

/**
 * Build alias-to-canonical lookup map from built-in taxonomy
 */
function buildAliasIndex(): Map<string, string> {
  const index = new Map<string, string>();

  for (const tag of BUILT_IN_TAXONOMY) {
    const canonical = tag.canonical.toLowerCase();

    // Index the canonical name itself
    index.set(canonical, canonical);

    // Index all aliases
    for (const alias of tag.aliases) {
      index.set(alias.toLowerCase(), canonical);
    }
  }

  return index;
}

/**
 * Format a raw tag into normalized format
 * lowercase → replace non-alphanum with hyphen → collapse hyphens → trim
 */
function formatTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Normalize a single tag to its canonical form
 */
function normalizeTag(tag: string, aliasIndex: Map<string, string>): string {
  const normalized = tag.toLowerCase().trim();
  if (!normalized) return "";

  // Check alias index for exact match
  const canonical = aliasIndex.get(normalized);
  if (canonical) {
    return canonical;
  }

  // Format unknown tag
  return formatTag(normalized);
}

/**
 * Normalize an array of tags, deduplicating results
 */
function normalizeTags(
  tags: string[],
  aliasIndex: Map<string, string>,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const normalized = normalizeTag(tag, aliasIndex);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

export const migration009BackfillTags: Migration = {
  version: "009",
  name: "backfill_tags",
  destructive: false,

  up(db: MigrationDatabase): void {
    // Build alias index from built-in taxonomy
    const aliasIndex = buildAliasIndex();

    // Get all memories with tags
    const rows = db.query<{ id: string; tags: string }>(
      "SELECT id, tags FROM memories WHERE tags IS NOT NULL",
    );

    let updatedCount = 0;
    let skippedCount = 0;

    // Process each memory
    for (const row of rows) {
      try {
        const oldTags = JSON.parse(row.tags) as string[];

        // Skip if empty array
        if (!Array.isArray(oldTags) || oldTags.length === 0) {
          skippedCount++;
          continue;
        }

        const normalizedTags = normalizeTags(oldTags, aliasIndex);
        const normalizedJson = JSON.stringify(normalizedTags);

        // Only update if changed
        if (row.tags !== normalizedJson) {
          db.run(
            "UPDATE memories SET tags = ? WHERE id = ?",
            normalizedJson,
            row.id,
          );
          updatedCount++;
        } else {
          skippedCount++;
        }
      } catch {
        // Skip malformed JSON
        skippedCount++;
      }
    }

    // Log results (will be visible in migration output)
    console.log(
      `[migration009] Normalized tags: ${updatedCount} updated, ${skippedCount} skipped`,
    );
  },

  down(_db: MigrationDatabase): void {
    // This migration is non-reversible as we don't store original values
    // The data is not lost, just normalized to canonical forms
    console.log(
      "[migration009] Tag normalization cannot be reversed - original values not stored",
    );
  },
};
