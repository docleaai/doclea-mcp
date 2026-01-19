---
sidebar_position: 1
title: Context Building Overview
description: Build formatted context from RAG and KAG within token budgets.
keywords: [context, RAG, KAG, semantic, code, assembly]
---

# Context Building

Assemble formatted context from both semantic search (RAG) and code relationships (KAG) within token budgets.

## Why Context Building?

LLMs need relevant context to answer questions effectively. Doclea combines:

- **RAG** - Semantic search over memories (decisions, patterns, solutions)
- **KAG** - Code graph relationships (call graphs, implementations)

The context builder assembles these into token-optimized markdown.

## Available Tools

| Tool | Description |
|------|-------------|
| [doclea_context](./build-context) | Build combined RAG+KAG context |

## How It Works

```
┌─────────────────────────────────────────────────┐
│                   Query                          │
└─────────────────────┬───────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌───────────────┐           ┌───────────────┐
│     RAG       │           │     KAG       │
│ (70% budget)  │           │ (30% budget)  │
└───────────────┘           └───────────────┘
        │                           │
        ▼                           ▼
┌───────────────┐           ┌───────────────┐
│ Memory Search │           │ Code Graph    │
│ - Embeddings  │           │ - Call Graph  │
│ - Scoring     │           │ - Implements  │
└───────────────┘           └───────────────┘
        │                           │
        └─────────────┬─────────────┘
                      ▼
        ┌─────────────────────────┐
        │   Rank by Relevance     │
        │   Fit Within Budget     │
        └─────────────┬───────────┘
                      ▼
        ┌─────────────────────────┐
        │   Format as Markdown    │
        └─────────────────────────┘
```

## Token Allocation

Default allocation:

| Source | Percentage | Purpose |
|--------|------------|---------|
| RAG | 70% | Semantic memory search |
| KAG | 30% | Code relationships |
| Overhead | ~200 tokens | Headers, formatting |

## Output Templates

### default

Full content with metadata:

```markdown
# Context for: auth flow

## Relevant Memories

### JWT Token Strategy (decision)
We decided to use JWT for API auth...
*Tags: auth, jwt | Importance: 85%*

## Code Relationships

### Code: validateToken
`validateToken` (function)
Called by: authMiddleware, refreshHandler
Calls: decodeJWT, verifySignature
```

### compact

First line only for each section - minimizes tokens.

### detailed

Full content with all available metadata.

## Integration with Budget

```typescript
// 1. Allocate budget
const budget = await allocateBudget({
  model: "claude-3-5-sonnet-20241022",
  preset: "contextHeavy"
});

// 2. Build context using allocated budget
const context = await buildContext({
  query: "How does authentication work?",
  tokenBudget: budget.context,
  includeCodeGraph: true
});
```

## Caching

Context building supports automatic caching:

- LRU cache with configurable size
- TTL-based expiration (default: 5 minutes)
- Targeted invalidation when memories change

See [Cache Stats](../testing/cache-stats) for cache management.

## See Also

- [Token Budget Overview](../budget/overview) - Allocate token budgets
- [Memory Search](../memory/search) - Underlying RAG search
- [Code Scanning](../code/overview) - Underlying KAG queries
