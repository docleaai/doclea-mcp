/**
 * Tests for markdown semantic chunking
 */

import { describe, expect, test } from "bun:test";
import {
  chunkMarkdown,
  extractFrontmatter,
  getHeadersAtLine,
} from "../../chunking/markdown";

describe("Markdown Chunking", () => {
  describe("chunkMarkdown", () => {
    test("should handle empty input", async () => {
      expect(await chunkMarkdown("")).toEqual([]);
      expect(await chunkMarkdown("   ")).toEqual([]);
    });

    test("should chunk simple markdown by headers", async () => {
      const markdown = `# Title

Some intro content.

## Section 1

Content for section 1.

## Section 2

Content for section 2.`;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });

      expect(chunks.length).toBeGreaterThanOrEqual(3);
      expect(chunks[0].metadata.headers).toContain("Title");
      expect(chunks[0].metadata.level).toBe(1);
    });

    test("should preserve header hierarchy", async () => {
      const markdown = `# Main

## Sub 1

Content 1.

### Sub Sub

Nested content.

## Sub 2

Content 2.`;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });

      // Find the "Sub Sub" section
      const nestedChunk = chunks.find((c) =>
        c.metadata.headers.includes("Sub Sub"),
      );
      expect(nestedChunk).toBeDefined();
      expect(nestedChunk!.metadata.headers).toContain("Main");
      expect(nestedChunk!.metadata.headers).toContain("Sub 1");
      expect(nestedChunk!.metadata.headers).toContain("Sub Sub");
    });

    test("should track line numbers correctly", async () => {
      const markdown = `Line 1
Line 2
Line 3
# Header on line 4
Line 5
Line 6`;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });

      // First chunk (before header)
      expect(chunks[0].metadata.startLine).toBe(1);

      // Header section starts on line 4
      const headerChunk = chunks.find((c) =>
        c.content.includes("# Header on line 4"),
      );
      expect(headerChunk).toBeDefined();
      expect(headerChunk!.metadata.startLine).toBe(4);
    });

    test("should preserve frontmatter in first chunk", async () => {
      const markdown = `---
title: Test Document
date: 2024-01-01
---

# Introduction

Content here.`;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });

      expect(chunks[0].metadata.hasFrontmatter).toBe(true);
      expect(chunks[0].content).toContain("---");
      expect(chunks[0].content).toContain("title: Test Document");
    });

    test("should handle code blocks atomically", async () => {
      const markdown = `# Code Example

Here is some code:

\`\`\`typescript
function hello() {
  console.log("Hello, World!");
  return 42;
}
\`\`\`

More text after code.`;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });

      // Find chunk with code block
      const codeChunk = chunks.find((c) => c.metadata.hasCodeBlock);
      expect(codeChunk).toBeDefined();

      // Code block should not be split
      expect(codeChunk!.content).toContain('console.log("Hello, World!")');
      expect(codeChunk!.content).toContain("return 42");
    });

    test("should not split code blocks even if over token limit", async () => {
      const longCode = "const x = " + '"a".repeat(100);\n'.repeat(20);
      const markdown = `# Code

\`\`\`javascript
${longCode}
\`\`\``;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 50 });

      // Code block gets its own chunk even if large
      const codeChunk = chunks.find((c) => c.metadata.hasCodeBlock);
      expect(codeChunk).toBeDefined();
      expect(codeChunk!.content).toContain("```javascript");
      expect(codeChunk!.content).toContain("```");
    });

    test("should split large sections while respecting token limits", async () => {
      // Create content that will exceed token limit - need substantial content
      const longContent = "This is a sentence with multiple words. ".repeat(50);
      const markdown = `# Large Section

${longContent}`;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 100 });

      expect(chunks.length).toBeGreaterThan(1);

      // Most chunks should be approximately within limit
      // (first chunk includes header which adds tokens)
      const regularChunks = chunks.slice(1);
      for (const chunk of regularChunks) {
        // Allow larger variance since we split by lines, not tokens
        expect(chunk.tokenCount).toBeLessThanOrEqual(150);
      }
    });

    test("should handle multiple code blocks", async () => {
      const markdown = `# Examples

First example:

\`\`\`python
print("Hello")
\`\`\`

Second example:

\`\`\`javascript
console.log("World");
\`\`\``;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });

      const codeChunks = chunks.filter((c) => c.metadata.hasCodeBlock);
      expect(codeChunks.length).toBeGreaterThanOrEqual(1);
    });

    test("should handle headers inside code blocks correctly", async () => {
      const markdown = `# Real Header

\`\`\`markdown
# This is not a header
## Neither is this
\`\`\`

## Another Real Header

Content.`;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });

      // Should have 2 real headers, not 4
      const h1Chunks = chunks.filter((c) => c.metadata.level === 1);
      const h2Chunks = chunks.filter((c) => c.metadata.level === 2);

      expect(h1Chunks.length).toBe(1);
      expect(h2Chunks.length).toBe(1);
    });

    test("should handle nested headers correctly", async () => {
      const markdown = `# H1

## H2a

### H3

## H2b

Content.`;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });

      // H3 should have H1 and H2a in its headers
      const h3Chunk = chunks.find((c) => c.metadata.headers.includes("H3"));
      expect(h3Chunk).toBeDefined();
      expect(h3Chunk!.metadata.headers).toContain("H1");
      expect(h3Chunk!.metadata.headers).toContain("H2a");

      // H2b should NOT have H2a in its headers (sibling, not parent)
      const h2bChunk = chunks.find((c) => c.metadata.headers.includes("H2b"));
      expect(h2bChunk).toBeDefined();
      expect(h2bChunk!.metadata.headers).not.toContain("H2a");
    });

    test("should include token count in each chunk", async () => {
      const markdown = `# Test

Some content here.`;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });

      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeGreaterThan(0);
        expect(typeof chunk.tokenCount).toBe("number");
      }
    });

    test("should handle content without headers", async () => {
      const markdown = `Just some plain text content
without any headers at all.

Multiple paragraphs even.`;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });

      expect(chunks.length).toBe(1);
      expect(chunks[0].metadata.level).toBe(0);
      expect(chunks[0].metadata.headers).toEqual([]);
    });

    test("should handle only frontmatter", async () => {
      const markdown = `---
title: Only Frontmatter
---`;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });

      expect(chunks.length).toBe(1);
      expect(chunks[0].metadata.hasFrontmatter).toBe(true);
    });

    test("should respect maxTokens option", async () => {
      const markdown = "word ".repeat(500);

      const chunks256 = await chunkMarkdown(markdown, { maxTokens: 256 });
      const chunks100 = await chunkMarkdown(markdown, { maxTokens: 100 });

      expect(chunks100.length).toBeGreaterThan(chunks256.length);
    });
  });

  describe("extractFrontmatter", () => {
    test("should extract frontmatter", () => {
      const markdown = `---
title: Test
author: Me
---

# Content`;

      const result = extractFrontmatter(markdown);

      expect(result.frontmatter).toContain("title: Test");
      expect(result.frontmatter).toContain("author: Me");
      expect(result.content.trim()).toBe("# Content");
      expect(result.frontmatterLines).toBe(5);
    });

    test("should handle missing frontmatter", () => {
      const markdown = `# No Frontmatter

Just content.`;

      const result = extractFrontmatter(markdown);

      expect(result.frontmatter).toBeNull();
      expect(result.content).toBe(markdown);
      expect(result.frontmatterLines).toBe(0);
    });

    test("should handle empty frontmatter", () => {
      const markdown = `---
---

Content`;

      const result = extractFrontmatter(markdown);

      expect(result.frontmatter).toBe("");
      expect(result.content.trim()).toBe("Content");
    });

    test("should not treat --- in content as frontmatter", () => {
      const markdown = `# Title

Some content

---

More content`;

      const result = extractFrontmatter(markdown);

      expect(result.frontmatter).toBeNull();
      expect(result.content).toBe(markdown);
    });
  });

  describe("getHeadersAtLine", () => {
    test("should return empty array for line before any headers", () => {
      const markdown = `Some content
before headers.

# First Header`;

      const headers = getHeadersAtLine(markdown, 1);
      expect(headers).toEqual([]);
    });

    test("should return headers at specific line", () => {
      const markdown = `# H1

## H2

Content here on line 5`;

      const headers = getHeadersAtLine(markdown, 5);
      expect(headers).toEqual(["H1", "H2"]);
    });

    test("should handle header hierarchy correctly", () => {
      const markdown = `# Main
## Sub 1
### Deep
## Sub 2
Content`;

      // At "Deep" (line 3), should have Main > Sub 1 > Deep
      const headersAtDeep = getHeadersAtLine(markdown, 3);
      expect(headersAtDeep).toEqual(["Main", "Sub 1", "Deep"]);

      // At "Sub 2" (line 4), should have Main > Sub 2 (Deep is sibling, not parent)
      const headersAtSub2 = getHeadersAtLine(markdown, 4);
      expect(headersAtSub2).toEqual(["Main", "Sub 2"]);
    });

    test("should ignore headers inside code blocks", () => {
      const markdown = `# Real Header
\`\`\`
# Fake Header
\`\`\`
Content`;

      const headers = getHeadersAtLine(markdown, 5);
      expect(headers).toEqual(["Real Header"]);
      expect(headers).not.toContain("Fake Header");
    });

    test("should handle out-of-range line numbers", () => {
      const markdown = `# Header
Content`;

      // Line 100 doesn't exist, should return headers up to end
      const headers = getHeadersAtLine(markdown, 100);
      expect(headers).toEqual(["Header"]);
    });
  });

  describe("Edge cases", () => {
    test("should handle markdown with only code block", async () => {
      const markdown = `\`\`\`javascript
console.log("Hello");
\`\`\``;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });

      expect(chunks.length).toBe(1);
      expect(chunks[0].metadata.hasCodeBlock).toBe(true);
    });

    test("should handle unclosed code block", async () => {
      const markdown = `# Header

\`\`\`javascript
// Code never closes
const x = 1;`;

      // Should not throw
      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });
      expect(chunks.length).toBeGreaterThan(0);
    });

    test("should handle special characters in headers", async () => {
      const markdown = `# Hello <World> & "Quotes"

Content.`;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });

      expect(chunks[0].metadata.headers[0]).toBe('Hello <World> & "Quotes"');
    });

    test("should handle unicode in content", async () => {
      const markdown = `# 你好世界

这是中文内容。

## Émojis 🎉

Content with émojis 🚀 and spëcial çharacters.`;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].metadata.headers).toContain("你好世界");
    });

    test("should handle windows line endings", async () => {
      const markdown = "# Header\r\n\r\nContent\r\n\r\n## Sub\r\n\r\nMore";

      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });

      expect(chunks.length).toBeGreaterThan(0);
    });

    test("should handle consecutive headers", async () => {
      const markdown = `# H1
## H2
### H3
#### H4

Finally some content.`;

      const chunks = await chunkMarkdown(markdown, { maxTokens: 500 });

      // Headers should be tracked correctly
      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.metadata.headers.length).toBeLessThanOrEqual(4);
    });
  });
});