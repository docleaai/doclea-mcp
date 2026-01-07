import { z } from "zod";
import type { Database } from "bun:sqlite";
import { CodeGraphStorage } from "../../database/code-graph";
import type { CallGraphResult } from "./types";

export const GetCallGraphInputSchema = z.object({
	nodeId: z
		.string()
		.optional()
		.describe("Node ID to start from"),
	functionName: z.string().optional().describe("Function name to search for"),
	depth: z
		.number()
		.min(1)
		.max(5)
		.default(2)
		.describe("How many levels deep to traverse"),
});

export type GetCallGraphInput = z.infer<typeof GetCallGraphInputSchema>;

export async function getCallGraph(
	input: GetCallGraphInput,
	db: Database,
): Promise<{
	graph: CallGraphResult;
	message: string;
}> {
	const codeGraph = new CodeGraphStorage(db);

	// Find the node
	let nodeId = input.nodeId;
	if (!nodeId && input.functionName) {
		const node = await codeGraph.findNodeByName(input.functionName, "function");
		if (!node) {
			return {
				graph: { nodes: [], edges: [] },
				message: `Function not found: ${input.functionName}`,
			};
		}
		nodeId = node.id;
	}

	if (!nodeId) {
		return {
			graph: { nodes: [], edges: [] },
			message: "Must provide nodeId or functionName",
		};
	}

	// Get call graph
	const graph = await codeGraph.getCallGraph(nodeId, input.depth);

	const message = `Found ${graph.nodes.length} nodes and ${graph.edges.length} call relationships`;

	return { graph, message };
}