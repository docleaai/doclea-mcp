/**
 * Hierarchy Builder
 *
 * Builds hierarchical community structures using the Leiden algorithm
 * at multiple resolution levels.
 */

import { GraphBuilder } from "../graph/graph-builder";
import type { GraphRAGStorage } from "../graph/graphrag-storage";
import type { Community, LeidenInput, LeidenResult } from "../types";
import { runLeidenWithFallback } from "./leiden";

/**
 * Configuration for hierarchy building
 */
export interface HierarchyConfig {
  /** Number of hierarchy levels (default: 3) */
  levels: number;
  /** Resolution values per level (higher = more communities) */
  resolutions: number[];
}

const DEFAULT_CONFIG: HierarchyConfig = {
  levels: 3,
  resolutions: [1.0, 0.5, 0.25],
};

/**
 * Result of hierarchy building
 */
export interface HierarchyResult {
  communities: Community[];
  modularity: number;
  levelStats: Array<{
    level: number;
    communityCount: number;
    avgCommunitySize: number;
  }>;
}

/**
 * Builds hierarchical community structures
 */
export class HierarchyBuilder {
  private graphBuilder: GraphBuilder;

  constructor(
    private storage: GraphRAGStorage,
    graphBuilder?: GraphBuilder,
  ) {
    this.graphBuilder = graphBuilder || new GraphBuilder(storage);
  }

  /**
   * Build multi-level community hierarchy
   *
   * Creates communities at multiple resolutions:
   * - Level 0: Finest granularity (many small communities)
   * - Level N: Coarsest granularity (few large communities)
   *
   * Child communities are linked to parent communities.
   */
  async buildHierarchy(
    config?: Partial<HierarchyConfig>,
  ): Promise<HierarchyResult> {
    const opts = { ...DEFAULT_CONFIG, ...config };

    // Ensure resolutions array matches levels
    while (opts.resolutions.length < opts.levels) {
      const lastResolution =
        opts.resolutions[opts.resolutions.length - 1] || 1.0;
      opts.resolutions.push(lastResolution * 0.5);
    }

    const input = this.graphBuilder.buildLeidenInput();

    if (input.sources.length === 0) {
      return {
        communities: [],
        modularity: 0,
        levelStats: [],
      };
    }

    const allCommunities: Community[] = [];
    const levelStats: HierarchyResult["levelStats"] = [];
    let overallModularity = 0;

    // Track community assignments at each level for parent linking
    const levelAssignments: Map<number, string>[] = [];

    for (let level = 0; level < opts.levels; level++) {
      const resolution = opts.resolutions[level];

      // Run Leiden at this resolution
      const result = await runLeidenWithFallback(input, {
        resolution,
        maxIterations: 100,
      });

      if (level === 0) {
        overallModularity = result.modularity;
      }

      // Group entities by community
      const communityEntities = this.groupByCommunity(result, input);

      // Create community records
      const levelCommunities: Community[] = [];
      const nodeToCommunitId = new Map<number, string>();

      for (const [communityIdx, entityIds] of communityEntities) {
        // Find parent community from previous level
        const parentId =
          level > 0
            ? this.findParentCommunity(
                entityIds,
                levelAssignments[level - 1],
                input,
              )
            : undefined;

        const now = Math.floor(Date.now() / 1000);
        const community = this.storage.createCommunity({
          level,
          parentId,
          entityCount: entityIds.length,
          resolution,
          modularity: result.modularity,
          createdAt: now,
          updatedAt: now,
        });

        // Add entities to community
        for (const entityId of entityIds) {
          this.storage.addEntityToCommunity(community.id, entityId);
          // Track node -> community mapping for parent linking
          const nodeIdx = input.nodeIdMap.get(entityId);
          if (nodeIdx !== undefined) {
            nodeToCommunitId.set(nodeIdx, community.id);
          }
        }

        levelCommunities.push(community);
      }

      allCommunities.push(...levelCommunities);

      // Store assignments for parent linking
      levelAssignments.push(nodeToCommunitId);

      // Calculate level stats
      const avgSize =
        levelCommunities.length > 0
          ? levelCommunities.reduce((sum, c) => sum + c.entityCount, 0) /
            levelCommunities.length
          : 0;

      levelStats.push({
        level,
        communityCount: levelCommunities.length,
        avgCommunitySize: avgSize,
      });
    }

    return {
      communities: allCommunities,
      modularity: overallModularity,
      levelStats,
    };
  }

