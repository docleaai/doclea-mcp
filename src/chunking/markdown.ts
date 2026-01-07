/**
 * Semantic markdown chunking
 *
 * Intelligently splits markdown documents while respecting:
 * - Document structure (headers, code blocks)
 * - Token limits per chunk
 * - Source location tracking
 */

import { countTokens, splitIntoTokenChunks } from "../utils/tokens";

/**
 * Metadata for a markdown chunk
 */
export interface MarkdownChunkMetadata {
  /** Starting line number (1-based) */
  startLine: number;
  /** Ending line number (1-based, inclusive) */
  endLine: number;
  /** Header hierarchy leading to this chunk */
  headers: string[];
  /** Header level of this section (1-6, or 0 for content without header) */
  level: number;
  /** Whether this chunk contains frontmatter */
  hasFrontmatter: boolean;
  /** Whether this chunk contains code blocks */
  hasCodeBlock: boolean;
}

/**
 * A chunk of markdown content with metadata
 */
export interface MarkdownChunk {
  /** The markdown content */
  content: string;
  /** Metadata about the chunk's location and context */
  metadata: MarkdownChunkMetadata;
  /** Approximate token count */
  tokenCount: number;
}

/**
 * Options for markdown chunking
 */
export interface MarkdownChunkOptions {
  /** Maximum tokens per chunk (default: 256) */
  maxTokens?: number;
  /** Overlap tokens between chunks for context continuity (default: 0) */
  overlap?: number;
  /** Whether to include header hierarchy in each chunk (default: true) */
  includeHeaderContext?: boolean;
  /** Tokenizer model to use (default: mxbai-embed-xsmall-v1) */
  model?: string;
}

// Regex patterns
const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n?/;
const EMPTY_FRONTMATTER_REGEX = /^---\n---\n?/;
const HEADER_REGEX = /^(#{1,6})\s+(.+)$/;
const CODE_BLOCK_START = /^```(\w*)?$/;
const CODE_BLOCK_END = /^```$/;

/**
 * Parsed markdown section
 */
interface MarkdownSection {
  content: string;
  startLine: number;
  endLine: number;
  level: number;
  header: string | null;
  headers: string[];
  hasFrontmatter: boolean;
  hasCodeBlock: boolean;
}

/**
 * Parse markdown into sections by headers
 */
function parseMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = markdown.split("\n");
  const sections: MarkdownSection[] = [];

  let currentSection: MarkdownSection | null = null;
  let headerStack: { level: number; text: string }[] = [];
  let inCodeBlock = false;
  let inFrontmatter = false;
  let frontmatterDone = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1; // 1-based

    // Track frontmatter (only at start)
    if (i === 0 && line === "---") {
      inFrontmatter = true;
      if (!currentSection) {
        currentSection = {
          content: line,
          startLine: lineNum,
          endLine: lineNum,
          level: 0,
          header: null,
          headers: [],
          hasFrontmatter: true,
          hasCodeBlock: false,
        };
      }
      continue;
    }

    if (inFrontmatter) {
      if (currentSection) {
        currentSection.content += "\n" + line;
        currentSection.endLine = lineNum;
      }
      if (line === "---") {
        inFrontmatter = false;
        frontmatterDone = true;
      }
      continue;
    }

    // Track code blocks (don't parse headers inside code blocks)
    if (CODE_BLOCK_START.test(line) && !inCodeBlock) {
      inCodeBlock = true;
      if (currentSection) {
        currentSection.hasCodeBlock = true;
      }
    } else if (CODE_BLOCK_END.test(line) && inCodeBlock) {
      inCodeBlock = false;
    }

    // Check for headers (only outside code blocks)
    const headerMatch = !inCodeBlock ? line.match(HEADER_REGEX) : null;

    if (headerMatch) {
      // Save previous section
      if (currentSection && currentSection.content.trim()) {
        sections.push(currentSection);
      }

      const level = headerMatch[1].length;
      const headerText = headerMatch[2].trim();

      // Update header stack
      while (headerStack.length > 0 && headerStack[headerStack.length - 1].level >= level) {
        headerStack.pop();
      }
      headerStack.push({ level, text: headerText });

      // Start new section
      currentSection = {
        content: line,
        startLine: lineNum,
        endLine: lineNum,
        level,
        header: headerText,
        headers: headerStack.map((h) => h.text),
        hasFrontmatter: false,
        hasCodeBlock: false,
      };
    } else {
      // Add content to current section
      if (!currentSection) {
        currentSection = {
          content: line,
          startLine: lineNum,
          endLine: lineNum,
          level: 0,
          header: null,
          headers: headerStack.map((h) => h.text),
          hasFrontmatter: frontmatterDone && lineNum <= 10, // Frontmatter was just before
          hasCodeBlock: inCodeBlock,
        };
      } else {
        currentSection.content += "\n" + line;
        currentSection.endLine = lineNum;
        if (inCodeBlock) {
          currentSection.hasCodeBlock = true;
        }
      }
    }
  }

  // Don't forget the last section
  if (currentSection && currentSection.content.trim()) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Split a section that exceeds token limit while preserving code blocks
 */
