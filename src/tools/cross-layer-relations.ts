/**
 * MCP tools for cross-layer relations (code <-> memory)
 *
 * Provides tools to:
 * - Suggest relations between code and memory entities
 * - Get code nodes related to a memory
 * - Get memories related to a code node
 * - Review cross-layer suggestions
 */

import { z } from "zod";
import type { Database } from "bun:sqlite";
import { CodeGraphStorage } from "@/database/code-graph";
import {
	CrossLayerRelationStorage,
	type CrossLayerRelation,
} from "@/database/cross-layer-relations";
import {
	CrossLayerSuggestionStorage,
	type CrossLayerSuggestion,
} from "@/database/cross-layer-suggestions";
import type { IStorageBackend } from "@/storage/interface";
import {
	CrossLayerDetector,
	type CrossLayerDetectionResult,
} from "@/relations/cross-layer-detector";

/**
 * Cross-layer relation type enum
 */
const CrossLayerRelationTypeSchema = z.enum([
	"documents",
	"addresses",
	"exemplifies",
]);

/**
 * Cross-layer detection method enum
 */
const CrossLayerDetectionMethodSchema = z.enum([
	"code_reference",
	"file_path_match",
	"keyword_match",
]);

/**
 * Suggest cross-layer relations (unified tool for code and memory)
 */
export const SuggestRelationsInputSchema = z.object({
	entityId: z.string().describe("ID of the entity (memory ID or code node ID)"),
	entityType: z.enum(["code", "memory"]).describe("Type of entity"),
	relationTypes: z
		.array(CrossLayerRelationTypeSchema)
		.optional()
		.describe("Filter by relation types"),
	minConfidence: z
		.number()
		.min(0)
		.max(1)
		.default(0.6)
		.describe("Minimum confidence threshold"),
});

export type SuggestRelationsInput = z.infer<typeof SuggestRelationsInputSchema>;

export async function suggestRelations(
	input: SuggestRelationsInput,
	storage: IStorageBackend,
): Promise<{
	result: CrossLayerDetectionResult | null;
	message: string;
}> {
	const db = storage.getDatabase();
	const codeGraph = new CodeGraphStorage(db);
	const relationStorage = new CrossLayerRelationStorage(db);
	const suggestionStorage = new CrossLayerSuggestionStorage(
		db,
		relationStorage,
	);

	const detector = new CrossLayerDetector(
		storage,
		codeGraph,
		relationStorage,
		suggestionStorage,
		{
			suggestionThreshold: input.minConfidence,
		},
	);

	if (input.entityType === "memory") {
		// Get the memory
		const memory = storage.getMemory(input.entityId);
		if (!memory) {
			return {
				result: null,
				message: `Memory not found: ${input.entityId}`,
			};
		}

		// Run detection
		const result = await detector.detectForMemory(memory);

		// Filter by relation types if specified
		if (input.relationTypes && input.relationTypes.length > 0) {
			result.autoApproved = result.autoApproved.filter((c) =>
				input.relationTypes!.includes(c.relationType),
			);
			result.suggestions = result.suggestions.filter((s) =>
				input.relationTypes!.includes(s.suggestedType),
			);
		}

		return {
			result,
			message: `Detection complete for memory: ${result.autoApproved.length} auto-approved, ${result.suggestions.length} suggestions created`,
		};
	} else {
		// Get the code node
		const codeNode = await codeGraph.getNode(input.entityId);
		if (!codeNode) {
			return {
				result: null,
				message: `Code node not found: ${input.entityId}`,
			};
		}

		// Run detection
		const result = await detector.detectForCodeNode(codeNode);

		// Filter by relation types if specified
		if (input.relationTypes && input.relationTypes.length > 0) {
			result.autoApproved = result.autoApproved.filter((c) =>
				input.relationTypes!.includes(c.relationType),
			);
			result.suggestions = result.suggestions.filter((s) =>
				input.relationTypes!.includes(s.suggestedType),
			);
		}

		return {
			result,
			message: `Detection complete for code node: ${result.autoApproved.length} auto-approved, ${result.suggestions.length} suggestions created`,
		};
	}
}

/**
 * Get code nodes related to a memory
 */
export const GetCodeForMemoryInputSchema = z.object({
	memoryId: z.string().describe("Memory ID to get code for"),
	relationType: CrossLayerRelationTypeSchema.optional().describe(
		"Filter by relation type",
	),
});

export type GetCodeForMemoryInput = z.infer<typeof GetCodeForMemoryInputSchema>;

export async function getCodeForMemory(
	input: GetCodeForMemoryInput,
	db: Database,
): Promise<{
	relations: CrossLayerRelation[];
	message: string;
}> {
	const relationStorage = new CrossLayerRelationStorage(db);

	const relations = await relationStorage.getRelationsForMemory(
		input.memoryId,
		input.relationType,
	);

	return {
		relations,
		message: `Found ${relations.length} code relations for memory`,
	};
}

