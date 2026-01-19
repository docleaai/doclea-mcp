---
sidebar_position: 11
title: doclea_refresh_confidence
description: Refresh a memory's confidence decay anchor.
keywords: [doclea_refresh_confidence, refresh, confidence, decay, staleness]
---

# doclea_refresh_confidence

Refresh a memory's confidence decay anchor. Resets decay to start from now, restoring confidence to its importance value. Use when a memory is still relevant but has decayed over time.

**Category:** Workflow
**Status:** Stable

---

## Quick Example

```
"Refresh the auth decision memory"
```

**Response:**

```json
{
  "success": true,
  "memoryId": "mem_abc123",
  "previousConfidence": 0.45,
  "newConfidence": 0.85,
  "importance": 0.85,
  "message": "Confidence refreshed from 0.45 to 0.85"
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `memoryId` | `string` | Yes | ID of the memory to refresh |
| `newImportance` | `number` | No | Optionally update importance (0-1) |

---

## Usage Examples

### Basic Refresh

```
"Refresh confidence for memory mem_abc123"
```

```json
{
  "memoryId": "mem_abc123"
}
```

Resets decay anchor to now, confidence returns to current importance.

### Refresh with New Importance

```
"Refresh and boost importance to 0.9"
```

```json
{
  "memoryId": "mem_abc123",
  "newImportance": 0.9
}
```

Updates importance and resets decay from that value.

---

## Response Schema

```typescript
interface RefreshConfidenceResult {
  success: boolean;
  memoryId: string;
  previousConfidence: number;  // Before refresh
  newConfidence: number;       // After refresh (equals importance)
  importance: number;          // Current importance value
  message: string;
  error?: string;
}
```

### Success

```json
{
  "success": true,
  "memoryId": "mem_abc123",
  "previousConfidence": 0.45,
  "newConfidence": 0.85,
  "importance": 0.85,
  "message": "Confidence refreshed from 0.45 to 0.85"
}
```

### Memory Not Found

```json
{
  "success": false,
  "memoryId": "mem_unknown",
  "error": "Memory not found",
  "message": "Failed to refresh: Memory not found"
}
```

---

## Understanding Confidence Decay

Memories decay over time based on:

```
confidence = importance × decay_factor
decay_factor = exp(-λ × days_since_refresh)
```

| Days Since Refresh | Decay Factor | Confidence (importance=0.9) |
|--------------------|--------------|----------------------------|
| 0 | 1.0 | 0.90 |
| 30 | 0.92 | 0.83 |
| 90 | 0.78 | 0.70 |
| 180 | 0.61 | 0.55 |
| 365 | 0.37 | 0.33 |

**Refreshing** resets the "days since refresh" to 0.

---

## When to Refresh

| Scenario | Action |
|----------|--------|
| Memory accessed and still accurate | Refresh |
| Memory reviewed during staleness scan | Refresh |
| Memory updated with new content | Automatic refresh |
| Memory no longer relevant | Delete instead |
| Memory partially outdated | Update then refresh |

---

## Workflow: Staleness Review

```typescript
// 1. Scan for stale memories
const stale = await doclea_staleness({
  action: "scan",
  minScore: 0.5
});

// 2. Review each stale memory
for (const memory of stale.memories) {
  // Check if still relevant
  const isRelevant = await reviewMemory(memory);

  if (isRelevant) {
    // Refresh to reset decay
    await doclea_refresh_confidence({
      memoryId: memory.id
    });
  } else {
    // Mark for deletion or update
    await doclea_delete({ memoryId: memory.id });
  }
}
```

---

## Difference from Update

| `doclea_update` | `doclea_refresh_confidence` |
|-----------------|----------------------------|
| Changes content, tags, etc. | Only resets decay anchor |
| Triggers re-embedding | No embedding change |
| Full memory modification | Lightweight operation |
| Auto-refreshes decay | Manual decay reset only |

Use `refresh_confidence` when the memory content is still accurate but has decayed due to time.

---

## See Also

- [doclea_staleness](../staleness/overview) - Detect stale memories
- [doclea_update](../memory/update) - Update memory content
- [Confidence Decay Architecture](../../architecture/confidence-decay) - How decay works
