---
sidebar_position: 10
title: doclea_update_code_summary
description: Update a code node's summary with an AI-generated description.
keywords: [doclea_update_code_summary, summary, code, AI, update]
---

# doclea_update_code_summary

Update the summary for a single code node with an AI-generated summary. Use this after the LLM analyzes code returned by `doclea_get_unsummarized`.

**Category:** Code Scanning (KAG)
**Status:** Stable

---

## Quick Example

```
"Update summary for getUserData function"
```

**Response:**

```
Summary updated for node src/api.ts:function:getUserData
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | `string` | Yes | ID of the code node |
| `summary` | `string` | Yes | AI-generated summary |

---

## Usage Examples

### Update Single Node

```json
{
  "nodeId": "src/api.ts:function:getUserData",
  "summary": "Retrieves user data by ID from the database. Returns null if user not found. Throws AuthError if caller lacks permission."
}
```

### After AI Analysis

```typescript
// 1. Get nodes needing summaries
const nodes = await doclea_get_unsummarized({ limit: 5 });

// 2. For each node, have LLM analyze the code
for (const node of nodes.nodes) {
  // LLM analyzes node.code and generates summary
  const summary = await llm.analyze(node.code);

  // 3. Update the summary
  await doclea_update_code_summary({
    nodeId: node.id,
    summary: summary
  });
}
```

---

## Response Schema

```typescript
interface UpdateSummaryResult {
  success: boolean;
  message: string;
}
```

### Success

```json
{
  "success": true,
  "message": "Summary updated for node src/api.ts:function:getUserData"
}
```

### Node Not Found

```json
{
  "success": false,
  "message": "Node not found: src/api.ts:function:unknown"
}
```

---

## Summary Best Practices

Good summaries should:

- Start with a verb (Retrieves, Validates, Creates, etc.)
- Describe the primary purpose
- Mention key parameters and return values
- Note important side effects or exceptions
- Be 1-3 sentences

**Good:**
> Validates JWT tokens and extracts user claims. Returns decoded payload or throws InvalidTokenError if expired or malformed.

**Too brief:**
> Validates tokens.

**Too verbose:**
> This function is responsible for taking a JWT token as input and validating it by checking the signature and expiration date, and if valid it extracts the claims from the payload section...

---

## Batch Updates

For updating multiple nodes at once, use [doclea_batch_update_summaries](./batch-update-summaries) instead.

---

## See Also

- [doclea_get_unsummarized](./get-unsummarized) - Get nodes needing summaries
- [doclea_batch_update_summaries](./batch-update-summaries) - Update multiple
- [doclea_summarize](./summarize) - Run summarization workflow
