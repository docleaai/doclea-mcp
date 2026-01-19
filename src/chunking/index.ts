/**
 * Chunking module exports
 *
 * Provides intelligent chunking for markdown and code files
 */

// Code chunking (Tree-sitter based)
export {
  type CodeChunk,
  type CodeChunkMetadata,
  type CodeChunkOptions,
  chunkCode,
  chunkCodeFallback,
  chunkCodeFile,
  detectLanguage,
  getSupportedExtensions,
  type SupportedLanguage,
} from "./code";
// Markdown chunking
export {
  chunkMarkdown,
  extractFrontmatter,
  getHeadersAtLine,
  type MarkdownChunk,
  type MarkdownChunkMetadata,
  type MarkdownChunkOptions,
} from "./markdown";
