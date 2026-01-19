---
sidebar_position: 11
title: doclea_get_unsummarized
description: Get code nodes that need AI-generated summaries.
keywords: [doclea_get_unsummarized, unsummarized, summary, AI, code]
---

# doclea_get_unsummarized

Get code nodes that need AI-generated summaries. Returns nodes with their code content for the LLM to analyze and generate summaries.

**Category:** Code Scanning (KAG)
**Status:** Stable

---

## Quick Example

```
"Get nodes that need summaries"
```

**Response:**

```json
{
  "message": "Found 15 nodes needing AI summaries",
  "total": 15,
  "nodes": [
    {
      "id": "src/api.ts:function:getUserData",
      "name": "getUserData",
      "type": "function",
      "filePath": "src/api.ts",
      "signature": "async function getUserData(id: string): Promise<User | null>",
      "code": "async function getUserData(id: string): Promise<User | null> {\n  const user = await db.users.findById(id);\n  if (!user) return null;\n  return sanitizeUser(user);\n}",
      "confidence": 0.3
    }
  ]
}
```

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `filePath` | `string` | No | - | Filter by file path |
| `limit` | `number` | No | `10` | Max nodes to return (1-50) |
| `includeCode` | `boolean` | No | `true` | Include code content |
| `confidenceThreshold` | `number` | No | `0.6` | Return nodes below this confidence |

---

## Usage Examples

### Get Top 10

```
"Get nodes needing summaries"
```

```json
{}
```

### Filter by File

```
"Get unsummarized nodes from auth module"
```

```json
{
  "filePath": "src/auth/",
  "limit": 20
}
```

### Low Confidence Only

```
"Get nodes with very poor summaries"
```

```json
{
  "confidenceThreshold": 0.3,
  "limit": 5
}
```

### Without Code (Faster)

```json
{
  "includeCode": false,
  "limit": 50
}
```

---

## Response Schema

```typescript
interface GetUnsummarizedResult {
  message: string;
  total: number;  // Total nodes needing summaries
  nodes: Array<{
    id: string;
    name: string;
    type: "function" | "class" | "interface" | "method";
    filePath: string;
    signature?: string;
    code?: string;       // Included if includeCode: true
    confidence: number;  // Current summary confidence (0-1)
  }>;
}
```

---

## Confidence Levels

| Confidence | Meaning |
|------------|---------|
| 0.0 - 0.3 | No summary or placeholder only |
| 0.3 - 0.5 | Basic heuristic extraction |
| 0.5 - 0.7 | Good heuristic, could be improved |
| 0.7 - 1.0 | AI-generated or high-quality |

---

## Workflow: AI Summarization

```typescript
// 1. Get nodes needing summaries
const result = await doclea_get_unsummarized({
  limit: 10,
  includeCode: true
});

// 2. Prepare batch for LLM
const summaries = [];
for (const node of result.nodes) {
  // Have LLM analyze the code
  const summary = await llm.generate(`
    Summarize this ${node.type}:
    ${node.code}
  `);

  summaries.push({
    nodeId: node.id,
    summary: summary
  });
}

// 3. Batch update summaries
await doclea_batch_update_summaries({ summaries });
```

---

## See Also

- [doclea_batch_update_summaries](./batch-update-summaries) - Update summaries
- [doclea_update_code_summary](./update-code-summary) - Update single summary
- [doclea_summarize](./summarize) - Full summarization workflow
