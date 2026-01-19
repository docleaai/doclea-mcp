---
sidebar_position: 4
title: doclea_get_memories_for_code
description: Find memories linked to a code node.
keywords: [doclea_get_memories_for_code, memory lookup, code documentation]
---

# doclea_get_memories_for_code

Find memories that are linked to a code node. Shows what documentation exists for code, or what decisions/patterns the code implements.

**Category:** Cross-Layer Relations
**Status:** Stable

---

## Quick Example

```
"What documentation exists for AuthService?"
```

**Response:**

```json
{
  "relations": [
    {
      "id": "clr_abc123",
      "memoryId": "mem_auth_docs",
      "codeNodeId": "src/auth/service.ts:class:AuthService",
      "relationType": "documents",
      "direction": "memory_to_code",
      "confidence": 0.92,
      "metadata": {
        "detectionMethod": "code_reference",
        "reason": "Memory references `AuthService`"
      },
      "createdAt": 1705432800000
    },
    {
      "id": "clr_def456",
      "memoryId": "mem_jwt_decision",
      "codeNodeId": "src/auth/service.ts:class:AuthService",
      "relationType": "addresses",
      "direction": "code_to_memory",
      "confidence": 0.78,
      "metadata": {
        "detectionMethod": "keyword_match"
      },
      "createdAt": 1705432800000
    }
  ],
  "message": "Found 2 memory relations for code node"
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `codeNodeId` | `string` | Yes | Code node ID to find memories for |
| `relationType` | `string` | No | Filter by relation type |

### Relation Types

| Type | Direction | Description |
|------|-----------|-------------|
| `documents` | Memory → Code | Memories documenting this code |
| `addresses` | Code → Memory | Decisions this code implements |
| `exemplifies` | Code → Memory | Patterns this code demonstrates |

---

## Usage Examples

### All Related Memories

```
"Show all documentation for this class"
```

```json
{
  "codeNodeId": "src/services/user.ts:class:UserService"
}
```

### Documentation Only

```
"Find docs that describe this function"
```

```json
{
  "codeNodeId": "src/api/handler.ts:function:handleRequest",
  "relationType": "documents"
}
```

### Decisions Addressed

```
"What decisions does this code implement?"
```

```json
{
  "codeNodeId": "src/cache/redis.ts:class:RedisCache",
  "relationType": "addresses"
}
```

### Patterns Exemplified

```
"What patterns does this class demonstrate?"
```

```json
{
  "codeNodeId": "src/db/user-repo.ts:class:UserRepository",
  "relationType": "exemplifies"
}
```

---

## Response Schema

```typescript
interface GetMemoriesForCodeResult {
  relations: CrossLayerRelation[];
  message: string;
}

interface CrossLayerRelation {
  id: string;                    // Relation ID
  memoryId: string;              // Memory ID
  codeNodeId: string;            // Code node ID
  relationType: string;          // documents | addresses | exemplifies
  direction: string;             // memory_to_code | code_to_memory
  confidence: number;            // Detection confidence
  metadata?: {
    detectionMethod: string;     // How it was detected
    reason: string;              // Human-readable reason
    matchedReference?: string;   // What was matched
  };
  createdAt: number;             // Timestamp
}
```

---

## Code Node ID Format

```
{filePath}:{nodeType}:{nodeName}
```

Examples:
- `src/auth/service.ts:class:AuthService`
- `src/utils/hash.ts:function:hashPassword`
- `src/types/user.ts:interface:User`

### Finding Code Node IDs

Use `doclea_get_code_node` to find IDs:

```json
{
  "name": "AuthService"
}
```

---

## Use Cases

### Code Context

```
"I'm working on AuthService - what should I know?"
```

```json
{ "codeNodeId": "src/auth/service.ts:class:AuthService" }
```

Returns all related documentation, decisions, and patterns.

### Before Refactoring

```
"What documentation references this code?"
```

If you change the code, these memories may need updates.

### Understanding Rationale

```
"Why is this code implemented this way?"
```

```json
{
  "codeNodeId": "src/core/engine.ts:class:Engine",
  "relationType": "addresses"
}
```

Returns decisions that explain the implementation choices.

### Pattern Discovery

```
"What patterns does this codebase use?"
```

Query exemplifies relations to find pattern implementations.

---

## Relation Directions

| Relation | Source | Target | Meaning |
|----------|--------|--------|---------|
| `documents` | Memory | Code | Memory describes code |
| `addresses` | Code | Memory | Code implements memory |
| `exemplifies` | Code | Memory | Code demonstrates memory |

When querying by code, you get:
- **documents**: Memories that document this code
- **addresses**: Memories (decisions) this code implements
- **exemplifies**: Memories (patterns) this code demonstrates

---

## Empty Results

No relations found when:

1. Code node has no cross-layer relations
2. Detection hasn't been run
3. Filter excludes all relations

### Next Steps

```json
// Run detection for this code node
{
  "entityId": "src/new-code.ts:class:NewClass",
  "entityType": "code"
}
```

---

## Error Cases

| Error | Cause | Resolution |
|-------|-------|------------|
| `Code node not found` | Invalid ID | Verify node exists in KAG |

---

## See Also

- [doclea_get_code_for_memory](./get-code-for-memory) - Reverse lookup
- [doclea_suggest_crosslayer](./suggest-crosslayer) - Detect relations
- [doclea_get_code_node](../code/get-node) - Find code node IDs
- [Cross-Layer Overview](./overview)
