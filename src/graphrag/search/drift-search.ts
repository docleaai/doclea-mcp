/**
 * Drift Search
 *
 * Iterative search using Hypothetical Document Embeddings (HyDE).
 * Generates hypothetical answers and refines search based on results.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  createHypothesisPrompt,
  HYPOTHESIS_GENERATION_SYSTEM,
} from "../extraction/prompts";
import type { GraphRAGStorage } from "../graph/graphrag-storage";
import type {
  DriftSearchConfig,
  DriftSearchResult,
  Entity,
  LocalSearchResult,
  Relationship,
} from "../types";
import { type EntityVectorSearch, LocalSearch } from "./local-search";

/**
 * Embedder function type
 */
export type TextEmbedder = (text: string) => Promise<number[]>;

/**
 * Drift search implementation
 */
export class DriftSearch {
  private client: Anthropic | null = null;
  private localSearch: LocalSearch;

  constructor(
    private storage: GraphRAGStorage,
    private vectorSearch: EntityVectorSearch,
    private embedder: TextEmbedder,
    apiKey?: string,
  ) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (key) {
      this.client = new Anthropic({ apiKey: key });
    }

    this.localSearch = new LocalSearch(storage, vectorSearch);
  }

  /**
   * Check if LLM client is available
   */
  get hasLLM(): boolean {
    return this.client !== null;
  }

  /**
   * Perform drift search
   *
   * Algorithm:
   * 1. Generate hypothetical answer embedding (HyDE)
   * 2. Run local search centered on hypothesis
   * 3. Refine hypothesis based on results
   * 4. Repeat until convergence or max iterations
   */
  async search(
    query: string,
    config: Partial<DriftSearchConfig> = {},
  ): Promise<DriftSearchResult> {
    const {
      maxIterations = 3,
      convergenceThreshold = 0.9,
      memoryWindow = 5,
    } = config;

    const hypotheses: string[] = [];
    let currentResult: LocalSearchResult | null = null;
    let previousEmbedding: number[] | null = null;
    let iterations = 0;
    let converged = false;

    for (let i = 0; i < maxIterations; i++) {
      iterations++;

      // Step 1: Generate hypothetical answer
      const previousFindings = currentResult
        ? this.formatFindings(currentResult)
        : undefined;

      const hypothesis = await this.generateHypothesis(
        query,
        previousFindings,
        hypotheses.slice(-memoryWindow),
      );
      hypotheses.push(hypothesis);

      // Step 2: Embed hypothesis
      let hypothesisEmbedding: number[];
      try {
        hypothesisEmbedding = await this.embedder(hypothesis);
      } catch (error) {
        console.warn("[doclea] Failed to embed hypothesis:", error);
        break;
      }

      // Step 3: Check convergence
      if (previousEmbedding) {
        const similarity = this.cosineSimilarity(
          previousEmbedding,
          hypothesisEmbedding,
        );

        if (similarity >= convergenceThreshold) {
          converged = true;
          break;
        }
      }
      previousEmbedding = hypothesisEmbedding;

      // Step 4: Run local search using entities mentioned in hypothesis
      const hypothesisEntities =
        await this.extractEntitiesFromHypothesis(hypothesis);

      if (hypothesisEntities.length > 0) {
        // Search using extracted entity names
        currentResult = await this.localSearch.search(
          hypothesisEntities.join(" "),
          {
            maxDepth: 2,
            minEdgeWeight: 2,
          },
        );
      } else {
        // Fallback: search using the query directly
        currentResult = await this.localSearch.search(query, {
          maxDepth: 2,
          minEdgeWeight: 2,
        });
      }

      // Early termination if no results
      if (currentResult.entities.length === 0) {
        break;
      }
    }

    // Build final result
    const baseResult = currentResult || {
      entities: [],
      relationships: [],
      totalExpanded: 0,
    };

    return {
      ...baseResult,
      iterations,
      hypotheses,
      converged,
    };
  }

  /**
   * Generate a hypothetical answer using LLM
   */
  private async generateHypothesis(
    query: string,
    previousFindings?: string,
    previousHypotheses?: string[],
  ): Promise<string> {
    if (!this.client) {
      // Fallback: return query reformulation
      return `The answer to "${query}" would involve ${previousFindings || "relevant entities from the knowledge graph"}.`;
    }

    try {
      const prompt = createHypothesisPrompt(
        query,
        previousFindings,
        previousHypotheses,
      );

      const response = await this.client.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 500,
        system: HYPOTHESIS_GENERATION_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      return text || `Hypothetical answer for: ${query}`;
    } catch (error) {
      console.warn("[doclea] Failed to generate hypothesis:", error);
      return `Hypothetical answer for: ${query}`;
    }
  }

  /**
   * Extract potential entity names from hypothesis text
   */
  private async extractEntitiesFromHypothesis(
    hypothesis: string,
  ): Promise<string[]> {
    // Simple extraction: find capitalized words/phrases
    const capitalizedPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    const matches = hypothesis.match(capitalizedPattern) || [];

    // Filter common words
    const commonWords = new Set([
      "The",
      "This",
      "That",
      "These",
      "When",
      "Where",
      "What",
      "Which",
      "How",
      "Why",
      "Based",
      "According",
    ]);

    const filtered = matches.filter((m) => !commonWords.has(m) && m.length > 2);

    // Deduplicate and limit
    return [...new Set(filtered)].slice(0, 10);
  }

  /**
   * Format search results as findings string
   */
  private formatFindings(result: LocalSearchResult): string {
    const topEntities = result.entities
      .slice(0, 5)
      .map((e) => e.entity.canonicalName);

    return `Found entities: ${topEntities.join(", ")}`;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have same length");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  /**
   * Search with pre-specified entity as starting point
   * Useful for exploration from a known entity
   */
  async searchFromEntity(
    entityId: string,
    query: string,
    config: Partial<DriftSearchConfig> = {},
  ): Promise<DriftSearchResult> {
    // First, do standard drift search
    const result = await this.search(query, config);

    // Then, add the starting entity and its connections if not already present
    const entity = this.storage.getEntity(entityId);
    if (entity) {
      const existingIds = new Set(result.entities.map((e) => e.entity.id));

      if (!existingIds.has(entityId)) {
        result.entities.unshift({
          entity,
          relevanceScore: 1.0,
          depth: 0,
        });
      }
    }

    return result;
  }
}
