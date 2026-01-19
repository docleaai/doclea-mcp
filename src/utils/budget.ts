/**
 * Token budget management for LLM context allocation
 *
 * Provides smart allocation of tokens across different categories:
 * - System prompts
 * - Context (RAG + KAG)
 * - User message
 * - Response buffer
 */

/**
 * Model context window configurations
 */
export const MODEL_CONTEXT_WINDOWS = {
  "gpt-4-turbo": 128000,
  "gpt-4": 8192,
  "gpt-3.5-turbo": 16385,
  "claude-opus": 200000,
  "claude-sonnet": 200000,
  "claude-haiku": 200000,
  "llama-3-70b": 8192,
  "llama-3-8b": 8192,
  "mistral-medium": 32000,
  "mixtral-8x7b": 32000,
} as const;

export type ModelName = keyof typeof MODEL_CONTEXT_WINDOWS;

/**
 * Budget category definitions
 */
export type BudgetCategory = "system" | "context" | "user" | "response";

/**
 * Budget allocation configuration
 */
export interface BudgetConfig {
  /** Total token budget (e.g., model context window) */
  totalBudget: number;
  /** Ratio allocations per category (must sum to 1.0) */
  ratios: Record<BudgetCategory, number>;
  /** Minimum tokens required per category (prevents squeezing) */
  minimums?: Partial<Record<BudgetCategory, number>>;
  /** Maximum tokens allowed per category (prevents bloat) */
  maximums?: Partial<Record<BudgetCategory, number>>;
}

/**
 * Allocated budget result
 */
export interface BudgetAllocation {
  /** Allocated tokens per category */
  allocated: Record<BudgetCategory, number>;
  /** Total allocated tokens */
  total: number;
  /** Warnings about budget constraints */
  warnings: string[];
  /** Whether any category hit its minimum */
  constrained: boolean;
  /** Utilization percentage (0-1) */
  utilization: number;
}

/**
 * Default budget ratios (balanced allocation)
 */
export const DEFAULT_RATIOS: Record<BudgetCategory, number> = {
  system: 0.1, // 10% - System prompts, instructions
  context: 0.6, // 60% - RAG + KAG context
  user: 0.2, // 20% - User's question/request
  response: 0.1, // 10% - Buffer for model's response
};

/**
 * Conservative ratios (more response buffer)
 */
export const CONSERVATIVE_RATIOS: Record<BudgetCategory, number> = {
  system: 0.1,
  context: 0.5,
  user: 0.15,
  response: 0.25, // Larger response buffer
};

/**
 * Context-heavy ratios (maximize RAG + KAG)
 */
export const CONTEXT_HEAVY_RATIOS: Record<BudgetCategory, number> = {
  system: 0.05,
  context: 0.75, // Maximum context
  user: 0.1,
  response: 0.1,
};

/**
 * Token budget manager
 */
export class TokenBudgetManager {
  constructor(private config: BudgetConfig) {
    this.validateConfig();
  }

  /**
   * Validate budget configuration
   */
  private validateConfig(): void {
    // Check ratios sum to 1.0 (with small tolerance for floating point)
    const sum = Object.values(this.config.ratios).reduce(
      (acc, val) => acc + val,
      0,
    );
    if (Math.abs(sum - 1.0) > 0.001) {
      throw new Error(`Budget ratios must sum to 1.0, got ${sum.toFixed(3)}`);
    }

    // Check all ratios are positive
    for (const [category, ratio] of Object.entries(this.config.ratios)) {
      if (ratio < 0) {
        throw new Error(`Ratio for ${category} must be >= 0, got ${ratio}`);
      }
    }

    // Check total budget is positive
    if (this.config.totalBudget <= 0) {
      throw new Error(
        `Total budget must be > 0, got ${this.config.totalBudget}`,
      );
    }
  }

