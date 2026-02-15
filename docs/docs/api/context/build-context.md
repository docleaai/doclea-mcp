---
sidebar_position: 2
title: doclea_context
description: Build formatted context from RAG and KAG within a token budget.
keywords: [doclea_context, context, RAG, KAG, build, assembly]
---

# doclea_context

Build formatted context from RAG (semantic search) and KAG (code relationships) within a token budget. Returns markdown-formatted context ready for LLM consumption.

**Category:** Context Building
**Status:** Stable

---

## Quick Example

```
"Build context about authentication"
```

**Response:**

```markdown
# Context for: authentication

## Relevant Memories

### JWT Authentication Strategy (decision)
We decided to use JWT tokens for API authentication...
*Tags: auth, security | Importance: 90%*

### Auth Middleware Pattern (pattern)
All authenticated routes use authMiddleware...
*Tags: auth, middleware | Importance: 75%*

## Code Relationships

### Code: validateToken
`validateToken` (function)
Called by: authMiddleware, refreshHandler
Calls: decodeJWT, verifySignature

---

**Metadata**: {
  "totalTokens": 1250,
  "sectionsIncluded": 4,
  "ragSections": 2,
  "kagSections": 1,
  "graphragSections": 1,
  "truncated": false,
  "route": "hybrid",
  "cacheHit": false
}
```

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | `string` | Yes | - | Search query to find relevant context |
| `tokenBudget` | `number` | No | `4000` | Maximum tokens (100-100,000) |
| `includeCodeGraph` | `boolean` | No | `true` | Include KAG code relationships |
| `includeGraphRAG` | `boolean` | No | `true` | Include GraphRAG entity/community retrieval |
| `filters` | `object` | No | - | Filters for memory search |
| `template` | `string` | No | `default` | Output format template |
| `includeEvidence` | `boolean` | No | `false` | Include structured section-level selection evidence |

### Filters Object

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Memory type: decision, solution, pattern, architecture, note |
| `tags` | `string[]` | Required tags |
| `minImportance` | `number` | Minimum importance (0-1) |

---

## Usage Examples

### Basic Context

```
"Get context about the database schema"
```

```json
{
  "query": "database schema"
}
```

### With Token Budget

```
"Build context about auth with 8000 token budget"
```

```json
{
  "query": "authentication flow",
  "tokenBudget": 8000
}
```

### Code-Only Context

```
"Get context about the API handlers without memories"
```

```json
{
  "query": "API handlers",
  "includeCodeGraph": true,
  "filters": {
    "type": "architecture"
  }
}
```

### Filtered Context

```
"Context about patterns tagged with 'performance'"
```

```json
{
  "query": "performance optimization",
  "filters": {
    "type": "pattern",
    "tags": ["performance"],
    "minImportance": 0.7
  }
}
```

### Compact Template

```
"Brief context about error handling"
```

```json
{
  "query": "error handling",
  "template": "compact"
}
```

### Disable GraphRAG

```json
{
  "query": "authentication flow",
  "includeGraphRAG": false
}
```

### With Evidence Mode

```
"Build context and show why each section was selected"
```

```json
{
  "query": "authentication strategy",
  "includeEvidence": true
}
```

---

## Response Schema

The tool returns formatted markdown with embedded metadata. When `includeEvidence` is `true`, it also includes a machine-readable evidence array.

### Context Structure

```markdown
# Context for: {query}

## Relevant Memories
{RAG sections sorted by relevance}

## Knowledge Graph Insights
{GraphRAG entity/community sections}

## Code Relationships
{KAG sections with call graphs and implementations}

---

**Metadata**: {JSON metadata}
```

### Metadata Object

```typescript
interface ContextMetadata {
  totalTokens: number;      // Actual token count
  sectionsIncluded: number; // Total sections
  ragSections: number;      // Memory sections count
  kagSections: number;      // Code sections count
  graphragSections: number; // Knowledge graph section count
  truncated: boolean;       // True if some results excluded
  route: "memory" | "code" | "hybrid";
  cacheHit: boolean;
}

interface ContextEvidenceItem {
  id: string;
  title: string;
  source: "rag" | "kag" | "graphrag";
  rank: number;
  relevance: number;
  rerankerScore?: number;
  rerankerBreakdown?: {
    semantic: number;
    sourceBalance: number;
    novelty: number;
    redundancyPenalty: number;
  };
  tokens: number;
  included: boolean;
  exclusionReason?: "token_budget";
  reason: string;
  queryTerms: string[];
  memory?: {
    id: string;
    type: "decision" | "solution" | "pattern" | "architecture" | "note";
    tags: string[];
    importance: number;
    relatedFiles: string[];
  };
  code?: {
    nodeId: string;
    nodeType: "function" | "class" | "interface" | "type" | "module" | "package";
    filePath: string;
    matchedEntity: string;
    callers: number;
    calls: number;
    implementations?: number;
  };
  graph?: {
    entityId: string;
    entityType: "PERSON" | "ORGANIZATION" | "TECHNOLOGY" | "CONCEPT" | "LOCATION" | "EVENT" | "PRODUCT" | "OTHER";
    mentionCount: number;
    relationshipCount: number;
    communityIds: string[];
    sourceMemoryIds: string[];
  };
}
```

---

## Templates

### default

Full content with tags and importance:

```markdown
### Memory Title (type)
Full content here...
*Tags: tag1, tag2 | Importance: 85%*
```

### compact

First line only - minimizes tokens:

```markdown
### Memory Title
First line of content...
```

### detailed

All available metadata included.

---

## Code Entity Extraction

The tool automatically extracts code entity names from your query:

- `camelCase` identifiers
- `PascalCase` class names
- Function calls like `functionName(`

These are used to look up relevant code graph entries.

---

## Budget Allocation

Within the token budget (adaptive by query intent):

| Source | Allocation | Purpose |
|--------|------------|---------|
| RAG | 75% (memory) / 55% (hybrid) / 20% (code) | Semantic memory search |
| KAG | 10% (memory) / 30% (hybrid) / 65% (code) | Code graph relationships |
| GraphRAG | 15% (all routes) | Entity + community graph retrieval |
| Overhead | ~200 | Headers and formatting |

Sections are ranked by a hybrid fusion reranker (semantic score + source-balance target + novelty coverage) and greedily selected until budget is exhausted. The selected route is returned in metadata.

---

## Caching

Results are automatically cached when caching is enabled:

- Cache key: hash of query + filters + template + scoring config
- Includes `includeGraphRAG` in cache key to isolate graph-enabled responses
- Includes `includeEvidence` in cache key to isolate evidence-mode responses
- Default TTL: 5 minutes
- Invalidated when referenced memories change

Check cache status with [doclea_cache_stats](../testing/cache-stats).

---

## See Also

- [Context Building Overview](./overview) - Architecture explanation
- [doclea_allocate_budget](../budget/allocate-budget) - Set token budget
- [doclea_search](../memory/search) - Underlying RAG search
- [doclea_scan_code](../code/scan-code) - Underlying KAG data
