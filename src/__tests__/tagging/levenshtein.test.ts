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

    it("should handle single character difference", () => {
      expect(levenshteinDistance("cat", "car")).toBe(1); // substitution
      expect(levenshteinDistance("cat", "cats")).toBe(1); // insertion
      expect(levenshteinDistance("cats", "cat")).toBe(1); // deletion
    });
  });

  describe("multiple edits", () => {
    it("should calculate correct distance for multiple substitutions", () => {
      expect(levenshteinDistance("abc", "xyz")).toBe(3);
    });

    it("should calculate correct distance for mixed operations", () => {
      expect(levenshteinDistance("kitten", "sitting")).toBe(3);
      expect(levenshteinDistance("saturday", "sunday")).toBe(3);
    });
  });

  describe("edge cases", () => {
    it("should handle unicode characters", () => {
      expect(levenshteinDistance("café", "cafe")).toBe(1);
    });

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

  it("should return 0 for completely different strings of same length", () => {
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
  it("should return true for strings within default threshold (3)", () => {
    expect(isWithinDistance("react", "reactt")).toBe(true); // distance 1
    expect(isWithinDistance("react", "recat")).toBe(true); // distance 2
    expect(isWithinDistance("react", "rectt")).toBe(true); // distance 3
  });

  it("should return false for strings beyond default threshold", () => {
    expect(isWithinDistance("react", "rexxxxx")).toBe(false); // distance > 3
  });

  it("should use custom threshold", () => {
    expect(isWithinDistance("react", "rexxxxx", 5)).toBe(true);
    expect(isWithinDistance("react", "r", 1)).toBe(false);
  });

  it("should quick-return false when length difference exceeds threshold", () => {
    // "a" vs "aaaaaaa" has length diff of 6, which exceeds threshold 3
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
    // "react" should be first with score 1, "react-native" second
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

    it("should fall back to all candidates if pre-filter yields too few", () => {
      // Use "r" which has some candidates starting with it (react, react-native)
      // but also matches other candidates when falling back
      const matches = findBestMatches("re", candidates, {
        preFilterByFirstLetter: true,
        limit: 10,
      });
      // Should find react and react-native with high scores
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].candidate).toBe("react");
    });
  });
});
