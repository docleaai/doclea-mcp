/**
 * Local Search
 *
 * Entity-centric search that finds relevant entities via embedding similarity
 * and then traverses the graph to find related context.
 */

import type { GraphRAGStorage } from "../graph/graphrag-storage";
import type {
  Entity,
  LocalSearchConfig,
  LocalSearchResult,
  Relationship,
} from "../types";

/**
 * Function type for vector search over entities
 */
export type EntityVectorSearch = (
  query: string,
) => Promise<Array<{ entityId: string; score: number }>>;

/**
 * Local search implementation
 */
export class LocalSearch {
  constructor(
    private storage: GraphRAGStorage,
    private vectorSearch: EntityVectorSearch,
  ) {}

  /**
   * Perform local search
   *
   * 1. Find seed entities via embedding similarity
   * 2. BFS traverse relationships up to maxDepth
   * 3. Return entities and relationships with relevance scores
   */
  async search(
    query: string,
    config: Partial<LocalSearchConfig> = {},
  ): Promise<LocalSearchResult> {
    const {
      maxDepth = 2,
      minEdgeWeight = 3,
      entitySimilarityBoost = true,
    } = config;

    // Step 1: Find seed entities via vector search
    const seedResults = await this.vectorSearch(query);

    if (seedResults.length === 0) {
      return { entities: [], relationships: [], totalExpanded: 0 };
    }

    // Step 2: BFS from seed entities
    const visited = new Map<string, { score: number; depth: number }>();
    const queue: Array<{ entityId: string; score: number; depth: number }> = [];
    const allRelationships: Relationship[] = [];
    const relationshipIds = new Set<string>();

    // Initialize with seeds
    for (const seed of seedResults) {
      if (!visited.has(seed.entityId)) {
        visited.set(seed.entityId, { score: seed.score, depth: 0 });
        queue.push({ entityId: seed.entityId, score: seed.score, depth: 0 });
      }
    }

    // BFS traversal
    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth >= maxDepth) continue;

      const relationships = this.storage.getRelationshipsForEntity(
        current.entityId,
        "both",
      );

      for (const rel of relationships) {
        // Filter weak edges
        if (rel.strength < minEdgeWeight) continue;

        // Track relationship (avoid duplicates)
        if (!relationshipIds.has(rel.id)) {
          relationshipIds.add(rel.id);
          allRelationships.push(rel);
        }

        // Find neighbor
        const neighborId =
          rel.sourceEntityId === current.entityId
            ? rel.targetEntityId
            : rel.sourceEntityId;

        if (!visited.has(neighborId)) {
          // Score decays with depth, boosted by edge strength
          const strengthFactor = rel.strength / 10;
          const depthDecay = 0.8 ** (current.depth + 1);
          const neighborScore = current.score * strengthFactor * depthDecay;

          visited.set(neighborId, {
            score: neighborScore,
            depth: current.depth + 1,
          });

          queue.push({
            entityId: neighborId,
            score: neighborScore,
            depth: current.depth + 1,
          });
        }
      }
    }

    // Step 3: Fetch entities and build result
    const entities: LocalSearchResult["entities"] = [];

    for (const [entityId, { score, depth }] of visited) {
      const entity = this.storage.getEntity(entityId);
      if (entity) {
        entities.push({
          entity,
          relevanceScore: score,
          depth,
        });
      }
    }

    // Sort by relevance score
    entities.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return {
      entities,
      relationships: allRelationships,
      totalExpanded: visited.size,
    };
  }

  /**
   * Search with a specific entity as the starting point
   */
  async searchFromEntity(
    entityId: string,
    config: Partial<LocalSearchConfig> = {},
  ): Promise<LocalSearchResult> {
    const entity = this.storage.getEntity(entityId);
    if (!entity) {
      return { entities: [], relationships: [], totalExpanded: 0 };
    }

    const { maxDepth = 2, minEdgeWeight = 3 } = config;

    const visited = new Map<string, { score: number; depth: number }>();
    const queue: Array<{ entityId: string; score: number; depth: number }> = [];
    const allRelationships: Relationship[] = [];
    const relationshipIds = new Set<string>();

    // Start from specified entity
    visited.set(entityId, { score: 1.0, depth: 0 });
    queue.push({ entityId, score: 1.0, depth: 0 });

    // BFS traversal
    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth >= maxDepth) continue;

      const relationships = this.storage.getRelationshipsForEntity(
        current.entityId,
        "both",
      );

      for (const rel of relationships) {
        if (rel.strength < minEdgeWeight) continue;

        if (!relationshipIds.has(rel.id)) {
          relationshipIds.add(rel.id);
          allRelationships.push(rel);
        }

        const neighborId =
          rel.sourceEntityId === current.entityId
            ? rel.targetEntityId
            : rel.sourceEntityId;

        if (!visited.has(neighborId)) {
          const strengthFactor = rel.strength / 10;
          const depthDecay = 0.8 ** (current.depth + 1);
          const neighborScore = current.score * strengthFactor * depthDecay;

          visited.set(neighborId, {
            score: neighborScore,
            depth: current.depth + 1,
          });

          queue.push({
            entityId: neighborId,
            score: neighborScore,
            depth: current.depth + 1,
          });
        }
      }
    }

    const entities: LocalSearchResult["entities"] = [];
    for (const [entId, { score, depth }] of visited) {
      const ent = this.storage.getEntity(entId);
      if (ent) {
        entities.push({ entity: ent, relevanceScore: score, depth });
      }
    }

    entities.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return {
      entities,
      relationships: allRelationships,
      totalExpanded: visited.size,
    };
  }

  /**
   * Find entities by name (exact and fuzzy matching)
   */
  findEntitiesByName(
    name: string,
    limit = 10,
  ): Array<{ entity: Entity; matchScore: number }> {
    const results: Array<{ entity: Entity; matchScore: number }> = [];
    const normalizedQuery = name.toLowerCase();

    const allEntities = this.storage.listEntities({ limit: 1000 });

    for (const entity of allEntities) {
      const normalizedName = entity.canonicalName.toLowerCase();

      let matchScore = 0;

      // Exact match
      if (normalizedName === normalizedQuery) {
        matchScore = 1.0;
      }
      // Starts with query
      else if (normalizedName.startsWith(normalizedQuery)) {
        matchScore = 0.9;
      }
      // Contains query
      else if (normalizedName.includes(normalizedQuery)) {
        matchScore = 0.7;
      }
      // Query contains name
      else if (normalizedQuery.includes(normalizedName)) {
        matchScore = 0.5;
      }

      if (matchScore > 0) {
        results.push({ entity, matchScore });
      }
    }

    // Sort by match score and mention count
    results.sort((a, b) => {
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      return b.entity.mentionCount - a.entity.mentionCount;
    });

    return results.slice(0, limit);
  }
}
