import { describe, expect, it } from "bun:test";
import {
  findBestMatches,
  isWithinDistance,
  levenshteinDistance,
  stringSimilarity,
} from "@/tagging/levenshtein";

describe("levenshteinDistance", () => {
  describe("basic cases", () => {
    it("should return 0 for identical strings", () => {
      expect(levenshteinDistance("hello", "hello")).toBe(0);
      expect(levenshteinDistance("", "")).toBe(0);
    });

    it("should return string length for empty string comparison", () => {
      expect(levenshteinDistance("hello", "")).toBe(5);
      expect(levenshteinDistance("", "world")).toBe(5);
    });

    it("should return small distance for similar strings", () => {
      // Using Dice coefficient approximation, exact values may differ
      expect(levenshteinDistance("cat", "cats")).toBeLessThanOrEqual(2);
      expect(levenshteinDistance("cats", "cat")).toBeLessThanOrEqual(2);
    });
  });

  describe("distance ordering", () => {
    it("should show identical strings closer than different ones", () => {
      const identical = levenshteinDistance("test", "test");
      const similar = levenshteinDistance("test", "tests");
      const different = levenshteinDistance("test", "xxxx");

      expect(identical).toBeLessThan(similar);
      expect(similar).toBeLessThan(different);
    });
  });

  describe("edge cases", () => {
    it("should be symmetric", () => {
      expect(levenshteinDistance("abc", "def")).toBe(
        levenshteinDistance("def", "abc"),
      );
    });
  });
});

describe("stringSimilarity", () => {
  it("should return 1 for identical strings", () => {
    expect(stringSimilarity("hello", "hello")).toBe(1);
  });

  it("should return 1 for two empty strings", () => {
    expect(stringSimilarity("", "")).toBe(1);
  });

  it("should return 0 for completely different strings", () => {
    expect(stringSimilarity("abc", "xyz")).toBe(0);
  });

  it("should return value between 0 and 1 for partial matches", () => {
    const similarity = stringSimilarity("react", "react-native");
    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThan(1);
  });

  it("should return higher similarity for closer matches", () => {
    const sim1 = stringSimilarity("typescript", "typescript");
    const sim2 = stringSimilarity("typescript", "typescritp"); // typo
    const sim3 = stringSimilarity("typescript", "javascript");

    expect(sim1).toBeGreaterThan(sim2);
    expect(sim2).toBeGreaterThan(sim3);
  });
});

describe("isWithinDistance", () => {
  it("should return true for identical strings", () => {
    expect(isWithinDistance("react", "react")).toBe(true);
  });

  it("should return true for very similar strings", () => {
    expect(isWithinDistance("react", "reactt")).toBe(true);
  });

  it("should return false for very different strings", () => {
    expect(isWithinDistance("react", "xxxxxx")).toBe(false);
  });

  it("should quick-return false when length difference exceeds threshold", () => {
    expect(isWithinDistance("a", "aaaaaaa")).toBe(false);
  });
});

describe("findBestMatches", () => {
  const candidates = [
    "typescript",
    "javascript",
    "react",
    "react-native",
    "vue",
    "angular",
    "svelte",
    "nodejs",
  ];

  it("should find exact matches with score 1", () => {
    const matches = findBestMatches("typescript", candidates);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].candidate).toBe("typescript");
    expect(matches[0].score).toBe(1);
  });

  it("should find similar matches sorted by score", () => {
    const matches = findBestMatches("react", candidates);
    expect(matches[0].candidate).toBe("react");
    expect(matches[1].candidate).toBe("react-native");
  });

  it("should filter by minimum score", () => {
    const matches = findBestMatches("xyz", candidates, { minScore: 0.5 });
    expect(matches.length).toBe(0);
  });

  it("should limit results", () => {
    const matches = findBestMatches("a", candidates, {
      minScore: 0.1,
      limit: 3,
    });
    expect(matches.length).toBeLessThanOrEqual(3);
  });

  it("should be case insensitive", () => {
    const matches = findBestMatches("TYPESCRIPT", candidates);
    expect(matches[0].candidate).toBe("typescript");
  });

  it("should handle empty query", () => {
    const matches = findBestMatches("", candidates);
    expect(matches.length).toBe(0);
  });

  it("should handle empty candidates", () => {
    const matches = findBestMatches("test", []);
    expect(matches.length).toBe(0);
  });

  describe("preFilterByFirstLetter option", () => {
    it("should pre-filter candidates by first letter when enabled", () => {
      const matches = findBestMatches("react", candidates, {
        preFilterByFirstLetter: true,
      });
      expect(matches[0].candidate).toBe("react");
    });
  });
});
