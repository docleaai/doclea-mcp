import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

/**
 * Types of relationships between memories
 */
export type MemoryRelationType =
	| "references" // Generic reference
	| "implements" // Implementation of a pattern/decision
	| "extends" // Extends/builds upon
	| "related_to" // Loosely related
	| "supersedes" // Replaces/updates
	| "requires"; // Dependency relationship

/**
 * Memory relationship with metadata
 */
export interface MemoryRelation {
	id: string;
	sourceId: string;
	targetId: string;
	type: MemoryRelationType;
	weight: number; // 0-1 strength of relationship
	metadata?: Record<string, any>;
	createdAt: number;
}

/**
 * Graph traversal result
 */
export interface MemoryGraph {
	nodes: Array<{ id: string; depth: number }>;
	edges: MemoryRelation[];
}

/**
 * Storage layer for memory relationships
 */
export class MemoryRelationStorage {
	constructor(private db: Database) {}

	/**
	 * Create a relationship between two memories
	 */
	async createRelation(
		sourceId: string,
		targetId: string,
		type: MemoryRelationType,
		weight = 1.0,
		metadata?: Record<string, any>,
	): Promise<MemoryRelation> {
		const id = randomUUID();
		const createdAt = Date.now();

		const stmt = this.db.prepare(`
      INSERT INTO memory_relations (id, source_id, target_id, type, weight, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id, target_id, type) DO UPDATE SET
        weight = excluded.weight,
        metadata = excluded.metadata
      RETURNING *
    `);

		const result = stmt.get(
			id,
			sourceId,
			targetId,
			type,
			weight,
			metadata ? JSON.stringify(metadata) : null,
			createdAt,
		) as any;

		return this.mapRow(result);
	}

	/**
	 * Get a specific relationship
	 */
	async getRelation(id: string): Promise<MemoryRelation | null> {
		const stmt = this.db.prepare(
			"SELECT * FROM memory_relations WHERE id = ?",
		);
		const result = stmt.get(id) as any;
		return result ? this.mapRow(result) : null;
	}

	/**
	 * Get all relationships from a source memory
	 */
	async getRelationsFrom(
		sourceId: string,
		type?: MemoryRelationType,
	): Promise<MemoryRelation[]> {
		let query = "SELECT * FROM memory_relations WHERE source_id = ?";
		const params: any[] = [sourceId];

		if (type) {
			query += " AND type = ?";
			params.push(type);
		}

		query += " ORDER BY weight DESC";

		const stmt = this.db.prepare(query);
		const results = stmt.all(...params) as any[];
		return results.map((r) => this.mapRow(r));
	}

	/**
	 * Get all relationships to a target memory
	 */
	async getRelationsTo(
		targetId: string,
		type?: MemoryRelationType,
	): Promise<MemoryRelation[]> {
		let query = "SELECT * FROM memory_relations WHERE target_id = ?";
		const params: any[] = [targetId];

		if (type) {
			query += " AND type = ?";
			params.push(type);
		}

		query += " ORDER BY weight DESC";

		const stmt = this.db.prepare(query);
		const results = stmt.all(...params) as any[];
		return results.map((r) => this.mapRow(r));
	}

	/**
	 * Get all relationships (both from and to) for a memory
	 */
	async getAllRelations(
		memoryId: string,
		type?: MemoryRelationType,
	): Promise<{ outgoing: MemoryRelation[]; incoming: MemoryRelation[] }> {
		const outgoing = await this.getRelationsFrom(memoryId, type);
		const incoming = await this.getRelationsTo(memoryId, type);
		return { outgoing, incoming };
	}

	/**
	 * Delete a relationship
	 */
	async deleteRelation(id: string): Promise<boolean> {
		const stmt = this.db.prepare("DELETE FROM memory_relations WHERE id = ?");
		const result = stmt.run(id);
		return result.changes > 0;
	}

	/**
	 * Check if a relation exists between two memories (in either direction)
	 * Used by relation detection to avoid duplicate suggestions
	 */
	async relationExists(sourceId: string, targetId: string): Promise<boolean> {
		const stmt = this.db.prepare(`
			SELECT 1 FROM memory_relations
			WHERE (source_id = ? AND target_id = ?)
			   OR (source_id = ? AND target_id = ?)
			LIMIT 1
		`);
		const result = stmt.get(sourceId, targetId, targetId, sourceId);
		return !!result;
	}

	/**
	 * Delete all relationships for a memory (cascade helper)
	 */
	async deleteAllRelations(memoryId: string): Promise<number> {
		const stmt = this.db.prepare(
			"DELETE FROM memory_relations WHERE source_id = ? OR target_id = ?",
		);
		const result = stmt.run(memoryId, memoryId);
		return result.changes;
	}

	/**
	 * Update relationship weight
	 */
	async updateWeight(id: string, weight: number): Promise<boolean> {
		const stmt = this.db.prepare(
			"UPDATE memory_relations SET weight = ? WHERE id = ?",
		);
		const result = stmt.run(weight, id);
		return result.changes > 0;
	}

