---
sidebar_position: 12
title: doclea_batch_update_summaries
description: Batch update summaries for multiple code nodes.
keywords: [doclea_batch_update_summaries, batch, summary, code, AI]
---

# doclea_batch_update_summaries

Update summaries for multiple code nodes at once. Use this after generating AI summaries for nodes returned by `doclea_get_unsummarized` or `doclea_summarize`.

**Category:** Code Scanning (KAG)
**Status:** Stable

---

## Quick Example

```
"Update summaries for these nodes"
```

**Response:**

```json
{
  "success": true,
  "updated": 5,
  "failed": 0,
  "message": "Updated 5/5 summaries"
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `summaries` | `array` | Yes | Array of node ID + summary pairs |

### Summary Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `nodeId` | `string` | Yes | Node ID to update |
| `summary` | `string` | Yes | AI-generated summary |

---

## Usage Examples

### Basic Batch Update

```json
{
  "summaries": [
    {
      "nodeId": "src/api.ts:function:getUserData",
      "summary": "Retrieves user by ID from database. Returns null if not found."
    },
    {
      "nodeId": "src/api.ts:function:createUser",
      "summary": "Creates a new user with the given data. Throws if email already exists."
    },
    {
      "nodeId": "src/auth.ts:class:AuthService",
      "summary": "Handles authentication and authorization. Manages JWT tokens and sessions."
    }
  ]
}
```

---

## Response Schema

```typescript
interface BatchUpdateResult {
  success: boolean;
  updated: number;
  failed: number;
  message: string;
  errors?: Array<{
    nodeId: string;
    error: string;
  }>;
}
```

### Full Success

```json
{
  "success": true,
  "updated": 5,
  "failed": 0,
  "message": "Updated 5/5 summaries"
}
```

### Partial Success

```json
{
  "success": true,
  "updated": 3,
  "failed": 2,
  "message": "Updated 3/5 summaries (2 failed)",
  "errors": [
    { "nodeId": "src/old.ts:function:removed", "error": "Node not found" },
    { "nodeId": "invalid-id", "error": "Invalid node ID format" }
  ]
}
```

---

## Complete Workflow

```typescript
// Step 1: Get nodes needing summaries
const unsummarized = await doclea_get_unsummarized({
  limit: 20,
  includeCode: true
});

// Step 2: Generate summaries with LLM (your implementation)
const summaries = [];
for (const node of unsummarized.nodes) {
  const prompt = `
    Write a 1-2 sentence summary for this ${node.type}:

    Signature: ${node.signature}

    Code:
    ${node.code}

    Focus on: purpose, key parameters, return value, side effects.
  `;

  const summary = await llm.generate(prompt);
  summaries.push({ nodeId: node.id, summary });
}

// Step 3: Batch update all summaries
const result = await doclea_batch_update_summaries({ summaries });
console.log(result.message);  // "Updated 20/20 summaries"
```

---

## Best Practices

### Batch Size

- Keep batches under 50 nodes for reliability
- Process larger sets in multiple batches

### Error Handling

```typescript
const result = await doclea_batch_update_summaries({ summaries });

if (result.failed > 0) {
  console.log(`Failed nodes: ${result.errors.map(e => e.nodeId).join(', ')}`);
  // Retry or handle failures
}
```

### Incremental Updates

Run periodically to keep summaries up to date:

```typescript
// Get only low-confidence nodes
const nodes = await doclea_get_unsummarized({
  confidenceThreshold: 0.5,
  limit: 10
});

// Generate and update summaries...
```

---

## See Also

- [doclea_get_unsummarized](./get-unsummarized) - Get nodes needing summaries
- [doclea_update_code_summary](./update-code-summary) - Update single node
- [doclea_summarize](./summarize) - Full summarization workflow