async function splitLargeSection(
  section: MarkdownSection,
  maxTokens: number,
  model?: string,
): Promise<MarkdownSection[]> {
  const lines = section.content.split("\n");
  const result: MarkdownSection[] = [];

  let currentChunk: string[] = [];
  let currentStartLine = section.startLine;
  let currentTokens = 0;
  let inCodeBlock = false;
  let codeBlockBuffer: string[] = [];
  let codeBlockStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = section.startLine + i;

    // Track code block boundaries
    if (CODE_BLOCK_START.test(line) && !inCodeBlock) {
      inCodeBlock = true;
      codeBlockBuffer = [line];
      codeBlockStartLine = lineNum;
      continue;
    }

    if (inCodeBlock) {
      codeBlockBuffer.push(line);

      if (CODE_BLOCK_END.test(line)) {
        // Code block complete - add atomically
        inCodeBlock = false;
        const codeBlockContent = codeBlockBuffer.join("\n");
        const codeBlockTokens = await countTokens(codeBlockContent, model);

        // If code block alone exceeds limit, it gets its own chunk
        if (codeBlockTokens > maxTokens) {
          // Flush current chunk first
          if (currentChunk.length > 0) {
            result.push({
              content: currentChunk.join("\n"),
              startLine: currentStartLine,
              endLine: lineNum - codeBlockBuffer.length,
              level: section.level,
              header: result.length === 0 ? section.header : null,
              headers: section.headers,
              hasFrontmatter: result.length === 0 && section.hasFrontmatter,
              hasCodeBlock: false,
            });
            currentChunk = [];
          }

          // Add code block as its own chunk
          result.push({
            content: codeBlockContent,
            startLine: codeBlockStartLine,
            endLine: lineNum,
            level: section.level,
            header: null,
            headers: section.headers,
            hasFrontmatter: false,
            hasCodeBlock: true,
          });
          currentStartLine = lineNum + 1;
          currentTokens = 0;
        } else if (currentTokens + codeBlockTokens > maxTokens) {
          // Flush current chunk, start new one with code block
          if (currentChunk.length > 0) {
            result.push({
              content: currentChunk.join("\n"),
              startLine: currentStartLine,
              endLine: codeBlockStartLine - 1,
              level: section.level,
              header: result.length === 0 ? section.header : null,
              headers: section.headers,
              hasFrontmatter: result.length === 0 && section.hasFrontmatter,
              hasCodeBlock: false,
            });
          }
          currentChunk = [codeBlockContent];
          currentStartLine = codeBlockStartLine;
          currentTokens = codeBlockTokens;
        } else {
          // Add code block to current chunk
          currentChunk.push(codeBlockContent);
          currentTokens += codeBlockTokens;
        }
        codeBlockBuffer = [];
      }
      continue;
    }

    // Regular line handling
    const lineTokens = await countTokens(line, model);

    // Handle single line that exceeds token limit - split by tokens
    if (lineTokens > maxTokens) {
      // Flush current chunk first
      if (currentChunk.length > 0) {
        result.push({
          content: currentChunk.join("\n"),
          startLine: currentStartLine,
          endLine: lineNum - 1,
          level: section.level,
          header: result.length === 0 ? section.header : null,
          headers: section.headers,
          hasFrontmatter: result.length === 0 && section.hasFrontmatter,
          hasCodeBlock: currentChunk.some((l) => l.startsWith("```")),
        });
        currentChunk = [];
        currentTokens = 0;
      }

      // Split the long line into token-based chunks
      const lineChunks = await splitIntoTokenChunks(line, maxTokens, 0, model);
      for (const lineChunk of lineChunks) {
        result.push({
          content: lineChunk,
          startLine: lineNum,
          endLine: lineNum,
          level: section.level,
          header: result.length === 0 ? section.header : null,
          headers: section.headers,
          hasFrontmatter: result.length === 0 && section.hasFrontmatter,
          hasCodeBlock: false,
        });
      }
      currentStartLine = lineNum + 1;
    } else if (currentTokens + lineTokens > maxTokens && currentChunk.length > 0) {
      // Flush current chunk
      result.push({
        content: currentChunk.join("\n"),
        startLine: currentStartLine,
        endLine: lineNum - 1,
        level: section.level,
        header: result.length === 0 ? section.header : null,
        headers: section.headers,
        hasFrontmatter: result.length === 0 && section.hasFrontmatter,
        hasCodeBlock: currentChunk.some((l) => l.startsWith("```")),
      });
      currentChunk = [line];
      currentStartLine = lineNum;
      currentTokens = lineTokens;
    } else {
      currentChunk.push(line);
      currentTokens += lineTokens;
    }
  }

  // Flush remaining content
  if (currentChunk.length > 0) {
    result.push({
      content: currentChunk.join("\n"),
      startLine: currentStartLine,
      endLine: section.endLine,
      level: section.level,
      header: result.length === 0 ? section.header : null,
      headers: section.headers,
      hasFrontmatter: result.length === 0 && section.hasFrontmatter,
      hasCodeBlock: currentChunk.some((l) => l.startsWith("```")),
    });
  }

  return result.length > 0 ? result : [section];
}

