/**
 * Related Updates Strategy
 *
 * Detects staleness when memories related to this one have been updated
 * more recently. If a memory's relations are fresher, it may need review.
 */

import type { MemoryRelationStorage } from "@/database/memory-relations";
import type { IStorageBackend } from "@/storage/interface";
import type { Memory } from "@/types";
import type { RelatedUpdatesStrategyConfig, StalenessSignal } from "../types";
import {
  BaseStalenessStrategy,
  type IStalenessStrategy,
  type StrategyContext,
} from "./base";

/**
 * Extended context for related updates strategy
 */
export interface RelatedUpdatesStrategyContext extends StrategyContext {
  relationStorage: MemoryRelationStorage;
  storage: IStorageBackend;
}

/**
 * Related memory update detection.
 *
 * Weight: 0.4 (medium-low) - related updates suggest review but aren't definitive.
 * Checks if memories this one references/extends have been updated more recently.
 */
export class RelatedUpdatesStrategy
  extends BaseStalenessStrategy
  implements IStalenessStrategy
{
  readonly type = "related_updates" as const;
  readonly weight: number;
  private readonly maxDepth: number;

  constructor(config: RelatedUpdatesStrategyConfig) {
    super();
    this.weight = config.weight;
    this.maxDepth = config.maxDepth;
  }

  async check(
    memory: Memory,
    context: StrategyContext,
  ): Promise<StalenessSignal | null> {
    const ctx = context as RelatedUpdatesStrategyContext;
    if (!ctx.relationStorage || !ctx.storage) {
      return null;
    }

    // Get the memory's anchor timestamp
    const memoryAnchor = this.getMemoryAnchor(memory);

    // Find related memories that this memory depends on
    // (outgoing relations indicate dependencies)
    const fresherRelated = await this.findFresherRelated(
      memory.id,
      memoryAnchor,
      ctx,
    );

    if (fresherRelated.length === 0) {
      return null;
    }

    // Calculate score based on how many related memories are fresher
    // and how much fresher they are
    const score = this.calculateScore(fresherRelated, memoryAnchor);

    if (score < 0.1) {
      return null;
    }

    const reason = this.formatReason(fresherRelated);

    return this.createSignal(score, reason, {
      fresherRelatedCount: fresherRelated.length,
      fresherMemories: fresherRelated.map((r) => ({
        id: r.memory.id,
        title: r.memory.title,
        relationType: r.relationType,
        updatedAt: r.updatedAt,
      })),
    });
  }

  /**
   * Get the anchor timestamp for the memory.
   */
  private getMemoryAnchor(memory: Memory): number {
    if (memory.lastRefreshedAt != null) {
      return memory.lastRefreshedAt;
    }
    return Math.max(memory.accessedAt, memory.createdAt);
  }

  /**
   * Find related memories that have been updated more recently.
   * Uses BFS with depth limit and visited tracking to prevent cycles.
   */
  private async findFresherRelated(
    memoryId: string,
    memoryAnchor: number,
    ctx: RelatedUpdatesStrategyContext,
  ): Promise<
    Array<{
      memory: Memory;
      relationType: string;
      updatedAt: number;
      depth: number;
    }>
  > {
    const fresherRelated: Array<{
      memory: Memory;
      relationType: string;
      updatedAt: number;
      depth: number;
    }> = [];

    // Track visited IDs to prevent cycles
    const visitedIds = new Set<string>([memoryId]);

    // BFS queue: [targetId, relationType, depth]
    const queue: Array<[string, string, number]> = [];

    // Get direct outgoing relations (what this memory references/extends)
    const directRelations =
      await ctx.relationStorage.getRelationsFrom(memoryId);
    for (const relation of directRelations) {
      if (!visitedIds.has(relation.targetId)) {
        queue.push([relation.targetId, relation.type, 1]);
        visitedIds.add(relation.targetId);
      }
    }

    // BFS traversal up to maxDepth
    while (queue.length > 0) {
      const [targetId, relationType, depth] = queue.shift()!;

      // Get the related memory
      const relatedMemory = ctx.storage.getMemory(targetId);
      if (!relatedMemory) continue;

      // Check if this related memory is fresher
      const relatedAnchor = this.getMemoryAnchor(relatedMemory);
      if (relatedAnchor > memoryAnchor) {
        fresherRelated.push({
          memory: relatedMemory,
          relationType,
          updatedAt: relatedAnchor,
          depth,
        });
      }

      // Continue traversal if within depth limit
      if (depth < this.maxDepth) {
        const nextRelations =
          await ctx.relationStorage.getRelationsFrom(targetId);
        for (const relation of nextRelations) {
          if (!visitedIds.has(relation.targetId)) {
            queue.push([relation.targetId, relation.type, depth + 1]);
            visitedIds.add(relation.targetId);
          }
        }
      }
    }

    return fresherRelated;
  }

  /**
   * Calculate staleness score based on fresher related memories.
   */
  private calculateScore(
    fresherRelated: Array<{
      memory: Memory;
      updatedAt: number;
      depth: number;
    }>,
    memoryAnchor: number,
  ): number {
    if (fresherRelated.length === 0) return 0;

    // Base score on count and freshness
    let totalWeight = 0;
    let weightedScore = 0;

    for (const related of fresherRelated) {
      // Weight by inverse depth (closer = higher weight)
      const depthWeight = 1 / related.depth;

      // Factor in how much fresher the related memory is
      const timeDiff = related.updatedAt - memoryAnchor;
      const daysDiff = timeDiff / 86400;
      // Freshness factor: 0.5 at 7 days, 1.0 at 30+ days
      const freshnessFactor = Math.min(1.0, 0.5 + (daysDiff / 30) * 0.5);

      weightedScore += depthWeight * freshnessFactor;
      totalWeight += depthWeight;
    }

    // Normalize to [0, 1]
    const normalizedScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

    // Scale: 1 fresher = 0.4 max, 2+ = up to 0.8, 5+ = up to 1.0
    const countFactor = Math.min(1.0, 0.4 + (fresherRelated.length - 1) * 0.15);

    return Math.min(1.0, normalizedScore * countFactor);
  }

  /**
   * Format a human-readable reason for the staleness.
   */
  private formatReason(
    fresherRelated: Array<{
      memory: Memory;
      relationType: string;
    }>,
  ): string {
    const count = fresherRelated.length;
    if (count === 1) {
      const r = fresherRelated[0];
      return `Related memory "${r.memory.title}" (${r.relationType}) was updated more recently`;
    }

    const titles = fresherRelated.slice(0, 2).map((r) => `"${r.memory.title}"`);
    const suffix = count > 2 ? ` and ${count - 2} more` : "";
    return `${count} related memories were updated more recently: ${titles.join(", ")}${suffix}`;
  }
}
