/**
 * Code graph migration
 *
 * Creates schema for code graph nodes and edges.
 * Enables KAG (Knowledge-Augmented Generation) with code relationships.
 */

import type { Migration, MigrationDatabase } from "./types";

export const migration002CodeGraph: Migration = {
  version: "002",
  name: "code_graph",
  destructive: false,

  up(db: MigrationDatabase): void {
    // Code graph nodes table
    db.exec(`
      CREATE TABLE IF NOT EXISTS code_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER,
        end_line INTEGER,
        signature TEXT,
        summary TEXT,
        metadata TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);

    // Code graph edges table
    db.exec(`
      CREATE TABLE IF NOT EXISTS code_edges (
        id TEXT PRIMARY KEY,
        from_node TEXT NOT NULL REFERENCES code_nodes(id) ON DELETE CASCADE,
        to_node TEXT NOT NULL REFERENCES code_nodes(id) ON DELETE CASCADE,
        edge_type TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(from_node, to_node, edge_type)
      )
    `);

    // File hash tracking for incremental scans
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_hashes (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Indexes for code_nodes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_code_nodes_type ON code_nodes(type)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_code_nodes_file ON code_nodes(file_path)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_code_nodes_name ON code_nodes(name)
    `);

    // Indexes for code_edges
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_code_edges_from ON code_edges(from_node, edge_type)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_code_edges_to ON code_edges(to_node, edge_type)
    `);

    // Index for file_hashes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_file_hashes_updated ON file_hashes(updated_at)
    `);
  },

  down(db: MigrationDatabase): void {
    db.exec("DROP INDEX IF EXISTS idx_file_hashes_updated");
    db.exec("DROP INDEX IF EXISTS idx_code_edges_to");
    db.exec("DROP INDEX IF EXISTS idx_code_edges_from");
    db.exec("DROP INDEX IF EXISTS idx_code_nodes_name");
    db.exec("DROP INDEX IF EXISTS idx_code_nodes_file");
    db.exec("DROP INDEX IF EXISTS idx_code_nodes_type");
    db.exec("DROP TABLE IF EXISTS file_hashes");
    db.exec("DROP TABLE IF EXISTS code_edges");
    db.exec("DROP TABLE IF EXISTS code_nodes");
  },
};
