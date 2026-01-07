---
sidebar_position: 1
title: Embeddings
description: How Doclea generates and manages text embeddings for semantic search. Supported models, token counting, and performance tuning.
keywords: [embeddings, transformers.js, semantic search, token counting, all-MiniLM-L6-v2]
---

# Embeddings

Doclea uses text embeddings to enable semantic search across your codebase memories. This page explains how embeddings work and how to tune them for your needs.

---

## How It Works

When you store a memory, Doclea:

1. **Combines** title and content into a single text
2. **Tokenizes** the text using the model's tokenizer
3. **Embeds** the tokens into a high-dimensional vector (384 or 768 dimensions)
4. **Stores** the vector in the vector database for similarity search

```typescript
// What gets embedded
const textToEmbed = `${memory.title}\n\n${memory.content}`;
```

---

## Embedding Providers

Doclea supports multiple embedding providers:

### Zero-Config (Default)

Uses **Transformers.js** with local models. No API keys required.

```json title=".doclea/config.json"
{
  "embedding": {
    "provider": "transformers",
    "model": "mxbai-embed-xsmall-v1"
  }
}
```

### Docker (TEI)

Uses **Text Embeddings Inference** for faster processing:

```json title=".doclea/config.json"
{
  "embedding": {
    "provider": "local",
    "endpoint": "http://localhost:8080"
  }
}
```

### Cloud Providers

| Provider | Model | Dimensions |
|----------|-------|------------|
| OpenAI | `text-embedding-3-small` | 1536 |
| Nomic | `nomic-embed-text-v1.5` | 768 |
| Voyage | `voyage-2` | 1024 |
| Ollama | `nomic-embed-text` | 768 |

---

## Supported Models

### Transformers.js Models

| Model | Dimensions | Size | Best For |
|-------|------------|------|----------|
| `mxbai-embed-xsmall-v1` | 384 | ~45MB | **Default.** Fast, small, English-focused |
| `all-MiniLM-L6-v2` | 384 | ~90MB | Classic, well-tested balance |
| `embeddinggemma-300m` | 768 | ~200MB | Multilingual (100+ languages) |
| `snowflake-arctic-embed-m` | 768 | ~220MB | Top retrieval benchmarks |
| `all-mpnet-base-v2` | 768 | ~420MB | Higher quality, slower |

### Model Context Windows

:::warning Important
Models have **context window limits** measured in tokens, not characters. Text beyond the limit is truncated.
:::

| Model | Max Tokens | Recommended Chunk |
|-------|------------|-------------------|
| `mxbai-embed-xsmall-v1` | 512 | 450 |
| `all-MiniLM-L6-v2` | 256 | 200 |
| `all-mpnet-base-v2` | 384 | 320 |

---

## Token Counting Utility

Doclea provides a token counting utility to help you manage context windows:

### Functions

```typescript
import {
  countTokens,
  truncateToTokens,
  splitIntoTokenChunks,
  fitsInTokenBudget,
  getTokenInfo
} from "@doclea/mcp/utils";
```

### `countTokens(text, model?)`

Count tokens in a string:

```typescript
const count = await countTokens("Hello world");
// => 2

const count = await countTokens("function foo() { return 42; }");
// => 9
```

### `truncateToTokens(text, maxTokens, model?)`

Truncate text to fit within a token budget:

```typescript
const longText = "word ".repeat(1000);
const truncated = await truncateToTokens(longText, 100);
// Returns first ~100 tokens
```

### `splitIntoTokenChunks(text, maxTokens, overlap?, model?)`

Split text into chunks with optional overlap:

```typescript
const chunks = await splitIntoTokenChunks(document, 256, 50);
// Returns array of ~256-token chunks with 50-token overlap
```

### `fitsInTokenBudget(text, maxTokens, model?)`

Check if text fits within a budget:

```typescript
if (await fitsInTokenBudget(content, 200)) {
  // Safe to embed without truncation
}
```

### `getTokenInfo(text, model?)`

Debug tokenization:

```typescript
const info = await getTokenInfo("Hello world!");
// {
//   count: 3,
//   tokens: ["Hello", " world", "!"],
//   tokenIds: [7592, 1362, 999]
// }
```

---

## Performance

### First Run

On first use, Transformers.js downloads the model (~45-420MB depending on model). Progress is shown in stderr:

```
[doclea] Downloading model.onnx: 45.2%
[doclea] Downloaded model.onnx
```

Models are cached in `~/.cache/doclea/transformers/` (XDG-compliant).

### Embedding Times

| Scenario | Zero-Config | Docker (TEI) |
|----------|-------------|--------------|
| Cold start (model load) | 2-5s | N/A (preloaded) |
| Single text | 50-100ms | 10-30ms |
| Batch (100 texts) | 500-1500ms | 50-150ms |

### Optimization Tips

1. **Use batching** for bulk operations:
   ```typescript
   const vectors = await embeddings.embedBatch(texts);
   ```

2. **Choose the right model**:
   - Fast prototype: `mxbai-embed-xsmall-v1`
   - Production English: `all-MiniLM-L6-v2`
   - Multilingual: `embeddinggemma-300m`

3. **Pre-chunk large documents** to avoid truncation losses

---

## MRL (Matryoshka Representation Learning)

Some models support dimension reduction via MRL truncation:

```json title=".doclea/config.json"
{
  "embedding": {
    "provider": "transformers",
    "model": "mxbai-embed-xsmall-v1",
    "dimensions": 128
  }
}
```

This reduces storage and speeds up search, with minimal quality loss for dimensions >= 128.

---

## Caching

Doclea caches embedding results using SHA-256 content hashing:

- **Cache hit**: Instant retrieval (sub-millisecond)
- **Cache miss**: Full embedding computation
- **Cache location**: SQLite database at `.doclea/local.db`

```typescript
// Automatic caching - no configuration needed
const vector1 = await embeddings.embed("Hello world");  // Computed
const vector2 = await embeddings.embed("Hello world");  // Cache hit
```

---

## Troubleshooting

### "Model not found" Error

```bash
# Check model cache
ls ~/.cache/doclea/transformers/
```

### Slow First Request

Normal for zero-config mode. Model downloads once, then cached.

### Out of Memory

Large models need RAM. Try smaller model:

```json
{
  "embedding": {
    "model": "mxbai-embed-xsmall-v1"
  }
}
```

### Token Truncation Warnings

Use `countTokens()` to check before embedding:

```typescript
const count = await countTokens(content);
if (count > 256) {
  console.warn(`Content has ${count} tokens, will be truncated`);
}
```

---

## Next Steps

- [Vector Search](./vector-search) - How vectors are stored and searched
- [Storage](./storage) - SQLite database structure
- [Configuration](../configuration) - All config options