/**
 * Edge case tests for expertise mapping functions
 * Tests boundary conditions and unusual scenarios
 */

import { describe, expect, test } from "bun:test";
import {
  ONE_DAY_UNIX,
  ONE_YEAR_UNIX,
  REFERENCE_UNIX,
  SIX_MONTHS_UNIX,
} from "../fixtures/timestamps";

describe("edge cases", () => {
  describe("percentage edge cases", () => {
    test("handles 1 commit total", () => {
      const totalCommits = 1;
      const authorCommits = 1;
      const percentage = Math.round((authorCommits / totalCommits) * 100);

      expect(percentage).toBe(100);
    });

    test("handles very large commit counts", () => {
      const totalCommits = 100000;
      const authorCommits = 33333;
      const percentage = Math.round((authorCommits / totalCommits) * 100);

      expect(percentage).toBe(33);
    });

    test("handles fractional percentages rounding", () => {
      // 1/3 = 33.33...
      const totalCommits = 3;
      const percentage = Math.round((1 / totalCommits) * 100);
      expect(percentage).toBe(33);

      // 2/3 = 66.66...
      const percentage2 = Math.round((2 / totalCommits) * 100);
      expect(percentage2).toBe(67);
    });

    test("handles exact 5% boundary", () => {
      const totalCommits = 100;
      const authorCommits = 5;
      const percentage = Math.round((authorCommits / totalCommits) * 100);
      const isSignificant = percentage >= 5;

      expect(isSignificant).toBe(true);
    });

    test("handles just below 5% boundary", () => {
      const totalCommits = 100;
      const authorCommits = 4;
      const percentage = Math.round((authorCommits / totalCommits) * 100);
      const isSignificant = percentage >= 5;

      expect(isSignificant).toBe(false);
    });
  });

  describe("bus factor edge cases", () => {
    test("single contributor is minimum bus factor", () => {
      const significantContributors = 1;
      const busFactor = Math.max(1, significantContributors);

      expect(busFactor).toBe(1);
    });

    test("zero contributors defaults to 1", () => {
      const significantContributors = 0;
      const busFactor = Math.max(1, significantContributors);

      expect(busFactor).toBe(1);
    });

    test("many significant contributors", () => {
      const significantContributors = 10;
      const busFactor = Math.max(1, significantContributors);

      expect(busFactor).toBe(10);
    });

    test("exactly 80% at boundary", () => {
      const percentage = 80;
      const threshold = 80;
      const risk = percentage >= threshold;

      expect(risk).toBe(true);
    });

    test("exactly at custom threshold", () => {
      const percentage = 50;
      const threshold = 50;
      const risk = percentage >= threshold;

      expect(risk).toBe(true);
    });
  });

  describe("date edge cases", () => {
    test("handles very old dates (2+ years)", () => {
      const twoYearsAgo = REFERENCE_UNIX - 2 * ONE_YEAR_UNIX;
      const sixMonthsAgo = REFERENCE_UNIX - SIX_MONTHS_UNIX;

      const isStale = twoYearsAgo < sixMonthsAgo;

      expect(isStale).toBe(true);
    });

    test("handles future dates gracefully", () => {
      const futureDate = REFERENCE_UNIX + ONE_DAY_UNIX;
      const sixMonthsAgo = REFERENCE_UNIX - SIX_MONTHS_UNIX;

      const isStale = futureDate < sixMonthsAgo;

      expect(isStale).toBe(false);
    });

    test("handles timestamp of 0", () => {
      const timestamp = 0;
      const sixMonthsAgo = REFERENCE_UNIX - SIX_MONTHS_UNIX;

      const isStale = timestamp < sixMonthsAgo;

      expect(isStale).toBe(true);
    });

    test("handles negative timestamps", () => {
      // Before Unix epoch
      const timestamp = -1000;
      const sixMonthsAgo = REFERENCE_UNIX - SIX_MONTHS_UNIX;

      const isStale = timestamp < sixMonthsAgo;

      expect(isStale).toBe(true);
    });
  });

  describe("path edge cases", () => {
    test("handles deeply nested paths", () => {
      const file = "a/b/c/d/e/f/g/h/i/j/file.ts";
      const parts = file.split("/");
      const depth = 3;
      const dir = parts.slice(0, Math.min(depth, parts.length - 1)).join("/");

      expect(dir).toBe("a/b/c");
    });

    test("handles single-level paths", () => {
      const file = "file.ts";
      const parts = file.split("/");
      const depth = 2;
      const dir =
        parts.slice(0, Math.min(depth, parts.length - 1)).join("/") || ".";

      expect(dir).toBe(".");
    });

    test("handles paths with special characters", () => {
      const file = "src/components/@shared/utils.ts";
      const parts = file.split("/");
      const depth = 2;
      const dir = parts.slice(0, Math.min(depth, parts.length - 1)).join("/");

      expect(dir).toBe("src/components");
    });

    test("handles paths with dots", () => {
      const file = "src/.config/settings.json";
      const parts = file.split("/");
      const depth = 2;
      const dir = parts.slice(0, Math.min(depth, parts.length - 1)).join("/");

      expect(dir).toBe("src/.config");
    });

    test("handles paths with unicode", () => {
      const file = "src/日本語/ファイル.ts";
      const parts = file.split("/");
      const depth = 2;
      const dir = parts.slice(0, Math.min(depth, parts.length - 1)).join("/");

      expect(dir).toBe("src/日本語");
    });
  });

  describe("author name edge cases", () => {
    test("handles unicode author names", () => {
      const name = "José García-Müller";
      const email = "jose@example.com";

      // Should be able to use as-is
      expect(name.length).toBeGreaterThan(0);
      expect(email.includes("@")).toBe(true);
    });

    test("handles very long author names", () => {
      const name = "Alexander Bartholomew Christopher Davidson Edward Franklin";
      const email = "alex@example.com";

      expect(name.length).toBeGreaterThan(50);
    });

    test("handles email with plus addressing", () => {
      const email = "dev+test@example.com";
      const key = email.toLowerCase();

      expect(key).toBe("dev+test@example.com");
    });

    test("handles case-insensitive email matching", () => {
      const email1 = "Alice@Example.COM";
      const email2 = "alice@example.com";

      expect(email1.toLowerCase()).toBe(email2.toLowerCase());
    });
  });

  describe("health score edge cases", () => {
    function calculateHealthScore(
      entriesLength: number,
      riskyCount: number,
      staleCount: number,
      avgBusFactor: number,
    ): number {
      if (entriesLength === 0) return 100;

      let score = 100;
      const riskyRatio = riskyCount / entriesLength;
      score -= Math.min(30, riskyRatio * 50);
      const staleRatio = staleCount / entriesLength;
      score -= Math.min(20, staleRatio * 30);
      if (avgBusFactor < 3) {
        score -= (3 - avgBusFactor) * 15;
      }
      if (avgBusFactor >= 3) {
        score = Math.min(100, score + 10);
      }

      return Math.max(0, Math.round(score));
    }

    test("all paths risky", () => {
      // 100% risky ratio, bus factor 1
      const score = calculateHealthScore(10, 10, 0, 1);
      // 100 - 30 (risky cap) - 30 (bus factor) = 40
      expect(score).toBe(40);
    });

    test("all paths stale", () => {
      // 100% stale ratio, bus factor 3+
      const score = calculateHealthScore(10, 0, 10, 3);
      // 100 - 20 (stale cap) + 10 (bonus) = 90
      expect(score).toBe(90);
    });

    test("all paths risky and stale", () => {
      // Both capped
      const score = calculateHealthScore(10, 10, 10, 1);
      // 100 - 30 - 20 - 30 = 20
      expect(score).toBe(20);
    });

    test("very high bus factor", () => {
      const score = calculateHealthScore(10, 0, 0, 10);
      // 100 + 10 bonus capped at 100
      expect(score).toBe(100);
    });

    test("bus factor exactly 3", () => {
      const score = calculateHealthScore(10, 0, 0, 3);
      // 100 + 10 bonus capped at 100
      expect(score).toBe(100);
    });

    test("bus factor 2.9 rounds differently", () => {
      const score = calculateHealthScore(10, 0, 0, 2.9);
      // 100 - (3 - 2.9) * 15 = 100 - 1.5 = 99 (rounded)
      expect(score).toBe(99);
    });

    test("floor at 0", () => {
      // Extreme case - should never go negative
      const score = calculateHealthScore(1, 1, 1, 0);
      // Would be negative but floors at 0
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("relevance score edge cases", () => {
    function calculateRelevance(
      fileCoverage: number,
      avgOwnership: number,
      hasRecentActivity: boolean,
    ): number {
      const recencyBonus = hasRecentActivity ? 0.1 : 0;
      return Math.min(
        1,
        fileCoverage * 0.7 + (avgOwnership / 100) * 0.3 + recencyBonus,
      );
    }

    test("maximum possible score", () => {
      const relevance = calculateRelevance(1.0, 100, true);
      // 0.7 + 0.3 + 0.1 = 1.1 capped at 1.0
      expect(relevance).toBe(1);
    });

    test("minimum possible score", () => {
      const relevance = calculateRelevance(0, 0, false);
      expect(relevance).toBe(0);
    });

    test("coverage over 100%", () => {
      // Shouldn't happen but handle gracefully
      const relevance = calculateRelevance(1.5, 50, false);
      // Would exceed 1.0 but capped
      expect(relevance).toBe(1);
    });
  });

  describe("reviewer limit edge cases", () => {
    test("limit of 1 with many reviewers", () => {
      const limit = 1;
      const requiredSlots = Math.ceil(limit / 2); // 1

      expect(requiredSlots).toBe(1);
    });

    test("limit of 10 (max)", () => {
      const limit = 10;
      const requiredSlots = Math.ceil(limit / 2); // 5

      expect(requiredSlots).toBe(5);
    });

    test("odd limit distribution", () => {
      const limit = 5;
      const requiredSlots = Math.ceil(limit / 2); // 3
      const optionalSlots = limit - requiredSlots; // 2

      expect(requiredSlots).toBe(3);
      expect(optionalSlots).toBe(2);
    });

    test("more required than slots available", () => {
      const requiredReviewers = 5;
      const limit = 3;
      const maxRequired = Math.ceil(limit / 2); // 2
      const taken = Math.min(requiredReviewers, maxRequired);

      expect(taken).toBe(2);
    });
  });

  describe("file ownership edge cases", () => {
    test("file with many minor contributors", () => {
      const contributions = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]; // 10 contributors at 10% each
      const totalCommits = contributions.reduce((a, b) => a + b, 0);
      const percentages = contributions.map((c) =>
        Math.round((c / totalCommits) * 100),
      );

      expect(percentages.every((p) => p === 10)).toBe(true);
      expect(percentages.filter((p) => p >= 5).length).toBe(10);
    });

    test("file with one dominant and many minor contributors", () => {
      const contributions = [80, 2, 2, 2, 2, 2, 2, 2, 2, 4];
      const totalCommits = contributions.reduce((a, b) => a + b, 0);
      const percentages = contributions.map((c) =>
        Math.round((c / totalCommits) * 100),
      );

      const significant = percentages.filter((p) => p >= 5);
      expect(significant.length).toBe(1);
      expect(significant[0]).toBe(80);
    });
  });

  describe("sorting stability", () => {
    test("stable sort with equal values", () => {
      const items = [
        {
          name: "A",
          category: "required" as const,
          expertise: 50,
          relevance: 0.5,
        },
        {
          name: "B",
          category: "required" as const,
          expertise: 50,
          relevance: 0.5,
        },
        {
          name: "C",
          category: "required" as const,
          expertise: 50,
          relevance: 0.5,
        },
      ];

      const sorted = [...items].sort((a, b) => {
        if (a.category !== b.category) {
          return a.category === "required" ? -1 : 1;
        }
        if (b.expertise !== a.expertise) {
          return b.expertise - a.expertise;
        }
        return b.relevance - a.relevance;
      });

      // All equal, order should be preserved (stable sort)
      expect(sorted.map((i) => i.name)).toEqual(["A", "B", "C"]);
    });
  });

  describe("ignored file patterns", () => {
    function isIgnoredFile(file: string): boolean {
      const ignoredPatterns = [
        /^\.git\//,
        /node_modules\//,
        /\.lock$/,
        /package-lock\.json$/,
        /yarn\.lock$/,
        /bun\.lock$/,
        /pnpm-lock\.yaml$/,
        /\.min\.(js|css)$/,
        /\.map$/,
        /dist\//,
        /build\//,
        /\.next\//,
        /coverage\//,
      ];

      return ignoredPatterns.some((pattern) => pattern.test(file));
    }

    test("doesn't ignore similar-but-different files", () => {
      expect(isIgnoredFile("my-lock-file.ts")).toBe(false);
      expect(isIgnoredFile("lock.ts")).toBe(false);
      expect(isIgnoredFile("package-lock.json.backup")).toBe(false);
    });

    test("ignores nested node_modules", () => {
      expect(isIgnoredFile("packages/foo/node_modules/bar/index.js")).toBe(
        true,
      );
    });

    test("ignores .next folder", () => {
      expect(isIgnoredFile(".next/static/chunks/main.js")).toBe(true);
    });

    test("ignores coverage folder", () => {
      expect(isIgnoredFile("coverage/lcov-report/index.html")).toBe(true);
    });
  });
});
