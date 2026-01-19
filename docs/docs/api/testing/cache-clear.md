---
sidebar_position: 3
title: doclea_cache_clear
description: Clear the context cache.
keywords: [doclea_cache_clear, cache, clear, reset]
---

# doclea_cache_clear

Clear the context cache and optionally reset statistics counters.

**Category:** Cache & A/B Testing
**Status:** Stable

---

## Quick Example

```
"Clear the context cache"
```

**Response:**

```json
{
  "success": true,
  "entriesCleared": 45,
  "statsReset": false
}
```

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resetStats` | `boolean` | No | `false` | Also reset statistics counters |

---

## Usage Examples

### Clear Cache Only

```
"Clear cached contexts"
```

```json
{}
```

Entries are cleared but stats (hits, misses, etc.) are preserved.

### Clear Cache and Reset Stats

```
"Clear cache and reset statistics"
```

```json
{
  "resetStats": true
}
```

Both entries and statistics are reset to zero.

---

## Response Schema

```typescript
interface CacheClearResult {
  success: boolean;
  entriesCleared: number;
  statsReset: boolean;
}
```

---

## When to Clear Cache

### After Memory Changes

When you bulk update, delete, or modify memories, cached contexts may be stale:

```json
// After bulk operations
{}
```

**Note:** Targeted invalidation handles individual memory changes automatically.

### After Configuration Changes

When scoring configuration changes:

```json
{
  "resetStats": true
}
```

Old cached results were generated with old config.

### Debugging

When troubleshooting unexpected results:

```json
{
  "resetStats": true
}
```

Forces fresh context generation.

### Performance Testing

Before benchmarking:

```json
{
  "resetStats": true
}
```

Ensures clean baseline for measurements.

---

## Cache Behavior After Clear

| State | Before | After |
|-------|--------|-------|
| Entries | N | 0 |
| Hits | X | X (or 0 if reset) |
| Misses | Y | Y (or 0 if reset) |
| Hit Rate | Z% | Z% (or 0% if reset) |

Next `doclea_context` call will:
1. Cache miss (no entries)
2. Build context fresh
3. Store result in cache
4. Return to caller

---

## Automatic Invalidation

Cache entries are automatically invalidated when:

1. **Memory Updated** - Entry referencing that memory cleared
2. **Memory Deleted** - Entry referencing that memory cleared
3. **TTL Expired** - Entry removed on next access
4. **LRU Eviction** - Oldest entries removed when full

Manual clear is usually only needed for:
- Configuration changes
- Bulk operations
- Debugging

---

## See Also

- [doclea_cache_stats](./cache-stats) - View cache statistics
- [Cache & A/B Testing Overview](./overview)