	/**
	 * Traverse memory graph from a starting node
	 * Returns all connected memories up to specified depth
	 */
	async traverseGraph(
		startId: string,
		maxDepth = 3,
		relationTypes?: MemoryRelationType[],
	): Promise<MemoryGraph> {
		const visited = new Set<string>();
		const nodes: Array<{ id: string; depth: number }> = [];
		const edges: MemoryRelation[] = [];

		const queue: Array<{ id: string; depth: number }> = [
			{ id: startId, depth: 0 },
		];
		visited.add(startId);
		nodes.push({ id: startId, depth: 0 });

		while (queue.length > 0) {
			const current = queue.shift()!;

			if (current.depth >= maxDepth) continue;

			// Get outgoing relations
			const outgoing = await this.getRelationsFrom(current.id);
			for (const relation of outgoing) {
				// Filter by type if specified
				if (relationTypes && !relationTypes.includes(relation.type)) {
					continue;
				}

				edges.push(relation);

				if (!visited.has(relation.targetId)) {
					visited.add(relation.targetId);
					nodes.push({ id: relation.targetId, depth: current.depth + 1 });
					queue.push({ id: relation.targetId, depth: current.depth + 1 });
				}
			}

			// Get incoming relations (bidirectional)
			const incoming = await this.getRelationsTo(current.id);
			for (const relation of incoming) {
				// Filter by type if specified
				if (relationTypes && !relationTypes.includes(relation.type)) {
					continue;
				}

				edges.push(relation);

				if (!visited.has(relation.sourceId)) {
					visited.add(relation.sourceId);
					nodes.push({ id: relation.sourceId, depth: current.depth + 1 });
					queue.push({ id: relation.sourceId, depth: current.depth + 1 });
				}
			}
		}

		return { nodes, edges };
	}

	/**
	 * Find shortest path between two memories
	 */
	async findPath(
		sourceId: string,
		targetId: string,
		maxDepth = 5,
	): Promise<string[] | null> {
		const visited = new Set<string>();
		const parent = new Map<string, string>();
		const queue: string[] = [sourceId];
		visited.add(sourceId);

		while (queue.length > 0) {
			const current = queue.shift()!;

			if (current === targetId) {
				// Reconstruct path
				const path: string[] = [];
				let node = targetId;
				while (node !== sourceId) {
					path.unshift(node);
					node = parent.get(node)!;
				}
				path.unshift(sourceId);
				return path;
			}

			// Check depth limit
			const depth = this.getDepth(sourceId, current, parent);
			if (depth >= maxDepth) continue;

			// Explore neighbors
			const outgoing = await this.getRelationsFrom(current);
			for (const relation of outgoing) {
				if (!visited.has(relation.targetId)) {
					visited.add(relation.targetId);
					parent.set(relation.targetId, current);
					queue.push(relation.targetId);
				}
			}
		}

		return null; // No path found
	}

	/**
	 * Get related memories with their details
	 */
	async getRelatedMemories(
		memoryId: string,
		depth = 2,
		relationTypes?: MemoryRelationType[],
	): Promise<
		Array<{
			memoryId: string;
			depth: number;
			relationPath: MemoryRelationType[];
		}>
	> {
		const graph = await this.traverseGraph(memoryId, depth, relationTypes);

		// Build result with relation paths
		const results: Array<{
			memoryId: string;
			depth: number;
			relationPath: MemoryRelationType[];
		}> = [];

		for (const node of graph.nodes) {
			if (node.id === memoryId) continue;

			// Find path to this node
			const path = await this.findPath(memoryId, node.id, depth);
			if (path) {
				const relationPath = this.getRelationTypesInPath(path, graph.edges);
				results.push({
					memoryId: node.id,
					depth: node.depth,
					relationPath,
				});
			}
		}

		return results;
	}

	/**
	 * Helper: Calculate depth from parent map
	 */
	private getDepth(
		start: string,
		current: string,
		parent: Map<string, string>,
	): number {
		let depth = 0;
		let node = current;
		while (node !== start && parent.has(node)) {
			depth++;
			node = parent.get(node)!;
		}
		return depth;
	}

	/**
	 * Helper: Get relation types in a path
	 */
	private getRelationTypesInPath(
		path: string[],
		edges: MemoryRelation[],
	): MemoryRelationType[] {
		const types: MemoryRelationType[] = [];
		for (let i = 0; i < path.length - 1; i++) {
			const edge = edges.find(
				(e) => e.sourceId === path[i] && e.targetId === path[i + 1],
			);
			if (edge) {
				types.push(edge.type);
			}
		}
		return types;
	}

	/**
	 * Helper: Map database row to MemoryRelation
	 */
	private mapRow(row: any): MemoryRelation {
		return {
			id: row.id,
			sourceId: row.source_id,
			targetId: row.target_id,
			type: row.type,
			weight: row.weight,
			metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
			createdAt: row.created_at,
		};
	}
}