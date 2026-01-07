import { z } from "zod";
import type { Database } from "bun:sqlite";

export const BatchUpdateSummariesInputSchema = z.object({
	summaries: z
		.array(
			z.object({
				nodeId: z.string().describe("Node ID to update"),
				summary: z.string().describe("AI-generated summary"),
			}),
		)
		.min(1)
		.max(50)
		.describe("Array of node summaries to update"),
});

export type BatchUpdateSummariesInput = z.infer<
	typeof BatchUpdateSummariesInputSchema
>;

/**
 * Batch update summaries for multiple nodes
 *
 * Efficiently updates multiple node summaries in one call.
 * Sets metadata.summaryGeneratedBy = 'ai' and clears needsAiSummary flag.
 */
export async function batchUpdateSummaries(
	input: BatchUpdateSummariesInput,
	db: Database,
): Promise<{
	updated: number;
	failed: number;
	message: string;
}> {
	const now = Math.floor(Date.now() / 1000);
	let updated = 0;
	let failed = 0;

	// Use a transaction for efficiency
	const updateStmt = db.prepare(`
		UPDATE code_nodes
		SET
			summary = ?,
			metadata = json_set(
				json_set(
					json_set(metadata, '$.summaryGeneratedBy', 'ai'),
					'$.summaryConfidence', 0.95
				),
				'$.needsAiSummary', 0
			),
			updated_at = ?
		WHERE id = ?
	`);

	const transaction = db.transaction(() => {
		for (const { nodeId, summary } of input.summaries) {
			try {
				const result = updateStmt.run(summary, now, nodeId);
				if (result.changes > 0) {
					updated++;
				} else {
					failed++;
				}
			} catch (error) {
				console.warn(`Failed to update summary for ${nodeId}:`, error);
				failed++;
			}
		}
	});

	transaction();

	const message =
		failed > 0
			? `Updated ${updated} summaries, ${failed} failed.`
			: `Successfully updated ${updated} summaries.`;

	return { updated, failed, message };
}
