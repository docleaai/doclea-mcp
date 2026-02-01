/**
 * Entity Merger
 *
 * Handles entity resolution by merging duplicate entities across memories.
 * Uses string similarity and optional embedding similarity for fuzzy matching.
 */

import { compareTwoStrings } from "string-similarity";
import type { Entity, ExtractedEntity } from "../types";
import type { GraphRAGStorage } from "./graphrag-storage";

/**
 * Configuration for entity merging
 */
export interface MergeConfig {
  /** Threshold for string similarity matching (0-1, default: 0.9) */
  stringSimilarityThreshold: number;
  /** Threshold for embedding similarity matching (0-1, default: 0.95) */
  embeddingSimilarityThreshold: number;
  /** Function to embed text and return an embedding vector */
  embedder?: (text: string) => Promise<number[]>;
  /** Function to search for similar entities by embedding */
  vectorSearch?: (embedding: number[], threshold: number) => Promise<Entity[]>;
}

const DEFAULT_CONFIG: MergeConfig = {
  stringSimilarityThreshold: 0.85,
  embeddingSimilarityThreshold: 0.95,
};

/**
 * Result of finding or creating an entity
 */
export interface MergeResult {
  entity: Entity;
  merged: boolean;
  matchType?: "exact" | "string_similarity" | "embedding" | "new";
}

/**
 * Entity merger with fuzzy matching capabilities
 */
export class EntityMerger {
  private config: MergeConfig;

  constructor(
    private storage: GraphRAGStorage,
    config: Partial<MergeConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Find or create an entity, merging with existing if similar enough
   *
   * Resolution strategy:
   * 1. Exact match on canonical name (case-insensitive)
   * 2. String similarity (Dice coefficient) above threshold
   * 3. Embedding similarity above threshold (if embedder available)
   * 4. Create new entity
   */
  async findOrCreateEntity(
    extracted: ExtractedEntity,
    memoryId: string,
  ): Promise<MergeResult> {
    // Step 1: Exact match on canonical name
    const exact = this.storage.getEntityByName(extracted.canonicalName);
    if (exact) {
      await this.mergeInto(exact, extracted, memoryId);
      return { entity: exact, merged: true, matchType: "exact" };
    }

    // Step 2: String similarity search
    const allEntities = this.storage.listEntities({ limit: 1000 });
    for (const entity of allEntities) {
      const similarity = this.calculateStringSimilarity(
        extracted.canonicalName,
        entity.canonicalName,
      );

      if (similarity >= this.config.stringSimilarityThreshold) {
        await this.mergeInto(entity, extracted, memoryId);
        return { entity, merged: true, matchType: "string_similarity" };
      }
    }

    // Step 3: Embedding similarity search (if available)
    if (this.config.embedder && this.config.vectorSearch) {
      try {
        const embedding = await this.config.embedder(extracted.canonicalName);
        const similar = await this.config.vectorSearch(
          embedding,
          this.config.embeddingSimilarityThreshold,
        );

        if (similar.length > 0) {
          const bestMatch = similar[0];
          await this.mergeInto(bestMatch, extracted, memoryId);
          return { entity: bestMatch, merged: true, matchType: "embedding" };
        }
      } catch (error) {
        console.warn("[doclea] Embedding search failed:", error);
        // Continue to create new entity
      }
    }

    // Step 4: Create new entity
    const now = Math.floor(Date.now() / 1000);
    const newEntity = this.storage.createEntity({
      canonicalName: extracted.canonicalName,
      entityType: extracted.entityType,
      description: extracted.description,
      mentionCount: 1,
      extractionConfidence: extracted.confidence,
      firstSeenAt: now,
      lastSeenAt: now,
      metadata: {},
    });

    // Link to memory
    this.storage.linkEntityToMemory(
      newEntity.id,
      memoryId,
      extracted.mentionText,
      extracted.confidence,
    );

    return { entity: newEntity, merged: false, matchType: "new" };
  }

  /**
   * Merge extracted entity data into existing entity
   */
  private async mergeInto(
    existing: Entity,
    extracted: ExtractedEntity,
    memoryId: string,
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    // Update entity with merged data
    this.storage.updateEntity(existing.id, {
      mentionCount: existing.mentionCount + 1,
      lastSeenAt: now,
      // Update description if new one is better (higher confidence)
      description:
        extracted.confidence > existing.extractionConfidence
          ? extracted.description || existing.description
          : existing.description,
      // Update confidence if new extraction is more confident
      extractionConfidence: Math.max(
        existing.extractionConfidence,
        extracted.confidence,
      ),
    });

    // Link to memory
    this.storage.linkEntityToMemory(
      existing.id,
      memoryId,
      extracted.mentionText,
      extracted.confidence,
    );
  }

  /**
   * Calculate string similarity using Dice coefficient
   * (More accurate than Levenshtein for this use case)
   */
  private calculateStringSimilarity(a: string, b: string): number {
    const aLower = a.toLowerCase().trim();
    const bLower = b.toLowerCase().trim();

    if (aLower === bLower) return 1;

    // Use string-similarity library for Dice coefficient
    return compareTwoStrings(aLower, bLower);
  }

  /**
   * Find potential duplicate entities
   * Useful for cleanup/deduplication tasks
   */
  findPotentialDuplicates(threshold?: number): Array<{
    entity1: Entity;
    entity2: Entity;
    similarity: number;
  }> {
    const duplicates: Array<{
      entity1: Entity;
      entity2: Entity;
      similarity: number;
    }> = [];

    const effectiveThreshold =
      threshold ?? this.config.stringSimilarityThreshold;
    const entities = this.storage.listEntities({});

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const similarity = this.calculateStringSimilarity(
          entities[i].canonicalName,
          entities[j].canonicalName,
        );

        if (similarity >= effectiveThreshold) {
          duplicates.push({
            entity1: entities[i],
            entity2: entities[j],
            similarity,
          });
        }
      }
    }

    return duplicates.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Merge two entities, keeping the one with more mentions
   */
  mergeEntities(entityId1: string, entityId2: string): Entity | null {
    const entity1 = this.storage.getEntity(entityId1);
    const entity2 = this.storage.getEntity(entityId2);

    if (!entity1 || !entity2) return null;

    // Keep the entity with more mentions (or older if equal)
    const [keeper, toMerge] =
      entity1.mentionCount >= entity2.mentionCount
        ? [entity1, entity2]
        : [entity2, entity1];

    // Move all memory links from toMerge to keeper
    const memoryLinks = this.storage.getMemoriesForEntity(toMerge.id);
    for (const link of memoryLinks) {
      this.storage.linkEntityToMemory(
        keeper.id,
        link.memoryId,
        link.mentionText || "",
        link.confidence,
      );
    }

    // Update mention count
    this.storage.updateEntity(keeper.id, {
      mentionCount: keeper.mentionCount + toMerge.mentionCount,
      // Keep the better description
      description:
        toMerge.extractionConfidence > keeper.extractionConfidence
          ? toMerge.description || keeper.description
          : keeper.description,
    });

    // Delete the merged entity
    this.storage.deleteEntity(toMerge.id);

    return this.storage.getEntity(keeper.id);
  }
}
