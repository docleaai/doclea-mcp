---
sidebar_position: 2
title: doclea_cache_stats
description: Get context cache statistics.
keywords: [doclea_cache_stats, cache, statistics, performance]
---

# doclea_cache_stats

Get context cache statistics including hit rate, misses, evictions, and current entry count.

**Category:** Cache & A/B Testing
**Status:** Stable

---

## Quick Example

```
"Show cache stats"
```

**Response:**

```json
{
  "enabled": true,
  "config": {
    "maxEntries": 100,
    "ttlMs": 300000
  },
  "stats": {
    "hits": 45,
    "misses": 12,
    "hitRate": "78.9%",
    "currentEntries": 23,
    "evictions": 5,
    "invalidations": 2
  }
}
```

---

## Parameters

This tool takes no parameters.

```json
{}
```

---

## Response Schema

```typescript
interface CacheStatsResult {
  enabled: boolean;
  config: {
    maxEntries: number;
    ttlMs: number;
  };
  stats: {
    hits: number;
    misses: number;
    hitRate: string;        // Formatted percentage
    currentEntries: number;
    evictions: number;
    invalidations: number;
  };
}
```

---

## Understanding the Stats

### hits

Number of cache lookups that found a valid entry.

### misses

Number of cache lookups that didn't find an entry (or found expired).

### hitRate

`hits / (hits + misses)` as a percentage.

| Hit Rate | Interpretation |
|----------|----------------|
| > 80% | Excellent - cache is very effective |
| 50-80% | Good - cache is helping |
| 20-50% | Fair - may need larger cache |
| < 20% | Poor - queries too diverse or TTL too short |

### currentEntries

Number of entries currently in cache (up to maxEntries).

### evictions

Total entries removed due to:
- LRU eviction (cache full)
- TTL expiration

### invalidations

Entries removed via targeted invalidation when memories change.

---

## Config Values

### maxEntries

Maximum LRU cache size. When full, least-recently-used entries are evicted.

**Default:** 100

### ttlMs

Time-to-live in milliseconds. Entries older than this are considered stale.

**Default:** 300,000 (5 minutes)

---

## Use Cases

### Monitor Cache Health

```
"Check cache performance"
```

Look for:
- High hit rate (> 50%)
- Reasonable entry count
- Low eviction rate relative to size

### Debug Slow Responses

If responses are slow despite caching:
- Check if `enabled: true`
- Check hit rate - low rate means cache isn't helping
- Consider increasing `maxEntries` or `ttlMs`

### Optimize Configuration

If hit rate is low:
```
Cache too small → Increase maxEntries
TTL too short → Increase ttlMs
Queries too diverse → Expected behavior
```

---

## Example Output Interpretation

```json
{
  "stats": {
    "hits": 145,
    "misses": 55,
    "hitRate": "72.5%",
    "currentEntries": 100,  // At max
    "evictions": 82,        // High eviction
    "invalidations": 3
  }
}
```

**Analysis:**
- 72.5% hit rate is good
- Cache at max capacity (100 entries)
- High evictions suggest cache is too small
- **Recommendation:** Increase `maxEntries` to 200

---

## See Also

- [doclea_cache_clear](./cache-clear) - Clear the cache
- [Cache & A/B Testing Overview](./overview)
