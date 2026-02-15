/**
 * LLM-powered entity and relationship extraction
 *
 * Extracts named entities and their relationships from memory content
 * using Claude. Falls back to regex-based extraction when no API key
 * is available or LLM fails.
 */

import Anthropic from "@anthropic-ai/sdk";
import { truncateToTokens } from "@/utils/tokens";
import type {
  ExtractedEntity,
  ExtractedRelationship,
  ExtractionResult,
} from "../types";
import { ExtractedEntitySchema, ExtractedRelationshipSchema } from "../types";
import {
  extractEntitiesFallback,
  extractRelationshipsFallback,
} from "./fallback";
import {
  createEntityExtractionUserPrompt,
  ENTITY_EXTRACTION_SYSTEM,
} from "./prompts";

/**
 * Default model for entity extraction
 */
const DEFAULT_MODEL = "claude-3-haiku-20240307";

/**
 * Default maximum tokens for content truncation
 */
const DEFAULT_MAX_TOKENS = 4000;

/**
 * Configuration for EntityExtractor
 */
export interface EntityExtractorConfig {
  /** Anthropic API key (uses ANTHROPIC_API_KEY env var if not provided) */
  apiKey?: string;
  /** Model to use (default: claude-3-haiku-20240307) */
  model?: string;
  /** Maximum tokens for content truncation (default: 4000) */
  maxTokens?: number;
  /** Minimum confidence threshold for entities (default: 0.5) */
  minConfidence?: number;
  /** Use fallback extraction if LLM fails (default: true) */
  useFallbackOnError?: boolean;
}

/**
 * LLM-powered entity and relationship extractor
 */
export class EntityExtractor {
  private client: Anthropic | null = null;
  private model: string;
  private maxTokens: number;
  private minConfidence: number;
  private useFallbackOnError: boolean;

  constructor(config: EntityExtractorConfig = {}) {
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }

    this.model = config.model || DEFAULT_MODEL;
    this.maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
    this.minConfidence = config.minConfidence ?? 0.5;
    this.useFallbackOnError = config.useFallbackOnError ?? true;
  }

  /**
   * Check if LLM client is available
   */
  get hasLLM(): boolean {
    return this.client !== null;
  }

  /**
   * Extract entities and relationships from content
   *
   * Uses LLM if available, otherwise falls back to regex extraction.
   */
  async extract(content: string): Promise<ExtractionResult> {
    if (!this.client) {
      const entities = extractEntitiesFallback(content);
      return {
        entities,
        relationships: extractRelationshipsFallback(entities, content),
        usedFallback: true,
      };
    }

    try {
      // Truncate content by tokens
      const truncatedContent = await truncateToTokens(content, this.maxTokens);

      // Build prompt
      const userPrompt = createEntityExtractionUserPrompt(truncatedContent);

      // Call LLM
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        system: ENTITY_EXTRACTION_SYSTEM,
        messages: [{ role: "user", content: userPrompt }],
      });

      // Extract text from response
      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Extract JSON from response
      const jsonStr = this.extractJSON(text);
      const parsed = JSON.parse(jsonStr);

      // Validate and filter entities
      const entities = this.validateEntities(parsed.entities || []);
      const validatedRelationships = this.validateRelationships(
        parsed.relationships || [],
      );
      const relationships =
        validatedRelationships.length > 0
          ? validatedRelationships
          : extractRelationshipsFallback(entities, truncatedContent);

      return {
        entities,
        relationships,
        usedFallback: false,
      };
    } catch (error) {
      console.warn("[doclea] Entity extraction failed, using fallback:", error);

      if (this.useFallbackOnError) {
        const entities = extractEntitiesFallback(content);
        return {
          entities,
          relationships: extractRelationshipsFallback(entities, content),
          usedFallback: true,
        };
      }

      throw error;
    }
  }

  /**
   * Extract entities from multiple contents
   */
  async extractBatch(
    contents: string[],
    concurrency = 3,
  ): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = [];

    for (let i = 0; i < contents.length; i += concurrency) {
      const batch = contents.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((content) => this.extract(content)),
      );
      results.push(...batchResults);

      // Rate limit delay between batches
      if (i + concurrency < contents.length) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    return results;
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
   * Validate and filter extracted entities
   */
  private validateEntities(rawEntities: unknown[]): ExtractedEntity[] {
    const validated: ExtractedEntity[] = [];

    for (const raw of rawEntities) {
      try {
        const input = raw as Record<string, unknown>;
        const rawEntityType =
          input.entity_type ?? input.entityType ?? input.type ?? "OTHER";
        const normalizedEntityType =
          typeof rawEntityType === "string"
            ? rawEntityType.trim().toUpperCase()
            : "OTHER";
        // Map from snake_case to camelCase
        const mapped = {
          canonicalName:
            input.canonical_name ?? input.canonicalName ?? input.name,
          entityType: normalizedEntityType,
          description: input.description,
          confidence:
            typeof input.confidence === "number"
              ? input.confidence
              : Number(input.confidence ?? 0),
          mentionText: input.mention_text ?? input.mentionText ?? input.mention,
        };

        const result = ExtractedEntitySchema.safeParse(mapped);
        if (result.success && result.data.confidence >= this.minConfidence) {
          validated.push(result.data);
        }
      } catch {
        // Skip invalid entities
      }
    }

    return validated;
  }

  /**
   * Validate and filter extracted relationships
   */
  private validateRelationships(
    rawRelationships: unknown[],
  ): ExtractedRelationship[] {
    const validated: ExtractedRelationship[] = [];

    for (const raw of rawRelationships) {
      try {
        const input = raw as Record<string, unknown>;
        const relationshipType = (
          input.relationship_type ??
          input.relationshipType ??
          input.type ??
          "RELATED_TO"
        )
          .toString()
          .trim()
          .toUpperCase();
        // Map from snake_case to camelCase
        const mapped = {
          sourceEntity:
            input.source_entity ??
            input.sourceEntity ??
            input.source ??
            input.from,
          targetEntity:
            input.target_entity ??
            input.targetEntity ??
            input.target ??
            input.to,
          relationshipType,
          description: input.description,
          strength:
            typeof input.strength === "number"
              ? input.strength
              : Number(input.strength ?? 0),
          confidence:
            typeof input.confidence === "number"
              ? input.confidence
              : Number(input.confidence ?? 0),
        };

        const result = ExtractedRelationshipSchema.safeParse(mapped);
        if (result.success && result.data.confidence >= this.minConfidence) {
          validated.push(result.data);
        }
      } catch {
        // Skip invalid relationships
      }
    }

    return validated;
  }
}

/**
 * Batch extract entities from multiple memories
 */
export async function extractEntitiesBatch(
  memories: Array<{ id: string; content: string }>,
  extractor: EntityExtractor,
  concurrency = 3,
): Promise<Map<string, ExtractionResult>> {
  const results = new Map<string, ExtractionResult>();

  for (let i = 0; i < memories.length; i += concurrency) {
    const batch = memories.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (m) => ({
        id: m.id,
        result: await extractor.extract(m.content),
      })),
    );

    for (const { id, result } of batchResults) {
      results.set(id, result);
    }

    // Rate limit delay between batches
    if (i + concurrency < memories.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return results;
}
