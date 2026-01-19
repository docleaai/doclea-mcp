/**
 * Base Strategy Interface
 *
 * Defines the contract for all staleness detection strategies.
 */

import type { Memory } from "@/types";
import type { StalenessSignal, StalenessStrategyType } from "../types";

/**
 * Context passed to all strategies during detection
 */
export interface StrategyContext {
  /** Current timestamp for consistent time calculations */
  now: number;
  /** Optional additional data passed from detector */
  [key: string]: unknown;
}

/**
 * Interface for staleness detection strategies.
 *
 * Strategies implement the Strategy pattern for extensibility.
 * Each strategy examines a specific aspect of potential staleness.
 */
export interface IStalenessStrategy {
  /**
   * Unique identifier for this strategy type
   */
  readonly type: StalenessStrategyType;

  /**
   * Weight of this strategy in the composite score (0-1)
   */
  readonly weight: number;

  /**
   * Check a memory for staleness signals from this strategy.
   *
   * @param memory - The memory to check
   * @param context - Shared context for consistent calculations
   * @returns Signal with score and reason, or null if not applicable
   */
  check(
    memory: Memory,
    context: StrategyContext,
  ): Promise<StalenessSignal | null>;

  /**
   * Initialize any resources needed by this strategy.
   * Called once when the detector starts.
   */
  initialize?(): Promise<void>;

  /**
   * Clean up any resources used by this strategy.
   * Called when the detector is disposed.
   */
  dispose?(): Promise<void>;
}

/**
 * Abstract base class providing common functionality for strategies.
 */
export abstract class BaseStalenessStrategy implements IStalenessStrategy {
  abstract readonly type: StalenessStrategyType;
  abstract readonly weight: number;

  /**
   * Create a signal with this strategy's type and weight
   */
  protected createSignal(
    score: number,
    reason: string,
    metadata?: Record<string, unknown>,
  ): StalenessSignal {
    return {
      strategy: this.type,
      score: Math.max(0, Math.min(1, score)), // Clamp to [0, 1]
      weight: this.weight,
      reason,
      metadata,
    };
  }

  abstract check(
    memory: Memory,
    context: StrategyContext,
  ): Promise<StalenessSignal | null>;
}
