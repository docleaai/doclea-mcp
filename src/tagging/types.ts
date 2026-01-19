/**
 * Types and Zod schemas for LLM-powered tag extraction and taxonomy management
 */

import { z } from "zod";

// ============================================================================
// Taxonomy Types
// ============================================================================

/**
 * Source of a tag definition
 */
export const TagSourceSchema = z.enum(["builtin", "custom"]);
export type TagSource = z.infer<typeof TagSourceSchema>;

/**
 * A tag definition in the taxonomy with canonical name and aliases
 */
export const TagDefinitionSchema = z.object({
  /** Official canonical tag name (lowercase, hyphenated) */
  canonical: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  /** Array of alias names that resolve to this canonical tag */
  aliases: z.array(z.string().min(1)),
  /** Category this tag belongs to */
  category: z.lazy(() => TagCategorySchema),
  /** Optional parent tag for hierarchical organization (metadata only) */
  parent: z.string().optional(),
  /** Optional description for the tag */
  description: z.string().optional(),
  /** Source of this tag definition */
  source: TagSourceSchema,
});
export type TagDefinition = z.infer<typeof TagDefinitionSchema>;

/**
 * Match type for tag suggestions
 */
export const TagMatchTypeSchema = z.enum(["exact", "alias", "fuzzy"]);
export type TagMatchType = z.infer<typeof TagMatchTypeSchema>;

/**
 * A tag suggestion with similarity score
 */
export interface TagSuggestion {
  /** The matched tag definition */
  tag: TagDefinition;
  /** Similarity score (0-1, higher is better) */
  score: number;
  /** How the match was found */
  matchType: TagMatchType;
}

/**
 * Configuration options for TaxonomyManager
 */
export const TaxonomyConfigSchema = z.object({
  /** Whether custom tags can override built-in tags (default: false) */
  allowOverride: z.boolean().default(false),
  /** Maximum Levenshtein distance for fuzzy matching (default: 3) */
  maxFuzzyDistance: z.number().min(1).max(10).default(3),
  /** Minimum similarity score for suggestions (default: 0.3) */
  minSuggestionScore: z.number().min(0).max(1).default(0.3),
  /** Strict mode: reject tags not in taxonomy (default: false) */
  strictMode: z.boolean().default(false),
});
export type TaxonomyConfig = z.infer<typeof TaxonomyConfigSchema>;

/**
 * Default taxonomy configuration
 */
export const DEFAULT_TAXONOMY_CONFIG: Required<TaxonomyConfig> = {
  allowOverride: false,
  maxFuzzyDistance: 3,
  minSuggestionScore: 0.3,
  strictMode: false,
};

// ============================================================================
// Tag Extraction Types (existing)
// ============================================================================

/**
 * Tag category types
 */
export const TagCategorySchema = z.enum([
  "technology",
  "concept",
  "domain",
  "action",
  "custom",
]);
export type TagCategory = z.infer<typeof TagCategorySchema>;

/**
 * A single extracted tag with metadata
 */
export const ExtractedTagSchema = z.object({
  name: z.string().min(1),
  confidence: z.number().min(0).max(1),
  category: TagCategorySchema,
});
export type ExtractedTag = z.infer<typeof ExtractedTagSchema>;

/**
 * Result from tag extraction
 */
export const TaggingResultSchema = z.object({
  tags: z.array(ExtractedTagSchema).min(0).max(10),
  reasoning: z.string(),
});
export type TaggingResult = z.infer<typeof TaggingResultSchema>;

/**
 * Input for tag extraction
 */
export interface MemoryInput {
  title: string;
  type: string;
  content: string;
}

/**
 * Options for LLMTagger
 */
export interface LLMTaggerOptions {
  /** API key (falls back to ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** Model to use (default: claude-3-haiku-20240307) */
  model?: string;
  /** Maximum tokens for content (default: 1500) */
  maxTokens?: number;
  /** Minimum confidence to include in auto-apply (default: 0.7) */
  minConfidence?: number;
}

/**
 * Stop words to filter in fallback extraction
 * Includes both English stop words and common programming keywords
 */
export const STOP_WORDS = new Set([
  // English stop words
  "this",
  "that",
  "with",
  "from",
  "have",
  "will",
  "been",
  "were",
  "they",
  "their",
  "which",
  "would",
  "could",
  "should",
  "about",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "also",
  "just",
  "when",
  "where",
  "what",
  "some",
  "more",
  "other",
  "than",
  "then",
  "only",
  "very",
  "most",
  "each",
  "both",
  "same",
  "being",
  "does",
  "done",
  "doing",
  "make",
  "made",
  "making",
  "used",
  "using",
  "need",
  "needs",
  // Programming keywords (JS/TS/Python)
  "const",
  "function",
  "return",
  "import",
  "export",
  "default",
  "async",
  "await",
  "class",
  "extends",
  "interface",
  "type",
  "true",
  "false",
  "null",
  "undefined",
  "void",
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "promise",
  "console",
  "error",
  "self",
  "super",
  "static",
  "public",
  "private",
  "protected",
  "readonly",
  "abstract",
  "implements",
  "module",
  "require",
  "package",
  "yield",
  "break",
  "continue",
  "throw",
  "catch",
  "finally",
  "switch",
  "case",
  "while",
  "else",
  "elif",
  "pass",
  "raise",
  "except",
  "lambda",
  "global",
  "local",
  "nonlocal",
]);
