---
sidebar_position: 6
title: doclea_review_crosslayer
description: Approve or reject a single cross-layer relation suggestion.
keywords: [doclea_review_crosslayer, approve, reject, review]
---

# doclea_review_crosslayer

Approve or reject a single cross-layer relation suggestion. Approving creates the suggested relation between memory and code.

**Category:** Cross-Layer Relations
**Status:** Stable

---

## Quick Example

```
"Approve cross-layer suggestion csug_abc123"
```

**Response:**

```json
{
  "success": true,
  "relationCreated": true,
  "message": "Cross-layer suggestion approved successfully (relation created)"
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
"Approve the suggestion csug_abc123"
```

```json
{
  "suggestionId": "csug_abc123",
  "action": "approve"
}
```

**Result:** Creates cross-layer relation between memory and code.

### Reject

```
"Reject suggestion csug_def456"
```

```json
{
  "suggestionId": "csug_def456",
  "action": "reject"
}
```

**Result:** Marks as rejected; no relation created.

---

## Response Schema

```typescript
interface ReviewCrossLayerResult {
  success: boolean;          // Whether action succeeded
  relationCreated: boolean;  // True if relation was created (approve only)
  message: string;
}
```

### Approve Success

```json
{
  "success": true,
  "relationCreated": true,
  "message": "Cross-layer suggestion approved successfully (relation created)"
}
```

### Reject Success

```json
{
  "success": true,
  "relationCreated": false,
  "message": "Cross-layer suggestion rejected successfully"
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
2. Cross-layer relation created with:
   - Memory ID from suggestion
   - Code node ID from suggestion
   - Relation type from `suggestedType`
   - Direction from suggestion
   - Confidence as weight
   - Detection metadata preserved

### On Reject

1. Suggestion status → `rejected`
2. No relation created
3. Won't be suggested again

---

## Relation Created

Approved relations include metadata:

```json
{
  "id": "clr_new123",
  "memoryId": "mem_auth_docs",
  "codeNodeId": "src/auth/service.ts:class:AuthService",
  "relationType": "documents",
  "direction": "memory_to_code",
  "confidence": 0.75,
  "metadata": {
    "detectionMethod": "file_path_match",
    "reason": "Memory references file containing AuthService",
    "approvedFromSuggestion": true,
    "suggestionId": "csug_abc123"
  },
  "createdAt": 1705432800000
}
```

---

## Review Workflow

### 1. Get Suggestions

```json
// doclea_get_crosslayer_suggestions
{ "limit": 10, "minConfidence": 0.7 }
```

### 2. Examine Each

For each suggestion:
- Review the memory content
- Review the code node (via `doclea_get_code_node`)
- Check the suggested relation type
- Verify the detection reason

### 3. Decide

```json
// Good match
{ "suggestionId": "csug_abc123", "action": "approve" }

// False positive
{ "suggestionId": "csug_def456", "action": "reject" }
```

---

## When to Approve

| Indicator | Action |
|-----------|--------|
| Memory clearly describes the code | Approve |
| Code clearly implements the decision | Approve |
| Code demonstrates the documented pattern | Approve |
| Detection reason makes sense | Approve |

## When to Reject

| Indicator | Action |
|-----------|--------|
| Coincidental file match | Reject |
| Keyword overlap but unrelated | Reject |
| Wrong relation direction | Reject |
| Code doesn't actually implement decision | Reject |

---

## Changing Relation Type

If the relation is valid but wrong type:

1. Reject the suggestion
2. Create manually with correct type:

```json
// Manual cross-layer relation (if supported)
// Or use the relations that was created and update
```

---

## Error Cases

| Error | Cause | Resolution |
|-------|-------|------------|
| `Suggestion not found` | Invalid ID | Check ID exists |
| `Already reviewed` | Previously processed | No action needed |
| `Invalid action` | Not "approve"/"reject" | Use valid action |

---

## See Also

- [doclea_bulk_review_crosslayer](./bulk-review-crosslayer) - Batch review
- [doclea_get_crosslayer_suggestions](./get-crosslayer-suggestions) - View pending
- [Cross-Layer Overview](./overview)
