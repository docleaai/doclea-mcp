/**
 * Boost/penalty rule evaluation engine
 *
 * Evaluates boost rules against memories and applies multiplicative factors.
 */

import type { AppliedBoost, Memory } from "@/types";
import type { BoostCondition, BoostRule } from "./types";

const SECONDS_PER_DAY = 86400;

/**
 * Evaluate all boost rules against a memory.
 * Returns list of applicable boosts with reasons.
 *
 * @param memory - Memory to evaluate
 * @param rules - Boost rules to check
 * @param now - Current timestamp (Unix seconds)
 * @returns Array of applied boosts
 */
export function evaluateBoostRules(
  memory: Memory,
  rules: BoostRule[],
  now: number,
): AppliedBoost[] {
  const applied: AppliedBoost[] = [];

  for (const rule of rules) {
    const result = evaluateCondition(memory, rule.condition, now);
    if (result.matches) {
      applied.push({
        name: rule.name,
        factor: rule.factor,
        reason: result.reason,
      });
    }
  }

  return applied;
}

/**
 * Apply boost factors to a base score.
 * Multiplies all factors together.
 *
 * @param baseScore - Score before boosts
 * @param boosts - Applied boosts
 * @returns Final score after all boosts
 */
export function applyBoosts(baseScore: number, boosts: AppliedBoost[]): number {
  if (boosts.length === 0) {
    return baseScore;
  }

  let score = baseScore;
  for (const boost of boosts) {
    score *= boost.factor;
  }

  // Keep score reasonable (don't let it explode)
  return Math.max(0, Math.min(2, score));
}

/**
 * Evaluate a single condition against a memory.
 */
function evaluateCondition(
  memory: Memory,
  condition: BoostCondition,
  now: number,
): { matches: boolean; reason: string } {
  switch (condition.type) {
    case "recency": {
      const lastActivity = Math.max(memory.createdAt, memory.accessedAt);
      const ageDays = (now - lastActivity) / SECONDS_PER_DAY;
      const matches = ageDays <= condition.maxDays;
      return {
        matches,
        reason: matches
          ? `Memory is ${ageDays.toFixed(1)} days old (< ${condition.maxDays} days)`
          : "",
      };
    }

    case "importance": {
      const matches = memory.importance >= condition.minValue;
      return {
        matches,
        reason: matches
          ? `Importance ${memory.importance.toFixed(2)} >= ${condition.minValue}`
          : "",
      };
    }

    case "frequency": {
      const matches = memory.accessCount >= condition.minAccessCount;
      return {
        matches,
        reason: matches
          ? `Access count ${memory.accessCount} >= ${condition.minAccessCount}`
          : "",
      };
    }

    case "staleness": {
      const lastActivity = Math.max(memory.createdAt, memory.accessedAt);
      const ageDays = (now - lastActivity) / SECONDS_PER_DAY;
      const matches = ageDays >= condition.minDays;
      return {
        matches,
        reason: matches
          ? `Memory is ${ageDays.toFixed(1)} days old (>= ${condition.minDays} days)`
          : "",
      };
    }

    case "memoryType": {
      const matches = condition.types.includes(memory.type);
      return {
        matches,
        reason: matches
          ? `Memory type "${memory.type}" in [${condition.types.join(", ")}]`
          : "",
      };
    }

    case "tags": {
      const memoryTags = memory.tags.map((t) => t.toLowerCase());
      const conditionTags = condition.tags.map((t) => t.toLowerCase());

      const matchingTags = conditionTags.filter((t) => memoryTags.includes(t));
      const matches =
        condition.match === "all"
          ? matchingTags.length === conditionTags.length
          : matchingTags.length > 0;

      return {
        matches,
        reason: matches
          ? `Tags match: [${matchingTags.join(", ")}] (${condition.match})`
          : "",
      };
    }

    default: {
      // Type exhaustiveness check
      const _exhaustiveCheck: never = condition;
      return { matches: false, reason: "" };
    }
  }
}
