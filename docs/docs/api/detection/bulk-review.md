---
sidebar_position: 5
title: doclea_bulk_review
description: Batch approve or reject multiple relation suggestions.
keywords: [doclea_bulk_review, batch, approve, reject, bulk]
---

# doclea_bulk_review

Batch approve or reject multiple relation suggestions at once. Efficient for processing large review queues.

**Category:** Relation Detection
**Status:** Stable

---

## Quick Example

```
"Approve these suggestions: sug_abc123, sug_def456, sug_ghi789"
```

**Response:**

```json
{
  "processed": 3,
  "relationsCreated": 3,
  "failed": [],
  "message": "approved 3/3 suggestions (3 relations created)"
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
"Approve all high-confidence suggestions"
```

```json
{
  "suggestionIds": [
    "sug_abc123",
    "sug_def456",
    "sug_ghi789"
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
    "sug_bad001",
    "sug_bad002"
  ],
  "action": "reject"
}
```

---

## Response Schema

```typescript
interface BulkReviewResult {
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
  "message": "approved 5/5 suggestions (5 relations created)"
}
```

### Partial Success

```json
{
  "processed": 3,
  "relationsCreated": 3,
  "failed": ["sug_notfound", "sug_reviewed"],
  "message": "approved 3/5 suggestions (3 relations created) (2 failed)"
}
```

### Bulk Reject

```json
{
  "processed": 4,
  "relationsCreated": 0,
  "failed": [],
  "message": "rejected 4/4 suggestions"
}
```

---

## Workflow

### Strategy 1: Approve High Confidence

```json
// 1. Get high-confidence suggestions
{ "minConfidence": 0.8 }

// 2. Bulk approve
{
  "suggestionIds": ["sug_1", "sug_2", "sug_3"],
  "action": "approve"
}
```

### Strategy 2: Review and Sort

```json
// 1. Get all pending
{ "limit": 50 }

// 2. Separate into approve/reject lists
approve = [...]
reject = [...]

// 3. Bulk process each
{ "suggestionIds": approve, "action": "approve" }
{ "suggestionIds": reject, "action": "reject" }
```

### Strategy 3: By Detection Method

```json
// 1. Trust semantic matches
{ "detectionMethod": "semantic", "minConfidence": 0.75 }
→ Bulk approve

// 2. Review temporal matches more carefully
{ "detectionMethod": "temporal" }
→ Individual review
```

---

## Failure Handling

### Why Suggestions Fail

| Reason | Example |
|--------|---------|
| Not found | Invalid ID |
| Already reviewed | Previously approved/rejected |
| Database error | Constraint violation |

### Handling Failures

```json
{
  "processed": 8,
  "failed": ["sug_xyz", "sug_abc"]
}
```

Failed IDs are reported but don't stop the batch. Process them individually if needed.

---

## Batch Size

No hard limit, but recommended:

| Size | Performance |
|------|-------------|
| 1-20 | Instant |
| 20-50 | Fast |
| 50-100 | Good |
| 100+ | Consider smaller batches |

---

## Atomicity

Bulk review is **not atomic**:
- Each suggestion is processed independently
- Failures don't rollback successes
- `processed` + `failed.length` = total attempted

---

## Combining with Get Suggestions

### Approve All Above Threshold

```typescript
// 1. Get high-confidence suggestions
const { suggestions } = await doclea_get_suggestions({
  minConfidence: 0.8
});

// 2. Extract IDs
const ids = suggestions.map(s => s.id);

// 3. Bulk approve
await doclea_bulk_review({
  suggestionIds: ids,
  action: "approve"
});
```

### Clear the Queue

```typescript
// 1. Get all pending
const { suggestions, total } = await doclea_get_suggestions({
  limit: 100
});

// 2. Review and categorize
const toApprove = [];
const toReject = [];

for (const s of suggestions) {
  if (shouldApprove(s)) {
    toApprove.push(s.id);
  } else {
    toReject.push(s.id);
  }
}

// 3. Bulk process
await doclea_bulk_review({ suggestionIds: toApprove, action: "approve" });
await doclea_bulk_review({ suggestionIds: toReject, action: "reject" });
```

---

## Error Cases

| Error | Cause | Resolution |
|-------|-------|------------|
| `Empty suggestionIds` | No IDs provided | Provide at least 1 ID |
| `Invalid action` | Not "approve" or "reject" | Use valid action |

---

## See Also

- [doclea_review_suggestion](./review-suggestion) - Single review
- [doclea_get_suggestions](./get-suggestions) - Get pending
- [Relation Detection Overview](./overview)
