---
sidebar_position: 3
title: doclea_get_code_for_memory
description: Find code nodes linked to a memory.
keywords: [doclea_get_code_for_memory, code lookup, documentation]
---

# doclea_get_code_for_memory

Find code nodes that are linked to a memory. Shows what code a memory documents, or what code addresses/exemplifies the memory.

**Category:** Cross-Layer Relations
**Status:** Stable

---

## Quick Example

```
"What code is linked to the auth documentation?"
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
      "memoryId": "mem_auth_docs",
      "codeNodeId": "src/auth/jwt.ts:function:verifyToken",
      "relationType": "documents",
      "direction": "memory_to_code",
      "confidence": 0.88,
      "metadata": {
        "detectionMethod": "code_reference"
      },
      "createdAt": 1705432800000
    }
  ],
  "message": "Found 2 code relations for memory"
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `memoryId` | `string` | Yes | Memory ID to find code for |
| `relationType` | `string` | No | Filter by relation type |

### Relation Types

| Type | Direction | Description |
|------|-----------|-------------|
| `documents` | Memory → Code | Memory describes code |
| `addresses` | Code → Memory | Code implements memory |
| `exemplifies` | Code → Memory | Code demonstrates memory |

---

## Usage Examples

### All Related Code

```
"Show all code linked to this memory"
```

```json
{
  "memoryId": "mem_repository_pattern"
}
```

### Documented Code Only

```
"What code does this memory document?"
```

```json
{
  "memoryId": "mem_api_docs",
  "relationType": "documents"
}
```

### Code That Addresses

```
"What code implements this decision?"
```

```json
{
  "memoryId": "mem_caching_decision",
  "relationType": "addresses"
}
```

### Code That Exemplifies

```
"What code demonstrates this pattern?"
```

```json
{
  "memoryId": "mem_singleton_pattern",
  "relationType": "exemplifies"
}
```

---

## Response Schema

```typescript
interface GetCodeForMemoryResult {
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

## Code Node IDs

Code node IDs follow the format:

```
{filePath}:{nodeType}:{nodeName}
```

Examples:
- `src/auth/service.ts:class:AuthService`
- `src/utils/hash.ts:function:hashPassword`
- `src/types/user.ts:interface:User`

---

## Use Cases

### Documentation Lookup

```
"I wrote docs about auth - what code does it cover?"
```

```json
{ "memoryId": "mem_auth_overview" }
```

### Decision Verification

```
"What code implements our caching decision?"
```

```json
{
  "memoryId": "mem_caching_decision",
  "relationType": "addresses"
}
```

Returns code that implements the decision.

### Pattern Instances

```
"Show all implementations of the repository pattern"
```

```json
{
  "memoryId": "mem_repository_pattern",
  "relationType": "exemplifies"
}
```

### Context Building

When building context for a memory, include its linked code:

```typescript
const codeContext = await getCodeForMemory({ memoryId });
// Add code summaries to context
```

---

## Empty Results

No relations found when:

1. Memory has no cross-layer relations
2. Detection hasn't been run
3. Filter excludes all relations

### Next Steps

```json
// Run detection first
{
  "entityId": "mem_no_relations",
  "entityType": "memory"
}
```

---

## Error Cases

| Error | Cause | Resolution |
|-------|-------|------------|
| `Memory not found` | Invalid memoryId | Verify memory exists |

---

## See Also

- [doclea_get_memories_for_code](./get-memories-for-code) - Reverse lookup
- [doclea_suggest_crosslayer](./suggest-crosslayer) - Detect relations
- [Cross-Layer Overview](./overview)
