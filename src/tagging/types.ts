/**
 * Types and Zod schemas for LLM-powered tag extraction
 */

import { z } from "zod";

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
