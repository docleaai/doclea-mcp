/**
 * Multi-factor relevance scorer
 *
 * Combines semantic, recency, confidence, and frequency scores
 * with configurable weights and boost rules.
 */

import type {
  Memory,
  ScoreBreakdown,
  ScoredSearchResult,
  SearchResult,
} from "@/types";
import { applyBoosts, evaluateBoostRules } from "./boost-rules";
import {
  calculateConfidenceScore,
  calculateFrequencyScore,
  calculateRecencyScore,
  calculateSemanticScore,
} from "./factors";
import type { ScoringConfig, ScoringWeights } from "./types";

/**
 * Multi-factor relevance scorer.
 * Combines multiple scoring factors with configurable weights.
 */
export class RelevanceScorer {
  private config: ScoringConfig;
  private normalizedWeights: ScoringWeights;

  constructor(config: ScoringConfig) {
    this.config = config;
    this.normalizedWeights = this.normalizeWeights(config.weights);
  }

  /**
   * Normalize weights to sum to 1.0.
   * Preserves relative proportions.
   */
  private normalizeWeights(weights: ScoringWeights): ScoringWeights {
    const sum =
      weights.semantic +
      weights.recency +
      weights.confidence +
      weights.frequency;

    if (sum === 0) {
      // Fallback to equal weights
      return {
        semantic: 0.25,
        recency: 0.25,
        confidence: 0.25,
        frequency: 0.25,
      };
    }

    if (Math.abs(sum - 1) < 0.001) {
      // Already normalized
      return weights;
    }

    // Normalize
    return {
      semantic: weights.semantic / sum,
      recency: weights.recency / sum,
      confidence: weights.confidence / sum,
      frequency: weights.frequency / sum,
    };
  }

  /**
   * Score a single memory.
   *
   * @param memory - Memory to score
   * @param semanticScore - Raw semantic similarity from vector search
   * @param now - Current timestamp (Unix seconds)
   * @returns Scored result with breakdown
   */
  score(
    memory: Memory,
    semanticScore: number,
    now: number,
  ): ScoredSearchResult {
    const { config, normalizedWeights } = this;

    // Calculate individual factor scores
    const semantic = calculateSemanticScore(semanticScore);
    const recency = calculateRecencyScore(
      memory.createdAt,
      memory.accessedAt,
      config.recencyDecay,
      now,
    );
    const confidence = calculateConfidenceScore(memory.importance);
    const frequency = calculateFrequencyScore(
      memory.accessCount,
      config.frequencyNormalization,
    );

    // Calculate weighted raw score
    const rawScore =
      semantic * normalizedWeights.semantic +
      recency * normalizedWeights.recency +
      confidence * normalizedWeights.confidence +
      frequency * normalizedWeights.frequency;

    // Evaluate and apply boost rules
    const boosts = evaluateBoostRules(memory, config.boostRules, now);
    const finalScore = applyBoosts(rawScore, boosts);

    // Build breakdown
    const breakdown: ScoreBreakdown = {
      semantic,
      recency,
      confidence,
      frequency,
      weights: normalizedWeights,
      boosts,
      rawScore,
      finalScore,
    };

    return {
      memory,
      score: finalScore,
      breakdown,
    };
  }

  /**
   * Score multiple results and sort by final score.
   *
   * @param results - Search results from vector search
   * @param now - Current timestamp (Unix seconds)
   * @returns Sorted scored results (highest score first)
   */
  scoreMany(results: SearchResult[], now: number): ScoredSearchResult[] {
    const scored = results.map((r) => this.score(r.memory, r.score, now));
    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Get the normalized weights being used.
   */
  getWeights(): ScoringWeights {
    return { ...this.normalizedWeights };
  }
}

/**
 * Create an empty/neutral breakdown for legacy results.
 * Used when scoring is disabled.
 */
export function createEmptyBreakdown(rawScore: number): ScoreBreakdown {
  return {
    semantic: rawScore,
    recency: 1,
    confidence: 0.5,
    frequency: 0.5,
    weights: {
      semantic: 1,
      recency: 0,
      confidence: 0,
      frequency: 0,
    },
    boosts: [],
    rawScore,
    finalScore: rawScore,
  };
}