/**
 * Chunk a markdown document into semantic sections
 *
 * @param markdown - The markdown content to chunk
 * @param options - Chunking options
 * @returns Array of markdown chunks with metadata
 *
 * @example
 * const chunks = await chunkMarkdown(content, { maxTokens: 256 });
 * for (const chunk of chunks) {
 *   console.log(`Lines ${chunk.metadata.startLine}-${chunk.metadata.endLine}`);
 *   console.log(`Headers: ${chunk.metadata.headers.join(' > ')}`);
 *   console.log(chunk.content);
 * }
 */
export async function chunkMarkdown(
  markdown: string,
  options: MarkdownChunkOptions = {},
): Promise<MarkdownChunk[]> {
  const {
    maxTokens = 256,
    overlap = 0,
    includeHeaderContext = true,
    model,
  } = options;

  if (!markdown || !markdown.trim()) {
    return [];
  }

  // Parse into sections by headers
  const sections = parseMarkdownSections(markdown);

  if (sections.length === 0) {
    return [];
  }

  // Process sections, splitting large ones
  const processedSections: MarkdownSection[] = [];

  for (const section of sections) {
    const tokenCount = await countTokens(section.content, model);

    if (tokenCount <= maxTokens) {
      processedSections.push(section);
    } else {
      // Split large section
      const subSections = await splitLargeSection(section, maxTokens, model);
      processedSections.push(...subSections);
    }
  }

  // Convert to chunks with metadata
  const chunks: MarkdownChunk[] = [];

  for (const section of processedSections) {
    let content = section.content;

    // Optionally prepend header context
    if (includeHeaderContext && section.headers.length > 0 && !section.header) {
      const contextHeader = section.headers
        .map((h, i) => `${"#".repeat(i + 1)} ${h}`)
        .join("\n");
      // Only add if it doesn't duplicate existing headers in content
      if (!content.startsWith("#")) {
        content = `<!-- Context: ${section.headers.join(" > ")} -->\n${content}`;
      }
    }

    const tokenCount = await countTokens(content, model);

    chunks.push({
      content,
      tokenCount,
      metadata: {
        startLine: section.startLine,
        endLine: section.endLine,
        headers: section.headers,
        level: section.level,
        hasFrontmatter: section.hasFrontmatter,
        hasCodeBlock: section.hasCodeBlock,
      },
    });
  }

  return chunks;
}

/**
 * Extract frontmatter from markdown
 *
 * @param markdown - The markdown content
 * @returns Object with frontmatter (if present) and remaining content
 */
export function extractFrontmatter(markdown: string): {
  frontmatter: string | null;
  content: string;
  frontmatterLines: number;
} {
  // Check for empty frontmatter first
  const emptyMatch = markdown.match(EMPTY_FRONTMATTER_REGEX);
  if (emptyMatch) {
    return {
      frontmatter: "",
      content: markdown.slice(emptyMatch[0].length),
      frontmatterLines: emptyMatch[0].split("\n").length,
    };
  }

  const match = markdown.match(FRONTMATTER_REGEX);

  if (match) {
    const frontmatter = match[1];
    const frontmatterLines = match[0].split("\n").length;
    return {
      frontmatter,
      content: markdown.slice(match[0].length),
      frontmatterLines,
    };
  }

  return {
    frontmatter: null,
    content: markdown,
    frontmatterLines: 0,
  };
}

/**
 * Get the header hierarchy at a specific line
 *
 * @param markdown - The markdown content
 * @param lineNumber - The line number (1-based)
 * @returns Array of headers leading to that line
 */
export function getHeadersAtLine(markdown: string, lineNumber: number): string[] {
  const lines = markdown.split("\n");
  const headerStack: { level: number; text: string }[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < Math.min(lineNumber, lines.length); i++) {
    const line = lines[i];

    // Track code blocks
    if (CODE_BLOCK_START.test(line) && !inCodeBlock) {
      inCodeBlock = true;
      continue;
    }
    if (CODE_BLOCK_END.test(line) && inCodeBlock) {
      inCodeBlock = false;
      continue;
    }

    if (!inCodeBlock) {
      const headerMatch = line.match(HEADER_REGEX);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const text = headerMatch[2].trim();

        // Pop headers of same or higher level
        while (headerStack.length > 0 && headerStack[headerStack.length - 1].level >= level) {
          headerStack.pop();
        }
        headerStack.push({ level, text });
      }
    }
  }

  return headerStack.map((h) => h.text);
}