  /**
   * Allocate tokens across categories
   */
  allocate(): BudgetAllocation {
    const warnings: string[] = [];
    let constrained = false;
    const allocated: Record<BudgetCategory, number> = {
      system: 0,
      context: 0,
      user: 0,
      response: 0,
    };

    // Phase 1: Initial allocation based on ratios
    const categories: BudgetCategory[] = [
      "system",
      "context",
      "user",
      "response",
    ];
    let remaining = this.config.totalBudget;

    for (const category of categories) {
      const idealAllocation = Math.floor(
        this.config.totalBudget * this.config.ratios[category],
      );
      allocated[category] = idealAllocation;
      remaining -= idealAllocation;
    }

    // Phase 2: Apply minimums (squeeze other categories if needed)
    if (this.config.minimums) {
      for (const category of categories) {
        const minimum = this.config.minimums[category];
        if (minimum && allocated[category] < minimum) {
          const deficit = minimum - allocated[category];
          allocated[category] = minimum;
          remaining -= deficit;
          constrained = true;
          warnings.push(
            `Category '${category}' hit minimum (${minimum} tokens)`,
          );
        }
      }
    }

    // Phase 3: Apply maximums (redistribute excess)
    if (this.config.maximums) {
      for (const category of categories) {
        const maximum = this.config.maximums[category];
        if (maximum && allocated[category] > maximum) {
          const excess = allocated[category] - maximum;
          allocated[category] = maximum;
          remaining += excess;
          warnings.push(
            `Category '${category}' capped at maximum (${maximum} tokens)`,
          );
        }
      }
    }

    // Phase 4: Distribute any remaining tokens proportionally
    if (remaining > 0) {
      // Give remainder to highest priority category that isn't maxed
      const priority: BudgetCategory[] = [
        "context",
        "user",
        "response",
        "system",
      ];
      for (const category of priority) {
        const maximum = this.config.maximums?.[category];
        if (!maximum || allocated[category] < maximum) {
          allocated[category] += remaining;
          break;
        }
      }
    } else if (remaining < 0) {
      // Over-allocated, need to reduce (prioritize keeping minimums)
      const deficit = Math.abs(remaining);
      warnings.push(
        `Budget over-allocated by ${deficit} tokens, reducing allocations`,
      );

      // Reduce from lowest priority categories first
      const reducePriority: BudgetCategory[] = [
        "system",
        "response",
        "user",
        "context",
      ];
      let toReduce = deficit;

      for (const category of reducePriority) {
        const minimum = this.config.minimums?.[category] || 0;
        const available = allocated[category] - minimum;
        if (available > 0) {
          const reduction = Math.min(available, toReduce);
          allocated[category] -= reduction;
          toReduce -= reduction;
          if (toReduce === 0) break;
        }
      }

      if (toReduce > 0) {
        warnings.push(
          `Unable to reduce budget by ${toReduce} tokens while respecting minimums`,
        );
      }
    }

    // Calculate totals
    const total = Object.values(allocated).reduce((acc, val) => acc + val, 0);
    const utilization = total / this.config.totalBudget;

    // Add utilization warnings
    if (utilization > 0.95) {
      warnings.push(
        `High utilization: ${(utilization * 100).toFixed(1)}% of budget used`,
      );
    }

    return {
      allocated,
      total,
      warnings,
      constrained,
      utilization,
    };
  }

  /**
   * Get allocation for a specific category
   */
  getAllocationFor(category: BudgetCategory): number {
    const allocation = this.allocate();
    return allocation.allocated[category];
  }

  /**
   * Check if budget supports minimum requirements
   */
  canSatisfyMinimums(): boolean {
    if (!this.config.minimums) return true;

    const totalMinimum = Object.values(this.config.minimums).reduce(
      (acc, val) => acc + (val || 0),
      0,
    );
    return this.config.totalBudget >= totalMinimum;
  }
}

/**
 * Create budget manager from model name
 */
export function createBudgetFromModel(
  modelName: ModelName,
  ratios: Record<BudgetCategory, number> = DEFAULT_RATIOS,
  options?: {
    minimums?: Partial<Record<BudgetCategory, number>>;
    maximums?: Partial<Record<BudgetCategory, number>>;
  },
): TokenBudgetManager {
  const totalBudget = MODEL_CONTEXT_WINDOWS[modelName];

  return new TokenBudgetManager({
    totalBudget,
    ratios,
    minimums: options?.minimums,
    maximums: options?.maximums,
  });
}

/**
 * Preset configurations for common scenarios
 */
export const BUDGET_PRESETS = {
  /**
   * Balanced allocation for general use
   */
  balanced: (totalBudget: number) =>
    new TokenBudgetManager({
      totalBudget,
      ratios: DEFAULT_RATIOS,
    }),

  /**
   * Context-heavy for research/analysis
   */
  contextHeavy: (totalBudget: number) =>
    new TokenBudgetManager({
      totalBudget,
      ratios: CONTEXT_HEAVY_RATIOS,
    }),

  /**
   * Conservative with large response buffer
   */
  conservative: (totalBudget: number) =>
    new TokenBudgetManager({
      totalBudget,
      ratios: CONSERVATIVE_RATIOS,
    }),

  /**
   * Chat-optimized (more space for conversation)
   */
  chat: (totalBudget: number) =>
    new TokenBudgetManager({
      totalBudget,
      ratios: {
        system: 0.05,
        context: 0.4,
        user: 0.3,
        response: 0.25,
      },
    }),
} as const;
