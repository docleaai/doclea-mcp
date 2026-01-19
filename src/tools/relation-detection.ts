/**
 * MCP tools for relation detection
 *
 * Provides tools to:
 * - Trigger relation detection for a memory
 * - Get pending suggestions
 * - Review (approve/reject) suggestions
 * - Bulk review suggestions
 */

import type { Database } from "bun:sqlite";
import { z } from "zod";
import { MemoryRelationStorage } from "@/database/memory-relations";
import { RelationSuggestionStorage } from "@/database/relation-suggestions";
import type { EmbeddingClient } from "@/embeddings/provider";
import { createRelationDetector, type DetectionResult } from "@/relations";
import type { IStorageBackend } from "@/storage/interface";
import type { VectorStore } from "@/vectors/interface";

/**
 * Detection method enum for zod schema
 */
const DetectionMethodSchema = z.enum([
  "semantic",
  "keyword",
  "file_overlap",
  "temporal",
]);

/**
 * Trigger relation detection for a memory
 */
export const DetectRelationsInputSchema = z.object({
  memoryId: z.string().describe("Memory ID to detect relations for"),
  semanticThreshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Minimum semantic similarity (default: 0.75)"),
  autoApproveThreshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Confidence threshold for auto-approval (default: 0.85)"),
});

export type DetectRelationsInput = z.infer<typeof DetectRelationsInputSchema>;

export async function detectRelations(
  input: DetectRelationsInput,
  storage: IStorageBackend,
  vectors?: VectorStore,
  embeddings?: EmbeddingClient,
): Promise<{
  result: DetectionResult | null;
  message: string;
}> {
  const db = storage.getDatabase();
  const relationStorage = new MemoryRelationStorage(db);
  const suggestionStorage = new RelationSuggestionStorage(db, relationStorage);

  // Get the memory
  const memory = storage.getMemory(input.memoryId);
  if (!memory) {
    return {
      result: null,
      message: `Memory not found: ${input.memoryId}`,
    };
  }

  // Create detector with optional custom config
  const detector = createRelationDetector(
    storage,
    relationStorage,
    suggestionStorage,
    vectors,
    embeddings,
    {
      semanticThreshold: input.semanticThreshold,
      autoApproveThreshold: input.autoApproveThreshold,
    },
  );

  // Run detection
  const result = await detector.detectRelationsForMemory(memory);

  return {
    result,
    message: `Detection complete: ${result.autoApproved.length} auto-approved, ${result.suggestions.length} suggestions created (${result.totalCandidates} candidates, ${result.filteredCount} filtered)`,
  };
}

/**
 * Get pending suggestions
 */
export const GetSuggestionsInputSchema = z.object({
  sourceId: z.string().optional().describe("Filter by source memory ID"),
  targetId: z.string().optional().describe("Filter by target memory ID"),
  detectionMethod: DetectionMethodSchema.optional().describe(
    "Filter by detection method",
  ),
  minConfidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Minimum confidence score"),
  limit: z.number().min(1).max(100).default(20).describe("Maximum results"),
  offset: z.number().min(0).default(0).describe("Offset for pagination"),
});

export type GetSuggestionsInput = z.infer<typeof GetSuggestionsInputSchema>;

export async function getSuggestions(
  input: GetSuggestionsInput,
  db: Database,
): Promise<{
  suggestions: any[];
  total: number;
  message: string;
}> {
  const relationStorage = new MemoryRelationStorage(db);
  const suggestionStorage = new RelationSuggestionStorage(db, relationStorage);

  const suggestions = await suggestionStorage.getPendingSuggestions({
    sourceId: input.sourceId,
    targetId: input.targetId,
    detectionMethod: input.detectionMethod,
    minConfidence: input.minConfidence,
    limit: input.limit,
    offset: input.offset,
  });

  const total = await suggestionStorage.getPendingCount();

  return {
    suggestions,
    total,
    message: `Found ${suggestions.length} pending suggestions (${total} total)`,
  };
}

/**
 * Review a single suggestion
 */
export const ReviewSuggestionInputSchema = z.object({
  suggestionId: z.string().describe("Suggestion ID to review"),
  action: z.enum(["approve", "reject"]).describe("Action to take"),
});

export type ReviewSuggestionInput = z.infer<typeof ReviewSuggestionInputSchema>;

export async function reviewSuggestion(
  input: ReviewSuggestionInput,
  db: Database,
): Promise<{
  success: boolean;
  relationCreated: boolean;
  message: string;
}> {
  const relationStorage = new MemoryRelationStorage(db);
  const suggestionStorage = new RelationSuggestionStorage(db, relationStorage);

  let success: boolean;
  let relationCreated = false;

  if (input.action === "approve") {
    success = await suggestionStorage.approveSuggestion(input.suggestionId);
    relationCreated = success;
  } else {
    success = await suggestionStorage.rejectSuggestion(input.suggestionId);
  }

  return {
    success,
    relationCreated,
    message: success
      ? `Suggestion ${input.action}d successfully${relationCreated ? " (relation created)" : ""}`
      : "Suggestion not found or already reviewed",
  };
}

/**
 * Bulk review suggestions
 */
export const BulkReviewInputSchema = z.object({
  suggestionIds: z
    .array(z.string())
    .min(1)
    .describe("Suggestion IDs to review"),
  action: z.enum(["approve", "reject"]).describe("Action to take for all"),
});

export type BulkReviewInput = z.infer<typeof BulkReviewInputSchema>;

export async function bulkReview(
  input: BulkReviewInput,
  db: Database,
): Promise<{
  processed: number;
  relationsCreated: number;
  failed: string[];
  message: string;
}> {
  const relationStorage = new MemoryRelationStorage(db);
  const suggestionStorage = new RelationSuggestionStorage(db, relationStorage);

  const result =
    input.action === "approve"
      ? await suggestionStorage.bulkApprove(input.suggestionIds)
      : await suggestionStorage.bulkReject(input.suggestionIds);

  return {
    processed: result.processed,
    relationsCreated: result.relationsCreated,
    failed: result.failed,
    message: `${input.action}d ${result.processed}/${input.suggestionIds.length} suggestions${result.relationsCreated > 0 ? ` (${result.relationsCreated} relations created)` : ""}${result.failed.length > 0 ? ` (${result.failed.length} failed)` : ""}`,
  };
}
