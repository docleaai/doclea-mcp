/**
 * Import tool for restoring doclea data
 *
 * Imports memories, documents, chunks, and relations from a portable JSON format.
 * Supports conflict resolution strategies and optional re-embedding.
 */

import { existsSync, readFileSync } from "node:fs";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { EmbeddingClient } from "@/embeddings/provider";
import type { IStorageBackend } from "@/storage/interface";
import type {
  ImportConflictStrategy,
  ImportResult,
  PendingMemory,
  StorageExport,
} from "@/storage/types";
import type { Chunk, Document, Memory } from "@/types";
import type { VectorStore } from "@/vectors/interface";

export const ImportInputSchema = z.object({
  inputPath: z.string().describe("Path to the export file to import"),
  conflictStrategy: z
    .enum(["skip", "overwrite", "error"])
    .default("skip")
    .describe("How to handle conflicts with existing data"),
  reembed: z
    .boolean()
    .default(false)
    .describe("Re-generate embeddings (required if embedding model changed)"),
  importRelations: z
    .boolean()
    .default(true)
    .describe("Import memory and cross-layer relations"),
  importPending: z.boolean().default(true).describe("Import pending memories"),
});

export type ImportInput = z.input<typeof ImportInputSchema>;

/**
 * Import data from an export file into storage
 *
 * If reembed is true, vectors will be regenerated using the current embedding model.
 * Otherwise, data is imported without vectors (semantic search won't work until re-embedded).
 */
