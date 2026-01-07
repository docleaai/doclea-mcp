import { z } from "zod";
import type { Database } from "bun:sqlite";
import {
	MemoryRelationStorage,
	type MemoryRelationType,
} from "../database/memory-relations";

/**
 * Zod schema for relation types
 */
const RelationTypeSchema = z.enum([
	"references",
	"implements",
	"extends",
	"related_to",
	"supersedes",
	"requires",
]);

/**
 * Link two memories with a typed relationship
 */
export const LinkMemoriesInputSchema = z.object({
	sourceId: z.string().describe("Source memory ID"),
	targetId: z.string().describe("Target memory ID"),
	type: RelationTypeSchema.describe("Type of relationship"),
	weight: z
		.number()
		.min(0)
		.max(1)
		.default(1.0)
		.describe("Relationship strength (0-1)"),
	metadata: z
		.record(z.string(), z.any())
		.optional()
		.describe("Optional metadata about the relationship"),
});

export type LinkMemoriesInput = z.infer<typeof LinkMemoriesInputSchema>;

export async function linkMemories(
	input: LinkMemoriesInput,
	db: Database,
): Promise<{
	relation: any;
	message: string;
}> {
	const storage = new MemoryRelationStorage(db);

	const relation = await storage.createRelation(
		input.sourceId,
		input.targetId,
		input.type as MemoryRelationType,
		input.weight,
		input.metadata,
	);

	return {
		relation,
		message: `Created ${input.type} relationship: ${input.sourceId} → ${input.targetId}`,
	};
}

/**
 * Get related memories for a given memory
 */
export const GetRelatedMemoriesInputSchema = z.object({
	memoryId: z.string().describe("Memory ID to find relations for"),
	depth: z
		.number()
		.min(1)
		.max(5)
		.default(2)
		.describe("How many relationship hops to traverse"),
	relationTypes: z
		.array(RelationTypeSchema)
		.optional()
		.describe("Filter by specific relation types"),
	direction: z
		.enum(["outgoing", "incoming", "both"])
		.default("both")
		.describe("Direction of relationships to follow"),
});

export type GetRelatedMemoriesInput = z.infer<
	typeof GetRelatedMemoriesInputSchema
>;

export async function getRelatedMemories(
	input: GetRelatedMemoriesInput,
	db: Database,
): Promise<{
	related: any[];
	graph: any;
	message: string;
}> {
	const storage = new MemoryRelationStorage(db);

	if (input.direction === "outgoing" || input.direction === "incoming") {
		// Simple directional query
		const relations =
			input.direction === "outgoing"
				? await storage.getRelationsFrom(
						input.memoryId,
						input.relationTypes?.[0] as MemoryRelationType,
					)
				: await storage.getRelationsTo(
						input.memoryId,
						input.relationTypes?.[0] as MemoryRelationType,
					);

		const relatedIds =
			input.direction === "outgoing"
				? relations.map((r) => r.targetId)
				: relations.map((r) => r.sourceId);

		return {
			related: relations,
			graph: { nodes: [{ id: input.memoryId, depth: 0 }], edges: relations },
			message: `Found ${relations.length} ${input.direction} relationships`,
		};
	}

	// Bidirectional graph traversal
	const graph = await storage.traverseGraph(
		input.memoryId,
		input.depth,
		input.relationTypes as MemoryRelationType[],
	);

	const related = await storage.getRelatedMemories(
		input.memoryId,
		input.depth,
		input.relationTypes as MemoryRelationType[],
	);

	return {
		related,
		graph,
		message: `Found ${graph.nodes.length - 1} related memories (${graph.edges.length} relationships)`,
	};
}

/**
 * Delete a relationship
 */
export const DeleteRelationInputSchema = z.object({
	relationId: z.string().describe("Relationship ID to delete"),
});

export type DeleteRelationInput = z.infer<typeof DeleteRelationInputSchema>;

export async function deleteRelation(
	input: DeleteRelationInput,
	db: Database,
): Promise<{
	success: boolean;
	message: string;
}> {
	const storage = new MemoryRelationStorage(db);
	const success = await storage.deleteRelation(input.relationId);

	return {
		success,
		message: success
			? "Relationship deleted successfully"
			: "Relationship not found",
	};
}

/**
 * Find path between two memories
 */
export const FindPathInputSchema = z.object({
	sourceId: z.string().describe("Starting memory ID"),
	targetId: z.string().describe("Target memory ID"),
	maxDepth: z
		.number()
		.min(1)
		.max(10)
		.default(5)
		.describe("Maximum path length to search"),
});

export type FindPathInput = z.infer<typeof FindPathInputSchema>;

export async function findPath(
	input: FindPathInput,
	db: Database,
): Promise<{
	path: string[] | null;
	message: string;
}> {
	const storage = new MemoryRelationStorage(db);
	const path = await storage.findPath(
		input.sourceId,
		input.targetId,
		input.maxDepth,
	);

	return {
		path,
		message: path
			? `Found path with ${path.length} steps`
			: "No path found between memories",
	};
}