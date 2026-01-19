---
sidebar_position: 7
title: doclea_bulk_approve
description: Bulk approve multiple pending memories.
keywords: [doclea_bulk_approve, bulk, approve, batch]
---

# doclea_bulk_approve

Bulk approve multiple pending memories at once. Optionally filter by confidence threshold.

**Category:** Workflow
**Status:** Stable

---

## Quick Example

```
"Approve all pending memories"
```

**Response:**

```json
{
  "approved": [
    { "id": "mem_abc123", "title": "Memory 1" },
    { "id": "mem_def456", "title": "Memory 2" }
  ],
  "failed": [],
  "skipped": 0,
  "message": "Approved 2/2 pending memories"
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pendingIds` | `string[]` | No | Specific IDs to approve (all if omitted) |
| `minConfidence` | `number` | No | Only approve above this threshold (0-1) |

---

## Usage Examples

### Approve All

```
"Approve all pending memories"
```

```json
{}
```

### Approve Specific

```
"Approve these pending memories"
```

```json
{
  "pendingIds": ["pending_abc", "pending_def", "pending_ghi"]
}
```

### Approve High Confidence

```
"Approve only high-importance pending memories"
```

```json
{
  "minConfidence": 0.7
}
```

---

## Response Schema

```typescript
interface BulkApproveResult {
  approved: Memory[];
  failed: Array<{ pendingId: string; error: string }>;
  skipped: number;
  message: string;
}
```

### Full Success

```json
{
  "approved": [ ... ],
  "failed": [],
  "skipped": 0,
  "message": "Approved 5/5 pending memories"
}
```

### Partial Success

```json
{
  "approved": [ ... ],
  "failed": [
    { "pendingId": "pending_bad", "error": "Embedding failed" }
  ],
  "skipped": 2,
  "message": "Approved 3/6 pending memories (2 skipped, 1 failed)"
}
```

---

## Confidence Threshold

Uses `importance` field as proxy for confidence:

```json
{
  "minConfidence": 0.8
}
```

Pending memories with `importance < 0.8` are **skipped**, not failed.

---

## Processing Order

Pending memories are processed in the order they appear in the queue (creation order).

---

## Error Handling

Failed items don't stop the batch:

```json
{
  "failed": [
    { "pendingId": "pending_x", "error": "Not found" },
    { "pendingId": "pending_y", "error": "Embedding failed" }
  ]
}
```

---

## See Also

- [doclea_approve_pending](./approve-pending) - Single approve
- [doclea_list_pending](./list-pending) - View pending
- [doclea_bulk_reject](./bulk-reject-pending) - Bulk reject
- [Workflow Overview](./overview)
