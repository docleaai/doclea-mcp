/**
 * Tests for CachedEmbeddingClient helper logic
 * Tests caching patterns, key generation, and cache invalidation
 */

import { describe, expect, test } from "bun:test";

describe("CachedEmbeddingClient", () => {
  describe("cache key generation", () => {
    function generateCacheKey(text: string): string {
      // Simple hash simulation for cache key
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return `emb_${Math.abs(hash).toString(16)}`;
    }

    test("generates consistent key for same text", () => {
      const key1 = generateCacheKey("Hello world");
      const key2 = generateCacheKey("Hello world");
      expect(key1).toBe(key2);
    });

    test("generates different keys for different text", () => {
      const key1 = generateCacheKey("Hello");
      const key2 = generateCacheKey("World");
      expect(key1).not.toBe(key2);
    });

    test("key has correct prefix", () => {
      const key = generateCacheKey("test");
      expect(key.startsWith("emb_")).toBe(true);
    });

    test("handles empty string", () => {
      const key = generateCacheKey("");
      expect(key).toBe("emb_0");
    });

    test("handles unicode", () => {
      const key = generateCacheKey("こんにちは");
      expect(key.startsWith("emb_")).toBe(true);
    });

    test("handles very long text", () => {
      const longText = "a".repeat(10000);
      const key = generateCacheKey(longText);
      expect(key.startsWith("emb_")).toBe(true);
    });
  });

  describe("cache hit detection", () => {
    function isCacheHit(cached: unknown): cached is number[] {
      return (
        cached !== null &&
        cached !== undefined &&
        Array.isArray(cached) &&
        cached.length > 0 &&
        cached.every((n) => typeof n === "number")
      );
    }

    test("detects valid cache hit", () => {
      expect(isCacheHit([0.1, 0.2, 0.3])).toBe(true);
    });

    test("rejects null", () => {
      expect(isCacheHit(null)).toBe(false);
    });

    test("rejects undefined", () => {
      expect(isCacheHit(undefined)).toBe(false);
    });

    test("rejects empty array", () => {
      expect(isCacheHit([])).toBe(false);
    });

    test("rejects non-array", () => {
      expect(isCacheHit("not an array")).toBe(false);
    });

    test("rejects array with non-numbers", () => {
      expect(isCacheHit([0.1, "str", 0.3])).toBe(false);
    });
  });

  describe("batch cache lookup", () => {
    interface CacheLookupResult {
      hits: Map<number, number[]>;
      misses: number[];
    }

    function lookupBatch(
      texts: string[],
      cache: Map<string, number[]>,
      keyFn: (t: string) => string,
    ): CacheLookupResult {
      const hits = new Map<number, number[]>();
      const misses: number[] = [];

      texts.forEach((text, index) => {
        const key = keyFn(text);
        const cached = cache.get(key);
        if (cached) {
          hits.set(index, cached);
        } else {
          misses.push(index);
        }
      });

      return { hits, misses };
    }

    const simpleKey = (t: string) => `key_${t}`;

    test("identifies all hits when fully cached", () => {
      const cache = new Map([
        ["key_a", [0.1]],
        ["key_b", [0.2]],
      ]);
      const result = lookupBatch(["a", "b"], cache, simpleKey);
      expect(result.hits.size).toBe(2);
      expect(result.misses.length).toBe(0);
    });

    test("identifies all misses when nothing cached", () => {
      const cache = new Map<string, number[]>();
      const result = lookupBatch(["a", "b"], cache, simpleKey);
      expect(result.hits.size).toBe(0);
      expect(result.misses).toEqual([0, 1]);
    });

    test("identifies partial hits", () => {
      const cache = new Map([["key_a", [0.1]]]);
      const result = lookupBatch(["a", "b", "c"], cache, simpleKey);
      expect(result.hits.size).toBe(1);
      expect(result.hits.get(0)).toEqual([0.1]);
      expect(result.misses).toEqual([1, 2]);
    });

    test("preserves original indices", () => {
      const cache = new Map([["key_b", [0.2]]]);
      const result = lookupBatch(["a", "b", "c"], cache, simpleKey);
      expect(result.hits.get(1)).toEqual([0.2]);
      expect(result.misses).toEqual([0, 2]);
    });

    test("handles empty input", () => {
      const cache = new Map<string, number[]>();
      const result = lookupBatch([], cache, simpleKey);
      expect(result.hits.size).toBe(0);
      expect(result.misses.length).toBe(0);
    });
  });

  describe("batch result merging", () => {
    function mergeBatchResults(
      hits: Map<number, number[]>,
      newResults: number[][],
      missIndices: number[],
      totalCount: number,
    ): number[][] {
      const merged: number[][] = new Array(totalCount);

      // Place cache hits
      hits.forEach((embedding, index) => {
        merged[index] = embedding;
      });

      // Place new results
      missIndices.forEach((originalIndex, newIndex) => {
        merged[originalIndex] = newResults[newIndex];
      });

      return merged;
    }

    test("merges all from cache", () => {
      const hits = new Map([
        [0, [0.1]],
        [1, [0.2]],
      ]);
      const result = mergeBatchResults(hits, [], [], 2);
      expect(result).toEqual([[0.1], [0.2]]);
    });

    test("merges all new results", () => {
      const hits = new Map<number, number[]>();
      const newResults = [[0.1], [0.2]];
      const result = mergeBatchResults(hits, newResults, [0, 1], 2);
      expect(result).toEqual([[0.1], [0.2]]);
    });

    test("merges mixed results", () => {
      const hits = new Map([[0, [0.1]]]);
      const newResults = [[0.2], [0.3]];
      const result = mergeBatchResults(hits, newResults, [1, 2], 3);
      expect(result).toEqual([[0.1], [0.2], [0.3]]);
    });

    test("handles non-contiguous cache hits", () => {
      const hits = new Map([
        [0, [0.1]],
        [2, [0.3]],
      ]);
      const newResults = [[0.2]];
      const result = mergeBatchResults(hits, newResults, [1], 3);
      expect(result).toEqual([[0.1], [0.2], [0.3]]);
    });
  });

  describe("cache storage", () => {
    function storeInCache(
      cache: Map<string, number[]>,
      texts: string[],
      embeddings: number[][],
      keyFn: (t: string) => string,
    ): number {
      let stored = 0;
      texts.forEach((text, i) => {
        const key = keyFn(text);
        if (!cache.has(key)) {
          cache.set(key, embeddings[i]);
          stored++;
        }
      });
      return stored;
    }

    const simpleKey = (t: string) => `key_${t}`;

    test("stores new entries", () => {
      const cache = new Map<string, number[]>();
      const stored = storeInCache(cache, ["a", "b"], [[0.1], [0.2]], simpleKey);
      expect(stored).toBe(2);
      expect(cache.size).toBe(2);
    });

    test("skips existing entries", () => {
      const cache = new Map([["key_a", [0.9]]]);
      const stored = storeInCache(cache, ["a", "b"], [[0.1], [0.2]], simpleKey);
      expect(stored).toBe(1);
      expect(cache.get("key_a")).toEqual([0.9]); // Original preserved
    });

    test("handles empty input", () => {
      const cache = new Map<string, number[]>();
      const stored = storeInCache(cache, [], [], simpleKey);
      expect(stored).toBe(0);
    });
  });

  describe("cache size management", () => {
    function shouldEvict(currentSize: number, maxSize: number): boolean {
      return currentSize >= maxSize;
    }

    function getEvictionCount(
      currentSize: number,
      maxSize: number,
      newEntries: number,
    ): number {
      const afterAdd = currentSize + newEntries;
      if (afterAdd <= maxSize) return 0;
      return afterAdd - maxSize;
    }

    test("should not evict when under limit", () => {
      expect(shouldEvict(50, 100)).toBe(false);
    });

    test("should evict when at limit", () => {
      expect(shouldEvict(100, 100)).toBe(true);
    });

    test("should evict when over limit", () => {
      expect(shouldEvict(150, 100)).toBe(true);
    });

    test("calculates zero evictions when under limit", () => {
      expect(getEvictionCount(50, 100, 10)).toBe(0);
    });

    test("calculates evictions when at limit", () => {
      expect(getEvictionCount(100, 100, 10)).toBe(10);
    });

    test("calculates evictions when would exceed", () => {
      expect(getEvictionCount(90, 100, 20)).toBe(10);
    });
  });

  describe("LRU eviction", () => {
    interface LRUEntry {
      key: string;
      lastAccess: number;
    }

    function getOldestEntries(entries: LRUEntry[], count: number): string[] {
      return [...entries]
        .sort((a, b) => a.lastAccess - b.lastAccess)
        .slice(0, count)
        .map((e) => e.key);
    }

    test("gets oldest single entry", () => {
      const entries: LRUEntry[] = [
        { key: "a", lastAccess: 100 },
        { key: "b", lastAccess: 200 },
        { key: "c", lastAccess: 50 },
      ];
      expect(getOldestEntries(entries, 1)).toEqual(["c"]);
    });

    test("gets multiple oldest entries", () => {
      const entries: LRUEntry[] = [
        { key: "a", lastAccess: 100 },
        { key: "b", lastAccess: 200 },
        { key: "c", lastAccess: 50 },
      ];
      expect(getOldestEntries(entries, 2)).toEqual(["c", "a"]);
    });

    test("handles request for more than available", () => {
      const entries: LRUEntry[] = [{ key: "a", lastAccess: 100 }];
      expect(getOldestEntries(entries, 5)).toEqual(["a"]);
    });

    test("handles empty entries", () => {
      expect(getOldestEntries([], 5)).toEqual([]);
    });
  });

  describe("cache statistics", () => {
    interface CacheStats {
      hits: number;
      misses: number;
      size: number;
    }

    function calculateHitRate(stats: CacheStats): number {
      const total = stats.hits + stats.misses;
      if (total === 0) return 0;
      return stats.hits / total;
    }

    test("calculates 100% hit rate", () => {
      expect(calculateHitRate({ hits: 100, misses: 0, size: 50 })).toBe(1);
    });

    test("calculates 0% hit rate", () => {
      expect(calculateHitRate({ hits: 0, misses: 100, size: 50 })).toBe(0);
    });

    test("calculates 50% hit rate", () => {
      expect(calculateHitRate({ hits: 50, misses: 50, size: 50 })).toBe(0.5);
    });

    test("handles zero total requests", () => {
      expect(calculateHitRate({ hits: 0, misses: 0, size: 0 })).toBe(0);
    });
  });

  describe("text normalization for caching", () => {
    function normalizeForCache(text: string): string {
      return text.trim().toLowerCase().replace(/\s+/g, " ");
    }

    test("trims whitespace", () => {
      expect(normalizeForCache("  hello  ")).toBe("hello");
    });

    test("lowercases text", () => {
      expect(normalizeForCache("HELLO")).toBe("hello");
    });

    test("normalizes multiple spaces", () => {
      expect(normalizeForCache("hello    world")).toBe("hello world");
    });

    test("handles tabs and newlines", () => {
      expect(normalizeForCache("hello\t\nworld")).toBe("hello world");
    });

    test("handles empty string", () => {
      expect(normalizeForCache("")).toBe("");
    });

    test("handles all whitespace", () => {
      expect(normalizeForCache("   \t\n   ")).toBe("");
    });
  });

  describe("cache configuration", () => {
    interface CacheConfig {
      maxSize: number;
      ttlMs?: number;
      normalizeKeys: boolean;
    }

    function isValidConfig(config: unknown): config is CacheConfig {
      if (typeof config !== "object" || config === null) return false;

      const c = config as Record<string, unknown>;
      if (typeof c.maxSize !== "number" || c.maxSize <= 0) return false;
      if (
        c.ttlMs !== undefined &&
        (typeof c.ttlMs !== "number" || c.ttlMs <= 0)
      )
        return false;
      if (typeof c.normalizeKeys !== "boolean") return false;

      return true;
    }

    test("validates valid config", () => {
      expect(isValidConfig({ maxSize: 1000, normalizeKeys: true })).toBe(true);
    });

    test("validates config with TTL", () => {
      expect(
        isValidConfig({ maxSize: 1000, ttlMs: 60000, normalizeKeys: false }),
      ).toBe(true);
    });

    test("rejects zero maxSize", () => {
      expect(isValidConfig({ maxSize: 0, normalizeKeys: true })).toBe(false);
    });

    test("rejects negative maxSize", () => {
      expect(isValidConfig({ maxSize: -100, normalizeKeys: true })).toBe(false);
    });

    test("rejects zero TTL", () => {
      expect(
        isValidConfig({ maxSize: 100, ttlMs: 0, normalizeKeys: true }),
      ).toBe(false);
    });

    test("rejects missing normalizeKeys", () => {
      expect(isValidConfig({ maxSize: 100 })).toBe(false);
    });
  });

  describe("TTL expiration", () => {
    function isExpired(storedAt: number, now: number, ttlMs: number): boolean {
      return now - storedAt > ttlMs;
    }

    test("not expired when within TTL", () => {
      expect(isExpired(1000, 2000, 5000)).toBe(false);
    });

    test("expired when past TTL", () => {
      expect(isExpired(1000, 7000, 5000)).toBe(true);
    });

    test("not expired at exact TTL boundary", () => {
      expect(isExpired(1000, 6000, 5000)).toBe(false);
    });

    test("expired just past TTL", () => {
      expect(isExpired(1000, 6001, 5000)).toBe(true);
    });
  });

  describe("dimension validation", () => {
    function validateDimension(
      embedding: number[],
      expectedDim: number,
    ): boolean {
      return embedding.length === expectedDim;
    }

    function validateBatchDimensions(
      embeddings: number[][],
      expectedDim: number,
    ): boolean {
      return embeddings.every((e) => e.length === expectedDim);
    }

    test("validates correct single dimension", () => {
      expect(validateDimension([0.1, 0.2, 0.3], 3)).toBe(true);
    });

    test("rejects wrong dimension", () => {
      expect(validateDimension([0.1, 0.2], 3)).toBe(false);
    });

    test("validates correct batch dimensions", () => {
      const batch = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];
      expect(validateBatchDimensions(batch, 3)).toBe(true);
    });

    test("rejects batch with inconsistent dimensions", () => {
      const batch = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5],
      ];
      expect(validateBatchDimensions(batch, 3)).toBe(false);
    });

    test("handles empty batch", () => {
      expect(validateBatchDimensions([], 3)).toBe(true);
    });
  });
});
