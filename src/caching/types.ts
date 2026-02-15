/**
 * Context caching types and Zod schemas
 *
 * Defines configuration for LRU caching of buildContext() results.
 */

import { z } from "zod";

// ============================================
// Cache Configuration
// ============================================

export const ContextCacheConfigSchema = z.object({
  /** Enable context caching */
  enabled: z.boolean().default(true),
  /** Maximum number of cached entries (LRU eviction) */
  maxEntries: z.number().int().positive().default(100),
  /** Time-to-live in milliseconds (default: 5 minutes) */
  ttlMs: z.number().int().positive().default(300_000),
});
export type ContextCacheConfig = z.infer<typeof ContextCacheConfigSchema>;

// ============================================
// Cache Entry
// ============================================

export interface CacheEntry<T> {
  /** Cache key (SHA-256 hash) */
  key: string;
  /** Cached value */
  value: T;
  /** Memory IDs that contributed to this result (for targeted invalidation) */
  memoryIds: string[];
  /** When the entry was created (Unix timestamp ms) */
  createdAt: number;
  /** When the entry was last accessed (Unix timestamp ms) */
  lastAccessedAt: number;
}

// ============================================
// Cache Statistics
// ============================================

export interface CacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Number of entries evicted (LRU or TTL) */
  evictions: number;
  /** Number of targeted invalidations */
  invalidations: number;
  /** Current number of entries in cache */
  currentEntries: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
}

// ============================================
// Cache Key Components
// ============================================

export interface CacheKeyComponents {
  /** The query string */
  query: string;
  /** Token budget for context assembly */
  tokenBudget: number;
  /** Whether code graph is included */
  includeCodeGraph: boolean;
  /** Whether GraphRAG retrieval is included */
  includeGraphRAG: boolean;
  /** Whether response includes section-level evidence */
  includeEvidence: boolean;
  /** Filters applied to search */
  filters?: {
    type?: string;
    tags?: string[];
    minImportance?: number;
  };
  /** Output template */
  template: string;
  /** Scoring config hash (if scoring is enabled) */
  scoringConfigHash?: string;
}

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_CACHE_CONFIG: ContextCacheConfig = {
  enabled: true,
  maxEntries: 100,
  ttlMs: 300_000, // 5 minutes
};
