/**
 * Relation type inference rules
 *
 * Determines the most appropriate relation type based on memory types
 * and other contextual information.
 */

import type { Memory } from "@/types";
import type { ExtendedRelationType } from "./types";

/**
 * Inference rule that maps source/target memory types to a relation type
 */
interface InferenceRule {
  sourceType: Memory["type"];
  targetType: Memory["type"];
  relationType: ExtendedRelationType;
  priority: number; // Higher = more specific rule
}

/**
 * Ordered rules for inferring relation types
 *
 * Rules are checked in order of priority (highest first).
 * If no rule matches, "related_to" is used as the default.
 */
const INFERENCE_RULES: InferenceRule[] = [
  // Decision → Solution implies causation
  {
    sourceType: "decision",
    targetType: "solution",
    relationType: "causes",
    priority: 10,
  },
  // Solution → Decision implies the solution addresses the decision
  {
    sourceType: "solution",
    targetType: "decision",
    relationType: "solves",
    priority: 10,
  },

  // Pattern → Architecture implies implementation
  {
    sourceType: "pattern",
    targetType: "architecture",
    relationType: "implements",
    priority: 9,
  },
  // Architecture → Pattern implies the pattern is referenced
  {
    sourceType: "architecture",
    targetType: "pattern",
    relationType: "references",
    priority: 9,
  },

  // Solution → Pattern implies implementation
  {
    sourceType: "solution",
    targetType: "pattern",
    relationType: "implements",
    priority: 8,
  },

  // Architecture → Decision implies the decision guides the architecture
  {
    sourceType: "architecture",
    targetType: "decision",
    relationType: "references",
    priority: 7,
  },

  // Note typically references other memories
  {
    sourceType: "note",
    targetType: "decision",
    relationType: "references",
    priority: 5,
  },
  {
    sourceType: "note",
    targetType: "architecture",
    relationType: "references",
    priority: 5,
  },
  {
    sourceType: "note",
    targetType: "pattern",
    relationType: "references",
    priority: 5,
  },
];

/**
 * Infer the most appropriate relation type based on memory types
 *
 * @param sourceMemory - The source memory
 * @param targetMemory - The target memory
 * @returns The inferred relation type
 */
export function inferRelationType(
  sourceMemory: Memory,
  targetMemory: Memory,
): ExtendedRelationType {
  // Sort rules by priority (highest first)
  const sortedRules = [...INFERENCE_RULES].sort(
    (a, b) => b.priority - a.priority,
  );

  // Find matching rule
  for (const rule of sortedRules) {
    if (
      rule.sourceType === sourceMemory.type &&
      rule.targetType === targetMemory.type
    ) {
      return rule.relationType;
    }
  }

  // Check for same type - might indicate supersession
  if (sourceMemory.type === targetMemory.type) {
    // If the source is newer and has similar title/content, it might supersede
    if (sourceMemory.createdAt > targetMemory.createdAt) {
      // Check if titles are similar (basic check)
      const titleSimilarity = calculateTitleSimilarity(
        sourceMemory.title,
        targetMemory.title,
      );
      if (titleSimilarity > 0.7) {
        return "supersedes";
      }
    }
  }

  // Default to related_to
  return "related_to";
}

/**
 * Calculate a simple title similarity score
 *
 * Uses word overlap as a proxy for similarity
 */
function calculateTitleSimilarity(title1: string, title2: string): number {
  const words1 = new Set(title1.toLowerCase().split(/\s+/));
  const words2 = new Set(title2.toLowerCase().split(/\s+/));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = [...words1].filter((w) => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;

  return intersection / union;
}

/**
 * Get all possible relation types for a given memory type pair
 *
 * Useful for suggesting multiple possible relations to the user
 */
export function getPossibleRelationTypes(
  sourceType: Memory["type"],
  targetType: Memory["type"],
): ExtendedRelationType[] {
  const types = new Set<ExtendedRelationType>();

  // Add types from matching rules
  for (const rule of INFERENCE_RULES) {
    if (rule.sourceType === sourceType && rule.targetType === targetType) {
      types.add(rule.relationType);
    }
  }

  // Always include related_to as an option
  types.add("related_to");

  // If same type, include supersedes
  if (sourceType === targetType) {
    types.add("supersedes");
  }

  return Array.from(types);
}

/**
 * Validate that a relation type makes sense for the given memory types
 */
export function isValidRelationType(
  sourceType: Memory["type"],
  targetType: Memory["type"],
  relationType: ExtendedRelationType,
): boolean {
  // All relation types are technically valid, but some are more appropriate
  const possibleTypes = getPossibleRelationTypes(sourceType, targetType);

  // Check if it's in the suggested types or is a generic type
  const genericTypes: ExtendedRelationType[] = [
    "related_to",
    "references",
    "requires",
  ];

  return (
    possibleTypes.includes(relationType) || genericTypes.includes(relationType)
  );
}
