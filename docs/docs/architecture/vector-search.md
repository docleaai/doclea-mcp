---
sidebar_position: 2
title: Vector Search
description: How Doclea uses vector embeddings and semantic search to retrieve relevant context.
keywords: [vector, embeddings, semantic search, HNSW, RAG, similarity]
---

# Vector Search

Understanding how Doclea uses vector embeddings and semantic search to retrieve relevant context.

---

## Overview

Doclea uses Retrieval-Augmented Generation (RAG) to find semantically relevant memories. Instead of exact keyword matching, it understands the meaning of your queries.

```
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│    Query      │────▶│   Embedding   │────▶│  Vector DB    │
│  "auth flow"  │     │   Model       │     │   (HNSW)      │
└───────────────┘     └───────────────┘     └───────────────┘
                              │                     │
                              ▼                     ▼
                      [0.12, 0.45, ...]    Nearest Neighbors
                                                   │
                              ┌─────────────────────┘
                              ▼
                    ┌───────────────────┐
                    │  Relevant         │
                    │  Memories         │
                    └───────────────────┘
```

---

## How It Works

### 1. Embedding Generation

When a memory is stored, its content is converted to a vector embedding:

```
Memory: "We use JWT tokens for authentication"
         ↓
  Embedding Model
         ↓
Vector: [0.12, 0.45, -0.23, 0.67, ...]  (384-3072 dimensions)
```

### 2. Vector Storage

The embedding is stored alongside the memory in the vector index:

```
memories table:
┌──────────┬─────────────────────────────────────┐
│ id       │ content                             │
├──────────┼─────────────────────────────────────┤
│ mem_123  │ "We use JWT tokens for auth..."     │
└──────────┴─────────────────────────────────────┘

vectors table:
┌──────────┬─────────────────────────────────────┐
│ mem_id   │ embedding                           │
├──────────┼─────────────────────────────────────┤
│ mem_123  │ [0.12, 0.45, -0.23, 0.67, ...]     │
└──────────┴─────────────────────────────────────┘
```

### 3. Similarity Search

When querying, the query is also embedded and compared:

```
Query: "How do we handle user login?"
         ↓
  Embedding Model
         ↓
Query Vector: [0.15, 0.42, -0.20, 0.71, ...]
         ↓
  Cosine Similarity
         ↓
Results: [
  { id: "mem_123", similarity: 0.92 },
  { id: "mem_456", similarity: 0.78 },
  ...
]
```

---

## Embedding Models

### Local Embeddings (Default)

Uses all-MiniLM-L6-v2 running locally:

```json
{
  "embedding": {
    "provider": "local",
    "model": "all-MiniLM-L6-v2"
  }
}
```

| Property | Value |
|----------|-------|
| Dimensions | 384 |
| Speed | ~10ms per embedding |
| Quality | Good for general text |
| Privacy | 100% local, no API calls |
| Cost | Free |

### OpenAI Embeddings

For better semantic understanding:

```json
{
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "apiKey": "${OPENAI_API_KEY}"
  }
}
```

| Model | Dimensions | Quality | Cost |
|-------|------------|---------|------|
| text-embedding-3-small | 1536 | Better | $0.02/1M tokens |
| text-embedding-3-large | 3072 | Best | $0.13/1M tokens |

### Choosing a Model

| Use Case | Recommended Model |
|----------|-------------------|
| Local development | all-MiniLM-L6-v2 |
| Small projects (<1000 memories) | all-MiniLM-L6-v2 |
| Production with budget | text-embedding-3-small |
| Maximum quality | text-embedding-3-large |

---

## Vector Index

### HNSW (Hierarchical Navigable Small World)

Doclea uses HNSW for efficient approximate nearest neighbor search:

```
        Layer 2: [        •        ]
                         /|\
        Layer 1: [   •    •    •   ]
                    /|\  /|\  /|\
        Layer 0: [• • • • • • • • •]
                  (all vectors)
```

**Properties:**
- O(log n) search complexity
- High recall (typically >95%)
- Memory-efficient
- No training required

### Index Parameters

```json
{
  "vectorIndex": {
    "type": "hnsw",
    "m": 16,
    "efConstruction": 100,
    "efSearch": 50
  }
}
```

| Parameter | Description | Default |
|-----------|-------------|---------|
| `m` | Max connections per node | 16 |
| `efConstruction` | Build-time accuracy | 100 |
| `efSearch` | Query-time accuracy | 50 |

**Trade-offs:**
- Higher `m` = Better recall, more memory
- Higher `efSearch` = Better recall, slower queries

---

## Storage Backends

### SQLite with HNSW

Default for local development:

```
.doclea/
├── memories.db      # SQLite database
└── memories.db.vec  # Vector index file
```

**Characteristics:**
- Single file storage
- Good for <10,000 memories
- No external dependencies

