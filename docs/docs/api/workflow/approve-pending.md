---
sidebar_position: 5
title: doclea_approve_pending
description: Approve a pending memory, committing it to storage.
keywords: [doclea_approve_pending, approve, pending, commit]
---

# doclea_approve_pending

Approve a pending memory, committing it to permanent storage. Optionally modify the memory during approval.

**Category:** Workflow
**Status:** Stable

---

## Quick Example

```
"Approve pending memory pending_abc123"
```

**Response:**

```json
{
  "success": true,
  "memory": {
    "id": "mem_xyz789",
    "title": "API Authentication Design",
    "content": "We will use JWT tokens for...",
    "type": "decision",
    "tags": ["auth", "jwt", "api"],
    "importance": 0.8,
    "createdAt": 1705432800000,
    "accessedAt": 1705432800000
  },
  "message": "Approved pending memory → mem_xyz789"
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pendingId` | `string` | Yes | ID of pending memory to approve |
| `title` | `string` | No | Override the title |
| `content` | `string` | No | Override the content |
| `tags` | `string[]` | No | Override the tags |
| `type` | `string` | No | Override the type |

---

## Usage Examples

### Basic Approve

```
"Approve the pending auth decision"
```

```json
{
  "pendingId": "pending_abc123"
}
```

### Approve with Title Change

```
"Approve but change the title"
```

```json
{
  "pendingId": "pending_abc123",
  "title": "JWT Authentication Decision"
}
```

### Approve with Tag Refinement

```
"Approve and add more tags"
```

```json
{
  "pendingId": "pending_abc123",
  "tags": ["auth", "jwt", "api", "security", "reviewed"]
}
```

### Approve with Type Change

```
"Approve as a pattern instead of note"
```

```json
{
  "pendingId": "pending_abc123",
  "type": "pattern"
}
```

### Full Modification

```
"Approve with multiple changes"
```

```json
{
  "pendingId": "pending_abc123",
  "title": "Refined Title",
  "content": "Updated content with more details...",
  "tags": ["refined", "approved"],
  "type": "decision"
}
```

---

## Response Schema

```typescript
interface ApproveResult {
  success: boolean;
  memory?: Memory;      // The created memory (on success)
  error?: string;       // Error message (on failure)
  message: string;
}
```

### Success

```json
{
  "success": true,
  "memory": { ... },
  "message": "Approved pending memory → mem_xyz789"
}
```

### Failure

```json
{
  "success": false,
  "error": "Pending memory not found",
  "message": "Failed to approve: Pending memory not found"
}
```

---

## What Happens on Approve

1. **Apply modifications** - Title, content, tags, type changes
2. **Generate embedding** - Create vector from content
3. **Store to Qdrant** - Add to vector database
4. **Store to SQLite** - Add to memories table
5. **Delete pending** - Remove from pending queue
6. **Detect relations** - Background relation detection runs

---

## Error Handling

### Pending Not Found

```json
{
  "success": false,
  "error": "Pending memory not found"
}
```

The pending may have been already approved/rejected or the ID is wrong.

### Embedding Failure

```json
{
  "success": false,
  "error": "Failed to generate embedding"
}
```

Pending is **not deleted** - you can retry.

### Vector Store Failure

```json
{
  "success": false,
  "error": "Failed to store vector"
}
```

Pending is **not deleted** - you can retry.

---

## Modifications

### What Can Be Modified

| Field | Effect |
|-------|--------|
| `title` | Updates title (affects embedding) |
| `content` | Updates content (affects embedding) |
| `tags` | Replaces all tags |
| `type` | Changes memory type |

### What Cannot Be Modified

| Field | Reason |
|-------|--------|
| `id` | Assigned by system |
| `relatedFiles` | From original store |
| `importance` | From original store |

---

## Use Cases

### Quality Review

```typescript
// List pending
const pending = await listPending();

// Review each
for (const p of pending) {
  if (isGoodQuality(p.memoryData)) {
    await approvePending({
      pendingId: p.id,
      tags: [...p.memoryData.tags, "approved"]
    });
  } else {
    await rejectPending({ pendingId: p.id });
  }
}
```

### Tag Normalization

```typescript
// Approve with standardized tags
await approvePending({
  pendingId: "pending_abc",
  tags: normalizeTags(pending.memoryData.tags)
});
```

---

## See Also

- [doclea_list_pending](./list-pending) - View pending memories
- [doclea_reject_pending](./reject-pending) - Reject instead
- [doclea_bulk_approve](./bulk-approve-pending) - Bulk approve
- [Workflow Overview](./overview)
