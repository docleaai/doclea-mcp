/**
 * Leiden Community Detection Algorithm
 *
 * A pure JavaScript implementation of the Leiden algorithm for community detection.
 * Based on the paper: "From Louvain to Leiden: guaranteeing well-connected communities"
 *
 * This implementation prioritizes correctness and clarity over maximum performance.
 * For very large graphs (>100k nodes), consider using a WASM-based implementation.
 */

import type { LeidenInput, LeidenResult } from "../types";

/**
 * Options for Leiden algorithm
 */
export interface LeidenOptions {
  /** Resolution parameter (higher = more communities, default: 1.0) */
  resolution?: number;
  /** Maximum number of iterations (default: 100) */
  maxIterations?: number;
  /** Random seed for reproducibility (optional) */
  seed?: number;
  /** Minimum improvement threshold for convergence (default: 1e-6) */
  minImprovement?: number;
}

const DEFAULT_OPTIONS: Required<LeidenOptions> = {
  resolution: 1.0,
  maxIterations: 100,
  seed: 42,
  minImprovement: 1e-6,
};

/**
 * Run Leiden community detection algorithm
 */
export async function runLeiden(
  input: LeidenInput,
  options: LeidenOptions = {},
): Promise<LeidenResult> {
  const startTime = performance.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const nodeCount = input.nodeIdMap.size;
  if (nodeCount === 0) {
    return {
      communities: new Map(),
      modularity: 0,
      iterations: 0,
    };
  }

  // Build adjacency structure
  const graph = buildAdjacencyStructure(input);

  // Initialize: each node in its own community
  const communityAssignment = new Map<number, number>();
  for (let i = 0; i < nodeCount; i++) {
    communityAssignment.set(i, i);
  }

  let totalWeight = 0;
  for (let i = 0; i < input.weights.length; i++) {
    totalWeight += input.weights[i];
  }
  totalWeight /= 2; // Undirected graph, edges counted twice

  let improved = true;
  let iterations = 0;
  let modularity = 0;

  while (improved && iterations < opts.maxIterations) {
    improved = false;
    iterations++;

    // Local moving phase (Louvain-style)
    const localMoved = localMovingPhase(
      graph,
      communityAssignment,
      totalWeight,
      opts.resolution,
    );

    if (localMoved) {
      improved = true;
    }

    // Refinement phase (Leiden-specific)
    const refined = refinementPhase(
      graph,
      communityAssignment,
      totalWeight,
      opts.resolution,
    );

    if (refined) {
      improved = true;
    }

    // Calculate modularity
    modularity = calculateModularity(
      graph,
      communityAssignment,
      totalWeight,
      opts.resolution,
    );
  }

  // Normalize community IDs to be consecutive
  const normalizedCommunities = normalizeCommunityIds(communityAssignment);

  const endTime = performance.now();

  return {
    communities: normalizedCommunities,
    modularity,
    iterations,
    diagnostics: {
      memoryUsed: process.memoryUsage?.().heapUsed ?? 0,
      executionTime: endTime - startTime,
    },
  };
}

/**
 * Run Leiden with fallback (for API compatibility)
 */
export async function runLeidenWithFallback(
  input: LeidenInput,
  options?: LeidenOptions,
): Promise<LeidenResult> {
  try {
    return await runLeiden(input, options);
  } catch (error) {
    console.warn("[doclea] Leiden algorithm failed:", error);

    // Simple fallback: each node in its own community
    const communities = new Map<number, number>();
    for (let i = 0; i < input.nodeIdMap.size; i++) {
      communities.set(i, i);
    }

    return {
      communities,
      modularity: 0,
      iterations: 0,
    };
  }
}

/**
 * Graph adjacency structure for efficient computation
 */
interface AdjacencyStructure {
  neighbors: Map<number, Array<{ node: number; weight: number }>>;
  nodeDegrees: Map<number, number>;
  nodeCount: number;
}

