import { createHash } from "node:crypto";
import type { CodeChunk } from "../../chunking/code";
import { chunkCode } from "../../chunking/code";
import type { CodeGraphStorage } from "../../database/code-graph";
import type { EmbeddingClient } from "../../embeddings/provider";
import type { VectorStore } from "../../vectors/interface";
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
    // RAG layer dependencies (optional - scanner works without them for KAG-only mode)
    private vectorStore?: VectorStore,
    private embeddings?: EmbeddingClient,
  ) {
    this.graphExtractor = new GraphExtractor();
  }

  /**
   * Scan incrementally, only processing changed files
   */
  async scanIncremental(
    files: Array<{ path: string; content: string }>,
    _options: ScanOptions = {},
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

    // 4. Flush remaining embeddings
    if (this.pendingEmbeddings.length > 0) {
      await this.flushEmbeddings(stats);
    }

    // 5. Update hashes
    await this.changeDetector.updateHashes(changes);

    return { changes, stats };
  }

  /**
   * Flush pending embeddings in a batch
   */
  private async flushEmbeddings(stats: ScanStats): Promise<void> {
    if (
      !this.vectorStore ||
      !this.embeddings ||
      this.pendingEmbeddings.length === 0
    ) {
      return;
    }

    console.log(
      `[scan] Flushing ${this.pendingEmbeddings.length} embeddings in batch`,
    );

    try {
      // Generate embedding texts
      const embeddingTexts = this.pendingEmbeddings.map(({ node, chunk }) => {
        const codeSnippet = chunk.content.slice(0, 500);
        return [
          node.name,
          node.signature || "",
          node.summary || "",
          codeSnippet,
        ]
          .filter(Boolean)
          .join("\n");
      });

      // Batch embed
      const vectors = await this.embeddings.embedBatch(embeddingTexts);

      // Upsert all vectors
      for (let i = 0; i < this.pendingEmbeddings.length; i++) {
        const { node, chunk, filePath } = this.pendingEmbeddings[i];
        const vector = vectors[i];

        const payload = {
          memoryId: node.id,
          type: node.type,
          title: node.name,
          tags: [
            chunk.metadata.language,
            ...(node.metadata?.isExported ? ["exported"] : []),
          ],
          relatedFiles: [filePath],
          importance:
            node.type === "function" || node.type === "class" ? 0.7 : 0.5,
          signature: node.signature,
          startLine: node.startLine,
          endLine: node.endLine,
        };

        const vectorId = this.generateVectorId(filePath, node.name);
        await this.vectorStore.upsert(vectorId, vector, payload);
        stats.embeddingsRegenerated++;
      }

      // Clear pending
      this.pendingEmbeddings = [];
    } catch (error) {
      console.warn("[scan] Failed to flush embeddings:", error);
      // Clear pending to prevent infinite retry
      this.pendingEmbeddings = [];
    }
  }

  // Pending embeddings for batch processing
  private pendingEmbeddings: Array<{
    node: CodeNode;
    chunk: CodeChunk;
    filePath: string;
  }> = [];

  private static readonly EMBEDDING_BATCH_SIZE = 32;

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

      // Use file-level extraction to get module nodes and import edges
      const { nodes, edges } = await this.graphExtractor.extractFromFile(
        file.path,
        chunks,
        file.content,
      );

      // Generate summaries and upsert nodes
      for (const node of nodes) {
        // Generate summary for function/class nodes
        if (
          this.summarizer &&
          (node.type === "function" || node.type === "class")
        ) {
          try {
            // Find the corresponding chunk for this node
            const chunk = chunks.find(
              (c) =>
                c.metadata.name === node.name &&
                c.metadata.startLine === node.startLine,
            );
            if (chunk) {
              const summaryResult = await this.summarizer.summarize(chunk);
              node.summary = summaryResult.summary;
            }
          } catch (error) {
            console.warn("Failed to generate summary:", error);
          }
        }

        // KAG: Upsert node
        await this.codeGraph.upsertNode(node);
        stats.nodesAdded++;

        // RAG: Queue embedding for batch processing
        if (
          this.vectorStore &&
          this.embeddings &&
          (node.type === "function" || node.type === "class")
        ) {
          // Find the corresponding chunk for this node
          const chunk =
            chunks.find(
              (c) =>
                c.metadata.name === node.name ||
                (c.metadata.isFunction &&
                  node.type === "function" &&
                  c.metadata.name === node.name) ||
                (c.metadata.isClass &&
                  node.type === "class" &&
                  c.metadata.name === node.name),
            ) ||
            chunks.find(
              (c) =>
                (c.metadata.isFunction && node.type === "function") ||
                (c.metadata.isClass && node.type === "class"),
            );
          if (chunk) {
            this.pendingEmbeddings.push({ node, chunk, filePath: file.path });
            stats.documentsUpdated++;
          }
        }
      }

      // Flush embeddings if batch is full
      if (
        this.pendingEmbeddings.length >= IncrementalScanner.EMBEDDING_BATCH_SIZE
      ) {
        await this.flushEmbeddings(stats);
      }

      // Upsert edges
      for (const edge of edges) {
        await this.codeGraph.upsertEdge(edge);
        stats.edgesAdded++;
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
      // RAG: Delete vector embedding for this node
      if (
        this.vectorStore &&
        (node.type === "function" || node.type === "class")
      ) {
        try {
          const vectorId = this.generateVectorId(filePath, node.name);
          const deleted = await this.vectorStore.delete(vectorId);
          if (deleted) {
            stats.embeddingsRegenerated++;
          }
        } catch (error) {
          console.warn(`Failed to delete embedding for ${node.name}:`, error);
        }
      }

      // Delete edges connected to this node
      const edgesDeleted = await this.codeGraph.deleteEdgesByNode(node.id);
      stats.edgesDeleted += edgesDeleted;

      // Delete the node
      await this.codeGraph.deleteNode(node.id);
      stats.nodesDeleted++;
    }
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
      return await chunkCode(content, language, {
        maxTokens: 512,
        includeImports: false,
        splitLargeFunctions: true,
      });
    } catch (error) {
      console.warn(`Failed to chunk file ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Generate deterministic vector ID based on file path and node name
   */
  private generateVectorId(filePath: string, nodeName: string): string {
    const hash = createHash("sha256")
      .update(`${filePath}:${nodeName}`)
      .digest("hex")
      .slice(0, 16);
    return `code_${hash}`;
  }
}
