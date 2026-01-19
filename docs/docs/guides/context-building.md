---
sidebar_position: 5
title: Context Building
description: Build rich context for AI assistants using memories, tags, and knowledge graphs.
keywords: [context, RAG, knowledge graph, embeddings, semantic search, tagging]
---

# Context Building

Build rich, relevant context for AI assistants by combining semantic search, structured tags, and knowledge graphs.

---

## Overview

Doclea provides context to AI assistants through multiple mechanisms:

```
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│    Query      │────▶│   Retrieval   │────▶│   Context     │
│  "auth flow"  │     │  - Vector     │     │  - Memories   │
│               │     │  - Tags       │     │  - Relations  │
│               │     │  - Graph      │     │  - Patterns   │
└───────────────┘     └───────────────┘     └───────────────┘
```

---

## Context Retrieval Methods

### 1. Semantic Search (RAG)

Uses vector embeddings to find semantically similar content:

```
"Get context about authentication"
```

Returns memories where the content is semantically related, even if exact words don't match.

### 2. Tag-Based Filtering

Filter context by specific tags:

```json
{
  "query": "authentication",
  "tags": ["security", "backend"]
}
```

### 3. Knowledge Graph (KAG)

Traverse relationships between memories:

```json
{
  "query": "JWT implementation",
  "includeRelated": true
}
```

Returns the JWT memory plus related decisions, patterns, and notes.

---

## The Context Tool

### Basic Usage

```
"Get context for implementing user authentication"
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | What you need context for |
| `limit` | number | Maximum memories (default: 10) |
| `types` | string[] | Filter by memory types |
| `tags` | string[] | Filter by tags |
| `minRelevance` | number | Minimum relevance score (0-1) |
| `includeRelated` | boolean | Include related memories |

### Example Response

```json
{
  "context": [
    {
      "id": "mem_jwt",
      "type": "decision",
      "title": "JWT-based authentication",
      "content": "We chose JWT tokens for authentication because...",
      "relevance": 0.92,
      "tags": ["auth", "security", "jwt"],
      "relatedMemories": ["mem_refresh", "mem_session"]
    },
    {
      "id": "mem_auth_pattern",
      "type": "pattern",
      "title": "Auth middleware pattern",
      "content": "Authentication middleware validates tokens...",
      "relevance": 0.85,
      "tags": ["auth", "middleware", "pattern"]
    }
  ],
  "summary": "Found 2 relevant memories for 'user authentication'"
}
```

---

## Building Effective Context

### 1. Store Diverse Memory Types

Different types serve different purposes:

| Type | Purpose | Example |
|------|---------|---------|
| `decision` | Why we chose X | "Chose PostgreSQL for ACID compliance" |
| `solution` | How we solved Y | "Fixed race condition with mutex lock" |
| `pattern` | Reusable approach | "Repository pattern for data access" |
| `architecture` | System design | "Microservices with event bus" |
| `note` | General context | "API rate limits are 100/min" |

### 2. Use Descriptive Tags

Tags improve filtering and discovery:

```json
{
  "title": "JWT refresh token implementation",
  "tags": ["auth", "jwt", "security", "backend", "api"]
}
```

**Tag categories to consider:**
- Domain: `auth`, `payments`, `users`
- Layer: `frontend`, `backend`, `database`
- Type: `security`, `performance`, `ux`
- Technology: `react`, `postgres`, `redis`

### 3. Create Memory Relations

Link related memories for graph traversal:

```
"Link the JWT decision to the refresh token pattern"
```

Relation types:
- `related_to` - General relationship
- `implements` - Pattern implements decision
- `supersedes` - New decision replaces old
- `depends_on` - Memory depends on another

---

## Context Scoring

Doclea scores context relevance using multiple factors:

### Scoring Formula

```
score = (relevance × 0.3) + (importance × 0.4) + (recency × 0.3)
```

### Factors Explained

| Factor | Weight | Description |
|--------|--------|-------------|
| **Relevance** | 30% | Semantic similarity to query |
| **Importance** | 40% | User-assigned importance (0-1) |
| **Recency** | 30% | How recently accessed/updated |

### Customizing Weights

In `.doclea/config.json`:

```json
{
  "scoring": {
    "weights": {
      "recency": 0.2,
      "importance": 0.5,
      "relevance": 0.3
    }
  }
}
```

---

## Advanced Context Patterns

### 1. Task-Specific Context

Get context for a specific task:

```
"Get context for implementing password reset"
```

Doclea will retrieve:
- Related authentication decisions
- Security patterns
- Similar past solutions

### 2. File-Based Context

Get context for files you're working on:

```json
{
  "query": "context for src/auth/login.ts",
  "includeRelated": true
}
```

### 3. Layered Context

Build context progressively:

```
1. "Get high-level architecture context"
2. "Now get detailed auth context"
3. "Get the specific JWT implementation pattern"
```

### 4. Negative Context

Exclude certain types or tags:

```json
{
  "query": "authentication",
  "excludeTags": ["deprecated", "legacy"]
}
```

---

## Context for Different Tasks

### Code Generation

```
"Get context for writing a new API endpoint"
```

Returns:
- API design patterns
- Error handling approaches
- Authentication requirements

### Bug Fixing

```
"Get context about the payment processing flow"
```

Returns:
- How the system works
- Past bugs and solutions
- Related decisions

### Code Review

```
"Get context for reviewing auth changes"
```

Returns:
- Security requirements
- Coding patterns
- Architecture decisions

### Documentation

```
"Get context for documenting the user service"
```

Returns:
- Service architecture
- API contracts
- Related documentation

---

## Knowledge Graph Queries

### Traversing Relations

Find connected memories:

```json
{
  "memoryId": "mem_jwt",
  "action": "getRelated",
  "depth": 2
}
```

### Example Graph

```
                    ┌─────────────────┐
                    │ JWT Decision    │
                    │ (mem_jwt)       │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │ Refresh     │  │ Auth        │  │ Session     │
    │ Token       │  │ Middleware  │  │ Management  │
    │ Pattern     │  │ Pattern     │  │ Note        │
    └─────────────┘  └─────────────┘  └─────────────┘