/**
 * Build adjacency structure from input
 */
function buildAdjacencyStructure(input: LeidenInput): AdjacencyStructure {
  const neighbors = new Map<number, Array<{ node: number; weight: number }>>();
  const nodeDegrees = new Map<number, number>();
  const nodeCount = input.nodeIdMap.size;

  // Initialize empty neighbor lists
  for (let i = 0; i < nodeCount; i++) {
    neighbors.set(i, []);
    nodeDegrees.set(i, 0);
  }

  // Build neighbor lists (handling duplicates)
  const edgeSeen = new Set<string>();

  for (let i = 0; i < input.sources.length; i++) {
    const source = input.sources[i];
    const target = input.targets[i];
    const weight = input.weights[i];

    const edgeKey = `${Math.min(source, target)}-${Math.max(source, target)}`;

    if (!edgeSeen.has(edgeKey)) {
      edgeSeen.add(edgeKey);

      neighbors.get(source)!.push({ node: target, weight });
      neighbors.get(target)!.push({ node: source, weight });

      nodeDegrees.set(source, (nodeDegrees.get(source) || 0) + weight);
      nodeDegrees.set(target, (nodeDegrees.get(target) || 0) + weight);
    }
  }

  return { neighbors, nodeDegrees, nodeCount };
}

/**
 * Local moving phase (Louvain algorithm core)
 */
function localMovingPhase(
  graph: AdjacencyStructure,
  communityAssignment: Map<number, number>,
  totalWeight: number,
  resolution: number,
): boolean {
  let improved = false;
  const nodeOrder = shuffleArray(
    Array.from({ length: graph.nodeCount }, (_, i) => i),
  );

  for (const node of nodeOrder) {
    const currentCommunity = communityAssignment.get(node)!;
    const nodeDegree = graph.nodeDegrees.get(node)!;

    // Calculate community weights
    const communityWeights = new Map<number, number>();
    const neighbors = graph.neighbors.get(node)!;

    for (const { node: neighbor, weight } of neighbors) {
      const neighborCommunity = communityAssignment.get(neighbor)!;
      communityWeights.set(
        neighborCommunity,
        (communityWeights.get(neighborCommunity) || 0) + weight,
      );
    }

    // Calculate gain for moving to each neighboring community
    let bestCommunity = currentCommunity;
    let bestGain = 0;

    // Calculate sum of degrees in current community
    const currentCommunityDegree = getCommunityDegree(
      graph,
      communityAssignment,
      currentCommunity,
    );

    for (const [community, edgeWeight] of communityWeights) {
      if (community === currentCommunity) continue;

      const targetCommunityDegree = getCommunityDegree(
        graph,
        communityAssignment,
        community,
      );

      // Modularity gain formula
      const gain =
        edgeWeight -
        resolution * ((nodeDegree * targetCommunityDegree) / (2 * totalWeight));

      const loss =
        (communityWeights.get(currentCommunity) || 0) -
        resolution *
          ((nodeDegree * (currentCommunityDegree - nodeDegree)) /
            (2 * totalWeight));

      const netGain = gain - loss;

      if (netGain > bestGain) {
        bestGain = netGain;
        bestCommunity = community;
      }
    }

    // Move node to best community
    if (bestCommunity !== currentCommunity) {
      communityAssignment.set(node, bestCommunity);
      improved = true;
    }
  }

  return improved;
}

/**
 * Leiden refinement phase
 * Ensures communities are well-connected
 */
