/**
 * Storage layer for cross-layer relations (code <-> memory)
 */

import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

/**
 * Cross-layer relation types
 */
export type CrossLayerRelationType = "documents" | "addresses" | "exemplifies";

/**
 * Direction of the cross-layer relation
 */
export type CrossLayerDirection = "memory_to_code" | "code_to_memory";

/**
 * Detection method for cross-layer relations
 */
export type CrossLayerDetectionMethod =
	| "code_reference"
	| "file_path_match"
	| "keyword_match";

/**
 * Cross-layer relation interface
 */
export interface CrossLayerRelation {
	id: string;
	memoryId: string;
	codeNodeId: string;
	relationType: CrossLayerRelationType;
	direction: CrossLayerDirection;
	confidence: number;
	metadata?: {
		matchedReference?: string;
		detectionMethod: CrossLayerDetectionMethod;
		reason: string;
	};
	createdAt: number;
}

/**
 * Database row for cross_layer_relations
 */
interface CrossLayerRelationRow {
	id: string;
	memory_id: string;
	code_node_id: string;
	relation_type: string;
	direction: string;
	confidence: number;
	metadata: string | null;
	created_at: number;
}

/**
 * Input for creating a cross-layer relation
 */
export interface CreateCrossLayerRelationInput {
	memoryId: string;
	codeNodeId: string;
	relationType: CrossLayerRelationType;
	direction: CrossLayerDirection;
	confidence: number;
	metadata?: {
		matchedReference?: string;
		detectionMethod: CrossLayerDetectionMethod;
		reason: string;
	};
}

/**
 * Storage class for cross-layer relations between code and memory
 */
export class CrossLayerRelationStorage {
	constructor(private db: Database) {}

	/**
	 * Create a new cross-layer relation
	 */
	async createRelation(
		input: CreateCrossLayerRelationInput,
	): Promise<CrossLayerRelation> {
		const id = randomUUID();
		const createdAt = Math.floor(Date.now() / 1000);
		const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

		const stmt = this.db.prepare(`
			INSERT INTO cross_layer_relations (
				id, memory_id, code_node_id, relation_type, direction,
				confidence, metadata, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(memory_id, code_node_id, relation_type) DO UPDATE SET
				direction = excluded.direction,
				confidence = excluded.confidence,
				metadata = excluded.metadata,
				created_at = excluded.created_at
			RETURNING *
		`);

		const result = stmt.get(
			id,
			input.memoryId,
			input.codeNodeId,
			input.relationType,
			input.direction,
			input.confidence,
			metadataJson,
			createdAt,
		) as CrossLayerRelationRow;

		return this.mapRow(result);
	}

	/**
	 * Get a relation by ID
	 */
	async getRelation(id: string): Promise<CrossLayerRelation | null> {
		const stmt = this.db.prepare(
			"SELECT * FROM cross_layer_relations WHERE id = ?",
		);
		const result = stmt.get(id) as CrossLayerRelationRow | undefined;
		return result ? this.mapRow(result) : null;
	}

	/**
	 * Get all relations for a memory
	 */
	async getRelationsForMemory(
		memoryId: string,
		type?: CrossLayerRelationType,
	): Promise<CrossLayerRelation[]> {
		let query = "SELECT * FROM cross_layer_relations WHERE memory_id = ?";
		const params: string[] = [memoryId];

		if (type) {
			query += " AND relation_type = ?";
			params.push(type);
		}

		query += " ORDER BY confidence DESC, created_at DESC";

		const stmt = this.db.prepare(query);
		const results = stmt.all(...params) as CrossLayerRelationRow[];
		return results.map((r) => this.mapRow(r));
	}

	/**
	 * Get all relations for a code node
	 */
	async getRelationsForCodeNode(
		codeNodeId: string,
		type?: CrossLayerRelationType,
	): Promise<CrossLayerRelation[]> {
		let query = "SELECT * FROM cross_layer_relations WHERE code_node_id = ?";
		const params: string[] = [codeNodeId];

		if (type) {
			query += " AND relation_type = ?";
			params.push(type);
		}

		query += " ORDER BY confidence DESC, created_at DESC";

		const stmt = this.db.prepare(query);
		const results = stmt.all(...params) as CrossLayerRelationRow[];
		return results.map((r) => this.mapRow(r));
	}

	/**
	 * Check if a relation already exists
	 */
	async relationExists(
		memoryId: string,
		codeNodeId: string,
		type?: CrossLayerRelationType,
	): Promise<boolean> {
		let query = `
			SELECT 1 FROM cross_layer_relations
			WHERE memory_id = ? AND code_node_id = ?
		`;
		const params: string[] = [memoryId, codeNodeId];

		if (type) {
			query += " AND relation_type = ?";
			params.push(type);
		}

		query += " LIMIT 1";

		const stmt = this.db.prepare(query);
		const result = stmt.get(...params);
		return !!result;
	}

	/**
	 * Delete a relation by ID
	 */
	async deleteRelation(id: string): Promise<boolean> {
		const stmt = this.db.prepare(
			"DELETE FROM cross_layer_relations WHERE id = ?",
		);
		const result = stmt.run(id);
		return result.changes > 0;
	}

	/**
	 * Delete all relations for a memory
	 */
	async deleteRelationsForMemory(memoryId: string): Promise<number> {
		const stmt = this.db.prepare(
			"DELETE FROM cross_layer_relations WHERE memory_id = ?",
		);
		const result = stmt.run(memoryId);
		return result.changes;
	}

	/**
	 * Delete all relations for a code node
	 */
	async deleteRelationsForCodeNode(codeNodeId: string): Promise<number> {
		const stmt = this.db.prepare(
			"DELETE FROM cross_layer_relations WHERE code_node_id = ?",
		);
		const result = stmt.run(codeNodeId);
		return result.changes;
	}

	/**
	 * Get all relations by direction
	 */
	async getRelationsByDirection(
		direction: CrossLayerDirection,
		limit = 100,
	): Promise<CrossLayerRelation[]> {
		const stmt = this.db.prepare(`
			SELECT * FROM cross_layer_relations
			WHERE direction = ?
			ORDER BY confidence DESC, created_at DESC
			LIMIT ?
		`);
		const results = stmt.all(direction, limit) as CrossLayerRelationRow[];
		return results.map((r) => this.mapRow(r));
	}

	/**
	 * Get count of relations
	 */
	async getCount(): Promise<number> {
		const stmt = this.db.prepare(
			"SELECT COUNT(*) as count FROM cross_layer_relations",
		);
		const result = stmt.get() as { count: number };
		return result.count;
	}

	/**
	 * Map database row to CrossLayerRelation
	 */
	private mapRow(row: CrossLayerRelationRow): CrossLayerRelation {
		return {
			id: row.id,
			memoryId: row.memory_id,
			codeNodeId: row.code_node_id,
			relationType: row.relation_type as CrossLayerRelationType,
			direction: row.direction as CrossLayerDirection,
			confidence: row.confidence,
			metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
			createdAt: row.created_at,
		};
	}
}
