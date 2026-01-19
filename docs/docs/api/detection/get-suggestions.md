---
sidebar_position: 3
title: doclea_get_suggestions
description: Get pending relation suggestions for review.
keywords: [doclea_get_suggestions, suggestions, review queue, pending]
---

# doclea_get_suggestions

Get pending relation suggestions awaiting review. Filter by memory, method, or confidence.

**Category:** Relation Detection
**Status:** Stable

---

## Quick Example

```
"Show pending relation suggestions"
```

**Response:**

```json
{
  "suggestions": [
    {
      "id": "sug_abc123",
      "sourceId": "mem_auth_handler",
      "targetId": "mem_jwt_utils",
      "suggestedType": "requires",
      "confidence": 0.78,
      "reason": "Semantic similarity: 78.2%",
      "detectionMethod": "semantic",
      "status": "pending",
      "createdAt": 1705432800000
    },
    {
      "id": "sug_def456",
      "sourceId": "mem_api_docs",
      "targetId": "mem_rest_patterns",
      "suggestedType": "references",
      "confidence": 0.72,
      "reason": "Keyword overlap: 45.0% match on tags",
      "detectionMethod": "keyword",
      "status": "pending",
      "createdAt": 1705432700000
    }
  ],
  "total": 15,
  "message": "Found 2 pending suggestions (15 total)"
}
```

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `sourceId` | `string` | No | - | Filter by source memory ID |
| `targetId` | `string` | No | - | Filter by target memory ID |
| `detectionMethod` | `string` | No | - | Filter by detection method |
| `minConfidence` | `number` | No | - | Minimum confidence score |
| `limit` | `number` | No | `20` | Max results (1-100) |
| `offset` | `number` | No | `0` | Pagination offset |

---

## Usage Examples

### All Pending

```
"Show all pending suggestions"
```

```json
{
  "limit": 50
}
```

### By Source Memory

```
"Show suggestions from the auth memory"
```

```json
{
  "sourceId": "mem_auth_handler"
}
```

### By Target Memory

```
"What suggests linking to the database memory?"
```

```json
{
  "targetId": "mem_database_docs"
}
```

### By Detection Method

```
"Show semantic similarity suggestions"
```

```json
{
  "detectionMethod": "semantic"
}
```

### High Confidence Only

```
"Show confident suggestions (75%+)"
```

```json
{
  "minConfidence": 0.75
}
```

### Paginated

```
"Show next 20 suggestions"
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
interface GetSuggestionsResult {
  suggestions: RelationSuggestion[];
  total: number;
  message: string;
}

interface RelationSuggestion {
  id: string;                    // Unique suggestion ID
  sourceId: string;              // Source memory ID
  targetId: string;              // Target memory ID
  suggestedType: string;         // Inferred relation type
  confidence: number;            // Detection confidence (0-1)
  reason: string;                // Human-readable explanation
  detectionMethod: string;       // How it was detected
  status: "pending";             // Always "pending" for this query
  createdAt: number;             // Detection timestamp
}
```

---

## Detection Methods

| Method | Description | Confidence Range |
|--------|-------------|------------------|
| `semantic` | Vector similarity | Often higher (0.75-0.85) |
| `keyword` | Tag/keyword overlap | Varies (0.6-0.8) |
| `file_overlap` | Shared file refs | Medium (0.65-0.8) |
| `temporal` | Created close together | Lower (0.6-0.7) |

### Filter by Method

```json
// Only semantic matches
{ "detectionMethod": "semantic" }

// Only keyword matches
{ "detectionMethod": "keyword" }

// Only file overlap
{ "detectionMethod": "file_overlap" }

// Only temporal
{ "detectionMethod": "temporal" }
```

---

## Workflow

### 1. Review Queue

Check pending suggestions regularly:

```json
{
  "limit": 10,
  "minConfidence": 0.7
}
```

### 2. Triage

Sort by confidence to review most likely first:

```json
{
  "minConfidence": 0.8,
  "limit": 10
}
```

### 3. Process

For each suggestion:
- Review source and target memories
- Approve if valid, reject if not
- Use `doclea_review_suggestion` or `doclea_bulk_review`

### 4. Repeat

Continue until queue is empty or manageable.

---

## Suggested Types

Suggestions include an inferred relation type:

| suggestedType | Meaning |
|---------------|---------|
| `references` | Generic reference |
| `implements` | Implementation pattern |
| `extends` | Builds upon |
| `related_to` | Loosely related |
| `supersedes` | Replaces |
| `requires` | Dependency |

When approving, the suggested type is used. You can change it later via `doclea_link_memories`.

---

## Pagination

For large queues, use pagination:

```json
// First page
{ "limit": 20, "offset": 0 }

// Second page
{ "limit": 20, "offset": 20 }

// Third page
{ "limit": 20, "offset": 40 }
```

The `total` field shows total pending count.

---

## Filtering Strategies

### High-Priority Review

Focus on high-confidence suggestions:

```json
{
  "minConfidence": 0.75,
  "limit": 20
}
```

### Specific Memory Review

Check suggestions for a particular memory:

```json
{
  "sourceId": "mem_important_decision"
}
```

### Method-Specific Review

Trust semantic matches more than temporal:

```json
{
  "detectionMethod": "semantic",
  "minConfidence": 0.70
}
```

---

## Status Values

This tool only returns `pending` suggestions. Other statuses:

| Status | Meaning | How to Access |
|--------|---------|---------------|
| `pending` | Awaiting review | This tool |
| `approved` | Relation created | Query relations |
| `rejected` | Marked invalid | N/A (discarded) |

---

## Error Cases

| Error | Cause | Resolution |
|-------|-------|------------|
| `Invalid limit` | Limit < 1 or > 100 | Use valid range |
| `Invalid offset` | Negative offset | Use positive number |

---

## See Also

- [doclea_review_suggestion](./review-suggestion) - Approve/reject one
- [doclea_bulk_review](./bulk-review) - Batch approve/reject
- [doclea_detect_relations](./detect-relations) - Trigger detection
- [Relation Detection Overview](./overview)