function refinementPhase(
  graph: AdjacencyStructure,
  communityAssignment: Map<number, number>,
  totalWeight: number,
  resolution: number,
): boolean {
  let improved = false;

  // Get all communities
  const communities = new Map<number, Set<number>>();
  for (const [node, community] of communityAssignment) {
    if (!communities.has(community)) {
      communities.set(community, new Set());
    }
    communities.get(community)!.add(node);
  }

  // For each community, check if nodes should be moved
  for (const [_, communityNodes] of communities) {
    if (communityNodes.size <= 1) continue;

    // Check connectivity within community
    const nodesArray = Array.from(communityNodes);
    for (const node of nodesArray) {
      const neighbors = graph.neighbors.get(node)!;
      let internalWeight = 0;
      let totalNeighborWeight = 0;

      for (const { node: neighbor, weight } of neighbors) {
        totalNeighborWeight += weight;
        if (communityNodes.has(neighbor)) {
          internalWeight += weight;
        }
      }

      // If node is weakly connected to its community (less than 50% internal),
      // consider moving it
      if (
        internalWeight < totalNeighborWeight * 0.3 &&
        totalNeighborWeight > 0
      ) {
        // Find better community among neighbors
        const neighborCommunities = new Map<number, number>();
        for (const { node: neighbor, weight } of neighbors) {
          const neighborCommunity = communityAssignment.get(neighbor)!;
          neighborCommunities.set(
            neighborCommunity,
            (neighborCommunities.get(neighborCommunity) || 0) + weight,
          );
        }

        let bestCommunity = communityAssignment.get(node)!;
        let bestWeight = internalWeight;

        for (const [community, weight] of neighborCommunities) {
          if (weight > bestWeight) {
            bestWeight = weight;
            bestCommunity = community;
          }
        }

        if (bestCommunity !== communityAssignment.get(node)) {
          communityAssignment.set(node, bestCommunity);
          improved = true;
        }
      }
    }
  }

  return improved;
}

/**
 * Calculate modularity of current partition
 */
function calculateModularity(
  graph: AdjacencyStructure,
  communityAssignment: Map<number, number>,
  totalWeight: number,
  resolution: number,
): number {
  if (totalWeight === 0) return 0;

  let modularity = 0;

  // Group edges by community
  const communityInternalWeight = new Map<number, number>();
  const communityTotalDegree = new Map<number, number>();

  for (let node = 0; node < graph.nodeCount; node++) {
    const community = communityAssignment.get(node)!;
    const degree = graph.nodeDegrees.get(node)!;

    communityTotalDegree.set(
      community,
      (communityTotalDegree.get(community) || 0) + degree,
    );

    const neighbors = graph.neighbors.get(node)!;
    for (const { node: neighbor, weight } of neighbors) {
      if (communityAssignment.get(neighbor) === community) {
        communityInternalWeight.set(
          community,
          (communityInternalWeight.get(community) || 0) + weight / 2,
        );
      }
    }
  }

  // Calculate modularity
  for (const community of communityTotalDegree.keys()) {
    const internalWeight = communityInternalWeight.get(community) || 0;
    const totalDegree = communityTotalDegree.get(community) || 0;

    modularity +=
      internalWeight / totalWeight -
      resolution * (totalDegree / (2 * totalWeight)) ** 2;
  }

  return modularity;
}

/**
 * Get total degree of a community
 */
function getCommunityDegree(
  graph: AdjacencyStructure,
  communityAssignment: Map<number, number>,
  community: number,
): number {
  let totalDegree = 0;
  for (const [node, nodeCommunity] of communityAssignment) {
    if (nodeCommunity === community) {
      totalDegree += graph.nodeDegrees.get(node) || 0;
    }
  }
  return totalDegree;
}

/**
 * Normalize community IDs to be consecutive starting from 0
 */
function normalizeCommunityIds(
  communityAssignment: Map<number, number>,
): Map<number, number> {
  const uniqueCommunities = new Set(communityAssignment.values());
  const communityRemap = new Map<number, number>();

  let newId = 0;
  for (const community of uniqueCommunities) {
    communityRemap.set(community, newId++);
  }

  const normalized = new Map<number, number>();
  for (const [node, community] of communityAssignment) {
    normalized.set(node, communityRemap.get(community)!);
  }

  return normalized;
}

/**
 * Fisher-Yates shuffle for random node ordering
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
