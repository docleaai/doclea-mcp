/**
 * Superseded Strategy Tests
 */

import { describe, expect, it, mock } from "bun:test";
import type { MemoryRelation } from "@/database/memory-relations";
import { SupersededStrategy } from "@/staleness/strategies/superseded";
import type { Memory } from "@/types";

const SECONDS_PER_DAY = 86400;

function createMockMemory(overrides: Partial<Memory> = {}): Memory {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: "test-memory-1",
    type: "decision",
    title: "Test Memory",
    content: "Test content",
    importance: 0.5,
    tags: [],
    relatedFiles: [],
    experts: [],
    createdAt: now - 30 * SECONDS_PER_DAY,
    accessedAt: now - 30 * SECONDS_PER_DAY,
    accessCount: 1,
    needsReview: false,
    ...overrides,
  };
}

function createMockRelation(
  overrides: Partial<MemoryRelation> = {},
): MemoryRelation {
  return {
    id: "rel-1",
    sourceId: "superseding-memory",
    targetId: "test-memory-1",
    type: "supersedes",
    weight: 1.0,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("SupersededStrategy", () => {
  const strategy = new SupersededStrategy({
    weight: 1.0,
  });

  it("should have correct type and weight", () => {
    expect(strategy.type).toBe("superseded");
    expect(strategy.weight).toBe(1.0);
  });

  it("should return null when no relation storage in context", async () => {
    const now = Math.floor(Date.now() / 1000);
    const memory = createMockMemory();

    const signal = await strategy.check(memory, { now });
    expect(signal).toBeNull();
  });

  it("should return null when memory is not superseded", async () => {
    const now = Math.floor(Date.now() / 1000);
    const memory = createMockMemory();

    const mockRelationStorage = {
      getRelationsTo: mock(() => Promise.resolve([])),
    };

    const signal = await strategy.check(memory, {
      now,
      relationStorage: mockRelationStorage as any,
    });

    expect(signal).toBeNull();
  });

  it("should return score 1.0 when memory is superseded", async () => {
    const now = Math.floor(Date.now() / 1000);
    const memory = createMockMemory();

    const mockRelationStorage = {
      getRelationsTo: mock(() => Promise.resolve([createMockRelation()])),
    };

    const signal = await strategy.check(memory, {
      now,
      relationStorage: mockRelationStorage as any,
    });

    expect(signal).not.toBeNull();
    expect(signal?.score).toBe(1.0);
    expect(signal?.strategy).toBe("superseded");
    expect(signal?.weight).toBe(1.0);
  });

  it("should include superseding memory ID in reason", async () => {
    const now = Math.floor(Date.now() / 1000);
    const memory = createMockMemory();

    const mockRelationStorage = {
      getRelationsTo: mock(() =>
        Promise.resolve([createMockRelation({ sourceId: "new-memory-xyz" })]),
      ),
    };

    const signal = await strategy.check(memory, {
      now,
      relationStorage: mockRelationStorage as any,
    });

    expect(signal).not.toBeNull();
    expect(signal?.reason).toContain("new-memory-xyz");
  });

  it("should handle multiple superseding memories", async () => {
    const now = Math.floor(Date.now() / 1000);
    const memory = createMockMemory();

    const mockRelationStorage = {
      getRelationsTo: mock(() =>
        Promise.resolve([
          createMockRelation({ sourceId: "superseding-1" }),
          createMockRelation({ sourceId: "superseding-2" }),
          createMockRelation({ sourceId: "superseding-3" }),
        ]),
      ),
    };

    const signal = await strategy.check(memory, {
      now,
      relationStorage: mockRelationStorage as any,
    });

    expect(signal).not.toBeNull();
    expect(signal?.score).toBe(1.0);
    expect(signal?.reason).toContain("3 memories");
    expect(signal?.metadata?.supersedingCount).toBe(3);
  });

  it("should include metadata with superseding memory IDs", async () => {
    const now = Math.floor(Date.now() / 1000);
    const memory = createMockMemory();

    const mockRelationStorage = {
      getRelationsTo: mock(() =>
        Promise.resolve([
          createMockRelation({ sourceId: "superseding-a" }),
          createMockRelation({ sourceId: "superseding-b" }),
        ]),
      ),
    };

    const signal = await strategy.check(memory, {
      now,
      relationStorage: mockRelationStorage as any,
    });

    expect(signal).not.toBeNull();
    expect(signal?.metadata).toBeDefined();
    expect(signal?.metadata?.supersedingMemoryIds).toEqual([
      "superseding-a",
      "superseding-b",
    ]);
    expect(signal?.metadata?.supersedingCount).toBe(2);
  });

  it("should only check for supersedes relation type", async () => {
    const now = Math.floor(Date.now() / 1000);
    const memory = createMockMemory();

    // Mock that verifies the correct relation type is queried
    const mockRelationStorage = {
      getRelationsTo: mock((_targetId: string, type: string) => {
        expect(type).toBe("supersedes");
        return Promise.resolve([]);
      }),
    };

    await strategy.check(memory, {
      now,
      relationStorage: mockRelationStorage as any,
    });

    expect(mockRelationStorage.getRelationsTo).toHaveBeenCalled();
  });
});
