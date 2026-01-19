import type { Database } from "bun:sqlite";
import { z } from "zod";
import { CodeGraphStorage } from "../../database/code-graph";
import type { CodeNode } from "./types";

export const FindImplementationsInputSchema = z.object({
  interfaceName: z
    .string()
    .describe("Name of the interface to find implementations for"),
  interfaceId: z
    .string()
    .optional()
    .describe("Direct interface node ID if known"),
});

export type FindImplementationsInput = z.infer<
  typeof FindImplementationsInputSchema
>;

export async function findImplementations(
  input: FindImplementationsInput,
  db: Database,
): Promise<{
  implementations: CodeNode[];
  message: string;
}> {
  const codeGraph = new CodeGraphStorage(db);

  let interfaceId = input.interfaceId;

  if (!interfaceId && input.interfaceName) {
    const interfaceNode = await codeGraph.findNodeByName(
      input.interfaceName,
      "interface",
    );
    if (!interfaceNode) {
      return {
        implementations: [],
        message: `Interface not found: ${input.interfaceName}`,
      };
    }
    interfaceId = interfaceNode.id;
  }

  if (!interfaceId) {
    return {
      implementations: [],
      message: "Must provide interfaceName or interfaceId",
    };
  }

  const implementations = await codeGraph.findImplementations(interfaceId);

  const message =
    implementations.length > 0
      ? `Found ${implementations.length} class(es) implementing the interface`
      : "No implementations found for this interface";

  return { implementations, message };
}
