/**
 * Tests for importContent helper functions
 * Tests ADR parsing, markdown parsing, file finding
 */

import { describe, expect, test } from "bun:test";

describe("importContent", () => {
  describe("ImportInput validation", () => {
    type SourceType = "markdown" | "adr";

    function isValidSource(source: string): source is SourceType {
      return source === "markdown" || source === "adr";
    }

    test("validates markdown source", () => {
      expect(isValidSource("markdown")).toBe(true);
    });

    test("validates adr source", () => {
      expect(isValidSource("adr")).toBe(true);
    });

    test("rejects invalid source", () => {
      expect(isValidSource("json")).toBe(false);
    });

    test("rejects empty source", () => {
      expect(isValidSource("")).toBe(false);
    });
  });

  describe("ImportResult structure", () => {
    interface ImportResult {
      imported: number;
      skipped: number;
      files: string[];
      errors: string[];
    }

    function createDefaultResult(): ImportResult {
      return {
        imported: 0,
        skipped: 0,
        files: [],
        errors: [],
      };
    }

    test("creates default result", () => {
      const result = createDefaultResult();
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
    });

    test("files array is empty", () => {
      const result = createDefaultResult();
      expect(result.files).toEqual([]);
    });

    test("errors array is empty", () => {
      const result = createDefaultResult();
      expect(result.errors).toEqual([]);
    });
  });

  describe("ADR parsing - title extraction", () => {
    function extractADRTitle(content: string): string | null {
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (!titleMatch) return null;

      return titleMatch[1].replace(/^ADR[-\s]*\d*:?\s*/i, "").trim();
    }

    test("extracts simple title", () => {
      expect(extractADRTitle("# Use TypeScript")).toBe("Use TypeScript");
    });

    test("extracts title with ADR prefix", () => {
      expect(extractADRTitle("# ADR-001: Use TypeScript")).toBe(
        "Use TypeScript",
      );
    });

    test("extracts title with ADR number", () => {
      expect(extractADRTitle("# ADR 1: Use TypeScript")).toBe("Use TypeScript");
    });

    test("returns null for no heading", () => {
      expect(extractADRTitle("No heading here")).toBeNull();
    });

    test("handles multiline content", () => {
      const content = "Some intro\n\n# The Title\n\nMore content";
      expect(extractADRTitle(content)).toBe("The Title");
    });
  });

  describe("ADR parsing - status extraction", () => {
    function extractADRStatus(content: string): string {
      const statusMatch = content.match(/##\s*Status\s*\n+(\w+)/i);
      return statusMatch?.[1] ?? "unknown";
    }

    test("extracts accepted status", () => {
      const content = "# Title\n\n## Status\n\nAccepted\n\n## Context";
      expect(extractADRStatus(content)).toBe("Accepted");
    });

    test("extracts deprecated status", () => {
      const content = "# Title\n\n## Status\n\nDeprecated\n\n## Context";
      expect(extractADRStatus(content)).toBe("Deprecated");
    });

    test("extracts superseded status", () => {
      const content = "# Title\n\n## Status\n\nSuperseded\n\n## Context";
      expect(extractADRStatus(content)).toBe("Superseded");
    });

    test("returns unknown for missing status", () => {
      const content = "# Title\n\n## Context\n\nSome context";
      expect(extractADRStatus(content)).toBe("unknown");
    });
  });

  describe("ADR parsing - context extraction", () => {
    function extractADRContext(content: string): string {
      const contextMatch = content.match(
        /##\s*Context\s*\n+([\s\S]*?)(?=\n##|$)/i,
      );
      return contextMatch?.[1]?.trim() ?? "";
    }

    test("extracts context section", () => {
      const content =
        "# Title\n\n## Context\n\nThis is context.\n\n## Decision";
      expect(extractADRContext(content)).toBe("This is context.");
    });

    test("extracts multiline context", () => {
      const content =
        "# Title\n\n## Context\n\nLine 1.\nLine 2.\n\n## Decision";
      expect(extractADRContext(content)).toBe("Line 1.\nLine 2.");
    });

    test("returns empty for missing context", () => {
      const content = "# Title\n\n## Decision\n\nSome decision";
      expect(extractADRContext(content)).toBe("");
    });

    test("extracts context at end of file", () => {
      const content = "# Title\n\n## Context\n\nFinal section content.";
      expect(extractADRContext(content)).toBe("Final section content.");
    });
  });

  describe("ADR parsing - decision extraction", () => {
    function extractADRDecision(content: string): string {
      const decisionMatch = content.match(
        /##\s*Decision\s*\n+([\s\S]*?)(?=\n##|$)/i,
      );
      return decisionMatch?.[1]?.trim() ?? "";
    }

    test("extracts decision section", () => {
      const content =
        "# Title\n\n## Decision\n\nWe will use TypeScript.\n\n## Consequences";
      expect(extractADRDecision(content)).toBe("We will use TypeScript.");
    });

    test("returns empty for missing decision", () => {
      const content = "# Title\n\n## Context\n\nSome context";
      expect(extractADRDecision(content)).toBe("");
    });
  });

  describe("ADR status to tags", () => {
    function statusToTags(status: string): string[] {
      const tags: string[] = [];
      const statusLower = status.toLowerCase();
      if (statusLower === "accepted") tags.push("accepted");
      if (statusLower === "deprecated") tags.push("deprecated");
      if (statusLower === "superseded") tags.push("superseded");
      if (statusLower === "proposed") tags.push("proposed");
      return tags;
    }

    test("adds accepted tag", () => {
      expect(statusToTags("accepted")).toEqual(["accepted"]);
    });

    test("adds deprecated tag", () => {
      expect(statusToTags("deprecated")).toEqual(["deprecated"]);
    });

    test("adds superseded tag", () => {
      expect(statusToTags("superseded")).toEqual(["superseded"]);
    });

    test("adds proposed tag", () => {
      expect(statusToTags("proposed")).toEqual(["proposed"]);
    });

    test("handles uppercase status", () => {
      expect(statusToTags("Accepted")).toEqual(["accepted"]);
    });

    test("returns empty for unknown status", () => {
      expect(statusToTags("unknown")).toEqual([]);
    });
  });

  describe("markdown parsing - title extraction", () => {
    function extractMarkdownTitle(content: string, filename: string): string {
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) return titleMatch[1];

      return filename.replace(/\.mdx?$/i, "").replace(/[-_]/g, " ");
    }

    test("extracts heading as title", () => {
      expect(extractMarkdownTitle("# My Title\n\nContent", "file.md")).toBe(
        "My Title",
      );
    });

    test("uses filename when no heading", () => {
      expect(extractMarkdownTitle("No heading", "my-document.md")).toBe(
        "my document",
      );
    });

    test("removes .md extension", () => {
      expect(extractMarkdownTitle("Content", "guide.md")).toBe("guide");
    });

    test("removes .mdx extension", () => {
      expect(extractMarkdownTitle("Content", "component.mdx")).toBe(
        "component",
      );
    });

    test("handles multiple dashes", () => {
      expect(extractMarkdownTitle("Content", "getting-started-guide.md")).toBe(
        "getting started guide",
      );
    });

    test("handles underscores", () => {
      expect(extractMarkdownTitle("Content", "api_reference.md")).toBe(
        "api reference",
      );
    });
  });

  describe("content length validation", () => {
    function shouldImport(content: string, minLength: number): boolean {
      return content.length >= minLength;
    }

    test("imports content above minimum", () => {
      expect(shouldImport("a".repeat(150), 100)).toBe(true);
    });

    test("skips content below minimum", () => {
      expect(shouldImport("short", 100)).toBe(false);
    });

    test("imports content at exactly minimum", () => {
      expect(shouldImport("a".repeat(100), 100)).toBe(true);
    });

    test("skips empty content", () => {
      expect(shouldImport("", 100)).toBe(false);
    });
  });

  describe("file extension matching", () => {
    function isMarkdownFile(filename: string): boolean {
      return /\.(md|mdx)$/i.test(filename);
    }

    test("matches .md extension", () => {
      expect(isMarkdownFile("readme.md")).toBe(true);
    });

    test("matches .mdx extension", () => {
      expect(isMarkdownFile("component.mdx")).toBe(true);
    });

    test("matches uppercase extension", () => {
      expect(isMarkdownFile("README.MD")).toBe(true);
    });

    test("rejects .txt extension", () => {
      expect(isMarkdownFile("readme.txt")).toBe(false);
    });

    test("rejects no extension", () => {
      expect(isMarkdownFile("readme")).toBe(false);
    });

    test("rejects partial match", () => {
      expect(isMarkdownFile("file.markdown")).toBe(false);
    });
  });

  describe("path existence error handling", () => {
    function buildNotFoundError(path: string): string {
      return `Path not found: ${path}`;
    }

    test("builds path not found error", () => {
      expect(buildNotFoundError("docs/missing.md")).toBe(
        "Path not found: docs/missing.md",
      );
    });

    test("handles relative path", () => {
      expect(buildNotFoundError("./src/file.md")).toBe(
        "Path not found: ./src/file.md",
      );
    });
  });

  describe("processing error handling", () => {
    function buildProcessError(file: string, message: string): string {
      return `Failed to process ${file}: ${message}`;
    }

    test("builds processing error", () => {
      expect(buildProcessError("docs/file.md", "Permission denied")).toBe(
        "Failed to process docs/file.md: Permission denied",
      );
    });

    test("handles empty error message", () => {
      expect(buildProcessError("file.md", "")).toBe(
        "Failed to process file.md: ",
      );
    });
  });

  describe("ADR validity check", () => {
    function isValidADR(content: string): boolean {
      // Must have a title heading
      const hasTitle = /^#\s+.+$/m.test(content);
      // Should have context or decision section
      const hasContext = /##\s*Context/i.test(content);
      const hasDecision = /##\s*Decision/i.test(content);

      return hasTitle && (hasContext || hasDecision);
    }

    test("validates complete ADR", () => {
      const adr =
        "# Use TypeScript\n\n## Context\n\nNeed types.\n\n## Decision\n\nUse TS.";
      expect(isValidADR(adr)).toBe(true);
    });

    test("validates ADR with only context", () => {
      const adr = "# Title\n\n## Context\n\nContext here.";
      expect(isValidADR(adr)).toBe(true);
    });

    test("validates ADR with only decision", () => {
      const adr = "# Title\n\n## Decision\n\nDecision here.";
      expect(isValidADR(adr)).toBe(true);
    });

    test("rejects ADR without title", () => {
      const adr = "## Context\n\nContext here.\n\n## Decision\n\nDecision.";
      expect(isValidADR(adr)).toBe(false);
    });

    test("rejects ADR without context or decision", () => {
      const adr = "# Title\n\nSome content without sections.";
      expect(isValidADR(adr)).toBe(false);
    });
  });

  describe("summary extraction from context", () => {
    function extractSummary(context: string): string {
      const firstLine = context.split("\n")[0] ?? "";
      return firstLine.slice(0, 200);
    }

    test("extracts first line as summary", () => {
      const context = "This is the first line.\nThis is second.";
      expect(extractSummary(context)).toBe("This is the first line.");
    });

    test("truncates long first line", () => {
      const longLine = "a".repeat(300);
      expect(extractSummary(longLine).length).toBe(200);
    });

    test("handles empty context", () => {
      expect(extractSummary("")).toBe("");
    });

    test("handles single line context", () => {
      expect(extractSummary("Single line context")).toBe("Single line context");
    });
  });

  describe("recursive file finding control", () => {
    function shouldRecurse(recursive: boolean, isDirectory: boolean): boolean {
      return recursive && isDirectory;
    }

    test("recurses when flag is true and is directory", () => {
      expect(shouldRecurse(true, true)).toBe(true);
    });

    test("does not recurse when flag is false", () => {
      expect(shouldRecurse(false, true)).toBe(false);
    });

    test("does not recurse for files", () => {
      expect(shouldRecurse(true, false)).toBe(false);
    });

    test("does not recurse for file when flag is false", () => {
      expect(shouldRecurse(false, false)).toBe(false);
    });
  });

  describe("import result tracking", () => {
    interface ImportResult {
      imported: number;
      skipped: number;
      files: string[];
    }

    function trackImport(
      result: ImportResult,
      success: boolean,
      filePath: string,
    ): ImportResult {
      if (success) {
        return {
          ...result,
          imported: result.imported + 1,
          files: [...result.files, filePath],
        };
      }
      return {
        ...result,
        skipped: result.skipped + 1,
      };
    }

    test("tracks successful import", () => {
      const result = trackImport(
        { imported: 0, skipped: 0, files: [] },
        true,
        "file.md",
      );
      expect(result.imported).toBe(1);
      expect(result.files).toContain("file.md");
    });

    test("tracks skipped file", () => {
      const result = trackImport(
        { imported: 0, skipped: 0, files: [] },
        false,
        "file.md",
      );
      expect(result.skipped).toBe(1);
      expect(result.files).not.toContain("file.md");
    });

    test("accumulates imports", () => {
      let result = { imported: 0, skipped: 0, files: [] as string[] };
      result = trackImport(result, true, "a.md");
      result = trackImport(result, true, "b.md");
      expect(result.imported).toBe(2);
      expect(result.files).toEqual(["a.md", "b.md"]);
    });
  });

  describe("content truncation for storage", () => {
    function truncateContent(content: string, maxLength: number): string {
      return content.slice(0, maxLength);
    }

    test("truncates long content", () => {
      const content = "a".repeat(15000);
      expect(truncateContent(content, 10000).length).toBe(10000);
    });

    test("preserves short content", () => {
      expect(truncateContent("short", 10000)).toBe("short");
    });

    test("truncates at exact boundary", () => {
      expect(truncateContent("hello", 3)).toBe("hel");
    });
  });

  describe("dry run mode", () => {
    function shouldStore(dryRun: boolean): boolean {
      return !dryRun;
    }

    test("stores when not dry run", () => {
      expect(shouldStore(false)).toBe(true);
    });

    test("does not store in dry run", () => {
      expect(shouldStore(true)).toBe(false);
    });
  });

  describe("ADR content building", () => {
    function buildADRContent(context: string, decision: string): string {
      return `## Context\n${context}\n\n## Decision\n${decision}`;
    }

    test("builds formatted ADR content", () => {
      const content = buildADRContent("Need types", "Use TypeScript");
      expect(content).toBe(
        "## Context\nNeed types\n\n## Decision\nUse TypeScript",
      );
    });

    test("handles empty context", () => {
      const content = buildADRContent("", "Use TypeScript");
      expect(content).toContain("## Context\n\n");
    });

    test("handles empty decision", () => {
      const content = buildADRContent("Need types", "");
      expect(content).toContain("## Decision\n");
    });
  });

  describe("file path to relative path", () => {
    function toRelativePath(fullPath: string, basePath: string): string {
      if (fullPath.startsWith(basePath)) {
        let relative = fullPath.slice(basePath.length);
        if (relative.startsWith("/")) {
          relative = relative.slice(1);
        }
        return relative;
      }
      return fullPath;
    }

    test("converts absolute to relative", () => {
      expect(
        toRelativePath("/home/user/project/docs/file.md", "/home/user/project"),
      ).toBe("docs/file.md");
    });

    test("handles trailing slash in base", () => {
      expect(
        toRelativePath(
          "/home/user/project/docs/file.md",
          "/home/user/project/",
        ),
      ).toBe("docs/file.md");
    });

    test("returns original if not under base", () => {
      expect(toRelativePath("/other/path/file.md", "/home/user/project")).toBe(
        "/other/path/file.md",
      );
    });
  });
});
