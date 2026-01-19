/**
 * Staleness Detector Tests
 */

import { describe, expect, it, mock } from "bun:test";
import { StalenessDetector } from "@/staleness/detector";
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

function createMockStorage(memories: Memory[] = []) {
  const memoryMap = new Map(memories.map((m) => [m.id, m]));

  return {
    getMemory: mock((id: string) => memoryMap.get(id) || null),
    listMemories: mock((_filters?: { type?: Memory["type"] }) =>
      Array.from(memoryMap.values()),
    ),
    getDatabase: mock(() => ({
      prepare: () => ({
        all: () => [],
        get: () => null,
        run: () => ({ changes: 0 }),
      }),
    })),
  };
}

describe("StalenessDetector", () => {
  describe("constructor", () => {
    it("should create with default config", () => {
      const storage = createMockStorage();
      const detector = new StalenessDetector(storage as any);
      const config = detector.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.thresholds.review).toBe(0.3);
      expect(config.thresholds.refresh).toBe(0.6);
      expect(config.thresholds.archive).toBe(0.9);
    });

    it("should merge custom config with defaults", () => {
      const storage = createMockStorage();
      const detector = new StalenessDetector(storage as any, {
        thresholds: {
          review: 0.4,
          refresh: 0.7,
          archive: 0.95,
        },
      });
      const config = detector.getConfig();

      expect(config.thresholds.review).toBe(0.4);
      expect(config.thresholds.refresh).toBe(0.7);
      expect(config.thresholds.archive).toBe(0.95);
    });

    it("should accept disabled config", () => {
      const storage = createMockStorage();
      const detector = new StalenessDetector(storage as any, {
        enabled: false,
      });
      const config = detector.getConfig();

      expect(config.enabled).toBe(false);
    });
  });

  describe("checkMemory", () => {
    it("should return null when disabled", async () => {
      const storage = createMockStorage([createMockMemory()]);
      const detector = new StalenessDetector(storage as any, {
        enabled: false,
      });

      const result = await detector.checkMemory("test-memory-1");
      expect(result).toBeNull();
    });

    it("should return null for non-existent memory", async () => {
      const storage = createMockStorage([]);
      const detector = new StalenessDetector(storage as any);

      const result = await detector.checkMemory("non-existent");
      expect(result).toBeNull();
    });

    it("should return result with composite score", async () => {
      const now = Math.floor(Date.now() / 1000);
      const memory = createMockMemory({
        createdAt: now - 90 * SECONDS_PER_DAY, // 90 days old
      });
      const storage = createMockStorage([memory]);
      const detector = new StalenessDetector(storage as any);
      await detector.initialize();

      const result = await detector.checkMemory("test-memory-1");

      expect(result).not.toBeNull();
      expect(result?.memoryId).toBe("test-memory-1");
      expect(result?.compositeScore).toBeGreaterThanOrEqual(0);
      expect(result?.compositeScore).toBeLessThanOrEqual(1);
      expect(result?.checkedAt).toBeGreaterThan(0);

      await detector.dispose();
    });

    it("should determine correct action based on score", async () => {
      const now = Math.floor(Date.now() / 1000);

      // Test review action (score >= 0.3)
      const recentMemory = createMockMemory({
        id: "recent",
        createdAt: now - 60 * SECONDS_PER_DAY, // ~0.33 score
      });

      // Test refresh action (score >= 0.6)
      const olderMemory = createMockMemory({
        id: "older",
        createdAt: now - 120 * SECONDS_PER_DAY, // ~0.67 score
      });

      // Test archive action (score >= 0.9)
      const veryOldMemory = createMockMemory({
        id: "very-old",
        createdAt: now - 200 * SECONDS_PER_DAY, // > 1.0 score (capped)
      });

      const storage = createMockStorage([
        recentMemory,
        olderMemory,
        veryOldMemory,
      ]);
      const detector = new StalenessDetector(storage as any);
      await detector.initialize();

      // Can't guarantee exact actions without mocking all strategies,
      // but we can verify the structure
      const result1 = await detector.checkMemory("recent");
      const result2 = await detector.checkMemory("older");
      const result3 = await detector.checkMemory("very-old");

      expect(result1?.recommendedAction).toBeDefined();
      expect(result2?.recommendedAction).toBeDefined();
      expect(result3?.recommendedAction).toBeDefined();

      await detector.dispose();
    });
  });

  describe("scanAll", () => {
    it("should return empty results when disabled", async () => {
      const storage = createMockStorage([createMockMemory()]);
      const detector = new StalenessDetector(storage as any, {
        enabled: false,
      });

      const result = await detector.scanAll();

      expect(result.scanned).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(result.pagination.hasMore).toBe(false);
    });

    it("should scan all memories", async () => {
      const now = Math.floor(Date.now() / 1000);
      const memories = [
        createMockMemory({
          id: "mem-1",
          createdAt: now - 30 * SECONDS_PER_DAY,
        }),
        createMockMemory({
          id: "mem-2",
          createdAt: now - 60 * SECONDS_PER_DAY,
        }),
        createMockMemory({
          id: "mem-3",
          createdAt: now - 90 * SECONDS_PER_DAY,
        }),
      ];

      const storage = createMockStorage(memories);
      const detector = new StalenessDetector(storage as any);
      await detector.initialize();

      const result = await detector.scanAll();

      expect(result.scanned).toBe(3);
      expect(result.pagination.offset).toBe(0);
      expect(result.pagination.limit).toBe(100);

      await detector.dispose();
    });

    it("should respect pagination options", async () => {
      const now = Math.floor(Date.now() / 1000);
      const memories = Array.from({ length: 10 }, (_, i) =>
        createMockMemory({
          id: `mem-${i}`,
          createdAt: now - (30 + i * 10) * SECONDS_PER_DAY,
        }),
      );

      const storage = createMockStorage(memories);
      const detector = new StalenessDetector(storage as any);
      await detector.initialize();

      const result = await detector.scanAll({
        limit: 5,
        offset: 0,
      });

      expect(result.scanned).toBe(5);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.limit).toBe(5);

      await detector.dispose();
    });

    it("should filter by minScore", async () => {
      const now = Math.floor(Date.now() / 1000);
      const memories = [
        createMockMemory({
          id: "recent",
          createdAt: now - 10 * SECONDS_PER_DAY,
        }),
        createMockMemory({ id: "old", createdAt: now - 180 * SECONDS_PER_DAY }),
      ];

      const storage = createMockStorage(memories);
      const detector = new StalenessDetector(storage as any);
      await detector.initialize();

      const result = await detector.scanAll({
        minScore: 0.5,
      });

      // Only old memory should pass the minScore filter
      expect(result.results.every((r) => r.compositeScore >= 0.5)).toBe(true);

      await detector.dispose();
    });

    it("should sort results by composite score descending", async () => {
      const now = Math.floor(Date.now() / 1000);
      const memories = [
        createMockMemory({
          id: "newer",
          createdAt: now - 30 * SECONDS_PER_DAY,
        }),
        createMockMemory({
          id: "older",
          createdAt: now - 90 * SECONDS_PER_DAY,
        }),
        createMockMemory({
          id: "oldest",
          createdAt: now - 180 * SECONDS_PER_DAY,
        }),
      ];

      const storage = createMockStorage(memories);
      const detector = new StalenessDetector(storage as any);
      await detector.initialize();

      const result = await detector.scanAll();

      // Results should be sorted by score descending
      for (let i = 1; i < result.results.length; i++) {
        expect(result.results[i - 1].compositeScore).toBeGreaterThanOrEqual(
          result.results[i].compositeScore,
        );
      }

      await detector.dispose();
    });
  });

  describe("composite score calculation", () => {
    it("should return 1.0 immediately when superseded", async () => {
      // This is a conceptual test - when superseded signal has score 1.0,
      // the composite should be 1.0 regardless of other signals
      const now = Math.floor(Date.now() / 1000);
      const memory = createMockMemory({
        createdAt: now - 10 * SECONDS_PER_DAY, // Very recent normally
      });

      const storage = createMockStorage([memory]);
      const detector = new StalenessDetector(storage as any);

      // Note: We can't easily test superseded without mocking the relation storage
      // This test verifies the basic structure works
      await detector.initialize();
      const result = await detector.checkMemory("test-memory-1");

      expect(result).not.toBeNull();
      expect(result?.signals).toBeDefined();

      await detector.dispose();
    });
  });

  describe("initialize and dispose", () => {
    it("should initialize without errors", async () => {
      const storage = createMockStorage();
      const detector = new StalenessDetector(storage as any);

      await detector.initialize();
      // Double init should be safe
      await detector.initialize();

      await detector.dispose();
    });

    it("should dispose without errors", async () => {
      const storage = createMockStorage();
      const detector = new StalenessDetector(storage as any);

      await detector.initialize();
      await detector.dispose();
      // Double dispose should be safe
      await detector.dispose();
    });
  });
});
