---
sidebar_position: 3
title: doclea_get_storage_mode
description: Get the current storage mode.
keywords: [doclea_get_storage_mode, storage mode, status]
---

# doclea_get_storage_mode

Get the current storage mode. Shows whether memories require approval.

**Category:** Workflow
**Status:** Stable

---

## Quick Example

```
"What is the current storage mode?"
```

**Response:**

```json
{
  "mode": "manual",
  "message": "Current storage mode: manual"
}
```

---

## Parameters

None.

---

## Response Schema

```typescript
interface GetStorageModeResult {
  mode: "manual" | "suggested" | "automatic";
  message: string;
}
```

---

## Modes Explained

| Mode | Meaning |
|------|---------|
| `manual` | Memories require explicit approval |
| `suggested` | Memories stored but flagged for review |
| `automatic` | Memories stored immediately |

---

## See Also

- [doclea_set_storage_mode](./set-storage-mode) - Change mode
- [Workflow Overview](./overview)