```

### Graph Queries

```
"Show me all memories related to authentication within 2 hops"
```

---

## Embedding Models

### Local Embeddings (Default)

Zero-config uses local embeddings:

```json
{
  "embedding": {
    "provider": "local",
    "model": "all-MiniLM-L6-v2"
  }
}
```

**Pros**: No API key, works offline, free
**Cons**: Smaller model, less semantic understanding

### OpenAI Embeddings

For better quality:

```json
{
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "apiKey": "${OPENAI_API_KEY}"
  }
}
```

**Pros**: Better semantic understanding
**Cons**: Requires API key, cost per embedding

### Model Comparison

| Model | Dimensions | Quality | Speed |
|-------|------------|---------|-------|
| all-MiniLM-L6-v2 | 384 | Good | Fast |
| text-embedding-3-small | 1536 | Better | Medium |
| text-embedding-3-large | 3072 | Best | Slower |

---

## Optimizing Context Quality

### 1. Write Clear Titles

```
❌ "Auth stuff"
✅ "JWT authentication decision with refresh tokens"
```

### 2. Include Keywords in Content

```
❌ "We use tokens"
✅ "We use JWT tokens for stateless authentication,
    storing user ID and roles in the payload"
```

### 3. Maintain Tags

Regularly review and update tags:

```
"List all tags in use"
"Consolidate 'auth' and 'authentication' tags"
```

### 4. Prune Stale Memories

Remove outdated information:

```
"Show memories not accessed in 6 months"
"Archive superseded decisions"
```

---

## Context in Practice

### Example Workflow

1. **Store decisions as you make them:**
```
"Store decision: We chose PostgreSQL for the user database
because we need ACID compliance for financial transactions"
```

2. **Store patterns as you implement:**
```
"Store pattern: Repository pattern - all database access goes
through repository classes that abstract the underlying storage"
```

3. **Retrieve context when needed:**
```
"Get context for implementing the order service database layer"
```

4. **Context-aware AI responses:**
The AI uses retrieved context to:
- Follow established patterns
- Respect architectural decisions
- Maintain consistency

---

## Troubleshooting

### Low Relevance Scores

If context isn't relevant:
- Add more descriptive content to memories
- Use more specific tags
- Adjust scoring weights

### Missing Context

If expected memories aren't returned:
- Check memory types and tags
- Verify memory content matches query
- Increase limit parameter

### Slow Context Retrieval

For large databases:
- Use tag filtering to narrow scope
- Consider Postgres with pgvector
- Reduce embedding dimensions

---

## See Also

- [Memory Management](./memory-management) - Store and organize memories
- [doclea_context](../api/context/get) - Context retrieval API
- [Vector Search](../architecture/vector-search) - How search works
