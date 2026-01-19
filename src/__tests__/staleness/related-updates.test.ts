/**
 * Related Updates Strategy Tests
 */

import { describe, expect, it, mock } from "bun:test";
import type { MemoryRelation } from "@/database/memory-relations";
import { RelatedUpdatesStrategy } from "@/staleness/strategies/related-updates";
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
    sourceId: "test-memory-1",
    targetId: "test-memory-2",
    type: "references",
    weight: 1.0,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("RelatedUpdatesStrategy", () => {
  const strategy = new RelatedUpdatesStrategy({
    weight: 0.4,
    maxDepth: 2,
  });

  it("should have correct type and weight", () => {
    expect(strategy.type).toBe("related_updates");
    expect(strategy.weight).toBe(0.4);
  });

  it("should return null when no relation storage in context", async () => {
    const now = Math.floor(Date.now() / 1000);
    const memory = createMockMemory();

    const signal = await strategy.check(memory, { now });
    expect(signal).toBeNull();
  });

  it("should return null when memory has no relations", async () => {
    const now = Math.floor(Date.now() / 1000);
    const memory = createMockMemory();

    const mockRelationStorage = {
      getRelationsFrom: mock(() => Promise.resolve([])),
    };

    const mockStorage = {
      getMemory: mock(() => null),
    };

    const signal = await strategy.check(memory, {
      now,
      relationStorage: mockRelationStorage as any,
      storage: mockStorage as any,
    });

    expect(signal).toBeNull();
  });

  it("should return null when related memories are older", async () => {
    const now = Math.floor(Date.now() / 1000);
    const memory = createMockMemory({
      createdAt: now - 10 * SECONDS_PER_DAY, // 10 days ago
    });

    const olderMemory = createMockMemory({
      id: "related-memory",
      createdAt: now - 30 * SECONDS_PER_DAY, // 30 days ago (older)
    });

    const mockRelationStorage = {
      getRelationsFrom: mock(() =>
        Promise.resolve([createMockRelation({ targetId: olderMemory.id })]),
      ),
    };

    const mockStorage = {
      getMemory: mock((id: string) =>
        id === olderMemory.id ? olderMemory : null,
      ),
    };

    const signal = await strategy.check(memory, {
      now,
      relationStorage: mockRelationStorage as any,
      storage: mockStorage as any,
    });

    expect(signal).toBeNull();
  });

  it("should return signal when related memory is fresher", async () => {
    const now = Math.floor(Date.now() / 1000);
    const memory = createMockMemory({
      id: "old-memory",
      createdAt: now - 60 * SECONDS_PER_DAY, // 60 days ago
    });

    const fresherMemory = createMockMemory({
      id: "fresh-memory",
      title: "Fresher Memory",
      createdAt: now - 5 * SECONDS_PER_DAY, // 5 days ago (fresher)
    });

    const mockRelationStorage = {
      getRelationsFrom: mock((id: string) => {
        if (id === "old-memory") {
          return Promise.resolve([
            createMockRelation({
              sourceId: "old-memory",
              targetId: "fresh-memory",
            }),
          ]);
        }
        return Promise.resolve([]);
      }),
    };

    const mockStorage = {
      getMemory: mock((id: string) =>
        id === "fresh-memory" ? fresherMemory : null,
      ),
    };

    const signal = await strategy.check(memory, {
      now,
      relationStorage: mockRelationStorage as any,
      storage: mockStorage as any,
    });

    expect(signal).not.toBeNull();
    expect(signal?.strategy).toBe("related_updates");
    expect(signal?.weight).toBe(0.4);
    expect(signal?.score).toBeGreaterThan(0);
    expect(signal?.reason).toContain("Fresher Memory");
  });

  it("should respect maxDepth limit", async () => {
    const now = Math.floor(Date.now() / 1000);
    const memory = createMockMemory({
      id: "root-memory",
      createdAt: now - 100 * SECONDS_PER_DAY,
    });

    // Create a chain: root -> level1 -> level2 -> level3
    const level1 = createMockMemory({
      id: "level1",
      createdAt: now - 90 * SECONDS_PER_DAY,
    });
    const level2 = createMockMemory({
      id: "level2",
      createdAt: now - 80 * SECONDS_PER_DAY,
    });
    const level3Fresh = createMockMemory({
      id: "level3",
      title: "Level 3 Fresh",
      createdAt: now - 5 * SECONDS_PER_DAY, // Fresher but at depth 3
    });

    const mockRelationStorage = {
      getRelationsFrom: mock((id: string) => {
        if (id === "root-memory") {
          return Promise.resolve([
            createMockRelation({ sourceId: id, targetId: "level1" }),
          ]);
        }
        if (id === "level1") {
          return Promise.resolve([
            createMockRelation({ sourceId: id, targetId: "level2" }),
          ]);
        }
        if (id === "level2") {
          return Promise.resolve([
            createMockRelation({ sourceId: id, targetId: "level3" }),
          ]);
        }
        return Promise.resolve([]);
      }),
    };

    const memories: Record<string, Memory> = {
      level1,
      level2,
      level3: level3Fresh,
    };

    const mockStorage = {
      getMemory: mock((id: string) => memories[id] || null),
    };

    // With maxDepth=2, level3 should not be traversed
    const signal = await strategy.check(memory, {
      now,
      relationStorage: mockRelationStorage as any,
      storage: mockStorage as any,
    });

    // Should not find level3 as it's at depth 3
    if (signal?.metadata) {
      const fresherMemories = signal.metadata.fresherMemories as Array<{
        id: string;
      }>;
      expect(fresherMemories.some((m) => m.id === "level3")).toBe(false);
    }
  });

  it("should include metadata with fresher memory details", async () => {
    const now = Math.floor(Date.now() / 1000);
    const memory = createMockMemory({
      id: "old-memory",
      createdAt: now - 60 * SECONDS_PER_DAY,
    });

    const fresherMemory = createMockMemory({
      id: "fresh-memory",
      title: "Fresher Memory",
      createdAt: now - 5 * SECONDS_PER_DAY,
    });

    const mockRelationStorage = {
      getRelationsFrom: mock((id: string) => {
        if (id === "old-memory") {
          return Promise.resolve([
            createMockRelation({
              sourceId: "old-memory",
              targetId: "fresh-memory",
              type: "extends",
            }),
          ]);
        }
        return Promise.resolve([]);
      }),
    };

    const mockStorage = {
      getMemory: mock((id: string) =>
        id === "fresh-memory" ? fresherMemory : null,
      ),
    };

    const signal = await strategy.check(memory, {
      now,
      relationStorage: mockRelationStorage as any,
      storage: mockStorage as any,
    });

    expect(signal).not.toBeNull();
    expect(signal?.metadata).toBeDefined();
    expect(signal?.metadata?.fresherRelatedCount).toBe(1);
    expect(signal?.metadata?.fresherMemories).toBeDefined();

    const fresherMemories = signal?.metadata?.fresherMemories as Array<{
      id: string;
      title: string;
      relationType: string;
    }>;
    expect(fresherMemories[0].id).toBe("fresh-memory");
    expect(fresherMemories[0].title).toBe("Fresher Memory");
    expect(fresherMemories[0].relationType).toBe("extends");
  });
});
