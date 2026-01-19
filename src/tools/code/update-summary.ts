import type { Database } from "bun:sqlite";
import { z } from "zod";
import { CodeGraphStorage } from "../../database/code-graph";

export const UpdateNodeSummaryInputSchema = z.object({
  nodeId: z
    .string()
    .describe("ID of the code node (e.g., 'src/api.ts:function:getUserData')"),
  summary: z
    .string()
    .describe("AI-generated summary provided by the LLM client"),
});

export type UpdateNodeSummaryInput = z.infer<
  typeof UpdateNodeSummaryInputSchema
>;

export async function updateNodeSummary(
  input: UpdateNodeSummaryInput,
  db: Database,
): Promise<{ success: boolean; message: string }> {
  const codeGraph = new CodeGraphStorage(db);

  // Get the node
  const node = await codeGraph.getNode(input.nodeId);
  if (!node) {
    return {
      success: false,
      message: `Node not found: ${input.nodeId}`,
    };
  }

  // Update summary
  node.summary = input.summary;
  node.metadata = {
    ...node.metadata,
    summaryGeneratedBy: "client",
    summaryUpdatedAt: Date.now(),
  };

  await codeGraph.upsertNode(node);

  return {
    success: true,
    message: `Summary updated for ${node.name}`,
  };
}
