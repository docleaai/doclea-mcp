import type { Database } from "bun:sqlite";
import { z } from "zod";
import { CodeGraphStorage } from "../../database/code-graph";
import type { ImpactAnalysisResult } from "./types";

export const AnalyzeImpactInputSchema = z.object({
  nodeId: z.string().optional().describe("Node ID to analyze impact for"),
  functionName: z
    .string()
    .optional()
    .describe("Function/class name to analyze"),
  depth: z
    .number()
    .min(1)
    .max(5)
    .default(3)
    .describe("How many levels deep to analyze"),
});

export type AnalyzeImpactInput = z.infer<typeof AnalyzeImpactInputSchema>;

export async function analyzeImpact(
  input: AnalyzeImpactInput,
  db: Database,
): Promise<{
  result: ImpactAnalysisResult;
  message: string;
}> {
  const codeGraph = new CodeGraphStorage(db);

  let nodeId = input.nodeId;

  if (!nodeId && input.functionName) {
    // Try to find by name - function, class, interface, or any
    let node = await codeGraph.findNodeByName(input.functionName, "function");
    if (!node) {
      node = await codeGraph.findNodeByName(input.functionName, "class");
    }
    if (!node) {
      node = await codeGraph.findNodeByName(input.functionName, "interface");
    }
    if (!node) {
      node = await codeGraph.findNodeByName(input.functionName);
    }
    if (!node) {
      return {
        result: {
          affectedNodes: [],
          affectedEdges: [],
          depth: 0,
          breakingChanges: [],
        },
        message: `Node not found: ${input.functionName}`,
      };
    }
    nodeId = node.id;
  }

  if (!nodeId) {
    return {
      result: {
        affectedNodes: [],
        affectedEdges: [],
        depth: 0,
        breakingChanges: [],
      },
      message: "Must provide nodeId or functionName",
    };
  }

  const result = await codeGraph.analyzeImpact(nodeId, input.depth);

  const highCount = result.breakingChanges.filter(
    (c) => c.severity === "high",
  ).length;
  const mediumCount = result.breakingChanges.filter(
    (c) => c.severity === "medium",
  ).length;
  const lowCount = result.breakingChanges.filter(
    (c) => c.severity === "low",
  ).length;

  const message =
    result.affectedNodes.length > 0
      ? `Impact analysis: ${result.affectedNodes.length} affected nodes. ` +
        `Breaking changes: ${highCount} high, ${mediumCount} medium, ${lowCount} low severity.`
      : "No dependent nodes found - this node appears to be a leaf or isolated.";

  return { result, message };
}
