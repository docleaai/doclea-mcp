---
sidebar_position: 6
title: doclea_reject_pending
description: Reject a pending memory, discarding it.
keywords: [doclea_reject_pending, reject, pending, discard]
---

# doclea_reject_pending

Reject a pending memory, discarding it permanently. The memory will not be stored.

**Category:** Workflow
**Status:** Stable

---

## Quick Example

```
"Reject pending memory pending_def456"
```

**Response:**

```json
{
  "success": true,
  "message": "Rejected pending memory pending_def456"
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pendingId` | `string` | Yes | ID of pending memory to reject |

---

## Usage Examples

### Basic Reject

```
"Reject the duplicate pending memory"
```

```json
{
  "pendingId": "pending_def456"
}
```

---

## Response Schema

```typescript
interface RejectResult {
  success: boolean;
  message: string;
}
```

### Success

```json
{
  "success": true,
  "message": "Rejected pending memory pending_def456"
}
```

### Not Found

```json
{
  "success": false,
  "message": "Pending memory not found"
}
```

---

## What Happens on Reject

1. Pending memory is deleted from the pending queue
2. **No storage** - Memory is not stored anywhere
3. **No vectors** - No embedding is created
4. **Permanent** - Cannot be recovered

---

## When to Reject

| Reason | Action |
|--------|--------|
| Duplicate content | Reject |
| Low quality | Reject |
| Wrong information | Reject |
| Test/temporary | Reject |
| Better version exists | Reject |

---

## See Also

- [doclea_list_pending](./list-pending) - View pending
- [doclea_approve_pending](./approve-pending) - Approve instead
- [doclea_bulk_reject](./bulk-reject-pending) - Bulk reject
- [Workflow Overview](./overview)
