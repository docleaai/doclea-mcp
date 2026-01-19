---
sidebar_position: 5
title: doclea_delete
description: Delete a memory by its ID.
keywords: [doclea_delete, memory, delete, remove]
---

# doclea_delete

Delete a memory by its ID. Removes from both SQLite storage and vector store.

**Category:** Memory Tools
**Status:** Stable

---

## Quick Example

```
"Delete the memory about the old caching approach"
```

**Response:**

```
Memory mem_abc123 deleted successfully
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | Yes | Memory ID to delete |

---

## Usage Examples

### Delete by ID

```json
{
  "id": "mem_abc123"
}
```

---

## Response Schema

```typescript
interface DeleteResult {
  success: boolean;
  message: string;
}
```

### Success

```json
{
  "success": true,
  "message": "Memory mem_abc123 deleted successfully"
}
```

### Not Found

```json
{
  "success": false,
  "message": "Memory not found: mem_unknown"
}
```

---

## What Gets Deleted

When a memory is deleted:

| Component | Deleted? | Notes |
|-----------|----------|-------|
| SQLite record | Yes | All metadata removed |
| Vector embedding | Yes | Qdrant vector deleted |
| Relations | Yes | Links to/from this memory removed |
| Pending suggestions | Yes | Relation suggestions cleaned up |
| Cross-layer links | Yes | Code-memory links removed |

---

## Cascading Deletions

```
Memory Deleted
    ├── SQLite record
    ├── Vector store entry
    ├── Memory relations (both directions)
    ├── Relation suggestions involving this memory
    └── Cross-layer suggestions involving this memory
```

---

## When to Delete

| Scenario | Action |
|----------|--------|
| Outdated information | Delete or update |
| Incorrect memory | Delete |
| Duplicate content | Delete duplicate, keep original |
| Superseded decision | Keep both, link with "supersedes" relation |
| Temporary notes | Delete when no longer needed |

---

## Alternatives to Deletion

Before deleting, consider:

1. **Update** - Fix incorrect information with `doclea_update`
2. **Supersede** - Link new decision to old with "supersedes" relation
3. **Archive** - Lower importance to 0.1 instead of deleting
4. **Mark stale** - Use staleness detection for outdated content

---

## Error Responses

### Not Found

```
Memory not found: mem_unknown
```

### Invalid ID

```
Error: Invalid memory ID format
```

---

## See Also

- [doclea_get](./get) - Retrieve before deleting
- [doclea_update](./update) - Alternative to deletion
- [doclea_link_memories](../relations/link-memories) - Create supersedes relations
