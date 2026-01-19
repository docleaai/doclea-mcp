/**
 * LRU Context Cache implementation
 *
 * Provides caching for buildContext() results with:
 * - LRU eviction based on entry count
 * - TTL-based expiration
 * - Targeted invalidation by memory ID
 */

import type { CacheEntry, CacheStats, ContextCacheConfig } from "./types";
import { DEFAULT_CACHE_CONFIG } from "./types";

/**
 * LRU Cache with TTL support and targeted invalidation.
 * Uses a Map for O(1) lookups and maintains insertion order for LRU.
 */
export class ContextCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private config: ContextCacheConfig;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
    invalidations: number;
  };

  constructor(config: Partial<ContextCacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      invalidations: 0,
    };
  }

  /**
   * Get an entry from the cache.
   * Returns null if entry doesn't exist or has expired.
   * Updates last accessed time on hit.
   */
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

    // Check TTL expiration
    const now = Date.now();
    if (now - entry.createdAt > this.config.ttlMs) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      return null;
    }

    // Update last accessed time and move to end of Map (most recently used)
    entry.lastAccessedAt = now;
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Store an entry in the cache.
   * Evicts LRU entries if cache is full.
   */
  set(key: string, value: T, memoryIds: string[] = []): void {
    if (!this.config.enabled) {
      return;
    }

    const now = Date.now();

    // If key already exists, delete it first (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict LRU entries if at capacity
    while (this.cache.size >= this.config.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
    }

    const entry: CacheEntry<T> = {
      key,
      value,
      memoryIds,
      createdAt: now,
      lastAccessedAt: now,
    };

    this.cache.set(key, entry);
  }

  /**
   * Invalidate cache entries that contain a specific memory ID.
   * Returns the number of entries invalidated.
   */
  invalidateByMemoryId(memoryId: string): number {
    if (!this.config.enabled) {
      return 0;
    }

    let invalidated = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      if (entry.memoryIds.includes(memoryId)) {
        keysToDelete.push(key);
      }
    }

    // Check if more than 50% would be invalidated - if so, clear all
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

  /**
   * Remove all expired entries from the cache.
   * Returns the number of entries removed.
   */
  invalidateExpired(): number {
    if (!this.config.enabled) {
      return 0;
    }

    const now = Date.now();
    let expired = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > this.config.ttlMs) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      expired++;
    }

    this.stats.evictions += expired;
    return expired;
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    const count = this.cache.size;
    this.cache.clear();
    this.stats.evictions += count;
  }

  /**
   * Check if a key exists in the cache (without updating access time).
   */
  has(key: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check TTL
    const now = Date.now();
    if (now - entry.createdAt > this.config.ttlMs) {
      this.cache.delete(key);
      this.stats.evictions++;
      return false;
    }

    return true;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      currentEntries: this.cache.size,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
    };
  }

  /**
   * Reset statistics counters.
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      invalidations: 0,
    };
  }

  /**
   * Get the current configuration.
   */
  getConfig(): ContextCacheConfig {
    return { ...this.config };
  }

  /**
   * Update the cache configuration.
   * If maxEntries is reduced, excess entries will be evicted.
   */
  updateConfig(config: Partial<ContextCacheConfig>): void {
    this.config = { ...this.config, ...config };

    // Evict excess entries if maxEntries was reduced
    while (this.cache.size > this.config.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
    }
  }

  /**
   * Get all memory IDs that are currently tracked in the cache.
   * Useful for understanding cache coverage.
   */
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

// Singleton instance for the default context cache
let defaultContextCache: ContextCache<unknown> | null = null;

/**
 * Get or create the default context cache instance.
 */
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

/**
 * Reset the default context cache instance.
 * Useful for testing.
 */
export function resetContextCache(): void {
  defaultContextCache = null;
}
