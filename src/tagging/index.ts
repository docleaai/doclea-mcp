/**
 * LLM-powered semantic tag extraction and taxonomy management module
 *
 * @example
 * ```typescript
 * import { LLMTagger, getTaxonomyManager } from "@/tagging";
 *
 * // LLM-powered tag extraction
 * const tagger = new LLMTagger();
 * const result = await tagger.extractTags({
 *   title: "Implementing React authentication",
 *   type: "solution",
 *   content: "We used JWT tokens with refresh token rotation..."
 * });
 *
 * console.log(result.tags);
 * // [
 * //   { name: "react", confidence: 0.95, category: "technology" },
 * //   { name: "authentication", confidence: 0.9, category: "domain" },
 * //   { name: "jwt", confidence: 0.85, category: "technology" }
 * // ]
 *
 * // Taxonomy normalization
 * const taxonomy = getTaxonomyManager();
 * console.log(taxonomy.normalize("ts"));      // "typescript"
 * console.log(taxonomy.normalize("k8s"));     // "kubernetes"
 * console.log(taxonomy.normalize("postgres")); // "postgresql"
 *
 * // Fuzzy suggestions
 * const suggestions = taxonomy.suggestTags("react", 5);
 * // [{ tag: {canonical: "react", ...}, score: 1.0, matchType: "exact" }, ...]
 * ```
 */

// Built-in Taxonomy
export { BUILT_IN_TAXONOMY, getBuiltInTagStats } from "./built-in-taxonomy";
// Levenshtein utilities
export {
  findBestMatches,
  isWithinDistance,
  levenshteinDistance,
  stringSimilarity,
} from "./levenshtein";
// LLM Tagger
export { LLMTagger, tagMemoriesBatch } from "./llm-tagger";
// Taxonomy Manager
export {
  getTaxonomyManager,
  resetTaxonomyManager,
  TaxonomyManager,
  type TaxonomyStorage,
} from "./taxonomy";

// Types
export type {
  ExtractedTag,
  LLMTaggerOptions,
  MemoryInput,
  TagCategory,
  TagDefinition,
  TaggingResult,
  TagMatchType,
  TagSource,
  TagSuggestion,
  TaxonomyConfig,
} from "./types";

export {
  DEFAULT_TAXONOMY_CONFIG,
  ExtractedTagSchema,
  STOP_WORDS,
  TagCategorySchema,
  TagDefinitionSchema,
  TaggingResultSchema,
  TagMatchTypeSchema,
  TagSourceSchema,
  TaxonomyConfigSchema,
} from "./types";
