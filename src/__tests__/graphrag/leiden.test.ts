/**
 * Tests for Leiden community detection algorithm
 */

import { describe, expect, test } from "bun:test";
import { runLeiden, runLeidenWithFallback } from "@/graphrag/community/leiden";
import type { LeidenInput } from "@/graphrag/types";

describe("Leiden Algorithm", () => {
  describe("runLeiden", () => {
    test("handles empty graph", async () => {
      const input: LeidenInput = {
        sources: new Uint32Array([]),
        targets: new Uint32Array([]),
        weights: new Float64Array([]),
        nodeIdMap: new Map(),
        reverseMap: new Map(),
      };

      const result = await runLeiden(input);

      expect(result.communities.size).toBe(0);
      expect(result.modularity).toBe(0);
      expect(result.iterations).toBe(0);
    });

    test("handles single node graph", async () => {
      const input: LeidenInput = {
        sources: new Uint32Array([]),
        targets: new Uint32Array([]),
        weights: new Float64Array([]),
        nodeIdMap: new Map([["node0", 0]]),
        reverseMap: new Map([[0, "node0"]]),
      };

      const result = await runLeiden(input);

      // Single node should be in its own community
      expect(result.communities.size).toBe(1);
      expect(result.communities.get(0)).toBeDefined();
    });

    test("detects communities in connected components", async () => {
      // Create two disconnected triangles
      // Triangle 1: 0-1-2
      // Triangle 2: 3-4-5
      const input: LeidenInput = {
        sources: new Uint32Array([
          0,
          1,
          0,
          2,
          1,
          2, // Triangle 1
          3,
          4,
          3,
          5,
          4,
          5, // Triangle 2
        ]),
        targets: new Uint32Array([
          1,
          0,
          2,
          0,
          2,
          1, // Triangle 1
          4,
          3,
          5,
          3,
          5,
          4, // Triangle 2
        ]),
        weights: new Float64Array([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]),
        nodeIdMap: new Map([
          ["n0", 0],
          ["n1", 1],
          ["n2", 2],
          ["n3", 3],
          ["n4", 4],
          ["n5", 5],
        ]),
        reverseMap: new Map([
          [0, "n0"],
          [1, "n1"],
          [2, "n2"],
          [3, "n3"],
          [4, "n4"],
          [5, "n5"],
        ]),
      };

      const result = await runLeiden(input);

      expect(result.communities.size).toBe(6);

      // Nodes in same triangle should be in same community
      const comm0 = result.communities.get(0);
      const comm1 = result.communities.get(1);
      const comm2 = result.communities.get(2);
      expect(comm0).toBe(comm1);
      expect(comm1).toBe(comm2);

      const comm3 = result.communities.get(3);
      const comm4 = result.communities.get(4);
      const comm5 = result.communities.get(5);
      expect(comm3).toBe(comm4);
      expect(comm4).toBe(comm5);

      // Different triangles should be in different communities
      expect(comm0).not.toBe(comm3);
    });

    test("handles weighted edges", async () => {
      // Line graph: 0--1--2--3
      // Strong edge between 0-1, weak edges elsewhere
      const input: LeidenInput = {
        sources: new Uint32Array([0, 1, 1, 2, 2, 3]),
        targets: new Uint32Array([1, 0, 2, 1, 3, 2]),
        weights: new Float64Array([10, 10, 1, 1, 1, 1]), // Strong 0-1, weak others
        nodeIdMap: new Map([
          ["n0", 0],
          ["n1", 1],
          ["n2", 2],
          ["n3", 3],
        ]),
        reverseMap: new Map([
          [0, "n0"],
          [1, "n1"],
          [2, "n2"],
          [3, "n3"],
        ]),
      };

      const result = await runLeiden(input);

      expect(result.communities.size).toBe(4);
      // 0 and 1 should likely be in same community due to strong edge
      expect(result.communities.get(0)).toBe(result.communities.get(1));
    });

    test("respects resolution parameter", async () => {
      // Complete graph of 4 nodes
      const input: LeidenInput = {
        sources: new Uint32Array([0, 1, 0, 2, 0, 3, 1, 2, 1, 3, 2, 3]),
        targets: new Uint32Array([1, 0, 2, 0, 3, 0, 2, 1, 3, 1, 3, 2]),
        weights: new Float64Array([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]),
        nodeIdMap: new Map([
          ["n0", 0],
          ["n1", 1],
          ["n2", 2],
          ["n3", 3],
        ]),
        reverseMap: new Map([
          [0, "n0"],
          [1, "n1"],
          [2, "n2"],
          [3, "n3"],
        ]),
      };

      // Low resolution = fewer communities (lumping)
      const lowRes = await runLeiden(input, { resolution: 0.1 });
      // High resolution = more communities (splitting)
      const highRes = await runLeiden(input, { resolution: 5.0 });

      // Count unique communities
      const lowResCount = new Set(lowRes.communities.values()).size;
      const highResCount = new Set(highRes.communities.values()).size;

      // Higher resolution should give more communities (or equal)
      expect(highResCount).toBeGreaterThanOrEqual(lowResCount);
    });

    test("normalizes community IDs", async () => {
      const input: LeidenInput = {
        sources: new Uint32Array([0, 1]),
        targets: new Uint32Array([1, 0]),
        weights: new Float64Array([5, 5]),
        nodeIdMap: new Map([
          ["n0", 0],
          ["n1", 1],
        ]),
        reverseMap: new Map([
          [0, "n0"],
          [1, "n1"],
        ]),
      };

      const result = await runLeiden(input);

      // Community IDs should start from 0 and be consecutive
      const communityIds = new Set(result.communities.values());
      const ids = Array.from(communityIds).sort((a, b) => a - b);

      for (let i = 0; i < ids.length; i++) {
        expect(ids[i]).toBe(i);
      }
    });

    test("reports modularity", async () => {
      // Triangle graph (should have positive modularity)
      const input: LeidenInput = {
        sources: new Uint32Array([0, 1, 0, 2, 1, 2]),
        targets: new Uint32Array([1, 0, 2, 0, 2, 1]),
        weights: new Float64Array([5, 5, 5, 5, 5, 5]),
        nodeIdMap: new Map([
          ["n0", 0],
          ["n1", 1],
          ["n2", 2],
        ]),
        reverseMap: new Map([
          [0, "n0"],
          [1, "n1"],
          [2, "n2"],
        ]),
      };

      const result = await runLeiden(input);

      // Modularity should be between -0.5 and 1.0
      expect(result.modularity).toBeGreaterThanOrEqual(-0.5);
      expect(result.modularity).toBeLessThanOrEqual(1.0);
    });

    test("reports iterations", async () => {
      const input: LeidenInput = {
        sources: new Uint32Array([0, 1]),
        targets: new Uint32Array([1, 0]),
        weights: new Float64Array([5, 5]),
        nodeIdMap: new Map([
          ["n0", 0],
          ["n1", 1],
        ]),
        reverseMap: new Map([
          [0, "n0"],
          [1, "n1"],
        ]),
      };

      const result = await runLeiden(input, { maxIterations: 10 });

      expect(result.iterations).toBeGreaterThan(0);
      expect(result.iterations).toBeLessThanOrEqual(10);
    });
  });

  describe("runLeidenWithFallback", () => {
    test("returns result for valid input", async () => {
      const input: LeidenInput = {
        sources: new Uint32Array([0, 1]),
        targets: new Uint32Array([1, 0]),
        weights: new Float64Array([5, 5]),
        nodeIdMap: new Map([
          ["n0", 0],
          ["n1", 1],
        ]),
        reverseMap: new Map([
          [0, "n0"],
          [1, "n1"],
        ]),
      };

      const result = await runLeidenWithFallback(input);

      expect(result.communities.size).toBe(2);
    });

    test("handles empty input gracefully", async () => {
      const input: LeidenInput = {
        sources: new Uint32Array([]),
        targets: new Uint32Array([]),
        weights: new Float64Array([]),
        nodeIdMap: new Map(),
        reverseMap: new Map(),
      };

      const result = await runLeidenWithFallback(input);

      expect(result.communities.size).toBe(0);
    });
  });
});
