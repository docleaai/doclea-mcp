/**
 * Tests for token counting utility using js-tiktoken (cl100k_base encoding)
 */

import { describe, expect, test } from "bun:test";
import {
  countTokens,
  countTokensBatch,
  fitsInTokenBudget,
  getTokenInfo,
  splitIntoTokenChunks,
  truncateToTokens,
} from "../../utils/tokens";

describe("Token Counting", () => {
  describe("countTokens", () => {
    test("should count tokens accurately for simple text", async () => {
      const count = await countTokens("Hello world");
      // With cl100k_base: "Hello" = 1, " world" = 1 = 2 tokens
      expect(count).toBe(2);
    });

    test("should handle empty strings", async () => {
      expect(await countTokens("")).toBe(0);
    });

    test("should handle whitespace-only strings", async () => {
      const count = await countTokens("   ");
      // Three spaces typically encode as a single token in cl100k_base
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test("should handle unicode correctly", async () => {
      const count = await countTokens("Hello 世界");
      // Unicode characters use multiple tokens in cl100k_base
      expect(count).toBeGreaterThan(2);
    });

    test("should handle emojis", async () => {
      const count = await countTokens("Hello 🌍");
      expect(count).toBeGreaterThan(0);
    });

    test("should handle long text", async () => {
      const longText = "word ".repeat(1000);
      const count = await countTokens(longText);
      // "word " is typically 2 tokens, so 1000 repetitions ~ 2000 tokens
      expect(count).toBeGreaterThan(1000);
    });

    test("should handle special characters", async () => {
      const count = await countTokens("Hello! @#$%^&*() World?");
      expect(count).toBeGreaterThan(0);
    });

    test("should handle newlines", async () => {
      const count = await countTokens("Hello\nWorld\n\nTest");
      expect(count).toBeGreaterThan(0);
    });

    test("should handle code snippets", async () => {
      const code = `function hello() {
  console.log("Hello, World!");
  return 42;
}`;
      const count = await countTokens(code);
      expect(count).toBeGreaterThan(10);
    });
  });

  describe("truncateToTokens", () => {
    test("should truncate to exact token limit", async () => {
      const longText = "word ".repeat(1000);
      const truncated = await truncateToTokens(longText, 100);
      const count = await countTokens(truncated);
      // Should be exactly 100 tokens
      expect(count).toBe(100);
    });

    test("should not truncate text under limit", async () => {
      const shortText = "Hello world";
      const truncated = await truncateToTokens(shortText, 100);
      expect(truncated).toBe(shortText);
    });

    test("should handle empty string", async () => {
      expect(await truncateToTokens("", 100)).toBe("");
    });

    test("should handle zero max tokens", async () => {
      expect(await truncateToTokens("Hello world", 0)).toBe("");
    });

    test("should handle negative max tokens", async () => {
      expect(await truncateToTokens("Hello world", -5)).toBe("");
    });

    test("should preserve whole tokens", async () => {
      const text = "Hello world, this is a longer sentence for testing.";
      const truncated = await truncateToTokens(text, 3);
      // Should decode properly without partial tokens
      const reencoded = await countTokens(truncated);
      expect(reencoded).toBe(3);
    });
  });

  describe("countTokensBatch", () => {
    test("should count tokens for multiple texts", async () => {
      const texts = ["Hello", "World", "Test string here"];
      const counts = await countTokensBatch(texts);
      expect(counts).toHaveLength(3);
      expect(counts[0]).toBe(1); // "Hello" = 1 token
      expect(counts[1]).toBe(1); // "World" = 1 token
      expect(counts[2]).toBeGreaterThan(1); // "Test string here" > 1 token
    });

    test("should handle empty array", async () => {
      const counts = await countTokensBatch([]);
      expect(counts).toEqual([]);
    });

    test("should handle array with empty strings", async () => {
      const counts = await countTokensBatch(["Hello", "", "World"]);
      expect(counts).toHaveLength(3);
      expect(counts[0]).toBe(1);
      expect(counts[1]).toBe(0);
      expect(counts[2]).toBe(1);
    });

    test("should be consistent with single countTokens calls", async () => {
      const texts = ["Hello world", "Test message", "Another one"];
      const batchCounts = await countTokensBatch(texts);
      const singleCounts: number[] = [];
      for (const text of texts) {
        singleCounts.push(await countTokens(text));
      }
      expect(batchCounts).toEqual(singleCounts);
    });
  });

  describe("fitsInTokenBudget", () => {
    test("should return true for text under budget", async () => {
      const result = await fitsInTokenBudget("Hello", 100);
      expect(result).toBe(true);
    });

    test("should return false for text over budget", async () => {
      const longText = "word ".repeat(1000);
      const result = await fitsInTokenBudget(longText, 10);
      expect(result).toBe(false);
    });

    test("should return true for exact fit", async () => {
      const text = "Hello world";
      const count = await countTokens(text);
      const result = await fitsInTokenBudget(text, count);
      expect(result).toBe(true);
    });

    test("should handle empty string", async () => {
      const result = await fitsInTokenBudget("", 0);
      expect(result).toBe(true);
    });
  });

  describe("splitIntoTokenChunks", () => {
    test("should split long text into chunks", async () => {
      const longText = "word ".repeat(500);
      const chunks = await splitIntoTokenChunks(longText, 100);
      expect(chunks.length).toBeGreaterThan(1);

      // Each chunk should be exactly at limit (except possibly the last)
      for (let i = 0; i < chunks.length - 1; i++) {
        const count = await countTokens(chunks[i]);
        expect(count).toBe(100);
      }
      // Last chunk can be smaller
      const lastCount = await countTokens(chunks[chunks.length - 1]);
      expect(lastCount).toBeLessThanOrEqual(100);
    });

    test("should not split text under limit", async () => {
      const shortText = "Hello world";
      const chunks = await splitIntoTokenChunks(shortText, 100);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(shortText);
    });

    test("should handle overlap", async () => {
      // "word " is 2 tokens in cl100k_base, so 200 repetitions = 201 tokens
      const longText = "word ".repeat(200);
      const chunksWithOverlap = await splitIntoTokenChunks(longText, 50, 20);
      const chunksWithoutOverlap = await splitIntoTokenChunks(longText, 50, 0);

      // With overlap, we get more chunks due to sliding window
      // Without overlap (step 50): ceil(201/50) = 5 chunks
      // With overlap 20 (step 30): positions 0, 30, 60, 90, 120, 150, 180 = 7 chunks
      expect(chunksWithOverlap.length).toBeGreaterThan(
        chunksWithoutOverlap.length,
      );
    });

    test("should handle empty string", async () => {
      const chunks = await splitIntoTokenChunks("", 100);
      expect(chunks).toEqual([]);
    });

    test("should handle zero chunk size", async () => {
      const chunks = await splitIntoTokenChunks("Hello world", 0);
      expect(chunks).toEqual([]);
    });
  });

  describe("getTokenInfo", () => {
    test("should return token information", async () => {
      const info = await getTokenInfo("Hello world");
      expect(info.count).toBe(2);
      expect(info.tokens).toBeInstanceOf(Array);
      expect(info.tokenIds).toBeInstanceOf(Array);
      expect(info.tokens.length).toBe(info.count);
      expect(info.tokenIds.length).toBe(info.count);
    });

    test("should handle empty string", async () => {
      const info = await getTokenInfo("");
      expect(info.count).toBe(0);
      expect(info.tokens).toEqual([]);
      expect(info.tokenIds).toEqual([]);
    });

    test("should return consistent results", async () => {
      const info1 = await getTokenInfo("Test message");
      const info2 = await getTokenInfo("Test message");
      expect(info1.count).toBe(info2.count);
      expect(info1.tokenIds).toEqual(info2.tokenIds);
    });

    test("should return decodable tokens", async () => {
      const info = await getTokenInfo("Hello world");
      // Joining decoded tokens should approximate original text
      const rejoined = info.tokens.join("");
      expect(rejoined).toBe("Hello world");
    });
  });

  describe("Synchronous operation (no caching needed)", () => {
    test("should be fast for repeated calls", async () => {
      // tiktoken is synchronous and doesn't need lazy loading
      const start1 = Date.now();
      await countTokens("First call");
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await countTokens("Second call");
      const time2 = Date.now() - start2;

      // Both calls should be very fast (< 50ms each)
      expect(time1).toBeLessThan(50);
      expect(time2).toBeLessThan(50);
    });
  });

  describe("Edge cases", () => {
    test("should handle very long single word", async () => {
      const longWord = "a".repeat(10000);
      const count = await countTokens(longWord);
      expect(count).toBeGreaterThan(0);
    });

    test("should handle mixed scripts", async () => {
      const mixed = "Hello Привет 你好 مرحبا";
      const count = await countTokens(mixed);
      expect(count).toBeGreaterThan(0);
    });

    test("should handle control characters", async () => {
      const withControl = "Hello\x00World\x1F";
      const count = await countTokens(withControl);
      expect(count).toBeGreaterThan(0);
    });

    test("should handle null bytes", async () => {
      const withNull = "Hello\0World";
      const count = await countTokens(withNull);
      expect(count).toBeGreaterThan(0);
    });

    test("should handle tab characters", async () => {
      const withTabs = "Hello\t\tWorld";
      const count = await countTokens(withTabs);
      expect(count).toBeGreaterThan(0);
    });
  });
});
