/**
 * SCIP-based Code Scanner
 * Uses SCIP indexers for compiler-accurate code analysis
 */

import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import type { CodeGraphStorage } from "@/database/code-graph";
import type { EmbeddingClient } from "@/embeddings/provider";
import {
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_INCLUDE_PATTERNS,
  discoverFiles,
} from "@/utils";
import type { VectorStore } from "@/vectors/interface";
import { mapScipToCodeGraph, runScipTypeScript } from "./scip";
import type { CodeNode, IncrementalScanResult, ScanStats } from "./types";

export interface ScipScannerOptions {
  projectPath: string;
  codeGraph: CodeGraphStorage;
  vectorStore?: VectorStore;
  embeddings?: EmbeddingClient;
}

/**
 * Scanner that uses SCIP for code analysis
 */
export class ScipScanner {
  private static readonly EMBEDDING_BATCH_SIZE = 32;
  private pendingEmbeddings: Array<{
    node: CodeNode;
    filePath: string;
  }> = [];

  constructor(private options: ScipScannerOptions) {}

  /**
   * Perform a full scan using SCIP
   */
  async scanFull(): Promise<IncrementalScanResult> {
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

    // Run SCIP indexer
    console.log("[scip-scanner] Running SCIP TypeScript indexer...");
    const scipResult = await runScipTypeScript({
      projectPath: this.options.projectPath,
    });

    if (!scipResult.success || !scipResult.indexPath) {
      console.error("[scip-scanner] SCIP indexer failed:", scipResult.error);
      return { changes: [], stats };
    }

    console.log(`[scip-scanner] SCIP completed in ${scipResult.duration}ms`);

    // Parse SCIP output to CodeNode/CodeEdge
    console.log("[scip-scanner] Mapping SCIP output to code graph...");
    const graph = mapScipToCodeGraph({
      projectRoot: this.options.projectPath,
      indexPath: scipResult.indexPath,
    });
    const supplementalNodes = await this.buildSupplementalFileNodes(
      graph.nodes,
    );
    if (supplementalNodes.length > 0) {
      graph.nodes.push(...supplementalNodes);
      graph.stats.nodesByType.module += supplementalNodes.length;
      console.log(
        `[scip-scanner] Added ${supplementalNodes.length} supplemental module nodes for files without SCIP symbols`,
      );
    }

    console.log(
      `[scip-scanner] Found ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
    );
    console.log("[scip-scanner] Node types:", graph.stats.nodesByType);

    // Note: For incremental updates in future, we'd track file hashes
    // For now, full scan adds/updates existing nodes

    // Insert nodes
    console.log("[scip-scanner] Inserting nodes...");
    for (const node of graph.nodes) {
      await this.options.codeGraph.upsertNode(node);
      stats.nodesAdded++;

      // Queue embeddings for functions and classes
      if (
        this.options.vectorStore &&
        this.options.embeddings &&
        (node.type === "function" || node.type === "class")
      ) {
        this.pendingEmbeddings.push({ node, filePath: node.filePath });

        if (this.pendingEmbeddings.length >= ScipScanner.EMBEDDING_BATCH_SIZE) {
          await this.flushEmbeddings(stats);
        }
      }
    }

    // Flush remaining embeddings
    if (this.pendingEmbeddings.length > 0) {
      await this.flushEmbeddings(stats);
    }

    // Insert edges
    console.log("[scip-scanner] Inserting edges...");
    for (const edge of graph.edges) {
      await this.options.codeGraph.upsertEdge(edge);
      stats.edgesAdded++;
    }

    // Track files scanned
    const uniqueFiles = new Set(graph.nodes.map((n) => n.filePath));
    stats.filesScanned = uniqueFiles.size;

    console.log(
      `[scip-scanner] Scan complete: ${stats.nodesAdded} nodes, ${stats.edgesAdded} edges from ${stats.filesScanned} files`,
    );

    return { changes: [], stats };
  }

  /**
   * Flush pending embeddings in a batch
   */
  private async flushEmbeddings(stats: ScanStats): Promise<void> {
    if (
      !this.options.vectorStore ||
      !this.options.embeddings ||
      this.pendingEmbeddings.length === 0
    ) {
      return;
    }

    console.log(
      `[scip-scanner] Flushing ${this.pendingEmbeddings.length} embeddings`,
    );

    try {
      const batch = this.pendingEmbeddings;

      // Generate embedding texts
      const embeddingTexts = batch.map(({ node }) => {
        return [node.name, node.signature || "", node.summary || ""]
          .filter(Boolean)
          .join("\n");
      });

      let vectors: number[][] = [];
      try {
        vectors = await this.options.embeddings.embedBatch(embeddingTexts);
      } catch (error) {
        console.warn(
          "[scip-scanner] Batch embedding failed, falling back to per-item:",
          error,
        );
        vectors = await Promise.all(
          embeddingTexts.map(async (text, index) => {
            try {
              return await this.options.embeddings.embed(text);
            } catch (itemError) {
              const nodeId = batch[index]?.node.id ?? `index_${index}`;
              console.warn(
                `[scip-scanner] Failed to embed node ${nodeId}:`,
                itemError,
              );
              return [];
            }
          }),
        );
      }

      // Upsert all vectors
      for (let i = 0; i < batch.length; i++) {
        const { node, filePath } = batch[i];
        const vector = vectors[i];
        if (!vector || vector.length === 0) {
          continue;
        }

        const payload = {
          memoryId: node.id,
          type: node.type,
          title: node.name,
          tags: [node.type],
          relatedFiles: [filePath],
          importance:
            node.type === "function" || node.type === "class" ? 0.7 : 0.5,
          signature: node.signature,
          startLine: node.startLine,
          endLine: node.endLine,
        };

        const vectorId = this.generateVectorId(filePath, node.name);
        await this.options.vectorStore.upsert(vectorId, vector, payload);
        stats.embeddingsRegenerated++;
      }

      this.pendingEmbeddings = [];
    } catch (error) {
      console.warn("[scip-scanner] Failed to flush embeddings:", error);
      this.pendingEmbeddings = [];
    }
  }

  /**
   * Generate deterministic vector ID
   */
  private generateVectorId(filePath: string, nodeName: string): string {
    const hash = createHash("sha256")
      .update(`${filePath}:${nodeName}`)
      .digest("hex")
      .slice(0, 16);
    return `code_${hash}`;
  }

  private async buildSupplementalFileNodes(
    existingNodes: CodeNode[],
  ): Promise<CodeNode[]> {
    const include = [
      ...DEFAULT_INCLUDE_PATTERNS,
      "**/*.sql",
      "**/.env",
      "**/.env.*",
    ];
    const exclude = [...DEFAULT_EXCLUDE_PATTERNS].filter(
      (pattern) =>
        pattern !== "**/.env" &&
        pattern !== "**/.env.*" &&
        pattern !== "**/.envrc",
    );
    const discoveredFiles = await discoverFiles({
      cwd: this.options.projectPath,
      include,
      exclude,
    });
    const existingFilePaths = new Set(
      existingNodes.map((node) => node.filePath),
    );
    const now = Date.now();
    const supplementalNodes: CodeNode[] = [];

    for (const filePath of discoveredFiles) {
      if (existingFilePaths.has(filePath)) {
        continue;
      }

      const fileName = basename(filePath);
      supplementalNodes.push({
        id: `${filePath}:module:${fileName}`,
        type: "module",
        name: fileName,
        filePath,
        summary: `File module for ${fileName}`,
        metadata: {
          source: "supplemental-file-index",
          extension: extname(fileName).replace(/^\./, "").toLowerCase(),
        },
        createdAt: now,
        updatedAt: now,
      });
    }

    return supplementalNodes;
  }
}

/**
 * Helper to create a SCIP scanner and run a full scan
 */
export async function runScipScan(
  projectPath: string,
  codeGraph: CodeGraphStorage,
  vectorStore?: VectorStore,
  embeddings?: EmbeddingClient,
): Promise<IncrementalScanResult> {
  const scanner = new ScipScanner({
    projectPath,
    codeGraph,
    vectorStore,
    embeddings,
  });
  return scanner.scanFull();
}
