/**
 * Context caching module exports
 *
 * Provides LRU caching for buildContext() results with
 * TTL expiration and targeted invalidation.
 */

// Cache key generation
export {
  buildCacheKeyComponents,
  generateCacheKey,
  hashScoringConfig,
} from "./cache-key";
// Cache implementation
export {
  ContextCache,
  getContextCache,
  resetContextCache,
} from "./context-cache";

// Types and schemas
export type {
  CacheEntry,
  CacheKeyComponents,
  CacheStats,
  ContextCacheConfig,
} from "./types";
export { ContextCacheConfigSchema, DEFAULT_CACHE_CONFIG } from "./types";
