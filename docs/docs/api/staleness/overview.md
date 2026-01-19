---
sidebar_position: 1
title: doclea_staleness
description: Detect stale memories that need review, refresh, or archiving using multiple detection strategies.
keywords: [doclea_staleness, staleness detection, memory refresh, time decay, git changes]
---

# doclea_staleness

Detect stale memories using multiple strategies and take action to keep your knowledge base fresh.

**Category:** Memory Maintenance
**Status:** Stable

---

## Quick Example

```
"Check if the authentication memory is stale"
```

**Response:**

```json
{
  "memoryId": "mem_a1b2c3d4",
  "compositeScore": 0.67,
  "recommendedAction": "refresh",
  "signals": [
    {
      "strategy": "time_decay",
      "score": 0.5,
      "reason": "Memory is 90 days old (50% toward 180-day threshold)"
    },
    {
      "strategy": "git_changes",
      "score": 0.8,
      "reason": "2 of 3 related files changed: src/auth/jwt.ts, src/middleware/auth.ts"
    }
  ]
}
```

---

## Overview

Memories become stale when:
- **Time passes** without access or refresh
- **Code changes** in related files
- **Related memories** are updated
- **Newer memories** supersede them

The `doclea_staleness` tool detects these conditions and recommends actions.

---

## Actions

The tool supports three actions:

| Action | Purpose | Required Parameters |
|--------|---------|---------------------|
| `check` | Check single memory | `memoryId` |
| `scan` | Scan multiple memories | (optional filters) |
| `refresh` | Reset decay anchor | `memoryId` |

---

## Parameters

### Common Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | `"check" \| "scan" \| "refresh"` | Action to perform |
| `memoryId` | `string` | Memory ID (required for `check`/`refresh`) |

### Scan-Specific Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | `string` | `null` | Filter by memory type |
| `limit` | `number` | `100` | Max memories to scan (1-500) |
| `offset` | `number` | `0` | Pagination offset |
| `minScore` | `number` | `0` | Minimum staleness score (0-1) |

### Refresh-Specific Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `newImportance` | `number` | Optionally update importance (0-1) |

---

## Detection Strategies

### 1. Time Decay (`time_decay`)

**Weight:** 0.5

Detects memories that haven't been accessed or refreshed recently.

| Age | Score | Recommendation |
|-----|-------|----------------|
| < 7 days | 0.0 | Fresh |
| 7-90 days | 0.04-0.5 | Monitor |
| 90-180 days | 0.5-1.0 | Review/Refresh |
| > 180 days | 1.0 | Refresh/Archive |

**Configuration:**
- Default threshold: 180 days
- Uses `lastRefreshedAt` > `accessedAt` > `createdAt` as anchor

### 2. Git Changes (`git_changes`)

**Weight:** 0.7

Detects when files related to a memory have changed in git.

| Changed Files | Score |
|---------------|-------|
| 1 file | 0.5 |
| 50% of files | 0.75 |
| All files | 1.0 |

**Configuration:**
- 5-minute cache for git operations
- Scans last 6 months of git history

### 3. Related Updates (`related_updates`)

**Weight:** 0.4

Detects when memories this one references have been updated more recently.

| Fresher Related | Score |
|-----------------|-------|
| 1 memory | 0.1-0.4 |
| 2-3 memories | 0.3-0.6 |
| 5+ memories | 0.6-1.0 |

**Configuration:**
- Max traversal depth: 2 hops
- Prevents circular traversal

### 4. Superseded (`superseded`)

**Weight:** 1.0

Detects when another memory explicitly supersedes this one.

| Condition | Score |
|-----------|-------|
| Has "supersedes" relation | 1.0 (immediate) |

**Note:** Being superseded immediately triggers maximum staleness.

---

## Composite Scoring

The final staleness score combines all strategies:

```
compositeScore = Σ(signal.score × signal.weight) / Σ(signal.weight)
```

**Special case:** If `superseded` signal has score 1.0, the composite is immediately 1.0.

### Action Thresholds

| Score Range | Recommended Action |
|-------------|-------------------|
| 0.0 - 0.29 | `none` |
| 0.3 - 0.59 | `review` |
| 0.6 - 0.89 | `refresh` |
| 0.9 - 1.0 | `archive` |

---

## Usage Examples

### Check Single Memory

```
"Check if memory mem_abc123 is stale"
```

Or directly:

```json
{
  "action": "check",
  "memoryId": "mem_abc123"
}
```

**Response:**

```json
{
  "action": "check",
  "result": {
    "memoryId": "mem_abc123",
    "compositeScore": 0.45,
    "recommendedAction": "review",
    "signals": [
      {
        "strategy": "time_decay",
        "score": 0.45,
        "weight": 0.5,
        "reason": "Memory is 81 days old (45% toward 180-day threshold)"
      }
    ],
    "checkedAt": 1705320000
  },
  "message": "Staleness check for mem_abc123: score 0.45 (review)"
}
```

### Scan All Memories

```
"Scan all memories for staleness"
```

Or with filters:

```json
{
  "action": "scan",
  "type": "decision",
  "minScore": 0.3,
  "limit": 50
}
```

**Response:**

