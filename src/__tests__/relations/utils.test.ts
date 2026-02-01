/**
 * Tests for relation detection utility functions
 * Covers extractKeywords, Jaccard similarity, file overlap, and temporal scoring
 */

import { describe, expect, test } from "bun:test";
import {
  calculateFileOverlapScore,
  calculateJaccardSimilarity,
  calculateOverlapScore,
  calculateTemporalScore,
  extractKeywords,
  getSharedFiles,
} from "../../relations/utils";

describe("extractKeywords", () => {
  describe("basic functionality", () => {
    test("extracts meaningful words from text", () => {
      const result = extractKeywords("authentication system design");
      expect(result).toContain("authentication");
      expect(result).toContain("system");
      expect(result).toContain("design");
    });

    test("returns empty array for empty string", () => {
      expect(extractKeywords("")).toEqual([]);
    });

    test("returns empty array for null input", () => {
      // @ts-expect-error testing null input
      expect(extractKeywords(null)).toEqual([]);
    });

    test("returns empty array for undefined input", () => {
      // @ts-expect-error testing undefined input
      expect(extractKeywords(undefined)).toEqual([]);
    });

    test("returns empty array for non-string input", () => {
      // @ts-expect-error testing number input
      expect(extractKeywords(123)).toEqual([]);
    });
  });

  describe("stopword filtering", () => {
    test("removes common English stopwords", () => {
      const result = extractKeywords(
        "the quick brown fox jumps over the lazy dog",
      );
      expect(result).not.toContain("the");
      expect(result).not.toContain("over");
      expect(result).toContain("quick");
      expect(result).toContain("brown");
      expect(result).toContain("fox");
      expect(result).toContain("jumps");
      expect(result).toContain("lazy");
      expect(result).toContain("dog");
    });

    test("removes common pronouns", () => {
      const result = extractKeywords("he it they we you");
      expect(result).not.toContain("he");
      expect(result).not.toContain("it");
      expect(result).not.toContain("they");
      expect(result).not.toContain("we");
      expect(result).not.toContain("you");
    });

    test("removes auxiliary verbs", () => {
      const result = extractKeywords(
        "is are was were be been being have has had",
      );
      expect(result).not.toContain("is");
      expect(result).not.toContain("are");
      expect(result).not.toContain("was");
      expect(result).not.toContain("were");
      expect(result).not.toContain("be");
      expect(result).not.toContain("been");
    });

    test("removes prepositions", () => {
      const result = extractKeywords("to of in for on with at by from");
      expect(result).not.toContain("to");
      expect(result).not.toContain("of");
      expect(result).not.toContain("in");
      expect(result).not.toContain("for");
      expect(result).not.toContain("on");
    });

    test("removes conjunctions", () => {
      const result = extractKeywords("and but or nor so yet");
      expect(result).not.toContain("and");
      expect(result).not.toContain("but");
      expect(result).not.toContain("or");
    });
  });

  describe("technical terms preservation", () => {
    test("preserves API-related terms", () => {
      const result = extractKeywords("api endpoint graphql rest");
      expect(result).toContain("api");
      expect(result).toContain("endpoint");
      expect(result).toContain("graphql");
      expect(result).toContain("rest");
    });

    test("preserves programming language abbreviations", () => {
      const result = extractKeywords("js ts py go rust java cpp");
      expect(result).toContain("js");
      expect(result).toContain("ts");
      expect(result).toContain("py");
      expect(result).toContain("go");
    });

    test("preserves authentication terms", () => {
      const result = extractKeywords("oauth jwt auth token");
      expect(result).toContain("oauth");
      expect(result).toContain("jwt");
      expect(result).toContain("auth");
      expect(result).toContain("token");
    });

    test("preserves database and config terms", () => {
      const result = extractKeywords("sql db env config async crud");
      expect(result).toContain("sql");
      expect(result).toContain("db");
      expect(result).toContain("env");
      expect(result).toContain("config");
      expect(result).toContain("async");
      expect(result).toContain("crud");
    });

    test("preserves http/https prefixes", () => {
      const result = extractKeywords("http https protocol");
      expect(result).toContain("http");
      expect(result).toContain("https");
    });
  });

  describe("normalization", () => {
    test("converts to lowercase", () => {
      const result = extractKeywords("Authentication SYSTEM Design");
      expect(result).toContain("authentication");
      expect(result).toContain("system");
      expect(result).toContain("design");
      expect(result).not.toContain("Authentication");
      expect(result).not.toContain("SYSTEM");
    });

    test("removes punctuation", () => {
      const result = extractKeywords("hello, world! how's it going?");
      expect(result).toContain("hello");
      expect(result).toContain("world");
      expect(result).not.toContain("hello,");
      expect(result).not.toContain("world!");
    });

    test("handles hyphenated words", () => {
      const result = extractKeywords("user-defined custom-built");
      expect(result).toContain("user-defined");
      expect(result).toContain("custom-built");
    });
  });

  describe("filtering rules", () => {
    test("filters out words shorter than 3 characters (non-technical)", () => {
      const result = extractKeywords("an is at ox ax");
      expect(result).not.toContain("an");
      expect(result).not.toContain("is");
      expect(result).not.toContain("at");
      // ox and ax are not technical prefixes, so they should be filtered
      expect(result).not.toContain("ox");
      expect(result).not.toContain("ax");
    });

    test("keeps short technical terms", () => {
      const result = extractKeywords("js ts py go");
      expect(result).toContain("js");
      expect(result).toContain("ts");
      expect(result).toContain("py");
      expect(result).toContain("go");
    });

    test("filters out pure numbers", () => {
      const result = extractKeywords("version 123 release 456");
      expect(result).toContain("version");
      expect(result).toContain("release");
      expect(result).not.toContain("123");
      expect(result).not.toContain("456");
    });

    test("keeps alphanumeric words", () => {
      const result = extractKeywords("user123 test456 api2");
      expect(result).toContain("user123");
      expect(result).toContain("test456");
      expect(result).toContain("api2");
    });
  });

  describe("deduplication", () => {
    test("removes duplicate words", () => {
      const result = extractKeywords("test test test unique");
      const testCount = result.filter((w) => w === "test").length;
      expect(testCount).toBe(1);
      expect(result).toContain("unique");
    });

    test("deduplication is case-insensitive", () => {
      const result = extractKeywords("Test TEST test");
      const testCount = result.filter((w) => w === "test").length;
      expect(testCount).toBe(1);
    });
  });

  describe("max keywords limit", () => {
    test("defaults to 20 keywords maximum", () => {
      const longText = Array.from({ length: 50 }, (_, i) => `word${i}`).join(
        " ",
      );
      const result = extractKeywords(longText);
      expect(result.length).toBeLessThanOrEqual(20);
    });

    test("respects custom maxKeywords parameter", () => {
      const longText = Array.from({ length: 50 }, (_, i) => `word${i}`).join(
        " ",
      );
      const result = extractKeywords(longText, 5);
      expect(result.length).toBeLessThanOrEqual(5);
    });

    test("returns all keywords if less than max", () => {
      const result = extractKeywords("authentication system design", 20);
      expect(result.length).toBe(3);
    });
  });

  describe("real-world scenarios", () => {
    test("extracts keywords from technical documentation", () => {
      const text =
        "The authentication module uses JWT tokens for secure API access. Configure the oauth2 settings in the config file.";
      const result = extractKeywords(text);
      expect(result).toContain("authentication");
      expect(result).toContain("module");
      expect(result).toContain("jwt");
      expect(result).toContain("tokens");
      expect(result).toContain("secure");
      expect(result).toContain("api");
      expect(result).toContain("access");
      expect(result).toContain("configure");
      expect(result).toContain("oauth2");
      expect(result).toContain("config");
      expect(result).toContain("file");
      // Should not contain stopwords
      expect(result).not.toContain("the");
      expect(result).not.toContain("for");
      expect(result).not.toContain("in");
    });

    test("extracts keywords from code comments", () => {
      const text =
        "// This function handles database connection pooling for SQL queries";
      const result = extractKeywords(text);
      expect(result).toContain("function");
      expect(result).toContain("handles");
      expect(result).toContain("database");
      expect(result).toContain("connection");
      expect(result).toContain("pooling");
      expect(result).toContain("sql");
      expect(result).toContain("queries");
    });
  });
});