/**
 * Get memories related to a code node
 */
export const GetMemoriesForCodeInputSchema = z.object({
	codeNodeId: z.string().describe("Code node ID to get memories for"),
	relationType: CrossLayerRelationTypeSchema.optional().describe(
		"Filter by relation type",
	),
});

export type GetMemoriesForCodeInput = z.infer<
	typeof GetMemoriesForCodeInputSchema
>;

export async function getMemoriesForCode(
	input: GetMemoriesForCodeInput,
	db: Database,
): Promise<{
	relations: CrossLayerRelation[];
	message: string;
}> {
	const relationStorage = new CrossLayerRelationStorage(db);

	const relations = await relationStorage.getRelationsForCodeNode(
		input.codeNodeId,
		input.relationType,
	);

	return {
		relations,
		message: `Found ${relations.length} memory relations for code node`,
	};
}

/**
 * Get pending cross-layer suggestions
 */
export const GetCrossLayerSuggestionsInputSchema = z.object({
	memoryId: z.string().optional().describe("Filter by memory ID"),
	codeNodeId: z.string().optional().describe("Filter by code node ID"),
	detectionMethod: CrossLayerDetectionMethodSchema.optional().describe(
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

export type GetCrossLayerSuggestionsInput = z.infer<
	typeof GetCrossLayerSuggestionsInputSchema
>;

export async function getCrossLayerSuggestions(
	input: GetCrossLayerSuggestionsInput,
	db: Database,
): Promise<{
	suggestions: CrossLayerSuggestion[];
	total: number;
	message: string;
}> {
	const relationStorage = new CrossLayerRelationStorage(db);
	const suggestionStorage = new CrossLayerSuggestionStorage(
		db,
		relationStorage,
	);

	const suggestions = await suggestionStorage.getPendingSuggestions({
		memoryId: input.memoryId,
		codeNodeId: input.codeNodeId,
		detectionMethod: input.detectionMethod,
		minConfidence: input.minConfidence,
		limit: input.limit,
		offset: input.offset,
	});

	const total = await suggestionStorage.getPendingCount();

	return {
		suggestions,
		total,
		message: `Found ${suggestions.length} pending cross-layer suggestions (${total} total)`,
	};
}

/**
 * Review a single cross-layer suggestion
 */
export const ReviewCrossLayerSuggestionInputSchema = z.object({
	suggestionId: z.string().describe("Suggestion ID to review"),
	action: z.enum(["approve", "reject"]).describe("Action to take"),
});

export type ReviewCrossLayerSuggestionInput = z.infer<
	typeof ReviewCrossLayerSuggestionInputSchema
>;

export async function reviewCrossLayerSuggestion(
	input: ReviewCrossLayerSuggestionInput,
	db: Database,
): Promise<{
	success: boolean;
	relationCreated: boolean;
	message: string;
}> {
	const relationStorage = new CrossLayerRelationStorage(db);
	const suggestionStorage = new CrossLayerSuggestionStorage(
		db,
		relationStorage,
	);

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
			? `Cross-layer suggestion ${input.action}d successfully${relationCreated ? " (relation created)" : ""}`
			: "Suggestion not found or already reviewed",
	};
}

/**
 * Bulk review cross-layer suggestions
 */
export const BulkReviewCrossLayerInputSchema = z.object({
	suggestionIds: z
		.array(z.string())
		.min(1)
		.describe("Suggestion IDs to review"),
	action: z.enum(["approve", "reject"]).describe("Action to take for all"),
});

export type BulkReviewCrossLayerInput = z.infer<
	typeof BulkReviewCrossLayerInputSchema
>;

export async function bulkReviewCrossLayer(
	input: BulkReviewCrossLayerInput,
	db: Database,
): Promise<{
	processed: number;
	relationsCreated: number;
	failed: string[];
	message: string;
}> {
	const relationStorage = new CrossLayerRelationStorage(db);
	const suggestionStorage = new CrossLayerSuggestionStorage(
		db,
		relationStorage,
	);

	let result;
	if (input.action === "approve") {
		result = await suggestionStorage.bulkApprove(input.suggestionIds);
	} else {
		result = await suggestionStorage.bulkReject(input.suggestionIds);
	}

	return {
		processed: result.processed,
		relationsCreated: result.relationsCreated,
		failed: result.failed,
		message: `${input.action}d ${result.processed}/${input.suggestionIds.length} cross-layer suggestions${result.relationsCreated > 0 ? ` (${result.relationsCreated} relations created)` : ""}${result.failed.length > 0 ? ` (${result.failed.length} failed)` : ""}`,
	};
}
