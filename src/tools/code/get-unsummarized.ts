import type { Database } from "bun:sqlite";
import { z } from "zod";
import type { UnsummarizedNode } from "./types";

export const GetUnsummarizedInputSchema = z.object({
  filePath: z.string().optional().describe("Filter by file path"),
  limit: z.number().min(1).max(50).default(10).describe("Max nodes to return"),
  includeCode: z
    .boolean()
    .default(true)
    .describe("Include code content for AI summarization"),
  confidenceThreshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.6)
    .describe("Return nodes with confidence below this threshold"),
});

export type GetUnsummarizedInput = z.infer<typeof GetUnsummarizedInputSchema>;

/**
 * Get nodes that need AI-generated summaries
 *
 * Returns nodes where:
 * - metadata.needsAiSummary = true, OR
 * - summary IS NULL, OR
 * - metadata.summaryConfidence < threshold
 */
export async function getUnsummarized(
  input: GetUnsummarizedInput,
  db: Database,
): Promise<{
  nodes: UnsummarizedNode[];
  total: number;
  message: string;
}> {
  const { filePath, limit, includeCode, confidenceThreshold } = input;

  // Build query to find nodes needing summaries
  let query = `
		SELECT
			id,
			name,
			type,
			file_path,
			start_line,
			end_line,
			summary,
			metadata
		FROM code_nodes
		WHERE (
			summary IS NULL
			OR summary = ''
			OR json_extract(metadata, '$.needsAiSummary') = 1
			OR json_extract(metadata, '$.summaryConfidence') < ?
		)
		AND type IN ('function', 'class', 'interface', 'type')
	`;

  const params: any[] = [confidenceThreshold];

  if (filePath) {
    query += " AND file_path = ?";
    params.push(filePath);
  }

  // Get total count first
  const countQuery = query.replace(
    /SELECT[\s\S]*?FROM/,
    "SELECT COUNT(*) as count FROM",
  );
  const countResult = db.query(countQuery).get(...params) as { count: number };
  const total = countResult?.count ?? 0;

  // Add limit and order
  query += " ORDER BY file_path, start_line LIMIT ?";
  params.push(limit);

  const rows = db.query(query).all(...params) as any[];

  const nodes: UnsummarizedNode[] = [];

  for (const row of rows) {
    const metadata = JSON.parse(row.metadata || "{}");

    let code = "";
    if (includeCode) {
      // Try to read code from file
      try {
        const fs = await import("node:fs/promises");
        const content = await fs.readFile(row.file_path, "utf-8");
        const lines = content.split("\n");
        const startLine = (row.start_line || 1) - 1;
        const endLine = row.end_line || startLine + 50;
        code = lines.slice(startLine, endLine).join("\n");
      } catch {
        // File might not exist or be inaccessible
        code = `[Unable to read code from ${row.file_path}]`;
      }
    }

    nodes.push({
      nodeId: row.id,
      name: row.name,
      type: row.type,
      filePath: row.file_path,
      code,
      currentSummary: row.summary || undefined,
      confidence: metadata.summaryConfidence ?? 0,
    });
  }

  const message =
    total > 0
      ? `Found ${total} nodes needing summaries. Returning ${nodes.length}.`
      : "No nodes need AI summaries.";

  return { nodes, total, message };
}
