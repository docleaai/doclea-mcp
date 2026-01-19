/**
 * Confidence decay migration
 *
 * Adds columns to memories table for per-memory decay configuration:
 * - decay_rate: Per-memory rate multiplier (NULL = global, 0 = pinned)
 * - last_refreshed_at: Decay anchor timestamp (NULL = use created_at)
 * - confidence_floor: Minimum effective confidence (NULL = global)
 * - decay_function: Override: exponential, linear, step, none
 */

import type { Migration, MigrationDatabase } from "./types";

export const migration011ConfidenceDecay: Migration = {
  version: "011",
  name: "confidence_decay",
  destructive: false,

  up(db: MigrationDatabase): void {
    // Add decay_rate column - per-memory rate multiplier
    // NULL = use global config, 0 = pinned (no decay)
    db.exec(`
      ALTER TABLE memories ADD COLUMN decay_rate REAL DEFAULT NULL
    `);

    // Add last_refreshed_at column - decay anchor timestamp
    // NULL = use created_at as anchor
    db.exec(`
      ALTER TABLE memories ADD COLUMN last_refreshed_at INTEGER DEFAULT NULL
    `);

    // Add confidence_floor column - minimum effective confidence
    // NULL = use global floor from config
    db.exec(`
      ALTER TABLE memories ADD COLUMN confidence_floor REAL DEFAULT NULL
    `);

    // Add decay_function column - override the decay function type
    // NULL = use global config, values: 'exponential', 'linear', 'step', 'none'
    db.exec(`
      ALTER TABLE memories ADD COLUMN decay_function TEXT DEFAULT NULL
    `);

    // Create single index on last_refreshed_at for "find stale memories" queries
    // Intentionally not a composite index as per plan to avoid premature optimization
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memories_last_refreshed
      ON memories(last_refreshed_at)
    `);
  },

  down(db: MigrationDatabase): void {
    // Drop the index
    db.exec("DROP INDEX IF EXISTS idx_memories_last_refreshed");

    // Note: SQLite < 3.35 can't DROP COLUMN; columns remain but are ignored
    // For SQLite 3.35+, you could use:
    // ALTER TABLE memories DROP COLUMN decay_rate;
    // ALTER TABLE memories DROP COLUMN last_refreshed_at;
    // ALTER TABLE memories DROP COLUMN confidence_floor;
    // ALTER TABLE memories DROP COLUMN decay_function;
    // But for compatibility, we leave columns in place - they will be ignored
  },
};
