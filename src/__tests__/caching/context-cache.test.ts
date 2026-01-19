import { beforeEach, describe, expect, it } from "bun:test";
import { ContextCache, resetContextCache } from "../../caching/context-cache";

describe("ContextCache", () => {
  beforeEach(() => {
    resetContextCache();
  });

  describe("basic operations", () => {
    it("should store and retrieve values", () => {
      const cache = new ContextCache<string>();
      cache.set("key1", "value1", []);
      expect(cache.get("key1")).toBe("value1");
    });

    it("should return null for missing keys", () => {
      const cache = new ContextCache<string>();
      expect(cache.get("nonexistent")).toBeNull();
    });

    it("should track memory IDs with entries", () => {
      const cache = new ContextCache<string>();
      cache.set("key1", "value1", ["mem1", "mem2"]);
      const trackedIds = cache.getTrackedMemoryIds();
      expect(trackedIds.has("mem1")).toBe(true);
      expect(trackedIds.has("mem2")).toBe(true);
    });

    it("should check if key exists", () => {
      const cache = new ContextCache<string>();
      cache.set("key1", "value1", []);
      expect(cache.has("key1")).toBe(true);
      expect(cache.has("key2")).toBe(false);
    });
  });

  describe("LRU eviction", () => {
    it("should evict oldest entry when full", () => {
      const cache = new ContextCache<string>({ maxEntries: 3 });
      cache.set("key1", "value1", []);
      cache.set("key2", "value2", []);
      cache.set("key3", "value3", []);
      cache.set("key4", "value4", []); // Should evict key1

      expect(cache.get("key1")).toBeNull();
      expect(cache.get("key2")).toBe("value2");
      expect(cache.get("key4")).toBe("value4");
    });

    it("should update LRU order on access", () => {
      const cache = new ContextCache<string>({ maxEntries: 3 });
      cache.set("key1", "value1", []);
      cache.set("key2", "value2", []);
      cache.set("key3", "value3", []);

      // Access key1 to make it most recently used
      cache.get("key1");

      // Add new entry - should evict key2 (oldest unused)
      cache.set("key4", "value4", []);

      expect(cache.get("key1")).toBe("value1"); // Still present
      expect(cache.get("key2")).toBeNull(); // Evicted
      expect(cache.get("key3")).toBe("value3");
      expect(cache.get("key4")).toBe("value4");
    });
  });

  describe("TTL expiration", () => {
    it("should expire entries after TTL", async () => {
      const cache = new ContextCache<string>({ ttlMs: 50 });
      cache.set("key1", "value1", []);

      expect(cache.get("key1")).toBe("value1");

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(cache.get("key1")).toBeNull();
    });

    it("should invalidate all expired entries", async () => {
      const cache = new ContextCache<string>({ ttlMs: 50 });
      cache.set("key1", "value1", []);
      cache.set("key2", "value2", []);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      const expired = cache.invalidateExpired();
      expect(expired).toBe(2);
      expect(cache.getStats().currentEntries).toBe(0);
    });
  });

  describe("targeted invalidation", () => {
    it("should invalidate entries by memory ID", () => {
      const cache = new ContextCache<string>();
      cache.set("key1", "value1", ["mem1", "mem2"]);
      cache.set("key2", "value2", ["mem2", "mem3"]);
      cache.set("key3", "value3", ["mem3"]);
      cache.set("key4", "value4", ["mem4"]);
      cache.set("key5", "value5", ["mem5"]);

      // mem2 affects 2 out of 5 entries (40%), so targeted invalidation
      const invalidated = cache.invalidateByMemoryId("mem2");

      expect(invalidated).toBe(2);
      expect(cache.get("key1")).toBeNull();
      expect(cache.get("key2")).toBeNull();
      expect(cache.get("key3")).toBe("value3");
      expect(cache.get("key4")).toBe("value4");
    });

    it("should clear all if >50% entries affected", () => {
      const cache = new ContextCache<string>();
      cache.set("key1", "value1", ["mem1"]);
      cache.set("key2", "value2", ["mem1"]);
      cache.set("key3", "value3", ["mem1"]);

      // All entries have mem1, which is >50%
      const invalidated = cache.invalidateByMemoryId("mem1");

      expect(invalidated).toBe(3);
      expect(cache.getStats().currentEntries).toBe(0);
    });
  });

  describe("statistics", () => {
    it("should track hits and misses", () => {
      const cache = new ContextCache<string>();
      cache.set("key1", "value1", []);

      cache.get("key1"); // Hit
      cache.get("key1"); // Hit
      cache.get("nonexistent"); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.667, 2);
    });

    it("should track evictions", () => {
      const cache = new ContextCache<string>({ maxEntries: 2 });
      cache.set("key1", "value1", []);
      cache.set("key2", "value2", []);
      cache.set("key3", "value3", []); // Evicts key1

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });

    it("should track invalidations", () => {
      const cache = new ContextCache<string>();
      cache.set("key1", "value1", ["mem1"]);
      cache.set("key2", "value2", ["mem1"]);

      cache.invalidateByMemoryId("mem1");

      const stats = cache.getStats();
      expect(stats.invalidations).toBe(2);
    });

    it("should reset statistics", () => {
      const cache = new ContextCache<string>();
      cache.set("key1", "value1", []);
      cache.get("key1");
      cache.get("miss");

      cache.resetStats();
      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.currentEntries).toBe(1); // Current entries not reset
    });
  });

  describe("disabled cache", () => {
    it("should return null when disabled", () => {
      const cache = new ContextCache<string>({ enabled: false });
      cache.set("key1", "value1", []);
      expect(cache.get("key1")).toBeNull();
    });

    it("should not store when disabled", () => {
      const cache = new ContextCache<string>({ enabled: false });
      cache.set("key1", "value1", []);
      expect(cache.getStats().currentEntries).toBe(0);
    });
  });

  describe("clear", () => {
    it("should remove all entries", () => {
      const cache = new ContextCache<string>();
      cache.set("key1", "value1", []);
      cache.set("key2", "value2", []);

      cache.clear();

      expect(cache.get("key1")).toBeNull();
      expect(cache.get("key2")).toBeNull();
      expect(cache.getStats().currentEntries).toBe(0);
    });
  });

  describe("config updates", () => {
    it("should update configuration", () => {
      const cache = new ContextCache<string>({ maxEntries: 10 });
      cache.updateConfig({ maxEntries: 5 });
      expect(cache.getConfig().maxEntries).toBe(5);
    });

    it("should evict excess entries when maxEntries reduced", () => {
      const cache = new ContextCache<string>({ maxEntries: 5 });
      cache.set("key1", "value1", []);
      cache.set("key2", "value2", []);
      cache.set("key3", "value3", []);

      cache.updateConfig({ maxEntries: 2 });

      expect(cache.getStats().currentEntries).toBe(2);
    });
  });
});
