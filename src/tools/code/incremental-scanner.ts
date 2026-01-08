import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { CodeChunk } from "../../chunking/code";
import { chunkCode } from "../../chunking/code";
import type { CodeGraphStorage } from "../../database/code-graph";
import type { EmbeddingClient } from "../../embeddings/provider";
import type { VectorPayload, VectorStore } from "../../vectors/interface";
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

        // RAG: Create embedding for function/class nodes
        if (
          this.vectorStore &&
          this.embeddings &&
          (node.type === "function" || node.type === "class")
        ) {
          try {
            // Find the corresponding chunk for this node (match by name, fallback to first matching type)
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
              await this.createCodeEmbedding(node, chunk, file.path);
              stats.documentsUpdated++;
              stats.embeddingsRegenerated++;
            }
          } catch (error) {
            console.warn(`Failed to create embedding for ${node.name}:`, error);
          }
        }
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
   * Create embedding for a code node and store in vector store
   */
  private async createCodeEmbedding(
    node: CodeNode,
    chunk: CodeChunk,
    filePath: string,
  ): Promise<void> {
    if (!this.vectorStore || !this.embeddings) return;

    // Generate embedding text: name + signature + summary + code snippet
    const codeSnippet = chunk.content.slice(0, 500); // First 500 chars of code
    const embeddingText = [
      node.name,
      node.signature || "",
      node.summary || "",
      codeSnippet,
    ]
      .filter(Boolean)
      .join("\n");

    // Generate embedding
    const vector = await this.embeddings.embed(embeddingText);

    // Create vector payload
    const payload: VectorPayload = {
      memoryId: node.id,
      type: node.type,
      title: node.name,
      tags: [
        chunk.metadata.language,
        ...(node.metadata?.isExported ? ["exported"] : []),
      ],
      relatedFiles: [filePath],
      importance: node.type === "function" || node.type === "class" ? 0.7 : 0.5,
      // Additional code-specific metadata
      signature: node.signature,
      startLine: node.startLine,
      endLine: node.endLine,
    };

    // Generate deterministic vector ID
    const vectorId = this.generateVectorId(filePath, node.name);

    // Upsert to vector store
    await this.vectorStore.upsert(vectorId, vector, payload);
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
