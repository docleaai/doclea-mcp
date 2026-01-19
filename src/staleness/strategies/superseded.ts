/**
 * Superseded Strategy
 *
 * Detects when a memory has been superseded by another memory.
 * If a memory has incoming "supersedes" relations, it's immediately stale (score: 1.0).
 */

import type { MemoryRelationStorage } from "@/database/memory-relations";
import type { Memory } from "@/types";
import type { StalenessSignal, SupersededStrategyConfig } from "../types";
import {
  BaseStalenessStrategy,
  type IStalenessStrategy,
  type StrategyContext,
} from "./base";

/**
 * Extended context for superseded strategy
 */
export interface SupersededStrategyContext extends StrategyContext {
  relationStorage: MemoryRelationStorage;
}

/**
 * Superseded detection strategy.
 *
 * Weight: 1.0 (highest) - being superseded is a definitive staleness signal.
 * If any memory supersedes this one, the score is immediately 1.0.
 */
export class SupersededStrategy
  extends BaseStalenessStrategy
  implements IStalenessStrategy
{
  readonly type = "superseded" as const;
  readonly weight: number;

  constructor(config: SupersededStrategyConfig) {
    super();
    this.weight = config.weight;
  }

  async check(
    memory: Memory,
    context: StrategyContext,
  ): Promise<StalenessSignal | null> {
    // Need relation storage in context
    const ctx = context as SupersededStrategyContext;
    if (!ctx.relationStorage) {
      return null;
    }

    // Check for incoming "supersedes" relations
    const supersedingRelations = await ctx.relationStorage.getRelationsTo(
      memory.id,
      "supersedes",
    );

    if (supersedingRelations.length === 0) {
      return null; // Not superseded
    }

    // Memory is superseded - immediately stale
    const supersedingIds = supersedingRelations.map((r) => r.sourceId);
    const reason =
      supersedingRelations.length === 1
        ? `Superseded by memory ${supersedingIds[0]}`
        : `Superseded by ${supersedingRelations.length} memories: ${supersedingIds.slice(0, 3).join(", ")}${supersedingIds.length > 3 ? "..." : ""}`;

    return this.createSignal(1.0, reason, {
      supersedingMemoryIds: supersedingIds,
      supersedingCount: supersedingRelations.length,
    });
  }
}
