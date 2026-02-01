/**
 * Graph Builder
 *
 * Converts entities and relationships into a format suitable for
 * community detection algorithms (Leiden).
 */

import type { Entity, LeidenInput, Relationship } from "../types";
import type { GraphRAGStorage } from "./graphrag-storage";

/**
 * Graph statistics
 */
export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  avgDegree: number;
  components: number;
}

/**
 * Builds graph representations for community detection
 */
export class GraphBuilder {
  constructor(private storage: GraphRAGStorage) {}

  /**
   * Build input arrays for Leiden algorithm
   *
   * Creates flat arrays suitable for efficient processing:
   * - sources: edge source indices
   * - targets: edge target indices
   * - weights: edge weights (from relationship strength)
   * - nodeIdMap: entity.id -> index mapping
   * - reverseMap: index -> entity.id mapping
   */
  buildLeidenInput(): LeidenInput {
    // Get all entities and relationships
    const entities = this.storage.listEntities({});
    const allRelationships = this.getAllRelationships(entities);

    // Create node ID mappings
    const nodeIdMap = new Map<string, number>();
    const reverseMap = new Map<number, string>();

    entities.forEach((entity, index) => {
      nodeIdMap.set(entity.id, index);
      reverseMap.set(index, entity.id);
    });

    // Build edge arrays
    const sources: number[] = [];
    const targets: number[] = [];
    const weights: number[] = [];
    const seenEdges = new Set<string>();

    for (const rel of allRelationships) {
      const sourceIdx = nodeIdMap.get(rel.sourceEntityId);
      const targetIdx = nodeIdMap.get(rel.targetEntityId);

      if (sourceIdx !== undefined && targetIdx !== undefined) {
        // Create undirected edges (both directions)
        const edgeKey1 = `${sourceIdx}-${targetIdx}`;
        const edgeKey2 = `${targetIdx}-${sourceIdx}`;

        if (!seenEdges.has(edgeKey1)) {
          seenEdges.add(edgeKey1);
          seenEdges.add(edgeKey2);

          // Forward edge
          sources.push(sourceIdx);
          targets.push(targetIdx);
          weights.push(rel.strength);

          // Reverse edge (undirected graph for community detection)
          sources.push(targetIdx);
          targets.push(sourceIdx);
          weights.push(rel.strength);
        }
      }
    }

    return {
      sources: new Uint32Array(sources),
      targets: new Uint32Array(targets),
      weights: new Float64Array(weights),
      nodeIdMap,
      reverseMap,
    };
  }

  /**
   * Build adjacency list representation
   * Useful for BFS/DFS traversals
   */
  buildAdjacencyList(): Map<
    string,
    Array<{ entityId: string; weight: number }>
  > {
    const adjacency = new Map<
      string,
      Array<{ entityId: string; weight: number }>
    >();
    const entities = this.storage.listEntities({});

    // Initialize all nodes
    for (const entity of entities) {
      adjacency.set(entity.id, []);
    }

    // Add edges
    for (const entity of entities) {
      const relationships = this.storage.getRelationshipsForEntity(
        entity.id,
        "both",
      );

      for (const rel of relationships) {
        const neighborId =
          rel.sourceEntityId === entity.id
            ? rel.targetEntityId
            : rel.sourceEntityId;

        // Check if neighbor exists
        if (adjacency.has(neighborId)) {
          const neighbors = adjacency.get(entity.id)!;
          // Avoid duplicates
          if (!neighbors.some((n) => n.entityId === neighborId)) {
            neighbors.push({ entityId: neighborId, weight: rel.strength });
          }
        }
      }
    }

    return adjacency;
  }

  /**
   * Get graph statistics
   */
  getGraphStats(): GraphStats {
    const entities = this.storage.listEntities({});
    const nodeCount = entities.length;

    if (nodeCount === 0) {
      return { nodeCount: 0, edgeCount: 0, avgDegree: 0, components: 0 };
    }

    // Count unique edges
    const seenEdges = new Set<string>();
    let totalDegree = 0;

    for (const entity of entities) {
      const relationships = this.storage.getRelationshipsForEntity(
        entity.id,
        "both",
      );
      totalDegree += relationships.length;

      for (const rel of relationships) {
        const edgeKey = [rel.sourceEntityId, rel.targetEntityId]
          .sort()
          .join("-");
        seenEdges.add(edgeKey);
      }
    }

    const edgeCount = seenEdges.size;
    const avgDegree = nodeCount > 0 ? totalDegree / nodeCount : 0;

    // Count connected components using BFS
    const components = this.countConnectedComponents(entities);

    return { nodeCount, edgeCount, avgDegree, components };
  }

  /**
   * Count connected components in the graph
   */
  private countConnectedComponents(entities: Entity[]): number {
    const visited = new Set<string>();
    let componentCount = 0;

    for (const entity of entities) {
      if (!visited.has(entity.id)) {
        componentCount++;
        this.bfsVisit(entity.id, visited);
      }
    }

    return componentCount;
  }

  /**
   * BFS traversal to mark all nodes in a component as visited
   */
  private bfsVisit(startId: string, visited: Set<string>): void {
    const queue = [startId];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const relationships = this.storage.getRelationshipsForEntity(
        nodeId,
        "both",
      );

      for (const rel of relationships) {
        const neighborId =
          rel.sourceEntityId === nodeId
            ? rel.targetEntityId
            : rel.sourceEntityId;

        if (!visited.has(neighborId)) {
          queue.push(neighborId);
        }
      }
    }
  }

  /**
   * Get all relationships for a set of entities
   */
  private getAllRelationships(entities: Entity[]): Relationship[] {
    const relationships: Relationship[] = [];
    const seen = new Set<string>();

    for (const entity of entities) {
      const rels = this.storage.getRelationshipsForEntity(entity.id, "source");
      for (const rel of rels) {
        if (!seen.has(rel.id)) {
          seen.add(rel.id);
          relationships.push(rel);
        }
      }
    }

    return relationships;
  }

  /**
   * Get subgraph for specific entities
   */
  getSubgraph(entityIds: string[]): {
    entities: Entity[];
    relationships: Relationship[];
  } {
    const entityIdSet = new Set(entityIds);
    const entities: Entity[] = [];
    const relationships: Relationship[] = [];
    const seenRels = new Set<string>();

    for (const id of entityIds) {
      const entity = this.storage.getEntity(id);
      if (entity) {
        entities.push(entity);

        // Get relationships between selected entities
        const rels = this.storage.getRelationshipsForEntity(id, "both");
        for (const rel of rels) {
          if (
            !seenRels.has(rel.id) &&
            entityIdSet.has(rel.sourceEntityId) &&
            entityIdSet.has(rel.targetEntityId)
          ) {
            seenRels.add(rel.id);
            relationships.push(rel);
          }
        }
      }
    }

    return { entities, relationships };
  }
}
