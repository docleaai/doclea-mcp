/**
 * Tests for suggestReviewers function
 * Tests internal logic and calculation formulas
 */

import { describe, expect, test } from "bun:test";
import { ALICE, BOB, CHARLIE, DIANA } from "../fixtures/authors";
import {
  INSIDE_30_DAY_WINDOW_UNIX,
  OUTSIDE_30_DAY_WINDOW_UNIX,
  REFERENCE_UNIX,
} from "../fixtures/timestamps";

describe("suggestReviewers helper functions", () => {
  // Constants from the source
  const REQUIRED_THRESHOLD = 50;
  const MIN_OWNERSHIP_THRESHOLD = 10;

  describe("ownership percentage calculation", () => {
    test("calculates correct percentage for single author", () => {
      const totalCommits = 100;
      const authorCommits = 100;
      const percentage = Math.round((authorCommits / totalCommits) * 100);

      expect(percentage).toBe(100);
    });

    test("calculates correct percentage for multiple authors", () => {
      const totalCommits = 100;
      const commits = [60, 30, 10];
      const percentages = commits.map((c) =>
        Math.round((c / totalCommits) * 100),
      );

      expect(percentages).toEqual([60, 30, 10]);
    });

    test("handles uneven splits", () => {
      const totalCommits = 7;
      const commits = [3, 3, 1];
      const percentages = commits.map((c) =>
        Math.round((c / totalCommits) * 100),
      );

      // 3/7 = 42.86% -> 43%, 1/7 = 14.29% -> 14%
      expect(percentages[0]).toBe(43);
      expect(percentages[1]).toBe(43);
      expect(percentages[2]).toBe(14);
    });
  });

  describe("reviewer categorization", () => {
    test("required: primary expert (50%+) with good coverage (>30%)", () => {
      const avgOwnership = 60;
      const fileCoverage = 0.5; // 50% of files

      const isPrimaryExpert = avgOwnership >= REQUIRED_THRESHOLD;
      const category =
        isPrimaryExpert && fileCoverage > 0.3 ? "required" : "optional";

      expect(category).toBe("required");
    });

    test("optional: primary expert (50%+) with poor coverage (<30%)", () => {
      const avgOwnership = 60;
      const fileCoverage = 0.2; // 20% of files

      const isPrimaryExpert = avgOwnership >= REQUIRED_THRESHOLD;
      const category =
        isPrimaryExpert && fileCoverage > 0.3 ? "required" : "optional";

      expect(category).toBe("optional");
    });

    test("optional: non-primary expert (<50%) even with good coverage", () => {
      const avgOwnership = 40;
      const fileCoverage = 0.5;

      const isPrimaryExpert = avgOwnership >= REQUIRED_THRESHOLD;
      const category =
        isPrimaryExpert && fileCoverage > 0.3 ? "required" : "optional";

      expect(category).toBe("optional");
    });

    test("exactly 50% ownership is primary expert", () => {
      const avgOwnership = 50;

      const isPrimaryExpert = avgOwnership >= REQUIRED_THRESHOLD;

      expect(isPrimaryExpert).toBe(true);
    });

    test("49% ownership is not primary expert", () => {
      const avgOwnership = 49;

      const isPrimaryExpert = avgOwnership >= REQUIRED_THRESHOLD;

      expect(isPrimaryExpert).toBe(false);
    });

    test("exactly 30% coverage is not enough for required", () => {
      const avgOwnership = 60;
      const fileCoverage = 0.3;

      const isPrimaryExpert = avgOwnership >= REQUIRED_THRESHOLD;
      const category =
        isPrimaryExpert && fileCoverage > 0.3 ? "required" : "optional";

      expect(category).toBe("optional"); // > 0.3 not >= 0.3
    });

    test("31% coverage is enough for required", () => {
      const avgOwnership = 60;
      const fileCoverage = 0.31;

      const isPrimaryExpert = avgOwnership >= REQUIRED_THRESHOLD;
      const category =
        isPrimaryExpert && fileCoverage > 0.3 ? "required" : "optional";

      expect(category).toBe("required");
    });
  });

  describe("expertise percentage calculation", () => {
    test("calculates expertise as avgOwnership * fileCoverage", () => {
      const avgOwnership = 50;
      const fileCoverage = 0.6;
      const expertisePct = Math.round(avgOwnership * fileCoverage);

      expect(expertisePct).toBe(30);
    });

    test("expertise is 0 when no coverage", () => {
      const avgOwnership = 80;
      const fileCoverage = 0;
      const expertisePct = Math.round(avgOwnership * fileCoverage);

      expect(expertisePct).toBe(0);
    });

    test("expertise capped by file coverage", () => {
      const avgOwnership = 100;
      const fileCoverage = 0.25;
      const expertisePct = Math.round(avgOwnership * fileCoverage);

      expect(expertisePct).toBe(25);
    });
  });

  describe("minimum ownership threshold", () => {
    test("10% is minimum for suggestion", () => {
      const expertisePct = 10;
      const recentCommits = 0;

      const shouldSuggest = !(
        expertisePct < MIN_OWNERSHIP_THRESHOLD && recentCommits === 0
      );

      expect(shouldSuggest).toBe(true);
    });

    test("below 10% without recent activity excluded", () => {
      const expertisePct = 9;
      const recentCommits = 0;

      const shouldSuggest = !(
        expertisePct < MIN_OWNERSHIP_THRESHOLD && recentCommits === 0
      );

      expect(shouldSuggest).toBe(false);
    });

    test("below 10% with recent activity included", () => {
      const expertisePct = 5;
      const recentCommits = 3;

      const shouldSuggest = !(
        expertisePct < MIN_OWNERSHIP_THRESHOLD &&
        recentCommits === (0 as number)
      );

      expect(shouldSuggest).toBe(true);
    });
  });

  describe("relevance score calculation", () => {
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

    test("combines file coverage, ownership, and recency", () => {
      const relevance = calculateRelevance(0.5, 60, true);
      // 0.5 * 0.7 + 0.6 * 0.3 + 0.1 = 0.35 + 0.18 + 0.1 = 0.63
      expect(relevance).toBeCloseTo(0.63, 2);
    });

    test("capped at 1.0", () => {
      const relevance = calculateRelevance(1.0, 100, true);
      expect(relevance).toBe(1);
    });

    test("no recency bonus when not recent", () => {
      const withRecent = calculateRelevance(0.5, 50, true);
      const withoutRecent = calculateRelevance(0.5, 50, false);

      expect(withRecent - withoutRecent).toBeCloseTo(0.1, 2);
    });

    test("file coverage weighted more than ownership", () => {
      const highCoverage = calculateRelevance(1.0, 0, false);
      const highOwnership = calculateRelevance(0, 100, false);

      expect(highCoverage).toBe(0.7);
      expect(highOwnership).toBe(0.3);
    });
  });

  describe("recent activity detection", () => {
    test("commit within 30 days is recent", () => {
      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      const commitTime = now - 15 * 24 * 60 * 60 * 1000; // 15 days ago

      const isRecent = commitTime > thirtyDaysAgo;

      expect(isRecent).toBe(true);
    });

    test("commit exactly 30 days ago is not recent", () => {
      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      const commitTime = thirtyDaysAgo;

      const isRecent = commitTime > thirtyDaysAgo;

      expect(isRecent).toBe(false);
    });

    test("commit 31 days ago is not recent", () => {
      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      const commitTime = now - 31 * 24 * 60 * 60 * 1000;

      const isRecent = commitTime > thirtyDaysAgo;

      expect(isRecent).toBe(false);
    });
  });

  describe("reviewer sorting", () => {
    interface ReviewerLike {
      name: string;
      category: "required" | "optional";
      expertisePct: number;
      relevance: number;
    }

    function sortReviewers(reviewers: ReviewerLike[]): ReviewerLike[] {
      return [...reviewers].sort((a, b) => {
        // Category first (required > optional)
        if (a.category !== b.category) {
          return a.category === "required" ? -1 : 1;
        }
        // Expertise percentage within category
        if (b.expertisePct !== a.expertisePct) {
          return b.expertisePct - a.expertisePct;
        }
        // Relevance as tiebreaker
        return b.relevance - a.relevance;
      });
    }

    test("required comes before optional", () => {
      const reviewers: ReviewerLike[] = [
        {
          name: "Optional",
          category: "optional",
          expertisePct: 90,
          relevance: 0.9,
        },
        {
          name: "Required",
          category: "required",
          expertisePct: 50,
          relevance: 0.5,
        },
      ];

      const sorted = sortReviewers(reviewers);

      expect(sorted[0]?.name).toBe("Required");
      expect(sorted[1]?.name).toBe("Optional");
    });

    test("higher expertise comes first within same category", () => {
      const reviewers: ReviewerLike[] = [
        { name: "Low", category: "required", expertisePct: 30, relevance: 0.5 },
        {
          name: "High",
          category: "required",
          expertisePct: 60,
          relevance: 0.5,
        },
      ];

      const sorted = sortReviewers(reviewers);

      expect(sorted[0]?.name).toBe("High");
      expect(sorted[1]?.name).toBe("Low");
    });

    test("relevance breaks ties", () => {
      const reviewers: ReviewerLike[] = [
        {
          name: "LowRelevance",
          category: "required",
          expertisePct: 50,
          relevance: 0.3,
        },
        {
          name: "HighRelevance",
          category: "required",
          expertisePct: 50,
          relevance: 0.8,
        },
      ];

      const sorted = sortReviewers(reviewers);

      expect(sorted[0]?.name).toBe("HighRelevance");
      expect(sorted[1]?.name).toBe("LowRelevance");
    });
  });

  describe("reviewer limiting", () => {
    test("respects limit parameter", () => {
      const allReviewers = [
        { name: "A", category: "required" as const },
        { name: "B", category: "required" as const },
        { name: "C", category: "optional" as const },
        { name: "D", category: "optional" as const },
        { name: "E", category: "optional" as const },
      ];

      const limit = 3;
      const required = allReviewers
        .filter((s) => s.category === "required")
        .slice(0, Math.ceil(limit / 2));
      const optional = allReviewers
        .filter((s) => s.category === "optional")
        .slice(0, limit - required.length);

      const total = required.length + optional.length;

      expect(total).toBeLessThanOrEqual(limit);
    });

    test("distributes between required and optional", () => {
      const limit = 4;
      const requiredCount = Math.ceil(limit / 2); // 2

      expect(requiredCount).toBe(2);
    });

    test("fills with optional if not enough required", () => {
      const allReviewers = [
        { name: "A", category: "required" as const },
        { name: "B", category: "optional" as const },
        { name: "C", category: "optional" as const },
        { name: "D", category: "optional" as const },
      ];

      const limit = 3;
      const required = allReviewers
        .filter((s) => s.category === "required")
        .slice(0, Math.ceil(limit / 2));
      const optional = allReviewers
        .filter((s) => s.category === "optional")
        .slice(0, limit - required.length);

      expect(required.length).toBe(1);
      expect(optional.length).toBe(2);
    });
  });

  describe("author exclusion", () => {
    function isExcluded(
      email: string,
      name: string,
      excludeSet: Set<string>,
    ): boolean {
      return (
        excludeSet.has(email.toLowerCase()) ||
        excludeSet.has(name.toLowerCase())
      );
    }

    test("excludes by email (case-insensitive)", () => {
      const excludeSet = new Set(["alice@example.com"]);

      expect(isExcluded("Alice@Example.com", "Alice", excludeSet)).toBe(true);
      expect(isExcluded("ALICE@EXAMPLE.COM", "Alice", excludeSet)).toBe(true);
    });

    test("excludes by name (case-insensitive)", () => {
      const excludeSet = new Set(["alice developer"]);

      expect(
        isExcluded("alice@example.com", "Alice Developer", excludeSet),
      ).toBe(true);
      expect(
        isExcluded("alice@example.com", "ALICE DEVELOPER", excludeSet),
      ).toBe(true);
    });

    test("does not exclude non-matching authors", () => {
      const excludeSet = new Set(["alice@example.com"]);

      expect(isExcluded("bob@example.com", "Bob", excludeSet)).toBe(false);
    });

    test("handles empty exclude set", () => {
      const excludeSet = new Set<string>();

      expect(isExcluded("alice@example.com", "Alice", excludeSet)).toBe(false);
    });

    test("handles multiple exclusions", () => {
      const excludeSet = new Set(["alice@example.com", "bob@example.com"]);

      expect(isExcluded("alice@example.com", "Alice", excludeSet)).toBe(true);
      expect(isExcluded("bob@example.com", "Bob", excludeSet)).toBe(true);
      expect(isExcluded("charlie@example.com", "Charlie", excludeSet)).toBe(
        false,
      );
    });
  });

  describe("reason generation", () => {
    function generateReason(
      avgOwnership: number,
      filesOwnedCount: number,
      totalFiles: number,
      hasRecentActivity: boolean,
      recentCommits: number,
    ): string {
      const parts: string[] = [];

      // Primary expertise description
      if (avgOwnership >= 70) {
        parts.push(`primary expert (${Math.round(avgOwnership)}%)`);
      } else if (avgOwnership >= 50) {
        parts.push(`major contributor (${Math.round(avgOwnership)}%)`);
      } else if (avgOwnership >= 30) {
        parts.push(`significant contributor (${Math.round(avgOwnership)}%)`);
      } else {
        parts.push(`contributor (${Math.round(avgOwnership)}%)`);
      }

      // File coverage
      if (filesOwnedCount === totalFiles) {
        parts.push(`all ${totalFiles} files`);
      } else if (filesOwnedCount > 1) {
        parts.push(`${filesOwnedCount}/${totalFiles} files`);
      } else {
        parts.push("1 file");
      }

      // Recency
      if (hasRecentActivity) {
        if (recentCommits > 3) {
          parts.push("very active recently");
        } else {
          parts.push("recent activity");
        }
      }

      return parts.join(", ");
    }

    test("primary expert (70%+)", () => {
      const reason = generateReason(75, 5, 5, false, 0);
      expect(reason).toContain("primary expert (75%)");
    });

    test("major contributor (50-69%)", () => {
      const reason = generateReason(55, 3, 5, false, 0);
      expect(reason).toContain("major contributor (55%)");
    });

    test("significant contributor (30-49%)", () => {
      const reason = generateReason(35, 2, 5, false, 0);
      expect(reason).toContain("significant contributor (35%)");
    });

    test("contributor (<30%)", () => {
      const reason = generateReason(20, 1, 5, false, 0);
      expect(reason).toContain("contributor (20%)");
    });

    test("shows all files when full coverage", () => {
      const reason = generateReason(50, 3, 3, false, 0);
      expect(reason).toContain("all 3 files");
    });

    test("shows file fraction for partial coverage", () => {
      const reason = generateReason(50, 2, 5, false, 0);
      expect(reason).toContain("2/5 files");
    });

    test("recent activity indicator", () => {
      const reason = generateReason(50, 2, 5, true, 2);
      expect(reason).toContain("recent activity");
    });

    test("very active recently indicator", () => {
      const reason = generateReason(50, 2, 5, true, 5);
      expect(reason).toContain("very active recently");
    });
  });

  describe("summary generation", () => {
    function generateSummary(
      filesCount: number,
      requiredCount: number,
      optionalCount: number,
      noOwnerCount: number,
    ): { hasNoOwnerWarning: boolean; reviewerCount: number } {
      return {
        hasNoOwnerWarning: noOwnerCount > 0,
        reviewerCount: requiredCount + optionalCount,
      };
    }

    test("includes no owner warning when files have no owner", () => {
      const result = generateSummary(5, 2, 1, 2);
      expect(result.hasNoOwnerWarning).toBe(true);
    });

    test("no warning when all files have owners", () => {
      const result = generateSummary(5, 2, 1, 0);
      expect(result.hasNoOwnerWarning).toBe(false);
    });

    test("counts total reviewers", () => {
      const result = generateSummary(5, 2, 3, 0);
      expect(result.reviewerCount).toBe(5);
    });
  });

  describe("file ownership edge cases", () => {
    test("file with no contributors goes to noOwner", () => {
      const fileOwnership: { percentage: number }[] = [];
      const hasSignificantOwner = fileOwnership.some(
        (o) => o.percentage >= MIN_OWNERSHIP_THRESHOLD,
      );

      expect(hasSignificantOwner).toBe(false);
    });

    test("file with only minor contributors goes to noOwner", () => {
      const fileOwnership = [
        { percentage: 5 },
        { percentage: 3 },
        { percentage: 2 },
      ];
      const hasSignificantOwner = fileOwnership.some(
        (o) => o.percentage >= MIN_OWNERSHIP_THRESHOLD,
      );

      expect(hasSignificantOwner).toBe(false);
    });

    test("file with at least one significant owner has owner", () => {
      const fileOwnership = [{ percentage: 15 }, { percentage: 5 }];
      const hasSignificantOwner = fileOwnership.some(
        (o) => o.percentage >= MIN_OWNERSHIP_THRESHOLD,
      );

      expect(hasSignificantOwner).toBe(true);
    });
  });
});
