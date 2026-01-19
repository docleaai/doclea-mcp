---
sidebar_position: 2
title: doclea_link_memories
description: Create a typed relationship between two memories.
keywords: [doclea_link_memories, relations, link, knowledge graph]
---

# doclea_link_memories

Create a typed relationship between two memories. This is the primary tool for building your knowledge graph.

**Category:** Memory Relations
**Status:** Stable

---

## Quick Example

```
"Link the JWT authentication memory to the OAuth standards memory"
```

**Response:**

```json
{
  "relation": {
    "id": "rel_abc123",
    "sourceId": "mem_jwt_auth",
    "targetId": "mem_oauth_standards",
    "type": "references",
    "weight": 1.0,
    "createdAt": 1705432800000
  },
  "message": "Created references relationship: mem_jwt_auth → mem_oauth_standards"
}
```

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `sourceId` | `string` | Yes | - | Source memory ID |
| `targetId` | `string` | Yes | - | Target memory ID |
| `type` | `string` | Yes | - | Relationship type |
| `weight` | `number` | No | `1.0` | Strength (0-1) |
| `metadata` | `object` | No | - | Optional metadata |

### Relation Types

| Type | Description |
|------|-------------|
| `references` | Generic reference |
| `implements` | Implementation of pattern |
| `extends` | Builds upon |
| `related_to` | Loosely related |
| `supersedes` | Replaces/updates |
| `requires` | Dependency |

---

## Usage Examples

### Basic Link

```
"Connect the user service memory to the database patterns memory"
```

```json
{
  "sourceId": "mem_user_service",
  "targetId": "mem_db_patterns",
  "type": "implements"
}
```

### With Weight

```
"Weakly link these two feature memories"
```

```json
{
  "sourceId": "mem_feature_a",
  "targetId": "mem_feature_b",
  "type": "related_to",
  "weight": 0.5
}
```

### With Metadata

```
"Link memories with context about why they're related"
```

```json
{
  "sourceId": "mem_new_auth",
  "targetId": "mem_old_auth",
  "type": "supersedes",
  "weight": 1.0,
  "metadata": {
    "reason": "Security vulnerability in old implementation",
    "migrationDate": "2025-01-15",
    "ticket": "SEC-1234"
  }
}
```

### Implementation Link

```
"The PostgresUserRepo implements the IUserRepository pattern"
```

```json
{
  "sourceId": "mem_postgres_user_repo",
  "targetId": "mem_iuser_repository",
  "type": "implements",
  "weight": 1.0
}
```

### Dependency Link

```
"The auth handler requires the JWT service"
```

```json
{
  "sourceId": "mem_auth_handler",
  "targetId": "mem_jwt_service",
  "type": "requires",
  "weight": 1.0
}
```

---

## Response Schema

```typescript
interface LinkMemoriesResult {
  relation: {
    id: string;            // Unique relation ID
    sourceId: string;      // Source memory ID
    targetId: string;      // Target memory ID
    type: string;          // Relation type
    weight: number;        // Relationship strength
    metadata?: object;     // Optional metadata
    createdAt: number;     // Timestamp
  };
  message: string;
}
```

---

## Behavior

### Upsert Logic

If a relationship already exists between the same source, target, and type, the operation **updates** the existing relationship (weight and metadata) rather than creating a duplicate.

```json
// First call creates
{ "sourceId": "a", "targetId": "b", "type": "references", "weight": 0.5 }

// Second call updates weight
{ "sourceId": "a", "targetId": "b", "type": "references", "weight": 1.0 }
```

### Different Types Allowed

The same pair can have multiple relationships of different types:

```json
// Memory A references B
{ "sourceId": "a", "targetId": "b", "type": "references" }

// Memory A also extends B
{ "sourceId": "a", "targetId": "b", "type": "extends" }
```

---

## Directionality

Relationships are **directional**. The meaning differs based on direction:

| Relation | Source → Target | Example |
|----------|-----------------|---------|
| `references` | Source cites target | "Auth doc references JWT spec" |
| `implements` | Source implements target | "UserService implements IUserService" |
| `extends` | Source extends target | "AdminAuth extends BaseAuth" |
| `supersedes` | Source replaces target | "v2 Auth supersedes v1 Auth" |
| `requires` | Source depends on target | "Login requires Auth" |

### Bidirectional Option

For truly bidirectional relationships, use `related_to`:

```json
{
  "sourceId": "mem_feature_a",
  "targetId": "mem_feature_b",
  "type": "related_to"
}
```

---

## Side Effects

### Supersedes Relations

Creating a `supersedes` relation marks the target memory as potentially stale:

```json
{
  "sourceId": "mem_new_api",
  "targetId": "mem_old_api",
  "type": "supersedes"
}
// → mem_old_api now detected as stale by staleness detection
```

---

## Error Cases

| Error | Cause | Resolution |
|-------|-------|------------|
| `Source memory not found` | Invalid sourceId | Verify memory exists |
| `Target memory not found` | Invalid targetId | Verify memory exists |
| `Invalid relation type` | Type not in enum | Use valid type |
| `Self-reference not allowed` | sourceId = targetId | Use different IDs |

---

## Best Practices

### Use Specific Types

```json
// Good: Specific type
{ "type": "implements" }

// Avoid: Overusing generic type
{ "type": "related_to" }
```

### Include Weights for Uncertainty

```json
// Definite relationship
{ "type": "supersedes", "weight": 1.0 }

// Tentative relationship
{ "type": "related_to", "weight": 0.6 }
```

### Add Metadata for Context

```json
{
  "type": "supersedes",
  "metadata": {
    "reason": "Breaking API change in v2",
    "migrationGuide": "See migration.md"
  }
}
```

---

## See Also

- [doclea_get_related](./get-related) - Find related memories
- [doclea_find_path](./find-path) - Find paths between memories
- [doclea_delete_relation](./delete-relation) - Remove relationships
- [Memory Relations Overview](./overview)
