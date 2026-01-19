/**
 * Staleness Detector
 *
 * Main class for detecting stale memories using multiple strategies.
 */

import { MemoryRelationStorage } from "@/database/memory-relations";
import type { IStorageBackend } from "@/storage/interface";
import type { Memory } from "@/types";
import {
  GitChangesStrategy,
  type IStalenessStrategy,
  RelatedUpdatesStrategy,
  type StrategyContext,
  SupersededStrategy,
  TimeDecayStrategy,
} from "./strategies";
import type {
  ScanAllOptions,
  ScanAllResult,
  StalenessAction,
  StalenessConfig,
  StalenessResult,
  StalenessSignal,
} from "./types";
import { DEFAULT_STALENESS_CONFIG } from "./types";

/**
 * StalenessDetector orchestrates multiple staleness detection strategies
 * to determine which memories may need review, refresh, or archiving.
 */
export class StalenessDetector {
  private readonly config: StalenessConfig;
  private readonly storage: IStorageBackend;
  private readonly relationStorage: MemoryRelationStorage;
  private readonly strategies: IStalenessStrategy[];
  private initialized = false;

  constructor(storage: IStorageBackend, config?: Partial<StalenessConfig>) {
    this.storage = storage;
    this.relationStorage = new MemoryRelationStorage(storage.getDatabase());
    this.config = {
      ...DEFAULT_STALENESS_CONFIG,
      ...config,
      thresholds: {
        ...DEFAULT_STALENESS_CONFIG.thresholds,
        ...config?.thresholds,
      },
      strategies: {
        ...DEFAULT_STALENESS_CONFIG.strategies,
        ...config?.strategies,
        timeDecay: {
          ...DEFAULT_STALENESS_CONFIG.strategies.timeDecay,
          ...config?.strategies?.timeDecay,
        },
        gitChanges: {
          ...DEFAULT_STALENESS_CONFIG.strategies.gitChanges,
          ...config?.strategies?.gitChanges,
        },
        relatedUpdates: {
          ...DEFAULT_STALENESS_CONFIG.strategies.relatedUpdates,
          ...config?.strategies?.relatedUpdates,
        },
        superseded: {
          ...DEFAULT_STALENESS_CONFIG.strategies.superseded,
          ...config?.strategies?.superseded,
        },
      },
    };

    // Initialize strategies
    this.strategies = [
      new SupersededStrategy(this.config.strategies.superseded),
      new TimeDecayStrategy(this.config.strategies.timeDecay),
      new GitChangesStrategy(this.config.strategies.gitChanges),
      new RelatedUpdatesStrategy(this.config.strategies.relatedUpdates),
    ];
  }

  /**
   * Initialize all strategies.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    for (const strategy of this.strategies) {
      if (strategy.initialize) {
        await strategy.initialize();
      }
    }

    this.initialized = true;
  }

  /**
   * Dispose all strategies and clean up resources.
   */
  async dispose(): Promise<void> {
    for (const strategy of this.strategies) {
      if (strategy.dispose) {
        await strategy.dispose();
      }
    }
    this.initialized = false;
  }

  /**
   * Check a single memory for staleness.
   */
  async checkMemory(memoryId: string): Promise<StalenessResult | null> {
    if (!this.config.enabled) {
      return null;
    }

    // Get the memory
    const memory = this.storage.getMemory(memoryId);
    if (!memory) {
      return null;
    }

    return this.checkMemoryObject(memory);
  }

  /**
   * Check a memory object for staleness (internal use).
   */
  private async checkMemoryObject(memory: Memory): Promise<StalenessResult> {
    const now = Math.floor(Date.now() / 1000);
    const context: StrategyContext = {
      now,
      relationStorage: this.relationStorage,
      storage: this.storage,
    };

    // Collect signals from all strategies
    const signals: StalenessSignal[] = [];

    for (const strategy of this.strategies) {
      try {
        const signal = await strategy.check(memory, context);
        if (signal) {
          signals.push(signal);
        }
      } catch (error) {
        // Log but continue with other strategies
        console.error(
          `[staleness] Strategy ${strategy.type} failed for memory ${memory.id}:`,
          error,
        );
      }
    }

    // Calculate composite score
    const compositeScore = this.calculateCompositeScore(signals);

    // Determine recommended action
    const recommendedAction = this.determineAction(compositeScore);

    return {
      memoryId: memory.id,
      compositeScore,
      signals,
      recommendedAction,
      checkedAt: now,
    };
  }

  /**
   * Scan all memories for staleness.
   */
  async scanAll(options: Partial<ScanAllOptions> = {}): Promise<ScanAllResult> {
    if (!this.config.enabled) {
      return {
        scanned: 0,
        results: [],
        pagination: {
          offset: 0,
          limit: options.limit ?? 100,
          hasMore: false,
        },
      };
    }

    const { type, limit = 100, offset = 0, minScore = 0 } = options;

    // Get memories to scan
    const allMemories = this.storage.listMemories({
      type: type as Memory["type"] | undefined,
    });

    // Apply pagination
    const paginatedMemories = allMemories.slice(offset, offset + limit);

    // Check each memory
    const results: StalenessResult[] = [];

    for (const memory of paginatedMemories) {
      try {
        const result = await this.checkMemoryObject(memory);
        if (result.compositeScore >= minScore) {
          results.push(result);
        }
      } catch (error) {
        console.error(
          `[staleness] Failed to check memory ${memory.id}:`,
          error,
        );
      }
    }

    // Sort by composite score (highest first)
    results.sort((a, b) => b.compositeScore - a.compositeScore);

    return {
      scanned: paginatedMemories.length,
      results,
      pagination: {
        offset,
        limit,
        hasMore: offset + limit < allMemories.length,
      },
    };
  }

  /**
   * Calculate composite staleness score from signals.
   * Uses weighted average with special handling for superseded.
   */
  private calculateCompositeScore(signals: StalenessSignal[]): number {
    if (signals.length === 0) {
      return 0;
    }

    // Check for superseded signal first - if present with score 1.0, return immediately
    const supersededSignal = signals.find(
      (s) => s.strategy === "superseded" && s.score >= 1.0,
    );
    if (supersededSignal) {
      return 1.0;
    }

    // Calculate weighted average for other signals
    let totalWeight = 0;
    let weightedSum = 0;

    for (const signal of signals) {
      weightedSum += signal.score * signal.weight;
      totalWeight += signal.weight;
    }

    if (totalWeight === 0) {
      return 0;
    }

    return Math.min(1.0, weightedSum / totalWeight);
  }

  /**
   * Determine recommended action based on composite score.
   */
  private determineAction(score: number): StalenessAction {
    const { thresholds } = this.config;

    if (score >= thresholds.archive) {
      return "archive";
    }
    if (score >= thresholds.refresh) {
      return "refresh";
    }
    if (score >= thresholds.review) {
      return "review";
    }
    return "none";
  }

  /**
   * Get the current configuration.
   */
  getConfig(): StalenessConfig {
    return { ...this.config };
  }
}