### PostgreSQL with pgvector

For production and larger datasets:

```sql
CREATE EXTENSION vector;

CREATE TABLE memory_vectors (
  id TEXT PRIMARY KEY,
  embedding vector(384)  -- or 1536, 3072
);

CREATE INDEX ON memory_vectors
  USING hnsw (embedding vector_cosine_ops);
```

**Characteristics:**
- Scales to millions of vectors
- Full SQL capabilities
- Requires separate database

---

## Similarity Metrics

### Cosine Similarity (Default)

Measures angle between vectors, normalized for magnitude:

```
similarity = (A · B) / (||A|| × ||B||)
```

Range: -1 to 1 (1 = identical, 0 = orthogonal)

**Best for:**
- Text embeddings
- Normalized vectors
- Semantic similarity

### Euclidean Distance

Measures straight-line distance:

```
distance = √(Σ(Ai - Bi)²)
```

Range: 0 to ∞ (0 = identical)

**Best for:**
- When magnitude matters
- Clustering applications

### Inner Product

Raw dot product:

```
product = Σ(Ai × Bi)
```

**Best for:**
- Pre-normalized vectors
- Maximum performance

---

## Query Process

### 1. Query Embedding

```typescript
const queryVector = await embed("How do we handle auth?");
// [0.15, 0.42, -0.20, 0.71, ...]
```

### 2. ANN Search

```typescript
const candidates = await vectorIndex.search(queryVector, {
  limit: 50,  // Get more than needed
  efSearch: 100
});
```

### 3. Re-ranking

Apply additional scoring factors:

```typescript
const reranked = candidates.map(c => ({
  ...c,
  finalScore:
    c.similarity * 0.3 +     // Vector similarity
    c.importance * 0.4 +      // User-assigned importance
    c.recencyScore * 0.3      // Time-based decay
}));
```

### 4. Filtering

Apply type/tag filters:

```typescript
const filtered = reranked.filter(m =>
  m.type === 'decision' &&
  m.tags.includes('auth')
);
```

---

## Performance Optimization

### Batch Embedding

Embed multiple texts at once:

```typescript
// Slow: Sequential embedding
for (const text of texts) {
  await embed(text);  // 10ms each = 1000ms for 100
}

// Fast: Batch embedding
await embedBatch(texts);  // 100ms for 100
```

### Embedding Caching

Cache embeddings for unchanged content:

```typescript
const cached = await embeddingCache.get(contentHash);
if (cached) return cached;

const embedding = await embed(content);
await embeddingCache.set(contentHash, embedding);
return embedding;
```

### Index Warming

Pre-load frequently accessed vectors:

```typescript
// On startup
const frequentMemories = await getFrequentlyAccessed(100);
await vectorIndex.preload(frequentMemories);
```

---

## Chunking Strategies

For long content, split into chunks:

### Fixed Size Chunking

```typescript
function chunkBySize(text: string, chunkSize = 500, overlap = 50) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}
```

### Semantic Chunking

Split on natural boundaries:

```typescript
function chunkBySentence(text: string, maxChunkSize = 500) {
  const sentences = text.split(/[.!?]+/);
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChunkSize) {
      chunks.push(current);
      current = sentence;
    } else {
      current += sentence + '.';
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
```

---

## Debugging Vector Search

### Check Similarity Scores

```
"Get context for authentication with debug info"
```

Response includes similarity scores:

```json
{
  "results": [
    {
      "id": "mem_123",
      "similarity": 0.92,
      "rerankedScore": 0.85
    }
  ]
}
```

### Visualize Embeddings

Use dimensionality reduction to inspect:

```python
from sklearn.manifold import TSNE
import matplotlib.pyplot as plt

# Reduce 384D to 2D
tsne = TSNE(n_components=2)
reduced = tsne.fit_transform(embeddings)

plt.scatter(reduced[:, 0], reduced[:, 1])
plt.show()
```

### Common Issues

**Low similarity scores:**
- Query too vague
- Content not embedded (check for re-embedding)
- Model mismatch between store and query

**Irrelevant results:**
- Content semantically similar but contextually different
- Use tags for filtering
- Adjust scoring weights

---

## Configuration Reference

### Full Config Example

```json
{
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "apiKey": "${OPENAI_API_KEY}",
    "batchSize": 100,
    "maxRetries": 3
  },
  "vectorIndex": {
    "type": "hnsw",
    "m": 16,
    "efConstruction": 100,
    "efSearch": 50,
    "metric": "cosine"
  },
  "search": {
    "defaultLimit": 10,
    "maxLimit": 100,
    "minSimilarity": 0.5
  }
}
```

---

## See Also

- [Context Building](../guides/context-building) - Using vector search
- [Memory Management](../guides/memory-management) - Storing content
- [Docker Setup](../installation/docker) - Production deployment with Postgres
