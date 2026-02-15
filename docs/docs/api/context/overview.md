---
sidebar_position: 1
title: Context Building Overview
description: Build formatted context from RAG and KAG within token budgets.
keywords: [context, RAG, KAG, semantic, code, assembly]
---

# Context Building

Assemble formatted context from semantic memory search (RAG), code relationships (KAG), and GraphRAG entity/community insights within token budgets, with optional selection evidence for auditability.

## Why Context Building?

LLMs need relevant context to answer questions effectively. Doclea combines:

- **RAG** - Semantic search over memories (decisions, patterns, solutions)
- **KAG** - Code graph relationships (call graphs, implementations)
- **GraphRAG** - Entity and community knowledge graph context

The context builder assembles these into token-optimized markdown.

## Available Tools

| Tool | Description |
|------|-------------|
| [doclea_context](./build-context) | Build combined RAG+KAG+GraphRAG context |

## How It Works

```
┌─────────────────────────────────────────────────┐
│                   Query                          │
└─────────────────────┬───────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌───────────────┐   ┌───────────────┐   ┌─────────────────┐
│     RAG       │   │     KAG       │   │    GraphRAG     │
│ (adaptive %)  │   │ (adaptive %)  │   │   (adaptive %)  │
└───────────────┘   └───────────────┘   └─────────────────┘
        │                   │                    │
        ▼                   ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌─────────────────┐
│ Memory Search │   │ Code Graph    │   │ Entity/Community│
│ - Embeddings  │   │ - Call Graph  │   │ - Relationships │
│ - Scoring     │   │ - Implements  │   │ - Reports       │
└───────────────┘   └───────────────┘   └─────────────────┘
        │                   │                    │
        └───────────────────┴────────────┬───────┘
                      ▼
        ┌─────────────────────────┐
        │ Hybrid Fusion Reranker  │
        │   Fit Within Budget     │
        └─────────────┬───────────┘
                      ▼
        ┌─────────────────────────┐
        │   Format as Markdown    │
        └─────────────────────────┘
```

## Token Allocation

Adaptive allocation by detected query intent:

| Source | Percentage | Purpose |
|--------|------------|---------|
| RAG | 75% (memory) / 55% (hybrid) / 20% (code) | Semantic memory search |
| KAG | 10% (memory) / 30% (hybrid) / 65% (code) | Code relationships |
| GraphRAG | 15% (all routes) | Entity/community graph insights |
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

## Evidence Mode

Set `includeEvidence: true` in `doclea_context` to return a structured list of why each section was selected, including:

- similarity/relevance signal
- matched query terms
- provenance metadata (memory IDs/types or code node details)
- whether a candidate section was excluded by token budget

Evidence entries also include reranker diagnostics (`rerankerScore`, semantic/source-balance/novelty components) so you can tune retrieval behavior.

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
