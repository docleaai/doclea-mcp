---
sidebar_position: 8
title: doclea_bulk_reject
description: Bulk reject multiple pending memories.
keywords: [doclea_bulk_reject, bulk, reject, batch]
---

# doclea_bulk_reject

Bulk reject multiple pending memories at once, discarding them permanently.

**Category:** Workflow
**Status:** Stable

---

## Quick Example

```
"Reject these pending memories"
```

**Response:**

```json
{
  "rejected": ["pending_abc", "pending_def"],
  "failed": [],
  "message": "Rejected 2/2 pending memories"
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pendingIds` | `string[]` | Yes | IDs of pending memories to reject |

---

## Usage Examples

### Reject Multiple

```
"Reject the duplicate and low-quality pending memories"
```

```json
{
  "pendingIds": ["pending_dup1", "pending_low1", "pending_low2"]
}
```

---

## Response Schema

```typescript
interface BulkRejectResult {
  rejected: string[];
  failed: Array<{ pendingId: string; error: string }>;
  message: string;
}
```

### Full Success

```json
{
  "rejected": ["pending_a", "pending_b", "pending_c"],
  "failed": [],
  "message": "Rejected 3/3 pending memories"
}
```

### Partial Success

```json
{
  "rejected": ["pending_a"],
  "failed": [
    { "pendingId": "pending_b", "error": "Not found" }
  ],
  "message": "Rejected 1/2 pending memories (1 failed)"
}
```

---

## Behavior

- Each pending memory is deleted from the queue
- **Permanent** - Cannot be recovered
- Failed items don't stop the batch

---

## See Also

- [doclea_reject_pending](./reject-pending) - Single reject
- [doclea_bulk_approve](./bulk-approve-pending) - Bulk approve
- [Workflow Overview](./overview)
