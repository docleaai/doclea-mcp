import { readFileSync } from "node:fs";
import type { CodeChunk } from "../../chunking/code";
import { chunkCode } from "../../chunking/code";
import type { CodeGraphStorage } from "../../database/code-graph";
import type { ChangeDetector } from "./change-detector";
import { GraphExtractor } from "./graph-extractor";
import type { CodeSummarizer } from "./summarizer";
import type {
	CodeNode,
	FileChange,
	IncrementalScanResult,
	ScanOptions,
	ScanStats,
} from "./types";

/**
 * Incremental code scanner that updates both RAG and KAG layers
 */
export class IncrementalScanner {
	private graphExtractor: GraphExtractor;

	constructor(
		private changeDetector: ChangeDetector,
		private codeGraph: CodeGraphStorage,
		private summarizer?: CodeSummarizer,
	) {
		this.graphExtractor = new GraphExtractor();
	}

	/**
	 * Scan incrementally, only processing changed files
	 */
	async scanIncremental(
		files: Array<{ path: string; content: string }>,
		options: ScanOptions = {},
	): Promise<IncrementalScanResult> {
		// 1. Detect changes
		const changes = await this.changeDetector.detectChanges(files);

		console.log(`Detected ${changes.length} changes:`, {
			added: changes.filter((c) => c.type === "added").length,
			modified: changes.filter((c) => c.type === "modified").length,
			deleted: changes.filter((c) => c.type === "deleted").length,
		});

		// 2. Initialize stats
		const stats: ScanStats = {
			filesScanned: 0,
			nodesAdded: 0,
			nodesUpdated: 0,
			nodesDeleted: 0,
			edgesAdded: 0,
			edgesDeleted: 0,
			documentsUpdated: 0,
			embeddingsRegenerated: 0,
		};

		// 3. Process each change type
		for (const change of changes.filter((c) => c.type === "added")) {
			await this.processAddedFile(change, files, stats);
		}

		for (const change of changes.filter((c) => c.type === "modified")) {
			await this.processModifiedFile(change, files, stats);
		}

		for (const change of changes.filter((c) => c.type === "deleted")) {
			await this.processDeletedFile(change, stats);
		}

		// 4. Update hashes
		await this.changeDetector.updateHashes(changes);

		return { changes, stats };
	}

	/**
	 * Process a newly added file
	 */
	private async processAddedFile(
		change: FileChange,
		allFiles: Array<{ path: string; content: string }>,
		stats: ScanStats,
	): Promise<void> {
		const file = allFiles.find((f) => f.path === change.path);
		if (!file) return;

		try {
			// Chunk the file
			const chunks = await this.chunkFile(file.path, file.content);

			// Process each chunk
			for (const chunk of chunks) {
				await this.processChunk(chunk, file.path, stats, "add");
			}

			stats.filesScanned++;
		} catch (error) {
			console.warn(`Failed to process added file ${file.path}:`, error);
		}
	}

	/**
	 * Process a modified file
	 */
	private async processModifiedFile(
		change: FileChange,
		allFiles: Array<{ path: string; content: string }>,
		stats: ScanStats,
	): Promise<void> {
		// 1. Delete old data for this file
		await this.deleteFileData(change.path, stats);

		// 2. Re-add with new content
		await this.processAddedFile(change, allFiles, stats);
	}

	/**
	 * Process a deleted file
	 */
	private async processDeletedFile(
		change: FileChange,
		stats: ScanStats,
	): Promise<void> {
		await this.deleteFileData(change.path, stats);
	}

	/**
	 * Delete all data (RAG + KAG) for a file
	 */
	private async deleteFileData(
		filePath: string,
		stats: ScanStats,
	): Promise<void> {
		// KAG: Delete nodes from this file
		const nodes = await this.codeGraph.getNodesByPath(filePath);

		for (const node of nodes) {
			// Delete edges connected to this node
			const edgesDeleted = await this.codeGraph.deleteEdgesByNode(node.id);
			stats.edgesDeleted += edgesDeleted;

			// Delete the node
			await this.codeGraph.deleteNode(node.id);
			stats.nodesDeleted++;
		}

		// RAG: Would delete documents here
		// For now we're focusing on KAG implementation
		// stats.documentsUpdated += deletedDocs;
	}

	/**
	 * Process a single code chunk
	 */
	private async processChunk(
		chunk: CodeChunk,
		filePath: string,
		stats: ScanStats,
		mode: "add" | "update",
	): Promise<void> {
		// 1. Generate summary if configured
		let summary: string | undefined;
		if (this.summarizer) {
			try {
				const summaryResult = await this.summarizer.summarize(chunk);
				summary = summaryResult.summary;
			} catch (error) {
				console.warn("Failed to generate summary:", error);
			}
		}

		// 2. Extract graph data (nodes + edges)
		const { nodes, edges } = await this.graphExtractor.extractFromChunk(
			chunk,
			filePath,
		);

		// 3. Add summary to nodes
		for (const node of nodes) {
			if (summary) {
				node.summary = summary;
			}

			// KAG: Upsert node
			await this.codeGraph.upsertNode(node);

			if (mode === "add") {
				stats.nodesAdded++;
			} else {
				stats.nodesUpdated++;
			}
		}

		// 4. Upsert edges
		for (const edge of edges) {
			await this.codeGraph.upsertEdge(edge);
			stats.edgesAdded++;
		}

		// RAG: Would add to vector store here
		// stats.documentsUpdated++;
		// stats.embeddingsRegenerated++;
	}

	/**
	 * Chunk a file into code chunks
	 */
	private async chunkFile(
		filePath: string,
		content: string,
	): Promise<CodeChunk[]> {
		// Detect language from file extension
		const ext = filePath.split(".").pop()?.toLowerCase();
		if (!ext) return [];

		const languageMap: Record<string, any> = {
			ts: "typescript",
			tsx: "tsx",
			js: "javascript",
			jsx: "jsx",
			py: "python",
			go: "go",
			rs: "rust",
		};

		const language = languageMap[ext];
		if (!language) {
			console.warn(`Unsupported file extension: ${ext}`);
			return [];
		}

		try {
			return await chunkCode(content, {
				language,
				maxTokens: 512,
				includeImports: false,
				splitLargeFunctions: true,
			});
		} catch (error) {
			console.warn(`Failed to chunk file ${filePath}:`, error);
			return [];
		}
	}
}