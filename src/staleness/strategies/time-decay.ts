/**
 * Time Decay Strategy
 *
 * Detects staleness based on how long it's been since a memory was last
 * refreshed or accessed.
 */

import { differenceInSeconds } from "date-fns";
import type { Memory } from "@/types";
import type { StalenessSignal, TimeDecayStrategyConfig } from "../types";
import {
  BaseStalenessStrategy,
  type IStalenessStrategy,
  type StrategyContext,
} from "./base";

const SECONDS_PER_DAY = 86400;

/**
 * Time-based staleness detection.
 *
 * Weight: 0.5 (medium) - time alone doesn't guarantee staleness.
 * Score increases linearly from 0 to 1 as age approaches the threshold.
 * After threshold, score is 1.0.
 */
export class TimeDecayStrategy
  extends BaseStalenessStrategy
  implements IStalenessStrategy
{
  readonly type = "time_decay" as const;
  readonly weight: number;
  private readonly thresholdDays: number;

  constructor(config: TimeDecayStrategyConfig) {
    super();
    this.weight = config.weight;
    this.thresholdDays = config.thresholdDays;
  }

  async check(
    memory: Memory,
    context: StrategyContext,
  ): Promise<StalenessSignal | null> {
    const now = context.now;

    // Determine the most recent relevant timestamp
    // Priority: lastRefreshedAt > accessedAt > createdAt
    const anchor = this.getAnchorTimestamp(memory);

    // Calculate age in days using date-fns
    // Convert Unix timestamps (seconds) to Date objects for date-fns
    const nowDate = new Date(now * 1000);
    const anchorDate = new Date(anchor * 1000);
    const ageSeconds = Math.max(0, differenceInSeconds(nowDate, anchorDate));
    const ageDays = ageSeconds / SECONDS_PER_DAY;

    // If very recent, no staleness signal
    if (ageDays < 7) {
      return null;
    }

    // Calculate score: linear progression from 0 to 1 over threshold period
    // Score of 1.0 when age >= thresholdDays
    const score = Math.min(1.0, ageDays / this.thresholdDays);

    // Only return signal if score is meaningful
    if (score < 0.1) {
      return null;
    }

    const reason = this.formatReason(ageDays, score);

    return this.createSignal(score, reason, {
      ageDays: Math.round(ageDays),
      thresholdDays: this.thresholdDays,
      anchorTimestamp: anchor,
      anchorType: this.getAnchorType(memory),
    });
  }

  /**
   * Get the anchor timestamp for staleness calculation.
   * Uses the most recent of lastRefreshedAt, accessedAt, or createdAt.
   */
  private getAnchorTimestamp(memory: Memory): number {
    if (memory.lastRefreshedAt != null) {
      return memory.lastRefreshedAt;
    }

    // Use the more recent of accessedAt or createdAt
    return Math.max(memory.accessedAt, memory.createdAt);
  }

  /**
   * Get a descriptive name for the anchor being used.
   */
  private getAnchorType(memory: Memory): string {
    if (memory.lastRefreshedAt != null) {
      return "lastRefreshedAt";
    }
    if (memory.accessedAt > memory.createdAt) {
      return "accessedAt";
    }
    return "createdAt";
  }

  /**
   * Format a human-readable reason for the staleness.
   */
  private formatReason(ageDays: number, score: number): string {
    const daysRounded = Math.round(ageDays);

    if (ageDays >= this.thresholdDays) {
      return `Memory has not been accessed or refreshed in ${daysRounded} days (threshold: ${this.thresholdDays} days)`;
    }

    const percentStale = Math.round(score * 100);
    return `Memory is ${daysRounded} days old (${percentStale}% toward ${this.thresholdDays}-day threshold)`;
  }
}
