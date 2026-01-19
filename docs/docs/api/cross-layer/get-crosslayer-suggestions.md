---
sidebar_position: 5
title: doclea_get_crosslayer_suggestions
description: Get pending cross-layer relation suggestions for review.
keywords: [doclea_get_crosslayer_suggestions, suggestions, pending, review]
---

# doclea_get_crosslayer_suggestions

Get pending cross-layer relation suggestions awaiting review. Filter by memory, code node, method, or confidence.

**Category:** Cross-Layer Relations
**Status:** Stable

---

## Quick Example

```
"Show pending cross-layer suggestions"
```

**Response:**

```json
{
  "suggestions": [
    {
      "id": "csug_abc123",
      "memoryId": "mem_auth_docs",
      "codeNodeId": "src/auth/utils.ts:function:hashPassword",
      "suggestedType": "documents",
      "direction": "memory_to_code",
      "confidence": 0.75,
      "reason": "Memory references file containing hashPassword",
      "detectionMethod": "file_path_match",
      "status": "pending",
      "createdAt": 1705432800000
    },
    {
      "id": "csug_def456",
      "memoryId": "mem_singleton_pattern",
      "codeNodeId": "src/services/config.ts:class:ConfigService",
      "suggestedType": "exemplifies",
      "direction": "code_to_memory",
      "confidence": 0.68,
      "reason": "Code may demonstrate pattern (42% keyword match)",
      "detectionMethod": "keyword_match",
      "status": "pending",
      "createdAt": 1705432700000
    }
  ],
  "total": 12,
  "message": "Found 2 pending cross-layer suggestions (12 total)"
}
```

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `memoryId` | `string` | No | - | Filter by memory ID |
| `codeNodeId` | `string` | No | - | Filter by code node ID |
| `detectionMethod` | `string` | No | - | Filter by detection method |
| `minConfidence` | `number` | No | - | Minimum confidence score |
| `limit` | `number` | No | `20` | Max results (1-100) |
| `offset` | `number` | No | `0` | Pagination offset |

### Detection Methods

| Method | Description |
|--------|-------------|
| `code_reference` | Backtick code refs in memory |
| `file_path_match` | File overlap |
| `keyword_match` | Keyword similarity |

---

## Usage Examples

### All Pending

```
"Show all pending cross-layer suggestions"
```

```json
{
  "limit": 50
}
```

### By Memory

```
"Suggestions for the auth documentation"
```

```json
{
  "memoryId": "mem_auth_docs"
}
```

### By Code Node

```
"Suggestions involving the UserService"
```

```json
{
  "codeNodeId": "src/services/user.ts:class:UserService"
}
```

### By Detection Method

```
"Show code reference suggestions"
```

```json
{
  "detectionMethod": "code_reference"
}
```

### High Confidence

```
"Show confident suggestions (70%+)"
```

```json
{
  "minConfidence": 0.70
}
```

### Paginated

```
"Show next page of suggestions"
```

```json
{
  "limit": 20,
  "offset": 20
}
```

---

## Response Schema

```typescript
interface GetCrossLayerSuggestionsResult {
  suggestions: CrossLayerSuggestion[];
  total: number;
  message: string;
}

interface CrossLayerSuggestion {
  id: string;                    // Suggestion ID
  memoryId: string;              // Memory ID
  codeNodeId: string;            // Code node ID
  suggestedType: string;         // documents | addresses | exemplifies
  direction: string;             // memory_to_code | code_to_memory
  confidence: number;            // Detection confidence (0-1)
  reason: string;                // Human-readable explanation
  detectionMethod: string;       // How it was detected
  status: "pending";             // Always pending for this query
  createdAt: number;             // Detection timestamp
}
```

---

## Suggested Types

| Type | Direction | Detected For |
|------|-----------|--------------|
| `documents` | Memory → Code | Memories referencing code |
| `addresses` | Code → Memory | Code matching decisions |
| `exemplifies` | Code → Memory | Code matching patterns |

---

## Workflow

### 1. Check Pending Count

```json
{ "limit": 1 }
// Check "total" in response
```

### 2. Review High Confidence First

```json
{
  "minConfidence": 0.75,
  "limit": 10
}
```

### 3. Process by Type

```json
// Review documents first (usually more accurate)
{ "detectionMethod": "code_reference" }

// Then file matches
{ "detectionMethod": "file_path_match" }

// Finally keyword matches (more noise)
{ "detectionMethod": "keyword_match" }
```

### 4. Approve/Reject

Use `doclea_review_crosslayer` or `doclea_bulk_review_crosslayer`.

---

## Filtering Strategies

### Focus on Specific Memory

When working on documentation:

```json
{
  "memoryId": "mem_current_docs"
}
```

### Focus on Specific Code

When maintaining a component:

```json
{
  "codeNodeId": "src/core/engine.ts:class:Engine"
}
```

### Trust Code References

Explicit code references have higher accuracy:

```json
{
  "detectionMethod": "code_reference",
  "minConfidence": 0.7
}
```

---

## Error Cases

| Error | Cause | Resolution |
|-------|-------|------------|
| `Invalid limit` | Limit < 1 or > 100 | Use valid range |
| `Invalid offset` | Negative offset | Use positive number |

---

## See Also

- [doclea_review_crosslayer](./review-crosslayer) - Approve/reject one
- [doclea_bulk_review_crosslayer](./bulk-review-crosslayer) - Batch review
- [doclea_suggest_crosslayer](./suggest-crosslayer) - Trigger detection
- [Cross-Layer Overview](./overview)