describe("calculateJaccardSimilarity", () => {
  test("returns 1 for identical sets", () => {
    const result = calculateJaccardSimilarity(["a", "b", "c"], ["a", "b", "c"]);
    expect(result).toBe(1);
  });

  test("returns 0 for disjoint sets", () => {
    const result = calculateJaccardSimilarity(["a", "b"], ["c", "d"]);
    expect(result).toBe(0);
  });

  test("returns 0 for empty sets", () => {
    expect(calculateJaccardSimilarity([], [])).toBe(0);
    expect(calculateJaccardSimilarity(["a"], [])).toBe(0);
    expect(calculateJaccardSimilarity([], ["a"])).toBe(0);
  });

  test("calculates correct similarity for partial overlap", () => {
    // intersection: {a, b} = 2, union: {a, b, c, d} = 4
    const result = calculateJaccardSimilarity(["a", "b", "c"], ["a", "b", "d"]);
    expect(result).toBeCloseTo(0.5, 5);
  });

  test("is case insensitive", () => {
    const result = calculateJaccardSimilarity(["A", "B"], ["a", "b"]);
    expect(result).toBe(1);
  });

  test("handles duplicates correctly", () => {
    const result = calculateJaccardSimilarity(["a", "a", "b"], ["a", "b", "b"]);
    expect(result).toBe(1);
  });
});