```json
{
  "action": "scan",
  "result": {
    "scanned": 50,
    "results": [
      {
        "memoryId": "mem_old1",
        "compositeScore": 0.89,
        "recommendedAction": "archive"
      },
      {
        "memoryId": "mem_old2",
        "compositeScore": 0.72,
        "recommendedAction": "refresh"
      }
    ],
    "pagination": {
      "offset": 0,
      "limit": 50,
      "hasMore": true
    }
  },
  "message": "Scanned 50 memories\nFound 12 stale memories"
}
```

### Scan High-Priority Stale Memories

```
"Find memories that need immediate attention (score > 0.6)"
```

```json
{
  "action": "scan",
  "minScore": 0.6,
  "limit": 20
}
```

### Refresh a Memory

```
"Refresh memory mem_abc123"
```

Or with importance update:

```json
{
  "action": "refresh",
  "memoryId": "mem_abc123",
  "newImportance": 0.8
}
```

**Response:**

```json
{
  "action": "refresh",
  "result": {
    "success": true,
    "memoryId": "mem_abc123",
    "before": {
      "importance": 0.5,
      "lastRefreshedAt": 1702900000,
      "effectiveConfidence": 0.32
    },
    "after": {
      "importance": 0.8,
      "lastRefreshedAt": 1705320000,
      "effectiveConfidence": 0.80
    },
    "message": "Memory mem_abc123 refreshed. Importance updated: 0.50 → 0.80. Effective confidence: 0.32 → 0.80."
  },
  "message": "Memory mem_abc123 refreshed."
}
```

---

## Workflow Examples

### Weekly Maintenance Scan

```
"Scan all memories for staleness, show only those needing action"
```

```json
{
  "action": "scan",
  "minScore": 0.3,
  "limit": 100
}
```

Then review and act:
- **Review** (0.3-0.59): Read and verify still accurate
- **Refresh** (0.6-0.89): Update `lastRefreshedAt` anchor
- **Archive** (0.9+): Consider deletion or mark as historical

### After Major Code Refactor

```
"Scan architecture memories for staleness after the refactor"
```

```json
{
  "action": "scan",
  "type": "architecture",
  "minScore": 0.0
}
```

High `git_changes` signals indicate memories need review.

### Validating a Memory Before Using

```
"Check if the database migration decision is still current"
```

If stale, either:
1. **Refresh** if still valid
2. **Update** the content if partially outdated
3. **Create new** memory that supersedes it

---

## Response Schema

### Check/Scan Result

```typescript
interface StalenessResult {
  memoryId: string;
  compositeScore: number;      // 0-1
  recommendedAction: "none" | "review" | "refresh" | "archive";
  signals: StalenessSignal[];
  checkedAt: number;           // Unix timestamp
}

interface StalenessSignal {
  strategy: "time_decay" | "git_changes" | "related_updates" | "superseded";
  score: number;               // 0-1
  weight: number;              // Strategy weight
  reason: string;              // Human-readable explanation
  metadata?: Record<string, unknown>;
}
```

### Scan Result

```typescript
interface ScanAllResult {
  scanned: number;
  results: StalenessResult[];
  pagination: {
    offset: number;
    limit: number;
    hasMore: boolean;
  };
}
```

### Refresh Result

```typescript
interface RefreshResult {
  success: boolean;
  memoryId: string;
  before: {
    importance: number;
    lastRefreshedAt: number | null;
    effectiveConfidence?: number;
  };
  after: {
    importance: number;
    lastRefreshedAt: number;
    effectiveConfidence?: number;
  };
  message: string;
}
```

---

## Error Cases

| Error | Cause | Resolution |
|-------|-------|------------|
| `memoryId is required for check action` | Missing ID | Provide `memoryId` parameter |
| `Memory not found` | Invalid ID | Verify memory exists |
| `Memory not found or staleness detection disabled` | ID invalid or disabled | Check config and ID |

---

## Best Practices

### Do

- Run weekly maintenance scans
- Review memories flagged for `refresh` before refreshing
- Archive superseded memories rather than deleting
- Use `minScore` to focus on actionable items
- Check memories before critical decisions

### Don't

- Auto-archive without review
- Ignore `git_changes` signals during refactors
- Refresh memories without verifying content
- Set importance to 1.0 on every refresh

---

## Configuration

Staleness detection can be configured in your Doclea config:

```typescript
{
  staleness: {
    enabled: true,
    thresholds: {
      review: 0.3,
      refresh: 0.6,
      archive: 0.9
    },
    strategies: {
      timeDecay: {
        thresholdDays: 180,
        weight: 0.5
      },
      gitChanges: {
        weight: 0.7,
        cacheTtlMs: 300000  // 5 minutes
      },
      relatedUpdates: {
        weight: 0.4,
        maxDepth: 2
      },
      superseded: {
        weight: 1.0
      }
    }
  }
}
```

See [Configuration Guide](/docs/configuration) for details.

---

## Related Tools

| Tool | When to Use |
|------|-------------|
| [`doclea_search`](../memory/search) | Find memories to check |
| [`doclea_update`](../memory/update) | Update stale content |
| [`doclea_delete`](../memory/delete) | Remove archived memories |
| [`doclea_link_memories`](../memory/relations) | Create supersedes relations |
| [`doclea_refresh_confidence`](../memory/refresh-confidence) | Manual confidence refresh |

---

## See Also

- [Memory Staleness Guide](/docs/guides/memory-staleness)
- [Confidence Decay Configuration](/docs/architecture/confidence-decay)
- [Memory Relations](/docs/guides/memory-relations)
