/**
 * GraphRAG Status Tool
 *
 * Get statistics about the GraphRAG knowledge graph.
 */

import { z } from "zod";
import { GraphBuilder } from "@/graphrag/graph/graph-builder";
import { GraphRAGStorage } from "@/graphrag/graph/graphrag-storage";
import type { IStorageBackend } from "@/storage/interface";

export const StatusInputSchema = z.object({
  includeGraphStats: z
    .boolean()
    .default(true)
    .describe("Include detailed graph statistics"),
  includeTopEntities: z
    .boolean()
    .default(true)
    .describe("Include list of top entities by mention count"),
  topEntitiesLimit: z
    .number()
    .min(1)
    .max(50)
    .default(10)
    .describe("Number of top entities to return"),
});

export type StatusInput = z.infer<typeof StatusInputSchema>;

export interface StatusResult {
  entityCount: number;
  relationshipCount: number;
  communityCount: number;
  reportCount: number;
  graphStats?: {
    nodeCount: number;
    edgeCount: number;
    avgDegree: number;
    components: number;
  };
  topEntityTypes: Array<{ type: string; count: number }>;
  topEntities?: Array<{
    name: string;
    type: string;
    mentions: number;
    relationships: number;
  }>;
  communityLevels: Array<{
    level: number;
    count: number;
    avgSize: number;
  }>;
  lastBuildAt?: number;
}

/**
 * Get GraphRAG knowledge graph status
 */
export function graphragStatus(
  input: StatusInput,
  storage: IStorageBackend,
): StatusResult {
  const db = storage.getDatabase();
  const graphStorage = new GraphRAGStorage(db);
  const graphBuilder = new GraphBuilder(graphStorage);

  // Get basic stats
  const stats = graphStorage.getStats();

  // Get entity type distribution
  const topEntityTypes = graphStorage.getEntityTypeDistribution();

  // Get graph stats if requested
  let graphStats: StatusResult["graphStats"];
  if (input.includeGraphStats) {
    graphStats = graphBuilder.getGraphStats();
  }

  // Get top entities if requested
  let topEntities: StatusResult["topEntities"];
  if (input.includeTopEntities) {
    const entities = graphStorage.listEntities({
      limit: input.topEntitiesLimit,
    });
    topEntities = entities.map((entity) => {
      const relationships = graphStorage.getRelationshipsForEntity(
        entity.id,
        "both",
      );
      return {
        name: entity.canonicalName,
        type: entity.entityType,
        mentions: entity.mentionCount,
        relationships: relationships.length,
      };
    });
  }

  // Get community level stats
  const communityLevels: StatusResult["communityLevels"] = [];
  for (let level = 0; level <= 5; level++) {
    const communities = graphStorage.getCommunitiesAtLevel(level);
    if (communities.length === 0) break;

    const totalSize = communities.reduce((sum, c) => sum + c.entityCount, 0);
    communityLevels.push({
      level,
      count: communities.length,
      avgSize: communities.length > 0 ? totalSize / communities.length : 0,
    });
  }

  // Find last build time (most recent entity creation)
  let lastBuildAt: number | undefined;
  const recentEntities = graphStorage.listEntities({ limit: 1 });
  if (recentEntities.length > 0) {
    lastBuildAt = recentEntities[0].lastSeenAt;
  }

  return {
    entityCount: stats.entities,
    relationshipCount: stats.relationships,
    communityCount: stats.communities,
    reportCount: stats.reports,
    graphStats,
    topEntityTypes,
    topEntities,
    communityLevels,
    lastBuildAt,
  };
}

/**
 * Format status result for MCP response
 */
export function formatStatusResult(result: StatusResult): string {
  const summary = [
    `GraphRAG Knowledge Graph Status`,
    `==============================`,
    ``,
    `Entities: ${result.entityCount}`,
    `Relationships: ${result.relationshipCount}`,
    `Communities: ${result.communityCount}`,
    `Reports: ${result.reportCount}`,
  ];

  if (result.graphStats) {
    summary.push(
      ``,
      `Graph Statistics:`,
      `  Nodes: ${result.graphStats.nodeCount}`,
      `  Edges: ${result.graphStats.edgeCount}`,
      `  Avg Degree: ${result.graphStats.avgDegree.toFixed(2)}`,
      `  Components: ${result.graphStats.components}`,
    );
  }

  if (result.topEntityTypes.length > 0) {
    summary.push(``, `Entity Types:`);
    for (const { type, count } of result.topEntityTypes) {
      summary.push(`  ${type}: ${count}`);
    }
  }

  if (result.communityLevels.length > 0) {
    summary.push(``, `Community Hierarchy:`);
    for (const { level, count, avgSize } of result.communityLevels) {
      summary.push(
        `  Level ${level}: ${count} communities (avg size: ${avgSize.toFixed(1)})`,
      );
    }
  }

  if (result.topEntities && result.topEntities.length > 0) {
    summary.push(``, `Top Entities:`);
    for (const entity of result.topEntities) {
      summary.push(
        `  - ${entity.name} (${entity.type}): ${entity.mentions} mentions, ${entity.relationships} relationships`,
      );
    }
  }

  if (result.lastBuildAt) {
    const date = new Date(result.lastBuildAt * 1000).toISOString();
    summary.push(``, `Last updated: ${date}`);
  }

  return summary.join("\n");
}