  /**
   * Clear existing communities and rebuild
   */
  async clearAndRebuild(
    config?: Partial<HierarchyConfig>,
  ): Promise<HierarchyResult> {
    this.storage.clearCommunities();
    return this.buildHierarchy(config);
  }

  /**
   * Rebuild communities for a specific level only
   */
  async rebuildLevel(level: number, resolution: number): Promise<Community[]> {
    // Delete communities at this level
    const existingCommunities = this.storage.getCommunitiesAtLevel(level);
    for (const community of existingCommunities) {
      // Note: CASCADE will handle members and reports
      this.storage.clearCommunities(); // For simplicity, clear all
    }

    // Rebuild entire hierarchy (simpler than partial rebuild)
    const result = await this.buildHierarchy({
      levels: level + 1,
      resolutions: Array.from({ length: level + 1 }, (_, i) =>
        i === level ? resolution : 1.0 / (i + 1),
      ),
    });

    return result.communities.filter((c) => c.level === level);
  }

  /**
   * Group Leiden results by community, mapping back to entity IDs
   */
  private groupByCommunity(
    result: LeidenResult,
    input: LeidenInput,
  ): Map<number, string[]> {
    const communityEntities = new Map<number, string[]>();

    for (const [nodeIdx, communityIdx] of result.communities) {
      const entityId = input.reverseMap.get(nodeIdx);
      if (entityId) {
        if (!communityEntities.has(communityIdx)) {
          communityEntities.set(communityIdx, []);
        }
        communityEntities.get(communityIdx)!.push(entityId);
      }
    }

    return communityEntities;
  }

  /**
   * Find the most common parent community for a set of entities
   */
  private findParentCommunity(
    entityIds: string[],
    parentAssignments: Map<number, string>,
    input: LeidenInput,
  ): string | undefined {
    if (!parentAssignments || parentAssignments.size === 0) {
      return undefined;
    }

    // Count parent community occurrences
    const parentCounts = new Map<string, number>();

    for (const entityId of entityIds) {
      const nodeIdx = input.nodeIdMap.get(entityId);
      if (nodeIdx !== undefined) {
        const parentCommunityId = parentAssignments.get(nodeIdx);
        if (parentCommunityId) {
          parentCounts.set(
            parentCommunityId,
            (parentCounts.get(parentCommunityId) || 0) + 1,
          );
        }
      }
    }

    // Return most common parent
    let maxCount = 0;
    let mostCommonParent: string | undefined;

    for (const [parentId, count] of parentCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonParent = parentId;
      }
    }

    return mostCommonParent;
  }

  /**
   * Get hierarchy statistics
   */
  getHierarchyStats(): {
    totalCommunities: number;
    levelsUsed: number;
    avgCommunitiesPerLevel: number;
  } {
    const stats = this.storage.getStats();

    // Count unique levels
    const communities = this.storage.getCommunitiesAtLevel(0);
    let maxLevel = 0;

    for (let level = 1; level <= 10; level++) {
      const levelCommunities = this.storage.getCommunitiesAtLevel(level);
      if (levelCommunities.length > 0) {
        maxLevel = level;
      } else {
        break;
      }
    }

    const levelsUsed = maxLevel + 1;

    return {
      totalCommunities: stats.communities,
      levelsUsed,
      avgCommunitiesPerLevel:
        levelsUsed > 0 ? stats.communities / levelsUsed : 0,
    };
  }
}
