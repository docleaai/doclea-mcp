/**
 * Cross-layer relations migration
 *
 * Creates schema for storing relationships between code entities (KAG)
 * and memory entities (RAG). Enables cross-layer linking:
 * - documents: memory describes code unit
 * - addresses: code implements decision from memory
 * - exemplifies: code demonstrates pattern from memory
 */

import type { Migration, MigrationDatabase } from "./types";

export const migration005CrossLayerRelations: Migration = {
	version: "005",
	name: "cross_layer_relations",
	destructive: false,

	up(db: MigrationDatabase): void {
		// Create cross_layer_relations table
		db.exec(`
			CREATE TABLE IF NOT EXISTS cross_layer_relations (
				id TEXT PRIMARY KEY,
				memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
				code_node_id TEXT NOT NULL REFERENCES code_nodes(id) ON DELETE CASCADE,
				relation_type TEXT NOT NULL,
				direction TEXT NOT NULL,
				confidence REAL NOT NULL,
				metadata TEXT,
				created_at INTEGER DEFAULT (unixepoch()),
				UNIQUE(memory_id, code_node_id, relation_type)
			)
		`);

		// Create indexes for efficient queries
		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_cross_layer_memory
			ON cross_layer_relations(memory_id)
		`);

		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_cross_layer_code
			ON cross_layer_relations(code_node_id)
		`);

		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_cross_layer_type
			ON cross_layer_relations(relation_type)
		`);

		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_cross_layer_direction
			ON cross_layer_relations(direction)
		`);

		// Create cross_layer_suggestions table for pending suggestions
		db.exec(`
			CREATE TABLE IF NOT EXISTS cross_layer_suggestions (
				id TEXT PRIMARY KEY,
				memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
				code_node_id TEXT NOT NULL REFERENCES code_nodes(id) ON DELETE CASCADE,
				direction TEXT NOT NULL,
				suggested_type TEXT NOT NULL,
				confidence REAL NOT NULL,
				reason TEXT NOT NULL,
				detection_method TEXT NOT NULL,
				status TEXT DEFAULT 'pending',
				created_at INTEGER DEFAULT (unixepoch()),
				reviewed_at INTEGER,
				UNIQUE(memory_id, code_node_id, detection_method)
			)
		`);

		// Create indexes for suggestions
		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_cross_suggestions_status
			ON cross_layer_suggestions(status)
		`);

		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_cross_suggestions_memory
			ON cross_layer_suggestions(memory_id)
		`);

		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_cross_suggestions_code
			ON cross_layer_suggestions(code_node_id)
		`);

		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_cross_suggestions_created
			ON cross_layer_suggestions(created_at)
		`);
	},

	down(db: MigrationDatabase): void {
		db.exec("DROP TABLE IF EXISTS cross_layer_suggestions");
		db.exec("DROP TABLE IF EXISTS cross_layer_relations");
	},
};
