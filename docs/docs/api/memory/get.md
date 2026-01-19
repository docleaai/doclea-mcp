---
sidebar_position: 3
title: doclea_get
description: Retrieve a memory by its ID.
keywords: [doclea_get, memory, retrieve, id, fetch]
---

# doclea_get

Retrieve a memory by its unique ID. Increments access count for usage tracking.

**Category:** Memory Tools
**Status:** Stable

---

## Quick Example

```
"Get memory mem_abc123"
```

**Response:**

```json
{
  "id": "mem_abc123",
  "type": "decision",
  "title": "Use PostgreSQL for ACID compliance",
  "content": "We chose PostgreSQL over MongoDB...",
  "summary": "PostgreSQL selected for transactional workloads",
  "importance": 0.9,
  "tags": ["database", "architecture"],
  "relatedFiles": ["src/db/connection.ts"],
  "createdAt": "2024-01-15T10:30:00Z",
  "accessedAt": "2024-03-10T14:22:00Z",
  "accessCount": 15
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | Yes | Memory ID to retrieve |
| `skipAccessTracking` | `boolean` | No | If true, don't increment access count (internal use) |

---

## Usage Examples

### Basic Retrieval

```json
{
  "id": "mem_abc123"
}
```

### Internal Use (No Tracking)

```json
{
  "id": "mem_abc123",
  "skipAccessTracking": true
}
```

---

## Response Schema

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
  gitCommit?: string;
  sourcePr?: string;
  experts: string[];
  createdAt: string;
  accessedAt: string;
  accessCount: number;
  qdrantId?: string;
  reviewStatus?: "pending" | "confirmed";
  lastRefreshedAt?: string;
}
```

---

## Access Tracking

When a memory is retrieved:

1. **Access count** is incremented (unless `skipAccessTracking: true`)
2. **accessedAt** timestamp is updated
3. This data feeds into **usage frequency** scoring for relevance ranking

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

## When to Use

| Scenario | Recommended |
|----------|-------------|
| Display memory details | `doclea_get` |
| Check if memory exists | `doclea_get` |
| Internal cross-referencing | `doclea_get` with `skipAccessTracking` |
| Search by content | Use `doclea_search` instead |

---

## See Also

- [doclea_search](./search) - Find memories by content
- [doclea_update](./update) - Modify a memory
- [doclea_delete](./delete) - Remove a memory
- [doclea_store](./store) - Create new memories
