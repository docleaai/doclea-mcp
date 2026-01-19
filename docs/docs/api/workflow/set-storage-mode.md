---
sidebar_position: 2
title: doclea_set_storage_mode
description: Set the storage mode for memory operations.
keywords: [doclea_set_storage_mode, storage mode, manual, suggested, automatic]
---

# doclea_set_storage_mode

Set the storage mode for memory operations. Controls whether memories require approval before being stored.

**Category:** Workflow
**Status:** Stable

---

## Quick Example

```
"Switch to manual storage mode"
```

**Response:**

```json
{
  "success": true,
  "mode": "manual",
  "message": "Storage mode changed to: manual"
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mode` | `string` | Yes | `"manual"`, `"suggested"`, or `"automatic"` |
| `autoApproveThreshold` | `number` | No | Confidence threshold for automatic mode (0-1) |

---

## Modes

### `manual`

All memories go to pending queue, require explicit approval.

```json
{ "mode": "manual" }
```

### `suggested`

Memories stored immediately but flagged for review.

```json
{ "mode": "suggested" }
```

### `automatic`

Memories stored immediately with no review required.

```json
{ "mode": "automatic" }
```

---

## Usage Examples

### Switch to Manual

```
"Enable manual approval for all memories"
```

```json
{
  "mode": "manual"
}
```

### Switch to Automatic

```
"Enable automatic storage for bulk import"
```

```json
{
  "mode": "automatic"
}
```

### Automatic with Threshold

```
"Auto-approve only high-confidence memories"
```

```json
{
  "mode": "automatic",
  "autoApproveThreshold": 0.8
}
```

---

## Response Schema

```typescript
interface SetStorageModeResult {
  success: boolean;
  mode: string;
  message: string;
}
```

---

## Mode Effects

| Mode | `doclea_store` Behavior |
|------|------------------------|
| `manual` | Creates pending memory |
| `suggested` | Stores + marks for review |
| `automatic` | Stores immediately |

---

## Use Cases

### Curated Knowledge Base

```json
{ "mode": "manual" }
```
Every memory reviewed before permanent storage.

### Bulk Import

```json
{ "mode": "automatic" }
```
Fast import, review later.

### Balanced Workflow

```json
{ "mode": "suggested" }
```
Stored immediately, review queue for quality.

---

## See Also

- [doclea_get_storage_mode](./get-storage-mode) - Check current mode
- [Workflow Overview](./overview)
