---
sidebar_position: 2
title: doclea_suggest_crosslayer
description: Detect cross-layer relations between code and memory entities.
keywords: [doclea_suggest_crosslayer, detection, code-memory, KAG-RAG]
---

# doclea_suggest_crosslayer

Detect cross-layer relations between code and memory entities. Works from either direction - starting from a memory or a code node.

**Category:** Cross-Layer Relations
**Status:** Stable

---

## Quick Example

### From Memory

```
"Find code related to the auth documentation"
```

**Response:**

```json
{
  "result": {
    "entityId": "mem_auth_docs",
    "entityType": "memory",
    "autoApproved": [
      {
        "memoryId": "mem_auth_docs",
        "codeNodeId": "src/auth/service.ts:class:AuthService",
        "direction": "memory_to_code",
        "relationType": "documents",
        "confidence": 0.90,
        "reason": "Memory references `AuthService` which matches code node",
        "detectionMethod": "code_reference"
      }
    ],
    "suggestions": [
      {
        "id": "csug_xyz789",
        "memoryId": "mem_auth_docs",
        "codeNodeId": "src/auth/utils.ts:function:hashPassword",
        "direction": "memory_to_code",
        "relationType": "documents",
        "confidence": 0.75,
        "reason": "Memory references file containing hashPassword",
        "status": "pending"
      }
    ],
    "totalCandidates": 8,
    "filteredCount": 2
  },
  "message": "Detection complete for memory: 1 auto-approved, 2 suggestions created"
}
```

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `entityId` | `string` | Yes | - | Memory ID or code node ID |
| `entityType` | `string` | Yes | - | `"memory"` or `"code"` |
| `relationTypes` | `string[]` | No | All | Filter by relation types |
| `minConfidence` | `number` | No | `0.6` | Minimum confidence threshold |

### Relation Types

| Type | Direction | Description |
|------|-----------|-------------|
| `documents` | Memory → Code | Memory describes code |
| `addresses` | Code → Memory | Code implements decision |
| `exemplifies` | Code → Memory | Code demonstrates pattern |

---

## Usage Examples

### Memory to Code

```
"Find what code the JWT documentation references"
```

```json
{
  "entityId": "mem_jwt_docs",
  "entityType": "memory"
}
```

### Code to Memory

```
"Find documentation for the UserRepository class"
```

```json
{
  "entityId": "src/db/user-repo.ts:class:UserRepository",
  "entityType": "code"
}
```

### Filter by Type

```
"Find what decisions this service addresses"
```

```json
{
  "entityId": "src/services/auth.ts:class:AuthService",
  "entityType": "code",
  "relationTypes": ["addresses"]
}
```

### Custom Threshold

```
"Find high-confidence relations only"
```

```json
{
  "entityId": "mem_architecture",
  "entityType": "memory",
  "minConfidence": 0.8
}
```

---

## Response Schema

```typescript
interface SuggestCrossLayerResult {
  result: {
    entityId: string;
    entityType: "memory" | "code";
    autoApproved: CrossLayerCandidate[];
    suggestions: CrossLayerSuggestion[];
    totalCandidates: number;
    filteredCount: number;
  } | null;
  message: string;
}

interface CrossLayerCandidate {
  memoryId: string;
  codeNodeId: string;
  direction: "memory_to_code" | "code_to_memory";
  relationType: "documents" | "addresses" | "exemplifies";
  confidence: number;
  reason: string;
  detectionMethod: string;
  matchedReference?: string;
}

interface CrossLayerSuggestion {
  id: string;
  memoryId: string;
  codeNodeId: string;
  suggestedType: string;
  direction: string;
  confidence: number;
  reason: string;
  detectionMethod: string;
  status: "pending";
  createdAt: number;
}
```

---

## Detection Process

### From Memory

When `entityType: "memory"`:

1. **Code References** - Extract backtick-quoted names, match against KAG
2. **File Path Overlap** - Check `relatedFiles` against code graph

Both produce `documents` relationships (memory documents code).

### From Code

When `entityType: "code"`:

1. **Addresses Detection** - Match code against decision/architecture memories
2. **Exemplifies Detection** - Match code against pattern memories

Produces `addresses` or `exemplifies` relationships.

---

## Detection Methods

### `code_reference` (Memory → Code)

Finds explicit code references:

```markdown
The `AuthService.authenticate()` method validates credentials.
```

**Confidence:** 0.90 (explicit reference = high confidence)

### `file_path_match` (Memory → Code)

Matches `relatedFiles` to code graph:

```json
{
  "relatedFiles": ["src/auth/service.ts"]
}
```

Finds all code nodes in that file.

**Confidence:** 0.75 (file-level, not specific)

### `keyword_match` (Code → Memory)

Matches keywords between code and memory:

```
Code: UserRepository class
Memory: "Repository Pattern" with matching keywords
```

**Confidence:** 0.60-0.75 (based on overlap %)

---

## Auto-Approve vs Suggestions

| Confidence | Action |
|------------|--------|
| ≥0.85 | Auto-approved (relation created) |
| 0.6-0.85 | Suggestion created for review |
| <0.6 | Discarded |

### Auto-Approved Relations

Created immediately with metadata:

```json
{
  "metadata": {
    "detectionMethod": "code_reference",
    "reason": "Memory references `AuthService`",
    "autoApproved": true
  }
}
```

### Suggestions

Stored for review:

```json
{
  "id": "csug_abc123",
  "status": "pending"
}
```

Review later with `doclea_review_crosslayer`.

---

## Error Cases

| Error | Cause | Resolution |
|-------|-------|------------|
| `Memory not found` | Invalid memory ID | Verify memory exists |
| `Code node not found` | Invalid code node ID | Verify node exists in KAG |
| `Invalid entity type` | Not "memory" or "code" | Use valid type |

---

## Use Cases

### After Storing Memory

```json
// 1. Store memory with file refs
{
  "title": "Auth Service Docs",
  "relatedFiles": ["src/auth/service.ts"]
}

// 2. Detect cross-layer relations
{
  "entityId": "mem_new_auth_docs",
  "entityType": "memory"
}
```

### After Scanning Code

```json
// 1. Scan code
{ "patterns": ["**/*.ts"] }

// 2. For important code nodes, find related docs
{
  "entityId": "src/core/engine.ts:class:Engine",
  "entityType": "code"
}
```

### Verify Decision Implementation

```json
// Find what code addresses a decision
{
  "entityId": "mem_caching_decision",
  "entityType": "memory",
  "relationTypes": ["addresses"]
}
```

---

## See Also

- [doclea_get_code_for_memory](./get-code-for-memory) - Query existing relations
- [doclea_get_memories_for_code](./get-memories-for-code) - Query existing relations
- [doclea_review_crosslayer](./review-crosslayer) - Approve suggestions
- [Cross-Layer Overview](./overview)
