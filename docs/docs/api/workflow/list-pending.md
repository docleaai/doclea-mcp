---
sidebar_position: 4
title: doclea_list_pending
description: List all pending memories awaiting approval.
keywords: [doclea_list_pending, pending, queue, approval]
---

# doclea_list_pending

List all pending memories awaiting approval. Only relevant in `manual` storage mode.

**Category:** Workflow
**Status:** Stable

---

## Quick Example

```
"Show pending memories"
```

**Response:**

```json
{
  "pending": [
    {
      "id": "pending_abc123",
      "memoryData": {
        "id": "mem_xyz789",
        "title": "API Authentication Design",
        "content": "We will use JWT tokens for...",
        "type": "decision",
        "tags": ["auth", "jwt", "api"],
        "importance": 0.8
      },
      "createdAt": 1705432800000,
      "source": "user"
    },
    {
      "id": "pending_def456",
      "memoryData": {
        "id": "mem_uvw321",
        "title": "Database Schema Notes",
        "content": "The user table should...",
        "type": "note",
        "tags": ["database", "schema"],
        "importance": 0.5
      },
      "createdAt": 1705432700000,
      "source": "ai"
    }
  ],
  "count": 2,
  "message": "Found 2 pending memories"
}
```

---

## Parameters

None.

---

## Response Schema

```typescript
interface ListPendingResult {
  pending: PendingMemory[];
  count: number;
  message: string;
}

interface PendingMemory {
  id: string;                // Pending memory ID
  memoryData: {
    id: string;              // Final memory ID (assigned)
    title: string;
    content: string;
    type: string;
    tags?: string[];
    relatedFiles?: string[];
    importance?: number;
  };
  createdAt: number;         // When pending was created
  source: string;            // "user" or "ai"
}
```

---

## Workflow

### 1. List Pending

```json
// doclea_list_pending
{}
```

### 2. Review Each

Examine `memoryData` for each pending item.

### 3. Approve or Reject

```json
// Approve
{ "pendingId": "pending_abc123" }

// Reject
{ "pendingId": "pending_def456" }
```

---

## Empty Result

When no pending memories:

```json
{
  "pending": [],
  "count": 0,
  "message": "No pending memories"
}
```

---

## Source Field

| Source | Meaning |
|--------|---------|
| `user` | Created via explicit user request |
| `ai` | Created by AI agent suggestion |

---

## See Also

- [doclea_approve_pending](./approve-pending) - Approve a pending memory
- [doclea_reject_pending](./reject-pending) - Reject a pending memory
- [Workflow Overview](./overview)
