---
sidebar_position: 1
title: doclea_store
description: Store a new memory (decision, solution, pattern, architecture, or note) with semantic search capabilities.
keywords: [doclea_store, store memory, save decision, MCP tool]
---

# doclea_store

Store a new memory with semantic search capabilities.

**Category:** Memory
**Status:** Stable

---

## Quick Example

```
"Store this decision: Using JWT for stateless auth. Tag it 'security' and 'authentication'."
```

**Response:**

```json
{
  "id": "mem_a1b2c3d4e5f6",
  "type": "decision",
  "title": "Using JWT for stateless auth",
  "importance": 0.7,
  "tags": ["security", "authentication"],
  "createdAt": "2025-01-15T10:30:00Z"
}
```

---

## Parameters

### Required

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `enum` | Memory category: `decision`, `solution`, `pattern`, `architecture`, `note` |
| `title` | `string` | Short descriptive title (30-80 chars recommended) |
| `content` | `string` | Full content with context and reasoning |

### Optional

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `summary` | `string` | `null` | Brief summary for search results |
| `importance` | `number` | `0.5` | Priority score (0-1) |
| `tags` | `string[]` | `[]` | Category tags (2-5 recommended) |
| `relatedFiles` | `string[]` | `[]` | Associated file paths |
| `gitCommit` | `string` | `null` | Related commit hash |
| `sourcePr` | `string` | `null` | PR reference (`#142` or `PR-142`) |
| `experts` | `string[]` | `[]` | Subject matter experts |

---

## Parameter Details

### `type`

| Value | Use For | Example |
|-------|---------|---------|
| `decision` | Architectural choices, technology selections | "Using PostgreSQL over MongoDB" |
| `solution` | Bug fixes, problem resolutions | "Fixed N+1 query with eager loading" |
| `pattern` | Code conventions, standards | "All API errors use RFC7807" |
| `architecture` | System design, infrastructure | "Service mesh topology diagram" |
| `note` | General documentation | "Team standup moved to 10am" |

### `importance`

| Range | When to Use |
|-------|-------------|
| 0.9-1.0 | Critical decisions (security, data model, core architecture) |
| 0.7-0.8 | Important patterns used frequently |
| 0.5-0.6 | Standard documentation |
| 0.3-0.4 | Minor implementation notes |
| 0.0-0.2 | Low-priority reference material |

---

## Response Schema

```typescript
interface Memory {
  id: string;              // Format: mem_<16-char-hex>
  qdrantId: string;        // Vector store ID
  type: MemoryType;
  title: string;
  content: string;
  summary?: string;
  importance: number;
  tags: string[];
  relatedFiles: string[];
  gitCommit?: string;
  sourcePr?: string;
  experts: string[];
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
}
```

---

## Usage Examples

### Basic Decision

```
"Store this decision: We chose PostgreSQL for ACID compliance in payment processing."
```

### With Full Context

```json
{
  "type": "decision",
  "title": "PostgreSQL for Payment Data",
  "content": "Chose PostgreSQL over MongoDB because:\n\n1. ACID transactions required for payments\n2. Complex relational queries across orders/users\n3. Team has SQL expertise\n4. Strong TypeScript integration via Prisma\n\nAlternatives considered:\n- MongoDB: Rejected due to lack of multi-document ACID\n- MySQL: Rejected due to inferior JSON support",
  "summary": "PostgreSQL chosen for ACID guarantees in payments",
  "importance": 0.9,
  "tags": ["database", "payments", "infrastructure"],
  "relatedFiles": ["src/db/schema.prisma", "src/payments/processor.ts"],
  "experts": ["alice@team.com"]
}
```

### Bug Fix Solution

```
"Store this solution: Fixed race condition in payment processing by adding database transaction isolation level SERIALIZABLE. Link it to src/payments/processor.ts and tag it 'concurrency' and 'payments'."
```

### Code Pattern

```json
{
  "type": "pattern",
  "title": "API Error Response Format",
  "content": "All API errors return RFC7807 Problem Details:\n\n```json\n{\n  \"type\": \"https://api.example.com/errors/validation\",\n  \"title\": \"Validation Error\",\n  \"status\": 400,\n  \"detail\": \"Email format is invalid\"\n}\n```",
  "importance": 0.7,
  "tags": ["api", "error-handling", "conventions"]
}
```

---

## Error Cases

| Error | Cause | Resolution |
|-------|-------|------------|
| `Validation error: 'type' must be one of...` | Invalid type value | Use: `decision`, `solution`, `pattern`, `architecture`, `note` |
| `Validation error: 'importance' must be between 0 and 1` | Importance out of range | Use value between 0.0 and 1.0 |
| `Embedding generation failed` | Embedding service unavailable | Check embedding service or wait for retry |
| `Storage error` | Database write failure | Check disk space and permissions |

---

## Best Practices

### Do

- Write descriptive titles (30-80 chars)
- Include reasoning and alternatives in content
- Use 2-5 focused tags
- Link related files for context
- Set appropriate importance based on impact

### Don't

- Store duplicate information (search first)
- Use vague titles like "Fixed bug"
- Omit context (future you won't remember)
- Set all importance to 1.0
- Store temporary notes

---

## Related Tools

| Tool | When to Use |
|------|-------------|
| [`doclea_search`](./search) | Find existing memories before storing |
| [`doclea_update`](./update) | Modify after creation |
| [`doclea_get`](./get) | Retrieve full details by ID |
| [`doclea_init`](../bootstrap/init) | Bootstrap project with initial memories |

---

## See Also

- [Memory Management Guide](../../guides/memory-management)
- [API Overview](../overview)
