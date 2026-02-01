/**
 * Tests for slugify utility
 *
 * Verifies that formatTag() produces consistent slug output matching
 * the original hand-rolled implementation behavior.
 */

import { describe, expect, test } from "bun:test";
import { formatTag } from "../../utils/slugify";

describe("formatTag", () => {
  describe("basic transformations", () => {
    test("should convert to lowercase", () => {
      expect(formatTag("Hello")).toBe("hello");
      expect(formatTag("WORLD")).toBe("world");
      expect(formatTag("TypeScript")).toBe("typescript");
    });

    test("should replace spaces with hyphens", () => {
      expect(formatTag("Hello World")).toBe("hello-world");
      expect(formatTag("API Key")).toBe("api-key");
      expect(formatTag("user name")).toBe("user-name");
    });

    test("should handle multiple spaces", () => {
      expect(formatTag("hello   world")).toBe("hello-world");
      expect(formatTag("foo  bar  baz")).toBe("foo-bar-baz");
    });
  });

  describe("special characters", () => {
    test("should replace special characters with hyphens", () => {
      // Original impl: replace non-alphanumeric with hyphen, then collapse
      expect(formatTag("hello@world")).toBe("hello-world");
      expect(formatTag("foo#bar")).toBe("foo-bar");
      expect(formatTag("test!case")).toBe("test-case");
    });

    test("should handle underscores", () => {
      expect(formatTag("hello_world")).toBe("hello-world");
      expect(formatTag("foo_bar_baz")).toBe("foo-bar-baz");
    });

    test("should handle dots", () => {
      expect(formatTag("hello.world")).toBe("hello-world");
      expect(formatTag("file.name")).toBe("file-name");
    });

    test("should handle mixed special characters", () => {
      expect(formatTag("hello@world#test")).toBe("hello-world-test");
      expect(formatTag("foo_bar.baz")).toBe("foo-bar-baz");
    });
  });

  describe("hyphens", () => {
    test("should collapse multiple hyphens", () => {
      expect(formatTag("hello--world")).toBe("hello-world");
      expect(formatTag("foo---bar")).toBe("foo-bar");
    });

    test("should trim leading hyphens", () => {
      expect(formatTag("-hello")).toBe("hello");
      expect(formatTag("--world")).toBe("world");
    });

    test("should trim trailing hyphens", () => {
      expect(formatTag("hello-")).toBe("hello");
      expect(formatTag("world--")).toBe("world");
    });

    test("should handle leading and trailing hyphens together", () => {
      expect(formatTag("-hello-")).toBe("hello");
      expect(formatTag("--world--")).toBe("world");
    });
  });

  describe("numbers", () => {
    test("should preserve numbers", () => {
      expect(formatTag("test123")).toBe("test123");
      expect(formatTag("123test")).toBe("123test");
      expect(formatTag("test123test")).toBe("test123test");
    });

    test("should handle numbers with spaces", () => {
      expect(formatTag("version 2")).toBe("version-2");
      expect(formatTag("v2 release")).toBe("v2-release");
    });
  });

  describe("edge cases", () => {
    test("should handle empty string", () => {
      expect(formatTag("")).toBe("");
    });

    test("should handle whitespace only", () => {
      expect(formatTag("   ")).toBe("");
    });

    test("should handle single character", () => {
      expect(formatTag("a")).toBe("a");
      expect(formatTag("A")).toBe("a");
      expect(formatTag("1")).toBe("1");
    });

    test("should handle already formatted tags", () => {
      expect(formatTag("hello-world")).toBe("hello-world");
      expect(formatTag("api-key")).toBe("api-key");
    });
  });

  describe("real-world tag examples", () => {
    test("should handle technology tags", () => {
      expect(formatTag("TypeScript")).toBe("typescript");
      expect(formatTag("Node.js")).toBe("node-js");
      expect(formatTag("React Native")).toBe("react-native");
      expect(formatTag("Vue.js")).toBe("vue-js");
      expect(formatTag("Next.js")).toBe("next-js");
    });

    test("should handle concept tags", () => {
      expect(formatTag("API Design")).toBe("api-design");
      expect(formatTag("Error Handling")).toBe("error-handling");
      expect(formatTag("Code Review")).toBe("code-review");
      expect(formatTag("Unit Testing")).toBe("unit-testing");
    });

    test("should handle action tags", () => {
      expect(formatTag("Bug Fix")).toBe("bug-fix");
      expect(formatTag("Refactoring")).toBe("refactoring");
      expect(formatTag("Performance Optimization")).toBe(
        "performance-optimization",
      );
    });
  });

  describe("backward compatibility with original formatTag", () => {
    // These tests ensure the slugify-based implementation matches
    // the original hand-rolled regex implementation:
    //
    // function formatTag(tag: string): string {
    //   return tag
    //     .toLowerCase()
    //     .replace(/[^a-z0-9-]/g, "-")
    //     .replace(/-+/g, "-")
    //     .replace(/^-|-$/g, "");
    // }

    test("should match original behavior for common inputs", () => {
      // The original implementation replaced non-alphanumeric (except hyphen) with hyphen
      // then collapsed hyphens and trimmed
      const testCases = [
        { input: "hello world", expected: "hello-world" },
        { input: "Hello World", expected: "hello-world" },
        { input: "HELLO WORLD", expected: "hello-world" },
        { input: "hello-world", expected: "hello-world" },
        { input: "hello_world", expected: "hello-world" },
        { input: "hello.world", expected: "hello-world" },
        { input: "hello@world", expected: "hello-world" },
        { input: "hello#world", expected: "hello-world" },
        { input: "  hello  world  ", expected: "hello-world" },
        { input: "test123", expected: "test123" },
        { input: "123test", expected: "123test" },
        { input: "a-b-c", expected: "a-b-c" },
        { input: "a--b--c", expected: "a-b-c" },
        { input: "-hello-", expected: "hello" },
        { input: "", expected: "" },
      ];

      for (const { input, expected } of testCases) {
        expect(formatTag(input)).toBe(expected);
      }
    });
  });
});
