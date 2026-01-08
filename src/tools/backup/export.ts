/**
 * Export tool for backing up doclea data
 *
 * Exports all memories, documents, chunks, and relations to a portable JSON format.
 * The export is designed to be re-importable across different storage backends.
 */

import { z } from "zod";
import { writeFileSync } from "node:fs";
import type { IStorageBackend } from "@/storage/interface";
import type { StorageExport, MemoryRelation, CrossLayerRelation } from "@/storage/types";
import type { Memory, Document, Chunk, EmbeddingConfig } from "@/types";

export const ExportInputSchema = z.object({
  outputPath: z.string().describe("Path to write the export file"),
  includeRelations: z.boolean().default(true).describe("Include memory and cross-layer relations"),
  includePending: z.boolean().default(true).describe("Include pending memories"),
});

export type ExportInput = z.input<typeof ExportInputSchema>;

export interface ExportResult {
  success: boolean;
  outputPath: string;
  stats: {
    memories: number;
    documents: number;
    chunks: number;
    memoryRelations: number;
    crossLayerRelations: number;
    pendingMemories: number;
  };
  error?: string;
}

/**
 * Export all data from storage to a portable JSON format
 */
export function exportData(
  input: ExportInput,
  storage: IStorageBackend,
  embeddingConfig?: EmbeddingConfig,
): ExportResult {
  try {
    const db = storage.getDatabase();
    const includeRelations = input.includeRelations ?? true;
    const includePending = input.includePending ?? true;

    // Get all memories
    const memories = storage.listMemories();

    // Get all documents
    const documents = getAllDocuments(storage);

    // Get all chunks
    const chunks = getAllChunks(storage);

    // Get relations if requested
    let memoryRelations: MemoryRelation[] = [];
    let crossLayerRelations: CrossLayerRelation[] = [];

    if (includeRelations) {
      memoryRelations = getMemoryRelations(db);
      crossLayerRelations = getCrossLayerRelations(db);
    }

    // Get pending memories if requested
    const pendingMemories = includePending ? storage.getPendingMemories() : [];

    // Build export object
    const exportData: StorageExport = {
      version: "1.0.0",
      exportedAt: Math.floor(Date.now() / 1000),
      backendType: storage.getBackendType(),
      storageMode: storage.getStorageMode(),
      schemaVersion: storage.getSchemaVersion() ?? "unknown",
      data: {
        memories,
        documents,
        chunks,
        memoryRelations,
        crossLayerRelations,
        pendingMemories,
      },
      metadata: {
        totalMemories: memories.length,
        embeddingProvider: embeddingConfig?.provider,
        embeddingModel: getEmbeddingModel(embeddingConfig),
      },
    };

    // Write to file
    writeFileSync(input.outputPath, JSON.stringify(exportData, null, 2), "utf-8");

    console.log(`[doclea] Exported data to ${input.outputPath}`);

    return {
      success: true,
      outputPath: input.outputPath,
      stats: {
        memories: memories.length,
        documents: documents.length,
        chunks: chunks.length,
        memoryRelations: memoryRelations.length,
        crossLayerRelations: crossLayerRelations.length,
        pendingMemories: pendingMemories.length,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[doclea] Export failed: ${errorMessage}`);
    return {
      success: false,
      outputPath: input.outputPath,
      stats: {
        memories: 0,
        documents: 0,
        chunks: 0,
        memoryRelations: 0,
        crossLayerRelations: 0,
        pendingMemories: 0,
      },
      error: errorMessage,
    };
  }
}

/**
 * Get all documents from storage
 */
function getAllDocuments(storage: IStorageBackend): Document[] {
  const db = storage.getDatabase();
  const stmt = db.prepare("SELECT * FROM documents ORDER BY created_at DESC");
  const rows = stmt.all() as DocumentRow[];
  return rows.map(rowToDocument);
}

/**
 * Get all chunks from storage
 */
function getAllChunks(storage: IStorageBackend): Chunk[] {
  const db = storage.getDatabase();
  const stmt = db.prepare("SELECT * FROM chunks ORDER BY document_id, start_offset");
  const rows = stmt.all() as ChunkRow[];
  return rows.map(rowToChunk);
}

/**
 * Get all memory relations
 */
function getMemoryRelations(db: ReturnType<IStorageBackend["getDatabase"]>): MemoryRelation[] {
  try {
    const stmt = db.prepare("SELECT * FROM memory_relations ORDER BY created_at DESC");
    return stmt.all() as MemoryRelation[];
  } catch {
    // Table may not exist in older schemas
    return [];
  }
}

/**
 * Get all cross-layer relations
 */
function getCrossLayerRelations(db: ReturnType<IStorageBackend["getDatabase"]>): CrossLayerRelation[] {
  try {
    const stmt = db.prepare("SELECT * FROM cross_layer_relations ORDER BY created_at DESC");
    return stmt.all() as CrossLayerRelation[];
  } catch {
    // Table may not exist in older schemas
    return [];
  }
}

/**
 * Extract embedding model from config
 */
function getEmbeddingModel(config?: EmbeddingConfig): string | undefined {
  if (!config) return undefined;

  switch (config.provider) {
    case "transformers":
      return config.model;
    case "openai":
      return config.model;
    case "nomic":
      return config.model;
    case "voyage":
      return config.model;
    case "ollama":
      return config.model;
    case "local":
      return "TEI";
    default:
      return undefined;
  }
}

// Row types for SQLite
interface DocumentRow {
  id: string;
  title: string;
  content: string;
  content_hash: string | null;
  created_at: number;
  updated_at: number;
}

interface ChunkRow {
  id: string;
  document_id: string;
  content: string;
  qdrant_id: string | null;
  start_offset: number;
  end_offset: number;
}

function rowToDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    contentHash: row.content_hash ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToChunk(row: ChunkRow): Chunk {
  return {
    id: row.id,
    documentId: row.document_id,
    content: row.content,
    qdrantId: row.qdrant_id ?? undefined,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
  };
}
