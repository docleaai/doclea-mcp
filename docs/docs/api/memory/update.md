---
sidebar_position: 4
title: doclea_update
description: Update an existing memory's properties.
keywords: [doclea_update, memory, update, modify, edit]
---

# doclea_update

Update an existing memory's properties. Re-embeds content if title or content changes.

**Category:** Memory Tools
**Status:** Stable

---

## Quick Example

```
"Update memory mem_abc123 to add the security tag"
```

**Response:**

```json
{
  "id": "mem_abc123",
  "type": "decision",
  "title": "Use PostgreSQL for ACID compliance",
  "content": "We chose PostgreSQL over MongoDB...",
  "importance": 0.9,
  "tags": ["database", "architecture", "security"],
  "updatedAt": "2024-03-10T14:30:00Z"
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | Yes | Memory ID to update |
| `type` | `string` | No | New memory type |
| `title` | `string` | No | New title (triggers re-embedding) |
| `content` | `string` | No | New content (triggers re-embedding) |
| `summary` | `string` | No | New summary |
| `importance` | `number` | No | New importance (0-1) |
| `tags` | `string[]` | No | Replace tags array |
| `relatedFiles` | `string[]` | No | Replace related files array |
| `gitCommit` | `string` | No | New git commit reference |
| `sourcePr` | `string` | No | New source PR reference |
| `experts` | `string[]` | No | Replace experts array |

---

## Usage Examples

### Update Tags

```json
{
  "id": "mem_abc123",
  "tags": ["database", "architecture", "security"]
}
```

### Update Content (Re-embeds)

```json
{
  "id": "mem_abc123",
  "content": "Updated decision: We chose PostgreSQL over MongoDB because...",
  "summary": "PostgreSQL selected for transactional workloads and security"
}
```

### Update Importance

```json
{
  "id": "mem_abc123",
  "importance": 0.95
}
```

### Update Multiple Fields

```json
{
  "id": "mem_abc123",
  "title": "PostgreSQL for ACID and Security",
  "importance": 0.95,
  "tags": ["database", "security", "compliance"],
  "relatedFiles": ["src/db/connection.ts", "src/db/migrations/"]
}
```

---

## Response Schema

Returns the updated `Memory` object:

```typescript
interface Memory {
  id: string;
  type: "decision" | "solution" | "pattern" | "architecture" | "note";
  title: string;
  content: string;
  summary?: string;
  importance: number;
  tags: string[];
  relatedFiles: string[];
  // ... other fields
}
```

---

## Re-embedding Behavior

| Fields Changed | Re-embeds? | Notes |
|---------------|------------|-------|
| `title` | Yes | Vector updated with new title |
| `content` | Yes | Vector updated with new content |
| `tags` | No | Payload updated, same vector |
| `importance` | No | Payload updated, same vector |
| `relatedFiles` | No | Payload updated, same vector |
| `type` | No | Payload updated, same vector |

---

## Error Responses

### Not Found

```
Memory not found: mem_unknown
```

### Validation Error

```
Error: importance must be between 0 and 1
```

---

## Best Practices

1. **Batch related updates** - Update multiple fields in one call
2. **Minimize content changes** - Re-embedding has a cost
3. **Keep tags focused** - 2-5 meaningful tags
4. **Update importance** when priorities change

---

## See Also

- [doclea_get](./get) - Retrieve a memory
- [doclea_delete](./delete) - Remove a memory
- [doclea_store](./store) - Create new memories
