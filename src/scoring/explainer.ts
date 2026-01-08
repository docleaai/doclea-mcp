/**
 * Score explanation generator
 *
 * Produces human-readable explanations of score breakdowns.
 */

import type { ScoreBreakdown } from "@/types";

/**
 * Generate a human-readable explanation of a score breakdown.
 *
 * @param breakdown - Score breakdown to explain
 * @returns Multi-line explanation string
 */
export function generateScoreExplanation(breakdown: ScoreBreakdown): string {
  const lines: string[] = [];

  // Final score
  lines.push(`Final Score: ${formatPercent(breakdown.finalScore)}`);
  lines.push("");

  // Factor contributions
  lines.push("Factor Scores:");
  lines.push(
    `  Semantic:   ${formatPercent(breakdown.semantic)} (weight: ${formatWeight(breakdown.weights.semantic)})`,
  );
  lines.push(
    `  Recency:    ${formatPercent(breakdown.recency)} (weight: ${formatWeight(breakdown.weights.recency)})`,
  );
  lines.push(
    `  Confidence: ${formatPercent(breakdown.confidence)} (weight: ${formatWeight(breakdown.weights.confidence)})`,
  );
  lines.push(
    `  Frequency:  ${formatPercent(breakdown.frequency)} (weight: ${formatWeight(breakdown.weights.frequency)})`,
  );

  // Raw score (before boosts)
  lines.push("");
  lines.push(`Raw Score: ${formatPercent(breakdown.rawScore)}`);

  // Boosts
  if (breakdown.boosts.length > 0) {
    lines.push("");
    lines.push("Applied Boosts:");
    for (const boost of breakdown.boosts) {
      const symbol = boost.factor >= 1 ? "+" : "-";
      const percent = Math.abs((boost.factor - 1) * 100).toFixed(0);
      lines.push(`  ${boost.name}: ${symbol}${percent}% (${boost.reason})`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate a compact one-line summary.
 */
export function generateScoreSummary(breakdown: ScoreBreakdown): string {
  const parts = [
    `sem=${formatPercent(breakdown.semantic)}`,
    `rec=${formatPercent(breakdown.recency)}`,
    `conf=${formatPercent(breakdown.confidence)}`,
    `freq=${formatPercent(breakdown.frequency)}`,
  ];

  if (breakdown.boosts.length > 0) {
    const boostFactors = breakdown.boosts
      .map((b) => b.factor.toFixed(2))
      .join("×");
    parts.push(`boosts=${boostFactors}`);
  }

  return `[${parts.join(", ")}] → ${formatPercent(breakdown.finalScore)}`;
}

/**
 * Format a score as a percentage.
 */
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Format a weight value.
 */
function formatWeight(value: number): string {
  return value.toFixed(2);
}
