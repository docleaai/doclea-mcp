import { z } from "zod";
import type { Database } from "bun:sqlite";
import { CodeGraphStorage } from "../../database/code-graph";
import type { CodeNode } from "./types";

export const GetCodeNodeInputSchema = z.object({
	nodeId: z
		.string()
		.optional()
		.describe("Node ID (e.g., 'src/api.ts:function:getUserData')"),
	name: z
		.string()
		.optional()
		.describe("Search by node name (e.g., 'getUserData')"),
	filePath: z.string().optional().describe("Get all nodes from a file"),
});

export type GetCodeNodeInput = z.infer<typeof GetCodeNodeInputSchema>;

export async function getCodeNode(
	input: GetCodeNodeInput,
	db: Database,
): Promise<{
	nodes: CodeNode[];
	message: string;
}> {
	const codeGraph = new CodeGraphStorage(db);

	let nodes: CodeNode[] = [];

	if (input.nodeId) {
		const node = await codeGraph.getNode(input.nodeId);
		if (node) nodes = [node];
	} else if (input.name) {
		const node = await codeGraph.findNodeByName(input.name);
		if (node) nodes = [node];
	} else if (input.filePath) {
		nodes = await codeGraph.getNodesByPath(input.filePath);
	}

	const message =
		nodes.length > 0
			? `Found ${nodes.length} node(s)`
			: "No nodes found";

	return { nodes, message };
}