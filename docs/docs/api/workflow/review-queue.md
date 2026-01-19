---
sidebar_position: 9
title: doclea_review_queue
description: Get memories that need review in suggested/automatic mode.
keywords: [doclea_review_queue, review, queue, confirm]
---

# doclea_review_queue

Get memories that were auto-stored but need review confirmation. Used in `suggested` and `automatic` modes.

**Category:** Workflow
**Status:** Stable

---

## Quick Example

```
"Show memories needing review"
```

**Response:**

```json
{
  "memories": [
    {
      "id": "mem_abc123",
      "title": "Auto-stored API Notes",
      "content": "Notes about the API...",
      "type": "note",
      "needsReview": true,
      "createdAt": 1705432800000
    },
    {
      "id": "mem_def456",
      "title": "Pattern from Session",
      "content": "Observed pattern...",
      "type": "pattern",
      "needsReview": true,
      "createdAt": 1705432700000
    }
  ],
  "count": 2,
  "message": "Found 2 memories needing review"
}
```

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | `number` | No | `20` | Maximum memories to return |

---

## Usage Examples

### Default

```
"Show review queue"
```

```json
{}
```

### More Items

```
"Show 50 memories needing review"
```

```json
{
  "limit": 50
}
```

---

## Response Schema

```typescript
interface ReviewQueueResult {
  memories: Memory[];
  count: number;
  message: string;
}
```

---

## Difference from Pending

| Pending Queue | Review Queue |
|---------------|--------------|
| Not yet stored | Already stored |
| Manual mode | Suggested/automatic mode |
| Approve to store | Confirm to mark reviewed |
| No vectors yet | Vectors already created |

---

## Workflow

### 1. Get Queue

```json
{ "limit": 20 }
```

### 2. Review Each

Examine memory content, tags, type.

### 3. Confirm Good Ones

```json
// doclea_confirm_memory
{ "memoryId": "mem_abc123" }
```

### 4. Optionally Edit

If memory needs changes, use `doclea_update` first, then confirm.

---

## Empty Queue

```json
{
  "memories": [],
  "count": 0,
  "message": "No memories needing review"
}
```

---

## See Also

- [doclea_confirm_memory](./confirm-memory) - Confirm a memory
- [doclea_list_pending](./list-pending) - Pending queue (manual mode)
- [Workflow Overview](./overview)
