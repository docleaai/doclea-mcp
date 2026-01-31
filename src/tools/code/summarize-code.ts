import type { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import { z } from "zod";
import {
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_INCLUDE_PATTERNS,
  discoverFiles,
} from "@/utils";
import { chunkCodeFile } from "../../chunking/code";
import { CodeSummarizer } from "./summarizer";
import type { SummaryStats, SummaryStrategy } from "./types";

export const SummarizeCodeInputSchema = z.object({
  filePath: z.string().optional().describe("Specific file to process"),
  directory: z.string().optional().describe("Directory to scan for code files"),
  patterns: z
    .array(z.string())
    .optional()
    .describe("Glob patterns for files (e.g., ['**/*.ts', '**/*.js'])"),
  strategy: z
    .enum(["heuristic", "hybrid"])
    .default("hybrid")
    .describe("Summary generation strategy"),
  forceRegenerate: z
    .boolean()
    .default(false)
    .describe("Regenerate existing summaries"),
  preferAiForExported: z
    .boolean()
    .default(true)
    .describe("Flag exported/public APIs for AI summarization"),
});

export type SummarizeCodeInput = z.infer<typeof SummarizeCodeInputSchema>;

interface NodeNeedingAi {
  nodeId: string;
  name: string;
  type: string;
  filePath: string;
  code: string;
}

/**
 * Run heuristic summarization on code and identify nodes needing AI
 *
 * This tool:
 * 1. Scans specified files/directory for code
 * 2. Extracts summaries using heuristics (JSDoc, docstrings, comments)
 * 3. Returns list of nodes that need AI-generated summaries
 *
 * The host LLM can then generate summaries and call batch_update_summaries
 */
export async function summarizeCode(
  input: SummarizeCodeInput,
  db: Database,
): Promise<{
  stats: SummaryStats;
  needsAiSummary: NodeNeedingAi[];
  message: string;
}> {
  const summarizer = new CodeSummarizer({
    enabled: true,
    strategy: input.strategy as SummaryStrategy,
    preferAiForExported: input.preferAiForExported,
    minConfidenceThreshold: 0.6,
  });

  const stats: SummaryStats = {
    totalNodes: 0,
    summarized: 0,
    needsAiSummary: 0,
    bySource: {},
  };

  const needsAiSummary: NodeNeedingAi[] = [];

  // Determine files to process
  let files: string[] = [];

  if (input.filePath) {
    files = [input.filePath];
  } else if (input.directory || input.patterns) {
    const baseDir = input.directory || process.cwd();
    const patterns = input.patterns || [...DEFAULT_INCLUDE_PATTERNS];
    const exclude = [...DEFAULT_EXCLUDE_PATTERNS];

    files = await discoverFiles({
      include: patterns,
      exclude,
      cwd: baseDir,
      debug: process.env.DOCLEA_DEBUG === "true",
    });
  } else {
    return {
      stats,
      needsAiSummary,
      message: "Must provide filePath, directory, or patterns",
    };
  }

  const now = Math.floor(Date.now() / 1000);

  // Process each file
  for (const filePath of files) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const chunks = await chunkCodeFile(content, filePath);

      for (const chunk of chunks) {
        // Skip imports and non-code chunks
        if (
          chunk.metadata.isImport ||
          (!chunk.metadata.isFunction && !chunk.metadata.isClass)
        ) {
          continue;
        }

        stats.totalNodes++;

        // Check if node already has summary (unless forcing regenerate)
        if (!input.forceRegenerate) {
          const nodeId = `${filePath}:${chunk.metadata.isClass ? "class" : "function"}:${chunk.metadata.name || "anonymous"}`;
          const existing = db
            .query("SELECT summary, metadata FROM code_nodes WHERE id = ?")
            .get(nodeId) as any;

          if (existing?.summary) {
            const metadata = JSON.parse(existing.metadata || "{}");
            if (
              metadata.summaryGeneratedBy === "ai" ||
              metadata.summaryConfidence >= 0.8
            ) {
              stats.summarized++;
              stats.bySource[metadata.summaryGeneratedBy || "existing"] =
                (stats.bySource[metadata.summaryGeneratedBy || "existing"] ||
                  0) + 1;
              continue;
            }
          }
        }

        // Generate summary
        const summary = await summarizer.summarize(chunk);
        stats.summarized++;
        stats.bySource[summary.generatedBy] =
          (stats.bySource[summary.generatedBy] || 0) + 1;

        // Update database
        const nodeId = `${filePath}:${chunk.metadata.isClass ? "class" : "function"}:${chunk.metadata.name || "anonymous"}`;

        db.query(
          `
					UPDATE code_nodes
					SET
						summary = ?,
						metadata = json_set(
							json_set(
								json_set(metadata, '$.summaryGeneratedBy', ?),
								'$.summaryConfidence', ?
							),
							'$.needsAiSummary', ?
						),
						updated_at = ?
					WHERE id = ?
				`,
        ).run(
          summary.summary,
          summary.generatedBy,
          summary.confidence,
          summary.needsAiSummary ? 1 : 0,
          now,
          nodeId,
        );

        // Track nodes needing AI
        if (summary.needsAiSummary) {
          stats.needsAiSummary++;
          needsAiSummary.push({
            nodeId,
            name: chunk.metadata.name || "anonymous",
            type: chunk.metadata.isClass ? "class" : "function",
            filePath,
            code: chunk.content,
          });
        }
      }
    } catch (error) {
      console.warn(`Failed to process ${filePath}:`, error);
    }
  }

  // Build message
  let message = `Processed ${stats.totalNodes} code units from ${files.length} file(s). `;
  message += `Summarized: ${stats.summarized}. `;

  if (stats.needsAiSummary > 0) {
    message += `${stats.needsAiSummary} node(s) need AI summaries.`;
  } else {
    message += "All nodes have adequate summaries.";
  }

  return { stats, needsAiSummary, message };
}
