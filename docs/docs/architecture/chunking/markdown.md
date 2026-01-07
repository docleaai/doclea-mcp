---
sidebar_position: 2
title: Markdown Chunking
description: Header-based markdown chunking with code block preservation and frontmatter handling.
keywords: [markdown, chunking, headers, frontmatter, code blocks]
---

# Markdown Chunking

The `chunkMarkdown` function splits markdown documents while preserving structure.

## Features

- **Header-based splitting**: Creates chunks at h1-h6 boundaries
- **Token limits**: Respects configurable max tokens per chunk
- **Code block preservation**: Never splits mid-code block
- **Frontmatter handling**: Keeps YAML frontmatter in first chunk
- **Line tracking**: Tracks source line numbers for each chunk
- **Header hierarchy**: Maintains breadcrumb context (e.g., "Guide > Installation > Linux")

## Usage

```typescript
import { chunkMarkdown } from "@doclea/mcp/chunking";

const markdown = `---
title: Installation Guide
---

# Getting Started

Welcome to the guide.

## Prerequisites

You'll need Node.js 18+.

## Installation

\`\`\`bash
npm install @doclea/mcp
\`\`\`

Configure your settings...
`;

const chunks = await chunkMarkdown(markdown, {
  maxTokens: 256,      // Max tokens per chunk
  overlap: 0,          // Token overlap between chunks
  includeHeaderContext: true,  // Add header breadcrumbs
});

for (const chunk of chunks) {
  console.log(`Lines ${chunk.metadata.startLine}-${chunk.metadata.endLine}`);
  console.log(`Headers: ${chunk.metadata.headers.join(" > ")}`);
  console.log(`Tokens: ${chunk.tokenCount}`);
  console.log(chunk.content);
  console.log("---");
}
```

## Output Structure

```typescript
interface MarkdownChunk {
  content: string;        // The chunk text
  tokenCount: number;     // Approximate token count
  metadata: {
    startLine: number;    // 1-based start line
    endLine: number;      // 1-based end line (inclusive)
    headers: string[];    // Header hierarchy ["Guide", "Installation"]
    level: number;        // Header level (1-6, or 0 for no header)
    hasFrontmatter: boolean;
    hasCodeBlock: boolean;
  };
}
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTokens` | number | 256 | Maximum tokens per chunk |
| `overlap` | number | 0 | Token overlap between chunks |
| `includeHeaderContext` | boolean | true | Add header hierarchy as context |
| `model` | string | `mxbai-embed-xsmall-v1` | Tokenizer model |

## Chunking Behavior

### Header Splitting

Each header starts a new chunk. Nested headers maintain hierarchy:

```markdown
# Main Topic           <- Chunk 1, headers: ["Main Topic"]

## Subtopic A          <- Chunk 2, headers: ["Main Topic", "Subtopic A"]

Content here.

### Deep Section       <- Chunk 3, headers: ["Main Topic", "Subtopic A", "Deep Section"]

## Subtopic B          <- Chunk 4, headers: ["Main Topic", "Subtopic B"]
                          (Note: "Subtopic A" is removed - sibling, not parent)
```

### Code Block Handling

Code blocks are **atomic** - never split mid-block:

```markdown
# Examples

Some intro text.

\`\`\`typescript
// This entire block stays together
function complexFunction() {
  // Even if it exceeds maxTokens
  // It becomes its own chunk
}
\`\`\`

More text after.
```

If a code block exceeds `maxTokens`, it gets its own chunk (preserving the limit is secondary to code integrity).

### Long Content Without Headers

Content without headers that exceeds token limits is split using token-based chunking:

```typescript
// Single line with 500 tokens -> splits into multiple chunks
const longText = "word ".repeat(500);
const chunks = await chunkMarkdown(longText, { maxTokens: 100 });
// Returns 5+ chunks, each ~100 tokens
```

### Frontmatter

YAML frontmatter is preserved in the first chunk:

```markdown
---
title: My Document
author: Developer
---

# Introduction
```

The frontmatter chunk has `metadata.hasFrontmatter: true`.

## Helper Functions

### `extractFrontmatter(markdown)`

Extract frontmatter separately:

```typescript
import { extractFrontmatter } from "@doclea/mcp/chunking";

const result = extractFrontmatter(markdown);
// {
//   frontmatter: "title: My Doc\nauthor: Me",
//   content: "# Introduction\n...",
//   frontmatterLines: 4
// }
```

### `getHeadersAtLine(markdown, lineNumber)`

Get header context at a specific line:

```typescript
import { getHeadersAtLine } from "@doclea/mcp/chunking";

const headers = getHeadersAtLine(markdown, 42);
// ["Main Topic", "Subtopic", "Current Section"]
```

## Best Practices

### Handle Code-Heavy Documents

For documentation with lots of code:

```typescript
// Use larger maxTokens to keep code blocks together
const chunks = await chunkMarkdown(doc, {
  maxTokens: 512,  // Larger to accommodate code
});
```

### Use Overlap for Narrative Content

For documents where context flows between sections:

```typescript
const chunks = await chunkMarkdown(doc, {
  maxTokens: 256,
  overlap: 50,  // 50 tokens shared between chunks
});
```

## Next Steps

- [Code Chunking](./code) - AST-based code chunking
- [Embeddings](../embeddings) - How chunks are embedded