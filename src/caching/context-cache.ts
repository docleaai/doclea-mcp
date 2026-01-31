/**
 * Context Cache using lru-cache library
 * Adds memory ID tracking for targeted invalidation on top of LRU
 */

import { LRUCache } from "lru-cache";
import type { CacheStats, ContextCacheConfig } from "./types";
import { DEFAULT_CACHE_CONFIG } from "./types";

interface CacheValue<T> {
  value: T;
  memoryIds: string[];
}

/**
 * LRU Cache with TTL support and memory ID-based invalidation
 */
export class ContextCache<T> {
  private cache: LRUCache<string, CacheValue<T>>;
  private config: ContextCacheConfig;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
    invalidations: number;
  };

  constructor(config: Partial<ContextCacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this.stats = { hits: 0, misses: 0, evictions: 0, invalidations: 0 };

    this.cache = new LRUCache<string, CacheValue<T>>({
      max: this.config.maxEntries,
      ttl: this.config.ttlMs,
      updateAgeOnGet: true,
      dispose: () => {
        this.stats.evictions++;
      },
    });
  }

  get(key: string): T | null {
    if (!this.config.enabled) {
      this.stats.misses++;
      return null;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value;
  }

  set(key: string, value: T, memoryIds: string[] = []): void {
    if (!this.config.enabled) return;
    this.cache.set(key, { value, memoryIds });
  }

  /**
   * Invalidate cache entries containing a specific memory ID
   */
  invalidateByMemoryId(memoryId: string): number {
    if (!this.config.enabled) return 0;

    let invalidated = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.memoryIds.includes(memoryId)) {
        keysToDelete.push(key);
      }
    }

    // If >50% would be invalidated, clear all
    if (keysToDelete.length > this.cache.size * 0.5) {
      invalidated = this.cache.size;
      this.cache.clear();
      this.stats.invalidations += invalidated;
      return invalidated;
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      invalidated++;
    }

    this.stats.invalidations += invalidated;
    return invalidated;
  }

  invalidateExpired(): number {
    if (!this.config.enabled) return 0;
    const sizeBefore = this.cache.size;
    this.cache.purgeStale();
    return sizeBefore - this.cache.size;
  }

  clear(): void {
    const count = this.cache.size;
    this.cache.clear();
    this.stats.evictions += count;
  }

  has(key: string): boolean {
    if (!this.config.enabled) return false;
    return this.cache.has(key);
  }

  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      currentEntries: this.cache.size,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
    };
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0, evictions: 0, invalidations: 0 };
  }

  getConfig(): ContextCacheConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<ContextCacheConfig>): void {
    const oldConfig = this.config;
    this.config = { ...this.config, ...config };

    // If max or ttl changed, recreate cache (lru-cache doesn't allow resize)
    if (
      this.config.maxEntries !== oldConfig.maxEntries ||
      this.config.ttlMs !== oldConfig.ttlMs
    ) {
      const oldEntries = [...this.cache.entries()];
      this.cache = new LRUCache<string, CacheValue<T>>({
        max: this.config.maxEntries,
        ttl: this.config.ttlMs,
        updateAgeOnGet: true,
        dispose: () => {
          this.stats.evictions++;
        },
      });
      // Re-add entries (will auto-evict if over new max)
      for (const [key, value] of oldEntries) {
        this.cache.set(key, value);
      }
    }
  }

  getTrackedMemoryIds(): Set<string> {
    const memoryIds = new Set<string>();
    for (const entry of this.cache.values()) {
      for (const id of entry.memoryIds) {
        memoryIds.add(id);
      }
    }
    return memoryIds;
  }
}

// Singleton
let defaultContextCache: ContextCache<unknown> | null = null;

export function getContextCache<T>(
  config?: Partial<ContextCacheConfig>,
): ContextCache<T> {
  if (!defaultContextCache) {
    defaultContextCache = new ContextCache<unknown>(config);
  } else if (config) {
    defaultContextCache.updateConfig(config);
  }
  return defaultContextCache as ContextCache<T>;
}

export function resetContextCache(): void {
  defaultContextCache = null;
}
