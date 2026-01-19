---
sidebar_position: 8
title: doclea_suggest_relations
description: Detect and suggest relationships between code and memory entities.
keywords: [doclea_suggest_relations, cross-layer, code, memory, detect]
---

# doclea_suggest_relations

Detect and suggest relationships between code and memory entities. This is an alternative entry point to cross-layer detection that works bidirectionally.

**Category:** Cross-Layer Relations
**Status:** Stable

---

## Quick Example

```
"Find code that relates to this memory"
```

**Response:**

```json
{
  "message": "Found 3 potential cross-layer relations",
  "result": {
    "suggestions": [
      {
        "id": "sug_abc123",
        "memoryId": "mem_xyz",
        "codeNodeId": "src/auth/jwt.ts:function:validateToken",
        "relationType": "documents",
        "confidence": 0.85,
        "detectionMethod": "keyword_match",
        "status": "pending"
      }
    ],
    "autoApproved": 1,
    "needsReview": 2
  }
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `entityId` | `string` | Yes | ID of the entity (memory or code node) |
| `entityType` | `string` | Yes | Type: `code` or `memory` |
| `relationTypes` | `string[]` | No | Filter by relation types |
| `minConfidence` | `number` | No | Minimum confidence (default: 0.6) |

### Entity Types

| Type | Starting From | Finds |
|------|---------------|-------|
| `memory` | A memory | Code that implements/documents it |
| `code` | A code node | Memories that document/address it |

### Relation Types

| Type | Direction | Meaning |
|------|-----------|---------|
| `documents` | memory → code | Memory documents the code |
| `addresses` | memory → code | Memory addresses issues in code |
| `exemplifies` | code → memory | Code exemplifies the pattern/decision |

---

## Usage Examples

### From Memory

```
"What code implements this auth decision?"
```

```json
{
  "entityId": "mem_auth_decision",
  "entityType": "memory",
  "relationTypes": ["documents", "addresses"]
}
```

### From Code

```
"What decisions affect this function?"
```

```json
{
  "entityId": "src/api.ts:function:handleRequest",
  "entityType": "code",
  "minConfidence": 0.7
}
```

### High Confidence Only

```json
{
  "entityId": "mem_pattern_123",
  "entityType": "memory",
  "minConfidence": 0.8
}
```

---

## Response Schema

```typescript
interface SuggestRelationsResult {
  message: string;
  result: {
    suggestions: Array<{
      id: string;
      memoryId: string;
      codeNodeId: string;
      relationType: "documents" | "addresses" | "exemplifies";
      confidence: number;
      detectionMethod: string;
      status: "pending" | "approved" | "rejected";
    }>;
    autoApproved: number;  // High confidence auto-approved
    needsReview: number;   // Pending human review
  };
}
```

---

## Detection Methods

| Method | Description | Typical Confidence |
|--------|-------------|-------------------|
| `code_reference` | Memory mentions code identifiers | 0.8-0.95 |
| `file_path_match` | Memory's relatedFiles match code | 0.7-0.85 |
| `keyword_match` | Semantic overlap in tags/content | 0.6-0.75 |
| `semantic_similarity` | Embedding similarity | 0.5-0.7 |

---

## Difference from suggest_crosslayer

| `doclea_suggest_relations` | `doclea_suggest_crosslayer` |
|---------------------------|----------------------------|
| Works from either direction | Memory-centric only |
| Single entity focus | Can scan multiple |
| Returns suggestions | Returns with grouping |

Use `suggest_relations` when you have a specific entity and want to find its connections bidirectionally.

---

## Workflow

```typescript
// 1. After storing a new memory
const memory = await doclea_store({ ... });

// 2. Find related code
const relations = await doclea_suggest_relations({
  entityId: memory.id,
  entityType: "memory"
});

// 3. Review high-confidence matches
for (const sug of relations.result.suggestions) {
  if (sug.confidence > 0.8) {
    await doclea_review_crosslayer({
      suggestionId: sug.id,
      action: "approve"
    });
  }
}
```

---

## See Also

- [doclea_suggest_crosslayer](./suggest-crosslayer) - Alternative detection method
- [doclea_get_crosslayer_suggestions](./get-crosslayer-suggestions) - View pending
- [doclea_review_crosslayer](./review-crosslayer) - Review suggestions
- [Cross-Layer Overview](./overview)
