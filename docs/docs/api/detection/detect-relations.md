---
sidebar_position: 2
title: doclea_detect_relations
description: Run relation detection for a memory to find potential connections.
keywords: [doclea_detect_relations, detection, auto-link, suggestions]
---

# doclea_detect_relations

Run relation detection for a memory to find potential connections. Uses semantic, keyword, file, and temporal strategies.

**Category:** Relation Detection
**Status:** Stable

---

## Quick Example

```
"Find relations for the authentication memory"
```

**Response:**

```json
{
  "result": {
    "sourceId": "mem_auth_handler",
    "autoApproved": [
      {
        "targetId": "mem_jwt_service",
        "confidence": 0.91,
        "reason": "Semantic similarity: 91.2%",
        "detectionMethod": "semantic",
        "suggestedType": "requires"
      }
    ],
    "suggestions": [
      {
        "id": "sug_xyz789",
        "sourceId": "mem_auth_handler",
        "targetId": "mem_session_utils",
        "suggestedType": "related_to",
        "confidence": 0.72,
        "reason": "Keyword overlap: 45.0% match on tags",
        "detectionMethod": "keyword",
        "status": "pending"
      }
    ],
    "totalCandidates": 15,
    "filteredCount": 3
  },
  "message": "Detection complete: 1 auto-approved, 2 suggestions created (15 candidates, 3 filtered)"
}
```

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `memoryId` | `string` | Yes | - | Memory ID to detect relations for |
| `semanticThreshold` | `number` | No | `0.75` | Min semantic similarity (0-1) |
| `autoApproveThreshold` | `number` | No | `0.85` | Confidence for auto-approval (0-1) |

---

## Usage Examples

### Basic Detection

```
"Detect relations for the API documentation memory"
```

```json
{
  "memoryId": "mem_api_docs"
}
```

### Custom Semantic Threshold

```
"Find highly similar memories (90%+ match)"
```

```json
{
  "memoryId": "mem_architecture_decision",
  "semanticThreshold": 0.90
}
```

### Stricter Auto-Approve

```
"Only auto-approve very confident matches"
```

```json
{
  "memoryId": "mem_critical_pattern",
  "autoApproveThreshold": 0.95
}
```

### Looser Matching

```
"Find any potentially related memories"
```

```json
{
  "memoryId": "mem_new_feature",
  "semanticThreshold": 0.65
}
```

---

## Response Schema

```typescript
interface DetectRelationsResult {
  result: {
    sourceId: string;
    autoApproved: RelationCandidate[];
    suggestions: RelationSuggestion[];
    totalCandidates: number;
    filteredCount: number;
  } | null;
  message: string;
}

interface RelationCandidate {
  targetId: string;
  confidence: number;
  reason: string;
  detectionMethod: "semantic" | "keyword" | "file_overlap" | "temporal";
  suggestedType: string;
}

interface RelationSuggestion {
  id: string;
  sourceId: string;
  targetId: string;
  suggestedType: string;
  confidence: number;
  reason: string;
  detectionMethod: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}
```

---

## Detection Process

### Step 1: Run Strategies

All four strategies run in parallel:

```
├── Semantic: Vector similarity search
├── Keyword: Tag/keyword overlap
├── File: Shared file references
└── Temporal: Creation time proximity
```

### Step 2: Merge & Deduplicate

Results are merged, keeping highest confidence for duplicates:

```
Memory A found by semantic (0.85) and keyword (0.70)
→ Keeps semantic result (0.85), combines reasons
```

### Step 3: Filter

Removes:
- Self-references
- Existing relations
- Candidates below threshold

### Step 4: Enrich

Infers the most appropriate relation type for each candidate.

### Step 5: Process

| Confidence | Action |
|------------|--------|
| ≥0.85 | Create relation (auto-approve) |
| 0.6-0.85 | Store as suggestion |
| <0.6 | Discard |

---

## Auto-Approved Relations

High-confidence matches are created immediately:

```json
{
  "autoApproved": [
    {
      "targetId": "mem_jwt_utils",
      "confidence": 0.92,
      "reason": "Semantic similarity: 92.1%",
      "suggestedType": "requires"
    }
  ]
}
```

These are stored with metadata:

```json
{
  "metadata": {
    "detectionMethod": "semantic",
    "reason": "Semantic similarity: 92.1%",
    "autoApproved": true
  }
}
```

---

## Suggestions

Medium-confidence matches are stored for review:

```json
{
  "suggestions": [
    {
      "id": "sug_abc123",
      "confidence": 0.78,
      "status": "pending"
    }
  ]
}
```

Review later with:
- `doclea_get_suggestions`
- `doclea_review_suggestion`
- `doclea_bulk_review`

---

## Detection Methods

### `semantic`

Uses vector embeddings to find conceptually similar memories:

```json
{
  "reason": "Semantic similarity: 87.3%",
  "detectionMethod": "semantic"
}
```

### `keyword`

Matches tags and extracted keywords:

```json
{
  "reason": "Keyword overlap: 55.0% match on tags",
  "detectionMethod": "keyword"
}
```

### `file_overlap`

Finds memories referencing shared files:

```json
{
  "reason": "File overlap: 2 shared file(s) - src/auth/jwt.ts, src/auth/types.ts",
  "detectionMethod": "file_overlap"
}
```

### `temporal`

Detects memories created within the time window:

```json
{
  "reason": "Temporal proximity: created 2.5 days apart",
  "detectionMethod": "temporal"
}
```

---

## Error Cases

| Error | Cause | Resolution |
|-------|-------|------------|
| `Memory not found` | Invalid memoryId | Verify memory exists |
| `No vector store` | Vectors not configured | Semantic detection skipped |
| `No embeddings` | Embeddings not configured | Semantic detection skipped |

---

## Performance

| Strategy | Time |
|----------|------|
| Semantic | ~100ms |
| Keyword | ~10ms |
| File overlap | ~20ms |
| Temporal | ~10ms |
| **Total** | ~150ms |

Strategies run in parallel, so total time ≈ slowest strategy.

---

## When to Use

### On Memory Creation

```json
// Auto-detect after storing
{
  "memoryId": "mem_just_created"
}
```

### After Major Updates

```json
// Re-run detection after significant changes
{
  "memoryId": "mem_updated_content"
}
```

### Batch Detection

For bulk detection, call for each memory:

```
for each memory in memories:
  doclea_detect_relations({ memoryId: memory.id })
```

---

## See Also

- [doclea_get_suggestions](./get-suggestions) - View pending suggestions
- [doclea_review_suggestion](./review-suggestion) - Approve/reject
- [Relation Detection Overview](./overview)
