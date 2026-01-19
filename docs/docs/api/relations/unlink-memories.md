---
sidebar_position: 5
title: doclea_unlink_memories
description: Delete a relationship between two memories.
keywords: [doclea_unlink_memories, unlink, delete, relation, remove]
---

# doclea_unlink_memories

Delete a relationship between two memories by its relation ID.

**Category:** Memory Relations
**Status:** Stable

---

## Quick Example

```
"Remove the link between those two memories"
```

**Response:**

```
Relation rel_abc123 deleted successfully
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `relationId` | `string` | Yes | ID of the relationship to delete |

---

## Usage Examples

### Delete by Relation ID

```json
{
  "relationId": "rel_abc123"
}
```

---

## Response Schema

```typescript
interface UnlinkResult {
  message: string;
}
```

### Success

```
Relation rel_abc123 deleted successfully
```

### Not Found

```
Relation not found: rel_unknown
```

---

## Finding Relation IDs

Relation IDs are returned when:

1. **Creating relations** - `doclea_link_memories` returns the new relation ID
2. **Getting related** - `doclea_get_related` includes relation IDs in results
3. **Finding paths** - `doclea_find_path` shows relation IDs in the path

```typescript
// Example: Get relations to find their IDs
const related = await doclea_get_related({
  memoryId: "mem_abc123",
  depth: 1
});

// Each relation has an ID
for (const rel of related.relations) {
  console.log(rel.relationId);  // "rel_xyz789"
}
```

---

## Effects of Deletion

When a relation is deleted:

- The link between memories is removed
- Both memories remain intact
- Graph traversal no longer follows this path
- Relation-based scoring is recalculated

---

## When to Unlink

| Scenario | Action |
|----------|--------|
| Relation was created incorrectly | Unlink |
| Memories are no longer related | Unlink |
| Replacing with different relation type | Unlink old, create new |
| Memory is being deleted | Relations auto-cleanup |

---

## See Also

- [doclea_link_memories](./link-memories) - Create relations
- [doclea_get_related](./get-related) - Find relation IDs
- [Memory Relations Overview](./overview)
