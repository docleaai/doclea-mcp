---
sidebar_position: 10
title: doclea_confirm_memory
description: Confirm an auto-stored memory, marking it as reviewed.
keywords: [doclea_confirm_memory, confirm, review, approve]
---

# doclea_confirm_memory

Confirm an auto-stored memory, marking it as reviewed and approved. Used in `suggested` and `automatic` modes.

**Category:** Workflow
**Status:** Stable

---

## Quick Example

```
"Confirm memory mem_abc123"
```

**Response:**

```json
{
  "success": true,
  "message": "Confirmed memory mem_abc123"
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `memoryId` | `string` | Yes | ID of memory to confirm |

---

## Usage Examples

### Basic Confirm

```
"Confirm the auto-stored API notes"
```

```json
{
  "memoryId": "mem_abc123"
}
```

---

## Response Schema

```typescript
interface ConfirmResult {
  success: boolean;
  error?: string;
  message: string;
}
```

### Success

```json
{
  "success": true,
  "message": "Confirmed memory mem_abc123"
}
```

### Not Found

```json
{
  "success": false,
  "error": "Memory not found",
  "message": "Failed to confirm: Memory not found"
}
```

---

## What Happens on Confirm

1. Memory's `needsReview` flag is cleared
2. Memory is marked as human-verified
3. No other changes to the memory

---

## Difference from Approve

| Approve (Pending) | Confirm (Review Queue) |
|-------------------|------------------------|
| Stores the memory | Memory already stored |
| Creates vectors | Vectors already exist |
| For manual mode | For suggested/automatic |

---

## Workflow

### After Auto-Store

```typescript
// 1. Memory was auto-stored
// 2. Appears in review queue
const queue = await reviewQueue({ limit: 20 });

// 3. Review and confirm good ones
for (const memory of queue) {
  if (isGood(memory)) {
    await confirmMemory({ memoryId: memory.id });
  }
}
```

### Edit Then Confirm

```typescript
// 1. Memory needs changes
await updateMemory({
  memoryId: "mem_abc123",
  tags: ["fixed", "tags"]
});

// 2. Then confirm
await confirmMemory({ memoryId: "mem_abc123" });
```

---

## See Also

- [doclea_review_queue](./review-queue) - Get review queue
- [doclea_approve_pending](./approve-pending) - Approve pending (manual mode)
- [Workflow Overview](./overview)