describe("calculateOverlapScore", () => {
  test("returns Jaccard similarity between keywords and tags", () => {
    const keywords = ["authentication", "api", "security"];
    const tags = ["authentication", "api", "design"];
    const result = calculateOverlapScore(keywords, tags);
    // intersection: 2, union: 4
    expect(result).toBeCloseTo(0.5, 5);
  });
});

describe("calculateFileOverlapScore", () => {
  test("returns 0 for empty arrays", () => {
    expect(calculateFileOverlapScore([], [])).toBe(0);
    expect(calculateFileOverlapScore(["a.ts"], [])).toBe(0);
    expect(calculateFileOverlapScore([], ["a.ts"])).toBe(0);
  });

  test("returns 1 for identical file lists", () => {
    const files = ["src/a.ts", "src/b.ts"];
    expect(calculateFileOverlapScore(files, files)).toBe(1);
  });

  test("calculates overlap based on smaller set", () => {
    const source = ["a.ts"];
    const target = ["a.ts", "b.ts", "c.ts"];
    // 1 shared, min size is 1
    expect(calculateFileOverlapScore(source, target)).toBe(1);
  });

  test("calculates partial overlap correctly", () => {
    const source = ["a.ts", "b.ts"];
    const target = ["b.ts", "c.ts"];
    // 1 shared, min size is 2
    expect(calculateFileOverlapScore(source, target)).toBe(0.5);
  });
});

describe("getSharedFiles", () => {
  test("returns empty array when no shared files", () => {
    expect(getSharedFiles(["a.ts"], ["b.ts"])).toEqual([]);
  });

  test("returns shared files", () => {
    const source = ["a.ts", "b.ts", "c.ts"];
    const target = ["b.ts", "c.ts", "d.ts"];
    const result = getSharedFiles(source, target);
    expect(result).toContain("b.ts");
    expect(result).toContain("c.ts");
    expect(result.length).toBe(2);
  });

  test("handles empty arrays", () => {
    expect(getSharedFiles([], ["a.ts"])).toEqual([]);
    expect(getSharedFiles(["a.ts"], [])).toEqual([]);
    expect(getSharedFiles([], [])).toEqual([]);
  });
});

describe("calculateTemporalScore", () => {
  const DAY_IN_SECONDS = 24 * 60 * 60;

  test("returns 1 for same timestamp", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(calculateTemporalScore(now, now)).toBe(1);
  });

  test("returns 0 for timestamps beyond window", () => {
    const now = Math.floor(Date.now() / 1000);
    const eightDaysAgo = now - 8 * DAY_IN_SECONDS;
    expect(calculateTemporalScore(now, eightDaysAgo, 7)).toBe(0);
  });

  test("returns value between 0 and 1 for timestamps within window", () => {
    const now = Math.floor(Date.now() / 1000);
    const threeDaysAgo = now - 3 * DAY_IN_SECONDS;
    const result = calculateTemporalScore(now, threeDaysAgo, 7);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });

  test("score decreases as time difference increases", () => {
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 1 * DAY_IN_SECONDS;
    const threeDaysAgo = now - 3 * DAY_IN_SECONDS;
    const sixDaysAgo = now - 6 * DAY_IN_SECONDS;

    const score1 = calculateTemporalScore(now, oneDayAgo, 7);
    const score3 = calculateTemporalScore(now, threeDaysAgo, 7);
    const score6 = calculateTemporalScore(now, sixDaysAgo, 7);

    expect(score1).toBeGreaterThan(score3);
    expect(score3).toBeGreaterThan(score6);
  });

  test("respects custom window parameter", () => {
    const now = Math.floor(Date.now() / 1000);
    const threeDaysAgo = now - 3 * DAY_IN_SECONDS;

    // With 7-day window, 3 days is within
    expect(calculateTemporalScore(now, threeDaysAgo, 7)).toBeGreaterThan(0);

    // With 2-day window, 3 days is outside
    expect(calculateTemporalScore(now, threeDaysAgo, 2)).toBe(0);
  });

  test("is symmetric (order of timestamps does not matter)", () => {
    const now = Math.floor(Date.now() / 1000);
    const twoDaysAgo = now - 2 * DAY_IN_SECONDS;

    const score1 = calculateTemporalScore(now, twoDaysAgo, 7);
    const score2 = calculateTemporalScore(twoDaysAgo, now, 7);

    expect(score1).toBeCloseTo(score2, 10);
  });
});
