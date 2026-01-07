---
sidebar_position: 3
title: Code Chunking
description: AST-based code chunking using Tree-sitter for intelligent function and class boundary splitting.
keywords: [code, chunking, tree-sitter, ast, functions, classes]
---

# Code Chunking

The `chunkCode` function provides **AST-based code chunking** using Tree-sitter. Unlike simple line-based splitting, it understands code structure and splits at meaningful boundaries.

## Supported Languages

| Language | Extensions | Node Types |
|----------|------------|------------|
| TypeScript | `.ts`, `.mts`, `.cts` | functions, classes, interfaces, types, enums |
| TSX | `.tsx` | Same as TypeScript + JSX |
| JavaScript | `.js`, `.mjs`, `.cjs` | functions, classes, variables |
| JSX | `.jsx` | Same as JavaScript + JSX |
| Python | `.py`, `.pyi` | functions, classes, imports, decorators |
| Go | `.go` | functions, methods, structs, consts |
| Rust | `.rs` | functions, impls, structs, enums, traits |

## Features

- **Function/class boundary splitting**: Never cuts mid-function
- **Import grouping**: Collects imports into their own chunk
- **Name extraction**: Extracts function/class names as metadata
- **Parent tracking**: Tracks parent class when splitting methods
- **Token-aware splitting**: Respects max token limits
- **Language detection**: Auto-detects from file extension
- **Fallback mode**: Line-based splitting for unsupported languages

## Usage

```typescript
import { chunkCode, chunkCodeFile, detectLanguage } from "@doclea/mcp/chunking";

// Direct chunking with known language
const chunks = await chunkCode(`
function add(a: number, b: number): number {
  return a + b;
}

class Calculator {
  multiply(a: number, b: number): number {
    return a * b;
  }
}
`, "typescript");

// Auto-detect language from filename
const fileChunks = await chunkCodeFile(code, "src/utils.ts");

// Check supported languages
const lang = detectLanguage("main.py"); // "python"
```

## Output Structure

```typescript
interface CodeChunk {
  content: string;        // The code content
  tokenCount: number;     // Approximate token count
  metadata: {
    startLine: number;    // 1-based start line
    endLine: number;      // 1-based end line
    startByte: number;    // Byte offset start
    endByte: number;      // Byte offset end
    nodeType: string;     // AST node type (e.g., "function_declaration")
    name: string | null;  // Function/class name if available
    parentName: string | null; // Parent class name if nested
    language: string;     // Language identifier
    isImport: boolean;    // Is this an import/use statement
    isFunction: boolean;  // Is this a function/method
    isClass: boolean;     // Is this a class/struct/type
  };
}
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTokens` | number | 512 | Maximum tokens per chunk |
| `includeImports` | boolean | false | Include imports with each function chunk |
| `splitLargeFunctions` | boolean | true | Split functions that exceed maxTokens |
| `model` | string | `mxbai-embed-xsmall-v1` | Tokenizer model |

## Chunking Behavior

### Large Function Handling

When a function exceeds `maxTokens`, it's split by lines while preserving metadata:

```typescript
const chunks = await chunkCode(largeFunction, "typescript", {
  maxTokens: 100,
  splitLargeFunctions: true,
});

// Result: Multiple chunks with nodeType "function_declaration_partial"
// and name preserved from original function
```

### Class Method Splitting

Large classes are split by methods:

```typescript
class BigClass {
  method1() { /* ... */ }
  method2() { /* ... */ }
  method3() { /* ... */ }
}

// Each method becomes its own chunk with:
// - parentName: "BigClass"
// - isFunction: true
// - nodeType: "method_definition"
```

### Import Grouping

Imports are collected into their own chunk:

```typescript
import { foo } from "foo";
import { bar } from "bar";
import { baz } from "baz";

// All imports become a single chunk with:
// - nodeType: "import_statement"
// - isImport: true
```

### Language Detection

Auto-detect language from file extension:

```typescript
import { detectLanguage, getSupportedExtensions } from "@doclea/mcp/chunking";

detectLanguage("main.py");        // "python"
detectLanguage("app.tsx");        // "tsx"
detectLanguage("unknown.xyz");    // null

getSupportedExtensions();
// [".ts", ".mts", ".cts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".py", ".pyi", ".go", ".rs"]
```

## Fallback Chunking

For unsupported languages, `chunkCodeFallback` provides line-based splitting:

```typescript
import { chunkCodeFallback } from "@doclea/mcp/chunking";

const chunks = await chunkCodeFallback(rubyCode, "app.rb", {
  maxTokens: 256,
});
// Returns chunks with nodeType: "lines"
```

The fallback chunker:
- Splits by lines respecting token limits
- Preserves line number metadata
- Sets `language` to the file extension
- Works with any text file

## Best Practices

### 1. Use Larger Token Limits for Code

Code often has long lines and complex structures:

```typescript
const chunks = await chunkCode(code, "typescript", {
  maxTokens: 512,  // Larger than markdown default
});
```

### 2. Include Imports for Self-Contained Chunks

When chunks need to be understood in isolation:

```typescript
const chunks = await chunkCode(code, "typescript", {
  includeImports: true,  // Each chunk includes relevant imports
});
```

### 3. Handle Mixed Content

For files with both code and documentation:

```typescript
// First extract markdown comments
const docChunks = await chunkMarkdown(extractDocs(code));

// Then chunk the code
const codeChunks = await chunkCode(code, "typescript");

// Combine with appropriate metadata
const allChunks = [...docChunks, ...codeChunks];
```

## Next Steps

- [Markdown Chunking](./markdown) - Header-based document chunking
- [Embeddings](../embeddings) - How chunks are embedded
- [Vector Search](../vector-search) - How to search embedded chunks