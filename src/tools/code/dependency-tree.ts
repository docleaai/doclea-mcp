import type { Database } from "bun:sqlite";
import { z } from "zod";
import { CodeGraphStorage } from "../../database/code-graph";
import type { CallGraphResult, DependencyTreeDirection } from "./types";

export const GetDependencyTreeInputSchema = z.object({
  modulePath: z.string().optional().describe("File path of the module"),
  moduleId: z.string().optional().describe("Module node ID if known"),
  depth: z
    .number()
    .min(1)
    .max(10)
    .default(3)
    .describe("How many levels deep to traverse"),
  direction: z
    .enum(["imports", "importedBy", "both"])
    .default("imports")
    .describe(
      "Direction: 'imports' (what this imports), 'importedBy' (what imports this), 'both'",
    ),
});

export type GetDependencyTreeInput = z.infer<
  typeof GetDependencyTreeInputSchema
>;

export async function getDependencyTree(
  input: GetDependencyTreeInput,
  db: Database,
): Promise<{
  tree: CallGraphResult;
  message: string;
}> {
  const codeGraph = new CodeGraphStorage(db);

  let moduleId = input.moduleId;

  if (!moduleId && input.modulePath) {
    // Try with :module suffix first
    moduleId = `${input.modulePath}:module`;
    const node = await codeGraph.getNode(moduleId);
    if (!node) {
      // Try to find a module node by path
      const nodes = await codeGraph.getNodesByPath(input.modulePath);
      const moduleNode = nodes.find((n) => n.type === "module");
      if (moduleNode) {
        moduleId = moduleNode.id;
      } else {
        return {
          tree: { nodes: [], edges: [] },
          message: `Module not found: ${input.modulePath}`,
        };
      }
    }
  }

  if (!moduleId) {
    return {
      tree: { nodes: [], edges: [] },
      message: "Must provide modulePath or moduleId",
    };
  }

  // Get dependency tree with direction
  const direction = (input.direction || "imports") as DependencyTreeDirection;
  const tree = await codeGraph.getDependencyTree(
    moduleId,
    input.depth,
    direction,
  );

  const directionDesc =
    direction === "imports"
      ? "dependencies"
      : direction === "importedBy"
        ? "dependents"
        : "all connections";
  const message = `Found ${tree.nodes.length} modules and ${tree.edges.length} ${directionDesc}`;

  return { tree, message };
}
