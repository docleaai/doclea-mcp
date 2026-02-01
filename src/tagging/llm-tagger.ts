/**
 * LLM-powered semantic tag extraction
 *
 * Uses Claude Haiku to extract relevant tags from memory content with
 * confidence scores and category classification. Falls back to keyword
 * frequency extraction when no API key is available.
 */

import Anthropic from "@anthropic-ai/sdk";
import { formatTag } from "@/utils/slugify";
import { truncateToTokens } from "@/utils/tokens";
import { getTaxonomyManager } from "./taxonomy";
import {
  type ExtractedTag,
  type LLMTaggerOptions,
  type MemoryInput,
  STOP_WORDS,
  type TaggingResult,
  TaggingResultSchema,
} from "./types";

/**
 * Default model for tag extraction (fast and cost-effective)
 */
const DEFAULT_MODEL = "claude-3-haiku-20240307";

/**
 * Default maximum tokens for content truncation
 */
const DEFAULT_MAX_TOKENS = 1500;

/**
 * Tagging prompt for structured output
 */
const TAGGING_PROMPT = `You are a semantic tag extractor for a developer knowledge base.

Given the following memory content, extract relevant tags that would help find this content later.

## Guidelines:
1. Extract 3-8 tags per memory
2. Use lowercase, hyphenated format (e.g., "react-hooks", "api-design")
3. Prefer specific over generic tags
4. Include both technologies AND concepts
5. Assign confidence scores (0.0-1.0)

## Tag Categories:
- technology: Languages, frameworks, tools (e.g., "typescript", "postgresql")
- concept: Patterns, principles (e.g., "dependency-injection", "caching")
- domain: Business areas (e.g., "authentication", "payments")
- action: What was done (e.g., "refactoring", "migration")

## Memory Content:
Title: {{title}}
Type: {{type}}
Content:
{{content}}

## Output Format (JSON only, no markdown):
{
  "tags": [
    { "name": "tag-name", "confidence": 0.95, "category": "technology" }
  ],
  "reasoning": "Brief explanation of why these tags were chosen"
}

Extract tags now:`;

/**
 * LLM-powered tag extractor with fallback to keyword extraction
 */
export class LLMTagger {
  private client: Anthropic | null = null;
  private model: string;
  private maxTokens: number;

  constructor(options: LLMTaggerOptions = {}) {
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
    // No throw - allows fallback to work

    this.model = options.model || DEFAULT_MODEL;
    this.maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
  }

  /**
   * Check if LLM client is available
   */
  get hasLLM(): boolean {
    return this.client !== null;
  }

  /**
   * Extract semantic tags from memory content
   *
   * Uses LLM if available, otherwise falls back to keyword extraction.
   * Any failure during LLM extraction triggers fallback.
   */
  async extractTags(memory: MemoryInput): Promise<TaggingResult> {
    // No API client → immediate fallback
    if (!this.client) {
      return this.fallbackExtraction(memory);
    }

    try {
      // Truncate content by tokens (not chars)
      const truncatedContent = await truncateToTokens(
        memory.content,
        this.maxTokens,
      );

      // Build prompt
      const prompt = TAGGING_PROMPT.replace("{{title}}", memory.title)
        .replace("{{type}}", memory.type)
        .replace("{{content}}", truncatedContent);

      // Call LLM
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });

      // Extract text from response
      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Extract JSON (handles markdown blocks)
      const jsonStr = this.extractJSON(text);

      // Validate with Zod
      const parsed = TaggingResultSchema.parse(JSON.parse(jsonStr));

      // Normalize tag names
      return {
        tags: parsed.tags.map((t) => ({
          ...t,
          name: this.normalizeTag(t.name),
        })),
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      // Any failure → graceful fallback
      console.warn("[doclea] LLM tagging failed, using fallback:", error);
      return this.fallbackExtraction(memory);
    }
  }

  /**
   * Extract JSON from LLM response
   * Handles markdown code blocks and raw JSON
   */
  private extractJSON(rawString: string): string {
    // Try markdown code block first
    const codeBlock = rawString.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) {
      return codeBlock[1].trim();
    }

    // Fall back to raw JSON detection
    const jsonMatch = rawString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }

    throw new Error("No JSON found in response");
  }

  /**
   * Fallback keyword frequency extraction
   * Used when no API key is available or LLM fails
   */
  private fallbackExtraction(memory: MemoryInput): TaggingResult {
    const text = `${memory.title} ${memory.content}`.toLowerCase();
    const words = text.split(/\W+/).filter((w) => w.length > 3);

    // Count word frequency
    const counts = new Map<string, number>();
    for (const word of words) {
      if (!STOP_WORDS.has(word)) {
        counts.set(word, (counts.get(word) || 0) + 1);
      }
    }

    // Get top words as tags
    const tags: ExtractedTag[] = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word, count]) => ({
        name: this.normalizeTag(word),
        confidence: Math.min(count / 10, 0.8),
        category: "custom" as const,
      }));

    return {
      tags,
      reasoning: "Extracted via keyword frequency (LLM unavailable)",
    };
  }

  /**
   * Normalize tag using TaxonomyManager
   * Resolves aliases to canonical forms and formats unknown tags
   *
   * @deprecated Use getTaxonomyManager().normalize() directly
   */
  private normalizeTag(tag: string): string {
    const taxonomy = getTaxonomyManager();
    const normalized = taxonomy.normalize(tag);
    // Fallback to basic formatting if taxonomy returns null (strict mode)
    return normalized ?? formatTag(tag);
  }
}

/**
 * Batch tag multiple memories with rate limiting
 *
 * @param memories - Array of memories to tag
 * @param tagger - LLMTagger instance
 * @param concurrency - Number of concurrent requests (default: 3)
 * @returns Map of memory ID to tagging result
 */
export async function tagMemoriesBatch(
  memories: Array<{ id: string } & MemoryInput>,
  tagger: LLMTagger,
  concurrency = 3,
): Promise<Map<string, TaggingResult>> {
  const results = new Map<string, TaggingResult>();

  // Process in batches to avoid rate limits
  for (let i = 0; i < memories.length; i += concurrency) {
    const batch = memories.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (m) => ({
        id: m.id,
        result: await tagger.extractTags(m),
      })),
    );

    for (const { id, result } of batchResults) {
      results.set(id, result);
    }

    // Rate limit delay between batches (except for last batch)
    if (i + concurrency < memories.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return results;
}
