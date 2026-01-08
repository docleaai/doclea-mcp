/**
 * LLM-powered semantic tag extraction module
 *
 * @example
 * ```typescript
 * import { LLMTagger } from "@/tagging";
 *
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
 * ```
 */

export { LLMTagger, tagMemoriesBatch } from "./llm-tagger";

export type {
	ExtractedTag,
	LLMTaggerOptions,
	MemoryInput,
	TagCategory,
	TaggingResult,
} from "./types";

export {
	ExtractedTagSchema,
	STOP_WORDS,
	TagCategorySchema,
	TaggingResultSchema,
} from "./types";
