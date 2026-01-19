---
sidebar_position: 4
title: doclea_review_suggestion
description: Approve or reject a single relation suggestion.
keywords: [doclea_review_suggestion, approve, reject, review]
---

# doclea_review_suggestion

Approve or reject a single relation suggestion. Approving creates the suggested relation.

**Category:** Relation Detection
**Status:** Stable

---

## Quick Example

```
"Approve suggestion sug_abc123"
```

**Response:**

```json
{
  "success": true,
  "relationCreated": true,
  "message": "Suggestion approved successfully (relation created)"
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `suggestionId` | `string` | Yes | Suggestion ID to review |
| `action` | `string` | Yes | `"approve"` or `"reject"` |

---

## Usage Examples

### Approve

```
"Approve the suggestion sug_abc123"
```

```json
{
  "suggestionId": "sug_abc123",
  "action": "approve"
}
```

**Result:** Creates the suggested relation between the memories.

### Reject

```
"Reject suggestion sug_def456"
```

```json
{
  "suggestionId": "sug_def456",
  "action": "reject"
}
```

**Result:** Marks the suggestion as rejected; no relation created.

---

## Response Schema

```typescript
interface ReviewSuggestionResult {
  success: boolean;          // Whether the action succeeded
  relationCreated: boolean;  // True if relation was created (approve only)
  message: string;
}
```

### Approve Success

```json
{
  "success": true,
  "relationCreated": true,
  "message": "Suggestion approved successfully (relation created)"
}
```

### Reject Success

```json
{
  "success": true,
  "relationCreated": false,
  "message": "Suggestion rejected successfully"
}
```

### Not Found

```json
{
  "success": false,
  "relationCreated": false,
  "message": "Suggestion not found or already reviewed"
}
```

---

## Behavior

### On Approve

1. Suggestion status → `approved`
2. Relation created with:
   - Source/target from suggestion
   - Type from `suggestedType`
   - Confidence as weight
   - Metadata includes detection info

### On Reject

1. Suggestion status → `rejected`
2. No relation created
3. Same suggestion won't be created again

---

## Relation Metadata

Approved relations include metadata:

```json
{
  "relation": {
    "sourceId": "mem_auth_handler",
    "targetId": "mem_jwt_utils",
    "type": "requires",
    "weight": 0.78,
    "metadata": {
      "detectionMethod": "semantic",
      "reason": "Semantic similarity: 78.2%",
      "approvedFromSuggestion": true,
      "suggestionId": "sug_abc123"
    }
  }
}
```

---

## Workflow

### 1. Get Suggestions

```json
// doclea_get_suggestions
{ "limit": 10 }
```

### 2. Review Each

For each suggestion, examine:
- Source memory content
- Target memory content
- Suggested relation type
- Detection reason

### 3. Decide

```json
// Approve good matches
{ "suggestionId": "sug_abc123", "action": "approve" }

// Reject false positives
{ "suggestionId": "sug_def456", "action": "reject" }
```

### 4. Continue

Repeat until queue is cleared.

---

## When to Approve

| Indicator | Action |
|-----------|--------|
| Clear conceptual link | Approve |
| Source truly depends on target | Approve |
| Same topic, different aspects | Approve |
| Detection reason makes sense | Approve |

## When to Reject

| Indicator | Action |
|-----------|--------|
| Coincidental keyword match | Reject |
| Unrelated despite similarity score | Reject |
| Temporal proximity but no real link | Reject |
| Wrong relation direction | Reject (or create manually) |

---

## Changing Relation Type

If the suggested type is wrong but the link is valid:

1. Reject the suggestion
2. Create the correct relation manually:

```json
// doclea_link_memories
{
  "sourceId": "mem_a",
  "targetId": "mem_b",
  "type": "extends"  // Different from suggested "related_to"
}
```

---

## Idempotency

Reviewing an already-reviewed suggestion returns:

```json
{
  "success": false,
  "relationCreated": false,
  "message": "Suggestion not found or already reviewed"
}
```

---

## Error Cases

| Error | Cause | Resolution |
|-------|-------|------------|
| `Suggestion not found` | Invalid ID | Check suggestion exists |
| `Already reviewed` | Previously approved/rejected | No action needed |
| `Invalid action` | Not "approve" or "reject" | Use valid action |

---

## See Also

- [doclea_bulk_review](./bulk-review) - Batch review
- [doclea_get_suggestions](./get-suggestions) - View pending
- [doclea_detect_relations](./detect-relations) - Trigger detection
- [Relation Detection Overview](./overview)