export async function importData(
  input: ImportInput,
  storage: IStorageBackend,
  vectors?: VectorStore,
  embeddings?: EmbeddingClient,
): Promise<ImportResult> {
  const conflictStrategy = input.conflictStrategy ?? "skip";
  const reembed = input.reembed ?? false;
  const importRelations = input.importRelations ?? true;
  const importPending = input.importPending ?? true;

  const result: ImportResult = {
    success: false,
    imported: {
      memories: 0,
      documents: 0,
      chunks: 0,
      relations: 0,
    },
    skipped: 0,
    errors: [],
    reembeddingRequired: false,
  };

  // Validate input file exists
  if (!existsSync(input.inputPath)) {
    result.errors.push(`Import file not found: ${input.inputPath}`);
    return result;
  }

  // Read and parse export file
  let exportData: StorageExport;
  try {
    const content = readFileSync(input.inputPath, "utf-8");
    exportData = JSON.parse(content) as StorageExport;
  } catch (error) {
    result.errors.push(
      `Failed to parse export file: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return result;
  }

  // Validate export format
  if (!exportData.version || !exportData.data) {
    result.errors.push("Invalid export file format");
    return result;
  }

  // Check if re-embedding is needed
  if (!reembed && exportData.data.memories.length > 0) {
    result.reembeddingRequired = true;
    console.warn(
      "[doclea] Import without re-embedding: semantic search may not work correctly",
    );
  }

  // Import memories
  const memoryResult = await importMemories(
    exportData.data.memories,
    storage,
    conflictStrategy,
    reembed,
    vectors,
    embeddings,
  );
  result.imported.memories = memoryResult.imported;
  result.skipped += memoryResult.skipped;
  result.errors.push(...memoryResult.errors);

  // Import documents
  const docResult = importDocuments(
    exportData.data.documents,
    storage,
    conflictStrategy,
  );
  result.imported.documents = docResult.imported;
  result.skipped += docResult.skipped;
  result.errors.push(...docResult.errors);

  // Import chunks
  const chunkResult = importChunks(
    exportData.data.chunks,
    storage,
    conflictStrategy,
  );
  result.imported.chunks = chunkResult.imported;
  result.skipped += chunkResult.skipped;
  result.errors.push(...chunkResult.errors);

  // Import relations if requested
  if (importRelations) {
    const relationResult = importRelations_(
      exportData.data.memoryRelations,
      exportData.data.crossLayerRelations,
      storage,
      conflictStrategy,
    );
    result.imported.relations = relationResult.imported;
    result.skipped += relationResult.skipped;
    result.errors.push(...relationResult.errors);
  }

  // Import pending memories if requested
  if (importPending && exportData.data.pendingMemories?.length > 0) {
    const pendingResult = importPendingMemories(
      exportData.data.pendingMemories,
      storage,
      conflictStrategy,
    );
    result.skipped += pendingResult.skipped;
    result.errors.push(...pendingResult.errors);
  }

  result.success = result.errors.length === 0;

  console.log(
    `[doclea] Import complete: ${result.imported.memories} memories, ${result.imported.documents} documents, ${result.imported.chunks} chunks`,
  );

  return result;
}

interface PartialResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * Import memories with optional re-embedding
 */
async function importMemories(
  memories: Memory[],
  storage: IStorageBackend,
  conflictStrategy: ImportConflictStrategy,
  reembed: boolean,
  vectors?: VectorStore,
  embeddings?: EmbeddingClient,
): Promise<PartialResult> {
  const result: PartialResult = { imported: 0, skipped: 0, errors: [] };

  for (const memory of memories) {
    try {
      // Check for existing memory
      const existing = storage.getMemory(memory.id);

      if (existing) {
        if (conflictStrategy === "skip") {
          result.skipped++;
          continue;
        } else if (conflictStrategy === "error") {
          result.errors.push(`Memory ${memory.id} already exists`);
          continue;
        }
        // overwrite: delete existing first
        storage.deleteMemory(memory.id);
      }

      // Generate new qdrantId if re-embedding
      let qdrantId = memory.qdrantId;
      if (reembed && vectors && embeddings) {
        qdrantId = `vec_${nanoid(16)}`;

        // Generate embedding and store in vector database
        const text = `${memory.title}\n\n${memory.content}`;
        const vector = await embeddings.embed(text);

        await vectors.upsert(qdrantId, vector, {
          memoryId: memory.id,
          type: memory.type,
          title: memory.title,
          tags: memory.tags,
          relatedFiles: memory.relatedFiles,
          importance: memory.importance,
        });
      }

      // Create memory in storage
      storage.createMemory({
        id: memory.id,
        qdrantId,
        type: memory.type,
        title: memory.title,
        content: memory.content,
        summary: memory.summary,
        importance: memory.importance,
        tags: memory.tags,
        relatedFiles: memory.relatedFiles,
        gitCommit: memory.gitCommit,
        sourcePr: memory.sourcePr,
        experts: memory.experts,
        needsReview: (memory as any).needsReview ?? false,
      });

      result.imported++;
    } catch (error) {
      result.errors.push(
        `Failed to import memory ${memory.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  return result;
}

/**
 * Import documents
 */
function importDocuments(
  documents: Document[],
  storage: IStorageBackend,
  conflictStrategy: ImportConflictStrategy,
): PartialResult {
  const result: PartialResult = { imported: 0, skipped: 0, errors: [] };

  for (const doc of documents) {
    try {
      // Check for existing document
      const existing = storage.getDocument(doc.id);

      if (existing) {
        if (conflictStrategy === "skip") {
          result.skipped++;
          continue;
        } else if (conflictStrategy === "error") {
          result.errors.push(`Document ${doc.id} already exists`);
          continue;
        }
        // overwrite: delete existing first (would need to add deleteDocument method)
        // For now, skip if exists in overwrite mode too
        result.skipped++;
        continue;
      }

      // Create document
      storage.createDocument({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        contentHash: doc.contentHash,
      });

      result.imported++;
    } catch (error) {
      result.errors.push(
        `Failed to import document ${doc.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  return result;
}

/**
 * Import chunks
 */
function importChunks(
  chunks: Chunk[],
  storage: IStorageBackend,
  conflictStrategy: ImportConflictStrategy,
): PartialResult {
  const result: PartialResult = { imported: 0, skipped: 0, errors: [] };
  const db = storage.getDatabase();

  for (const chunk of chunks) {
    try {
      // Check for existing chunk
      const existingStmt = db.prepare("SELECT id FROM chunks WHERE id = ?");
      const existing = existingStmt.get(chunk.id);

      if (existing) {
        if (conflictStrategy === "skip") {
          result.skipped++;
          continue;
        } else if (conflictStrategy === "error") {
          result.errors.push(`Chunk ${chunk.id} already exists`);
          continue;
        }
        // overwrite: delete existing first
        const deleteStmt = db.prepare("DELETE FROM chunks WHERE id = ?");
        deleteStmt.run(chunk.id);
      }

      // Create chunk
      storage.createChunk(chunk);
      result.imported++;
    } catch (error) {
      result.errors.push(
        `Failed to import chunk ${chunk.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  return result;
}

/**
 * Import memory and cross-layer relations
 */
function importRelations_(
  memoryRelations: StorageExport["data"]["memoryRelations"],
  crossLayerRelations: StorageExport["data"]["crossLayerRelations"],
  storage: IStorageBackend,
  conflictStrategy: ImportConflictStrategy,
): PartialResult {
  const result: PartialResult = { imported: 0, skipped: 0, errors: [] };
  const db = storage.getDatabase();

  // Import memory relations
  for (const relation of memoryRelations) {
    try {
      // Check for existing relation
      const existingStmt = db.prepare(
        "SELECT id FROM memory_relations WHERE id = ?",
      );
      const existing = existingStmt.get(relation.id);

      if (existing) {
        if (conflictStrategy === "skip") {
          result.skipped++;
          continue;
        } else if (conflictStrategy === "error") {
          result.errors.push(`Memory relation ${relation.id} already exists`);
          continue;
        }
        // overwrite: delete existing first
        const deleteStmt = db.prepare(
          "DELETE FROM memory_relations WHERE id = ?",
        );
        deleteStmt.run(relation.id);
      }

      // Insert relation
      const insertStmt = db.prepare(`
        INSERT INTO memory_relations (id, source_id, target_id, relation_type, confidence, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(
        relation.id,
        relation.source_id,
        relation.target_id,
        relation.relation_type,
        relation.confidence,
        relation.metadata,
        relation.created_at,
      );
      result.imported++;
    } catch (error) {
      result.errors.push(
        `Failed to import memory relation ${relation.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  // Import cross-layer relations
  for (const relation of crossLayerRelations) {
    try {
      // Check for existing relation
      const existingStmt = db.prepare(
        "SELECT id FROM cross_layer_relations WHERE id = ?",
      );
      const existing = existingStmt.get(relation.id);

      if (existing) {
        if (conflictStrategy === "skip") {
          result.skipped++;
          continue;
        } else if (conflictStrategy === "error") {
          result.errors.push(
            `Cross-layer relation ${relation.id} already exists`,
          );
          continue;
        }
        // overwrite: delete existing first
        const deleteStmt = db.prepare(
          "DELETE FROM cross_layer_relations WHERE id = ?",
        );
        deleteStmt.run(relation.id);
      }

      // Insert relation
      const insertStmt = db.prepare(`
        INSERT INTO cross_layer_relations (id, memory_id, code_node_id, relation_type, direction, confidence, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(
        relation.id,
        relation.memory_id,
        relation.code_node_id,
        relation.relation_type,
        relation.direction,
        relation.confidence,
        relation.metadata,
        relation.created_at,
      );
      result.imported++;
    } catch (error) {
      result.errors.push(
        `Failed to import cross-layer relation ${relation.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  return result;
}

/**
 * Import pending memories
 */
function importPendingMemories(
  pendingMemories: PendingMemory[],
  storage: IStorageBackend,
  conflictStrategy: ImportConflictStrategy,
): PartialResult {
  const result: PartialResult = { imported: 0, skipped: 0, errors: [] };

  for (const pending of pendingMemories) {
    try {
      // Check for existing pending memory
      const existing = storage.getPendingMemory(pending.id);

      if (existing) {
        if (conflictStrategy === "skip") {
          result.skipped++;
          continue;
        } else if (conflictStrategy === "error") {
          result.errors.push(`Pending memory ${pending.id} already exists`);
          continue;
        }
        // overwrite: delete existing first
        storage.deletePendingMemory(pending.id);
      }

      // Create pending memory (insert with existing ID)
      const db = storage.getDatabase();
      const stmt = db.prepare(`
        INSERT INTO pending_memories (id, memory_data, qdrant_id, suggested_at, source, reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        pending.id,
        JSON.stringify(pending.memoryData),
        pending.memoryData.qdrantId,
        pending.suggestedAt,
        pending.source,
        pending.reason,
      );

      result.imported++;
    } catch (error) {
      result.errors.push(
        `Failed to import pending memory ${pending.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  return result;
}
