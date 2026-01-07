---
sidebar_position: 1
title: Overview
description: Why chunking matters and Doclea's approach to semantic document splitting.
keywords: [chunking, semantic search, token limits, embedding]
---

# Document Chunking

Doclea uses intelligent chunking to split documents into meaningful segments for embedding. This section explains the chunking strategies and how to optimize them for your use case.

## Why Chunking Matters

Embedding models have **token limits** (typically 256-512 tokens). Long documents must be split, but naive splitting loses context:

| Approach | Problem |
|----------|---------|
| Split by character count | Cuts mid-word, loses meaning |
| Split by sentence | May split related concepts |
| Split by paragraph | Paragraphs vary wildly in size |
| **Semantic chunking** | Respects document structure |

Doclea uses **semantic chunking** - splitting at logical boundaries like headers, code blocks, and sections.

## Chunking Strategies

Doclea provides two specialized chunking strategies:

### Markdown Chunking

For documentation, READMEs, and prose content:

- Header-based splitting (h1-h6)
- Preserves code blocks as atomic units
- Maintains header hierarchy for context
- Handles YAML frontmatter

[Learn more about Markdown Chunking](./markdown)

### Code Chunking

For source code files using AST-based parsing:

- Function/class boundary splitting
- Import grouping
- Supports TypeScript, JavaScript, Python, Go, Rust
- Fallback for unsupported languages

[Learn more about Code Chunking](./code)

## Performance

| Operation | Time |
|-----------|------|
| Parse markdown (1000 lines) | ~5ms |
| Chunk with token counting | ~50-100ms |
| Parse code with Tree-sitter | ~10-50ms |

Token counting is typically the bottleneck. For bulk operations, consider pre-warming the tokenizer:

```typescript
import { getTokenizer } from "@doclea/mcp/utils";

// Pre-warm tokenizer
await getTokenizer();

// Now chunking is faster
const chunks = await chunkMarkdown(doc);
```

## Best Practices

### 1. Match Token Limits to Your Model

| Model | Recommended maxTokens |
|-------|----------------------|
| `mxbai-embed-xsmall-v1` | 450 |
| `all-MiniLM-L6-v2` | 200 |
| `all-mpnet-base-v2` | 320 |

### 2. Use Overlap for Context Continuity

For documents where context flows between sections:

```typescript
const chunks = await chunkMarkdown(doc, {
  maxTokens: 256,
  overlap: 50,  // 50 tokens shared between chunks
});
```

### 3. Pre-process Large Documents

For very large documents, consider:

1. Split by top-level headers first
2. Then chunk each section separately
3. Store section metadata with each chunk

## Next Steps

- [Markdown Chunking](./markdown) - Detailed markdown chunking guide
- [Code Chunking](./code) - AST-based code chunking guide
- [Embeddings](../embeddings) - How chunks are embedded
- [Vector Search](../vector-search) - How to search embedded chunks