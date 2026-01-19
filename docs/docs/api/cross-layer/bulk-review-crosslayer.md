---
sidebar_position: 7
title: doclea_bulk_review_crosslayer
description: Batch approve or reject multiple cross-layer relation suggestions.
keywords: [doclea_bulk_review_crosslayer, batch, approve, reject, bulk]
---

# doclea_bulk_review_crosslayer

Batch approve or reject multiple cross-layer relation suggestions at once. Efficient for processing large review queues.

**Category:** Cross-Layer Relations
**Status:** Stable

---

## Quick Example

```
"Approve these cross-layer suggestions: csug_abc123, csug_def456, csug_ghi789"
```

**Response:**

```json
{
  "processed": 3,
  "relationsCreated": 3,
  "failed": [],
  "message": "approved 3/3 cross-layer suggestions (3 relations created)"
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `suggestionIds` | `string[]` | Yes | Array of suggestion IDs (1+ items) |
| `action` | `string` | Yes | `"approve"` or `"reject"` |

---

## Usage Examples

### Bulk Approve

```
"Approve all high-confidence cross-layer suggestions"
```

```json
{
  "suggestionIds": [
    "csug_abc123",
    "csug_def456",
    "csug_ghi789"
  ],
  "action": "approve"
}
```

### Bulk Reject

```
"Reject these false positives"
```

```json
{
  "suggestionIds": [
    "csug_bad001",
    "csug_bad002"
  ],
  "action": "reject"
}
```

---

## Response Schema

```typescript
interface BulkReviewCrossLayerResult {
  processed: number;           // Successfully processed count
  relationsCreated: number;    // Relations created (approve only)
  failed: string[];            // IDs that failed
  message: string;
}
```

### Full Success

```json
{
  "processed": 5,
  "relationsCreated": 5,
  "failed": [],
  "message": "approved 5/5 cross-layer suggestions (5 relations created)"
}
```

### Partial Success

```json
{
  "processed": 3,
  "relationsCreated": 3,
  "failed": ["csug_notfound", "csug_reviewed"],
  "message": "approved 3/5 cross-layer suggestions (3 relations created) (2 failed)"
}
```

### Bulk Reject

```json
{
  "processed": 4,
  "relationsCreated": 0,
  "failed": [],
  "message": "rejected 4/4 cross-layer suggestions"
}
```

---

## Workflow

### Strategy 1: By Confidence

```typescript
// 1. Get high-confidence suggestions
const { suggestions } = await getCrossLayerSuggestions({
  minConfidence: 0.8
});

// 2. Bulk approve
await bulkReviewCrossLayer({
  suggestionIds: suggestions.map(s => s.id),
  action: "approve"
});
```

### Strategy 2: By Detection Method

```typescript
// Trust code references
const codeRefs = await getCrossLayerSuggestions({
  detectionMethod: "code_reference"
});
await bulkReviewCrossLayer({
  suggestionIds: codeRefs.suggestions.map(s => s.id),
  action: "approve"
});

// Review keyword matches more carefully
const keywordMatches = await getCrossLayerSuggestions({
  detectionMethod: "keyword_match"
});
// Individual review...
```

### Strategy 3: By Entity

```typescript
// Process all suggestions for a memory
const memorySugs = await getCrossLayerSuggestions({
  memoryId: "mem_important_docs"
});

// Review and categorize
const toApprove = memorySugs.suggestions
  .filter(s => isValid(s))
  .map(s => s.id);

const toReject = memorySugs.suggestions
  .filter(s => !isValid(s))
  .map(s => s.id);

// Bulk process
await bulkReviewCrossLayer({
  suggestionIds: toApprove,
  action: "approve"
});
await bulkReviewCrossLayer({
  suggestionIds: toReject,
  action: "reject"
});
```

---

## Failure Handling

### Why Suggestions Fail

| Reason | Example |
|--------|---------|
| Not found | Invalid suggestion ID |
| Already reviewed | Previously approved/rejected |
| Database error | Constraint violation |

### Handling Failures

```json
{
  "processed": 8,
  "failed": ["csug_xyz", "csug_abc"]
}
```

Failed IDs are reported but don't stop the batch. Review individually if needed.

---

## Batch Size

Recommended batch sizes:

| Size | Performance |
|------|-------------|
| 1-20 | Instant |
| 20-50 | Fast |
| 50-100 | Good |
| 100+ | Consider smaller batches |

---

## Atomicity

Bulk review is **not atomic**:
- Each suggestion processed independently
- Failures don't rollback successes
- `processed` + `failed.length` = total attempted

---

## Error Cases

| Error | Cause | Resolution |
|-------|-------|------------|
| `Empty suggestionIds` | No IDs provided | Provide at least 1 ID |
| `Invalid action` | Not "approve"/"reject" | Use valid action |

---

## See Also

- [doclea_review_crosslayer](./review-crosslayer) - Single review
- [doclea_get_crosslayer_suggestions](./get-crosslayer-suggestions) - Get pending
- [Cross-Layer Overview](./overview)
