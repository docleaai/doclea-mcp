/**
 * Staleness MCP Tool Handler
 *
 * Provides check, scan, and refresh actions for memory staleness detection.
 */

import { z } from "zod";
import type { ConfidenceDecayConfig } from "@/scoring/types";
import { StalenessDetector } from "@/staleness";
import type {
  ScanAllResult,
  StalenessConfig,
  StalenessResult,
} from "@/staleness/types";
import type { IStorageBackend } from "@/storage/interface";
import { type RefreshConfidenceResult, refreshConfidence } from "./refresh";

/**
 * Input schema for staleness tool
 */
export const StalenessInputSchema = z.object({
  action: z
    .enum(["check", "scan", "refresh"])
    .describe(
      "Action: 'check' single memory, 'scan' multiple memories, 'refresh' reset decay",
    ),
  memoryId: z
    .string()
    .optional()
    .describe("Memory ID (required for check/refresh actions)"),
  type: z
    .string()
    .optional()
    .describe("Filter by memory type (for scan action)"),
  limit: z
    .number()
    .min(1)
    .max(500)
    .default(100)
    .describe("Maximum memories to scan (default: 100)"),
  offset: z
    .number()
    .min(0)
    .default(0)
    .describe("Pagination offset (default: 0)"),
  minScore: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Minimum staleness score to include in results (0-1)"),
  newImportance: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("New importance value for refresh action (0-1)"),
});

export type StalenessInput = z.infer<typeof StalenessInputSchema>;

/**
 * Result type for staleness tool
 */
export type StalenessToolResult =
  | {
      action: "check";
      result: StalenessResult | null;
      message: string;
    }
  | {
      action: "scan";
      result: ScanAllResult;
      message: string;
    }
  | {
      action: "refresh";
      result: RefreshConfidenceResult;
      message: string;
    };

/**
 * Execute staleness tool action.
 *
 * @param input - Tool input
 * @param storage - Storage backend
 * @param stalenessConfig - Optional staleness configuration
 * @param decayConfig - Optional decay configuration for refresh action
 * @returns Result based on action type
 */
export async function handleStaleness(
  input: StalenessInput,
  storage: IStorageBackend,
  stalenessConfig?: Partial<StalenessConfig>,
  decayConfig?: ConfidenceDecayConfig,
): Promise<StalenessToolResult> {
  const detector = new StalenessDetector(storage, stalenessConfig);

  try {
    await detector.initialize();

    switch (input.action) {
      case "check":
        return handleCheck(input, detector);

      case "scan":
        return handleScan(input, detector);

      case "refresh":
        return handleRefresh(input, storage, decayConfig);

      default: {
        const exhaustiveCheck: never = input.action;
        throw new Error(`Unknown action: ${exhaustiveCheck}`);
      }
    }
  } finally {
    await detector.dispose();
  }
}

/**
 * Handle check action for a single memory.
 */
async function handleCheck(
  input: StalenessInput,
  detector: StalenessDetector,
): Promise<StalenessToolResult> {
  if (!input.memoryId) {
    return {
      action: "check",
      result: null,
      message: "memoryId is required for check action",
    };
  }

  const result = await detector.checkMemory(input.memoryId);

  if (!result) {
    return {
      action: "check",
      result: null,
      message: `Memory ${input.memoryId} not found or staleness detection disabled`,
    };
  }

  const message = formatCheckMessage(result);

  return {
    action: "check",
    result,
    message,
  };
}

/**
 * Handle scan action for multiple memories.
 */
async function handleScan(
  input: StalenessInput,
  detector: StalenessDetector,
): Promise<StalenessToolResult> {
  const result = await detector.scanAll({
    type: input.type,
    limit: input.limit,
    offset: input.offset,
    minScore: input.minScore,
  });

  const message = formatScanMessage(result);

  return {
    action: "scan",
    result,
    message,
  };
}

/**
 * Handle refresh action for a single memory.
 */
function handleRefresh(
  input: StalenessInput,
  storage: IStorageBackend,
  decayConfig?: ConfidenceDecayConfig,
): StalenessToolResult {
  if (!input.memoryId) {
    return {
      action: "refresh",
      result: {
        success: false,
        memoryId: "",
        before: { importance: 0, lastRefreshedAt: null },
        after: { importance: 0, lastRefreshedAt: 0 },
        message: "memoryId is required for refresh action",
      },
      message: "memoryId is required for refresh action",
    };
  }

  const result = refreshConfidence(
    {
      memoryId: input.memoryId,
      newImportance: input.newImportance,
    },
    storage,
    decayConfig,
  );

  return {
    action: "refresh",
    result,
    message: result.message,
  };
}

/**
 * Format check result message.
 */
function formatCheckMessage(result: StalenessResult): string {
  const parts: string[] = [];

  parts.push(
    `Staleness check for ${result.memoryId}: score ${result.compositeScore.toFixed(2)} (${result.recommendedAction})`,
  );

  if (result.signals.length > 0) {
    parts.push("\nSignals:");
    for (const signal of result.signals) {
      parts.push(
        `  - ${signal.strategy}: ${signal.score.toFixed(2)} (weight: ${signal.weight}) - ${signal.reason}`,
      );
    }
  }

  return parts.join("\n");
}

/**
 * Format scan result message.
 */
function formatScanMessage(result: ScanAllResult): string {
  const parts: string[] = [];

  parts.push(`Scanned ${result.scanned} memories`);
  parts.push(`Found ${result.results.length} stale memories`);

  if (result.pagination.hasMore) {
    parts.push(
      `\nMore results available (offset: ${result.pagination.offset + result.pagination.limit})`,
    );
  }

  // Summarize by action
  const actionCounts = {
    archive: 0,
    refresh: 0,
    review: 0,
    none: 0,
  };

  for (const r of result.results) {
    actionCounts[r.recommendedAction]++;
  }

  if (result.results.length > 0) {
    parts.push("\nRecommended actions:");
    if (actionCounts.archive > 0) {
      parts.push(`  - Archive: ${actionCounts.archive}`);
    }
    if (actionCounts.refresh > 0) {
      parts.push(`  - Refresh: ${actionCounts.refresh}`);
    }
    if (actionCounts.review > 0) {
      parts.push(`  - Review: ${actionCounts.review}`);
    }
  }

  return parts.join("\n");
}
