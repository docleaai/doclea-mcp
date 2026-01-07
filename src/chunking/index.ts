/**
 * Chunking module exports
 *
 * Provides intelligent chunking for markdown and code files
 */

// Markdown chunking
export {
  chunkMarkdown,
  extractFrontmatter,
  getHeadersAtLine,
  type MarkdownChunk,
  type MarkdownChunkMetadata,
  type MarkdownChunkOptions,
} from "./markdown";

// Code chunking (Tree-sitter based)
export {
  chunkCode,
  chunkCodeFile,
  chunkCodeFallback,
  detectLanguage,
  getSupportedExtensions,
  type CodeChunk,
  type CodeChunkMetadata,
  type CodeChunkOptions,
  type SupportedLanguage,
} from "./code";