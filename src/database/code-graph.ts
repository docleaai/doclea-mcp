import type { Database } from "bun:sqlite";
import type {
	CallGraphResult,
	CodeEdge,
	CodeEdgeType,
	CodeNode,
	CodeNodeType,
	FileHash,
} from "../tools/code/types";

export class CodeGraphStorage {
	constructor(private db: Database) {}

	// ============================================================================
	// Node Operations
	// ============================================================================

	async upsertNode(node: CodeNode): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		this.db
			.query(
				`INSERT INTO code_nodes (id, type, name, file_path, start_line, end_line, signature, summary, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         type = excluded.type,
         name = excluded.name,
         file_path = excluded.file_path,
         start_line = excluded.start_line,
         end_line = excluded.end_line,
         signature = excluded.signature,
         summary = excluded.summary,
         metadata = excluded.metadata,
         updated_at = excluded.updated_at`,
			)
			.run(
				node.id,
				node.type,
				node.name,
				node.filePath,
				node.startLine ?? null,
				node.endLine ?? null,
				node.signature ?? null,
				node.summary ?? null,
				JSON.stringify(node.metadata),
				node.createdAt ?? now,
				now,
			);
	}

	async getNode(id: string): Promise<CodeNode | null> {
		const row = this.db
			.query("SELECT * FROM code_nodes WHERE id = ?")
			.get(id) as any;
		return row ? this.rowToNode(row) : null;
	}

	async findNodeByName(
		name: string,
		type?: CodeNodeType,
	): Promise<CodeNode | null> {
		const query = type
			? "SELECT * FROM code_nodes WHERE name = ? AND type = ? LIMIT 1"
			: "SELECT * FROM code_nodes WHERE name = ? LIMIT 1";
		const params = type ? [name, type] : [name];
		const row = this.db.query(query).get(...params) as any;
		return row ? this.rowToNode(row) : null;
	}

	async getNodesByPath(filePath: string): Promise<CodeNode[]> {
		const rows = this.db
			.query("SELECT * FROM code_nodes WHERE file_path = ?")
			.all(filePath) as any[];
		return rows.map((row) => this.rowToNode(row));
	}

	async getNodesByType(type: CodeNodeType): Promise<CodeNode[]> {
		const rows = this.db
			.query("SELECT * FROM code_nodes WHERE type = ?")
			.all(type) as any[];
		return rows.map((row) => this.rowToNode(row));
	}

	async deleteNode(id: string): Promise<void> {
		this.db.query("DELETE FROM code_nodes WHERE id = ?").run(id);
	}

	async deleteNodesByPath(filePath: string): Promise<number> {
		const result = this.db
			.query("DELETE FROM code_nodes WHERE file_path = ?")
			.run(filePath);
		return result.changes;
	}

	// ============================================================================
	// Edge Operations
	// ============================================================================

	async upsertEdge(edge: CodeEdge): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		this.db
			.query(
				`INSERT INTO code_edges (id, from_node, to_node, edge_type, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(from_node, to_node, edge_type) DO UPDATE SET
         metadata = excluded.metadata`,
			)
			.run(
				edge.id,
				edge.fromNode,
				edge.toNode,
				edge.edgeType,
				edge.metadata ? JSON.stringify(edge.metadata) : null,
				edge.createdAt ?? now,
			);
	}

	async getEdge(id: string): Promise<CodeEdge | null> {
		const row = this.db
			.query("SELECT * FROM code_edges WHERE id = ?")
			.get(id) as any;
		return row ? this.rowToEdge(row) : null;
	}

	async getEdgesFrom(
		nodeId: string,
		edgeType?: CodeEdgeType,
	): Promise<CodeEdge[]> {
		const query = edgeType
			? "SELECT * FROM code_edges WHERE from_node = ? AND edge_type = ?"
			: "SELECT * FROM code_edges WHERE from_node = ?";
		const params = edgeType ? [nodeId, edgeType] : [nodeId];
		const rows = this.db.query(query).all(...params) as any[];
		return rows.map((row) => this.rowToEdge(row));
	}

	async getEdgesTo(
		nodeId: string,
		edgeType?: CodeEdgeType,
	): Promise<CodeEdge[]> {
		const query = edgeType
			? "SELECT * FROM code_edges WHERE to_node = ? AND edge_type = ?"
			: "SELECT * FROM code_edges WHERE to_node = ?";
		const params = edgeType ? [nodeId, edgeType] : [nodeId];
		const rows = this.db.query(query).all(...params) as any[];
		return rows.map((row) => this.rowToEdge(row));
	}

	async getConnectedEdges(nodeId: string): Promise<CodeEdge[]> {
		const rows = this.db
			.query(
				"SELECT * FROM code_edges WHERE from_node = ? OR to_node = ?",
			)
			.all(nodeId, nodeId) as any[];
		return rows.map((row) => this.rowToEdge(row));
	}

	async deleteEdge(id: string): Promise<void> {
		this.db.query("DELETE FROM code_edges WHERE id = ?").run(id);
	}

	async deleteEdgesByNode(nodeId: string): Promise<number> {
		const result = this.db
			.query("DELETE FROM code_edges WHERE from_node = ? OR to_node = ?")
			.run(nodeId, nodeId);
		return result.changes;
	}

	// ============================================================================
	// Graph Queries
	// ============================================================================

	async getCallGraph(
		functionId: string,
		depth: number = 2,
	): Promise<CallGraphResult> {
		const visited = new Set<string>();
		const nodes: CodeNode[] = [];
		const edges: CodeEdge[] = [];
		const queue: Array<{ id: string; currentDepth: number }> = [
			{ id: functionId, currentDepth: 0 },
		];

		while (queue.length > 0) {
			const { id, currentDepth } = queue.shift()!;

			if (visited.has(id) || currentDepth > depth) continue;
			visited.add(id);

			// Get node
			const node = await this.getNode(id);
			if (node) nodes.push(node);

			// Get outgoing 'calls' edges
			const outgoing = await this.getEdgesFrom(id, "calls");
			edges.push(...outgoing);

			for (const edge of outgoing) {
				queue.push({ id: edge.toNode, currentDepth: currentDepth + 1 });
			}
		}

		return { nodes, edges };
	}

	async findImplementations(interfaceId: string): Promise<CodeNode[]> {
		const rows = this.db
			.query(
				`SELECT n.* FROM code_nodes n
         JOIN code_edges e ON e.from_node = n.id
         WHERE e.to_node = ? AND e.edge_type = 'implements'`,
			)
			.all(interfaceId) as any[];
		return rows.map((row) => this.rowToNode(row));
	}

	async whoImports(moduleId: string): Promise<CodeNode[]> {
		const rows = this.db
			.query(
				`SELECT n.* FROM code_nodes n
         JOIN code_edges e ON e.from_node = n.id
         WHERE e.to_node = ? AND e.edge_type = 'imports'`,
			)
			.all(moduleId) as any[];
		return rows.map((row) => this.rowToNode(row));
	}

	async getDependencyTree(
		moduleId: string,
		depth: number = 3,
	): Promise<CallGraphResult> {
		const visited = new Set<string>();
		const nodes: CodeNode[] = [];
		const edges: CodeEdge[] = [];
		const queue: Array<{ id: string; currentDepth: number }> = [
			{ id: moduleId, currentDepth: 0 },
		];

		while (queue.length > 0) {
			const { id, currentDepth } = queue.shift()!;

			if (visited.has(id) || currentDepth > depth) continue;
			visited.add(id);

			// Get node
			const node = await this.getNode(id);
			if (node) nodes.push(node);

			// Get outgoing 'imports' edges
			const outgoing = await this.getEdgesFrom(id, "imports");
			edges.push(...outgoing);

			for (const edge of outgoing) {
				queue.push({ id: edge.toNode, currentDepth: currentDepth + 1 });
			}
		}

		return { nodes, edges };
	}

	// ============================================================================
	// File Hash Operations
	// ============================================================================

	async getFileHash(path: string): Promise<FileHash | null> {
		const row = this.db
			.query("SELECT * FROM file_hashes WHERE path = ?")
			.get(path) as any;
		if (!row) return null;
		return {
			path: row.path,
			hash: row.hash,
			updatedAt: row.updated_at,
		};
	}

	async getAllFilePaths(): Promise<string[]> {
		const rows = this.db.query("SELECT path FROM file_hashes").all() as any[];
		return rows.map((row) => row.path);
	}

	async upsertFileHash(hash: FileHash): Promise<void> {
		this.db
			.query(
				`INSERT INTO file_hashes (path, hash, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         hash = excluded.hash,
         updated_at = excluded.updated_at`,
			)
			.run(hash.path, hash.hash, hash.updatedAt);
	}

	async deleteFileHash(path: string): Promise<void> {
		this.db.query("DELETE FROM file_hashes WHERE path = ?").run(path);
	}

	// ============================================================================
	// Statistics
	// ============================================================================

	async getStats(): Promise<{
		totalNodes: number;
		totalEdges: number;
		nodesByType: Record<string, number>;
		edgesByType: Record<string, number>;
	}> {
		const totalNodes = (
			this.db.query("SELECT COUNT(*) as count FROM code_nodes").get() as any
		).count;
		const totalEdges = (
			this.db.query("SELECT COUNT(*) as count FROM code_edges").get() as any
		).count;

		const nodeTypeRows = this.db
			.query("SELECT type, COUNT(*) as count FROM code_nodes GROUP BY type")
			.all() as any[];
		const nodesByType: Record<string, number> = {};
		for (const row of nodeTypeRows) {
			nodesByType[row.type] = row.count;
		}

		const edgeTypeRows = this.db
			.query(
				"SELECT edge_type, COUNT(*) as count FROM code_edges GROUP BY edge_type",
			)
			.all() as any[];
		const edgesByType: Record<string, number> = {};
		for (const row of edgeTypeRows) {
			edgesByType[row.edge_type] = row.count;
		}

		return { totalNodes, totalEdges, nodesByType, edgesByType };
	}

	// ============================================================================
	// Helper Methods
	// ============================================================================

	private rowToNode(row: any): CodeNode {
		return {
			id: row.id,
			type: row.type,
			name: row.name,
			filePath: row.file_path,
			startLine: row.start_line,
			endLine: row.end_line,
			signature: row.signature,
			summary: row.summary,
			metadata: JSON.parse(row.metadata || "{}"),
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	private rowToEdge(row: any): CodeEdge {
		return {
			id: row.id,
			fromNode: row.from_node,
			toNode: row.to_node,
			edgeType: row.edge_type,
			metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
			createdAt: row.created_at,
		};
	}
}