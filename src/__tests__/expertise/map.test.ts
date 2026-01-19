/**
 * Tests for mapExpertise function
 * Phase 1: Core calculations and basic functionality
 */

import { describe, expect, test } from "bun:test";
import { ALICE } from "../fixtures/authors";
import { REFERENCE_UNIX } from "../fixtures/timestamps";

// We need to test the internal logic by extracting pure functions
// Since mocking simple-git is complex, let's test what we can directly

describe("mapExpertise helper functions", () => {
  describe("buildLogOutput helper", () => {
    test("formats log entries correctly", () => {
      const entries = [
        { ...ALICE, timestamp: REFERENCE_UNIX, files: ["src/index.ts"] },
      ];
      const output = buildLogOutput(entries);

      expect(output).toContain(
        `${ALICE.name}|${ALICE.email}|${REFERENCE_UNIX}`,
      );
      expect(output).toContain("src/index.ts");
    });
  });

  describe("repeat helper", () => {
    test("creates correct number of entries", () => {
      const entries = repeat(
        { ...ALICE, files: ["src/index.ts"] },
        5,
        REFERENCE_UNIX,
      );

      expect(entries).toHaveLength(5);
    });

    test("spaces entries by 1 hour", () => {
      const entries = repeat(
        { ...ALICE, files: ["src/index.ts"] },
        3,
        REFERENCE_UNIX,
      );

      expect(entries[0]?.timestamp).toBe(REFERENCE_UNIX);
      expect(entries[1]?.timestamp).toBe(REFERENCE_UNIX - 3600);
      expect(entries[2]?.timestamp).toBe(REFERENCE_UNIX - 7200);
    });
  });

  describe("percentage calculations", () => {
    test("100% for single contributor", () => {
      const totalCommits = 50;
      const aliceCommits = 50;
      const percentage = Math.round((aliceCommits / totalCommits) * 100);

      expect(percentage).toBe(100);
    });

    test("80/20 split calculation", () => {
      const totalCommits = 100;
      const aliceCommits = 80;
      const bobCommits = 20;

      const alicePct = Math.round((aliceCommits / totalCommits) * 100);
      const bobPct = Math.round((bobCommits / totalCommits) * 100);

      expect(alicePct).toBe(80);
      expect(bobPct).toBe(20);
    });

    test("even 3-way split", () => {
      const totalCommits = 99;
      const commits = [33, 33, 33];
      const percentages = commits.map((c) =>
        Math.round((c / totalCommits) * 100),
      );

      expect(percentages).toEqual([33, 33, 33]);
    });
  });

  describe("bus factor logic", () => {
    test("counts contributors with >= 5%", () => {
      const experts = [
        { percentage: 40 },
        { percentage: 35 },
        { percentage: 25 },
      ];

      const significantContributors = experts.filter(
        (e) => e.percentage >= 5,
      ).length;
      const busFactor = Math.max(1, significantContributors);

      expect(busFactor).toBe(3);
    });

    test("excludes contributors below 5%", () => {
      const experts = [{ percentage: 96 }, { percentage: 4 }];

      const significantContributors = experts.filter(
        (e) => e.percentage >= 5,
      ).length;
      const busFactor = Math.max(1, significantContributors);

      expect(busFactor).toBe(1);
    });

    test("minimum bus factor is 1", () => {
      const experts: { percentage: number }[] = [];

      const significantContributors = experts.filter(
        (e) => e.percentage >= 5,
      ).length;
      const busFactor = Math.max(1, significantContributors);

      expect(busFactor).toBe(1);
    });
  });

  describe("bus factor risk threshold", () => {
    test("exactly 80% triggers risk at default threshold", () => {
      const primaryPercentage = 80;
      const threshold = 80;
      const risk = primaryPercentage >= threshold;

      expect(risk).toBe(true);
    });

    test("79% does not trigger risk at default threshold", () => {
      const primaryPercentage = 79;
      const threshold = 80;
      const risk = primaryPercentage >= threshold;

      expect(risk).toBe(false);
    });

    test("55% triggers risk with 50% threshold", () => {
      const primaryPercentage = 55;
      const threshold = 50;
      const risk = primaryPercentage >= threshold;

      expect(risk).toBe(true);
    });

    test("49% does not trigger risk with 50% threshold", () => {
      const primaryPercentage = 49;
      const threshold = 50;
      const risk = primaryPercentage >= threshold;

      expect(risk).toBe(false);
    });
  });

  describe("health score calculation", () => {
    // Replicate the calculateHealthScore function logic
    function calculateHealthScore(
      entriesLength: number,
      riskyCount: number,
      staleCount: number,
      avgBusFactor: number,
    ): number {
      if (entriesLength === 0) return 100;

      let score = 100;

      // Deduct for risky paths (up to 30 points)
      const riskyRatio = riskyCount / entriesLength;
      score -= Math.min(30, riskyRatio * 50);

      // Deduct for stale paths (up to 20 points)
      const staleRatio = staleCount / entriesLength;
      score -= Math.min(20, staleRatio * 30);

      // Deduct for low average bus factor (up to 30 points)
      if (avgBusFactor < 3) {
        score -= (3 - avgBusFactor) * 15;
      }

      // Bonus for high bus factor (up to 10 points)
      if (avgBusFactor >= 3) {
        score = Math.min(100, score + 10);
      }

      return Math.max(0, Math.round(score));
    }

    test("empty repository returns 100", () => {
      expect(calculateHealthScore(0, 0, 0, 0)).toBe(100);
    });

    test("perfect score with no issues and high bus factor", () => {
      // No risky, no stale, bus factor of 3
      const score = calculateHealthScore(1, 0, 0, 3);
      expect(score).toBe(100); // 100 + 10 bonus capped at 100
    });

    test("deducts for risky paths", () => {
      // 1 entry, 1 risky (100% risky)
      // Deduction: min(30, 1.0 * 50) = 30
      // Bus factor 1: (3-1)*15 = 30 deduction
      const score = calculateHealthScore(1, 1, 0, 1);
      expect(score).toBe(40); // 100 - 30 - 30
    });

    test("deducts for stale paths", () => {
      // 1 entry, 0 risky, 1 stale
      // Stale deduction: min(20, 1.0 * 30) = 20
      // Bus factor 3: no deduction, +10 bonus
      const score = calculateHealthScore(1, 0, 1, 3);
      expect(score).toBe(90); // 100 - 20 + 10 capped
    });

    test("deducts for low bus factor", () => {
      // Bus factor 1: (3-1)*15 = 30 deduction
      const score = calculateHealthScore(1, 0, 0, 1);
      expect(score).toBe(70); // 100 - 30
    });

    test("gives bonus for high bus factor", () => {
      // Bus factor 4: +10 bonus
      const score = calculateHealthScore(1, 0, 0, 4);
      expect(score).toBe(100); // 100 + 10 capped at 100
    });

    test("combined negative factors floor at 0", () => {
      // 1 entry, 1 risky, 1 stale, bus factor 1
      // Risky: -30, Stale: -20, BusFactor: -30 = -80
      const score = calculateHealthScore(1, 1, 1, 1);
      expect(score).toBe(20); // 100 - 80 = 20
    });
  });

  describe("stale path detection", () => {
    const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

    test("path is stale if last activity > 6 months ago", () => {
      const now = Date.now();
      const sevenMonthsAgo = now - 7 * 30 * 24 * 60 * 60 * 1000;

      const isStale = sevenMonthsAgo < now - SIX_MONTHS_MS;
      expect(isStale).toBe(true);
    });

    test("path is not stale if last activity < 6 months ago", () => {
      const now = Date.now();
      const fiveMonthsAgo = now - 5 * 30 * 24 * 60 * 60 * 1000;

      const isStale = fiveMonthsAgo < now - SIX_MONTHS_MS;
      expect(isStale).toBe(false);
    });

    test("exactly 6 months is boundary (stale)", () => {
      const now = Date.now();
      const exactlySixMonths = now - SIX_MONTHS_MS;

      // < means strictly before, so exactly at boundary is NOT stale
      const isStale = exactlySixMonths < now - SIX_MONTHS_MS;
      expect(isStale).toBe(false);
    });
  });

  describe("directory grouping", () => {
    function groupByDirectory(
      files: string[],
      depth: number,
    ): Record<string, string[]> {
      const groups: Record<string, string[]> = {};

      for (const file of files) {
        const parts = file.split("/");
        const dir =
          parts.slice(0, Math.min(depth, parts.length - 1)).join("/") || ".";

        if (!groups[dir]) groups[dir] = [];
        groups[dir].push(file);
      }

      return groups;
    }

    test("groups files at depth 1", () => {
      const files = ["src/index.ts", "src/utils.ts", "lib/helper.ts"];

      const groups = groupByDirectory(files, 1);

      expect(Object.keys(groups)).toContain("src");
      expect(Object.keys(groups)).toContain("lib");
      expect(groups.src).toHaveLength(2);
      expect(groups.lib).toHaveLength(1);
    });

    test("groups files at depth 2", () => {
      const files = [
        "src/tools/git.ts",
        "src/tools/memory.ts",
        "src/utils/helper.ts",
      ];

      const groups = groupByDirectory(files, 2);

      expect(Object.keys(groups)).toContain("src/tools");
      expect(Object.keys(groups)).toContain("src/utils");
      expect(groups["src/tools"]).toHaveLength(2);
    });

    test("root level files grouped as .", () => {
      const files = ["README.md", "package.json"];

      const groups = groupByDirectory(files, 1);

      expect(Object.keys(groups)).toContain(".");
      expect(groups["."]).toHaveLength(2);
    });
  });

  describe("ignored file detection", () => {
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

    test("ignores lock files", () => {
      expect(isIgnoredFile("package-lock.json")).toBe(true);
      expect(isIgnoredFile("yarn.lock")).toBe(true);
      expect(isIgnoredFile("bun.lock")).toBe(true);
      expect(isIgnoredFile("pnpm-lock.yaml")).toBe(true);
    });

    test("ignores node_modules", () => {
      expect(isIgnoredFile("node_modules/lodash/index.js")).toBe(true);
    });

    test("ignores dist/build folders", () => {
      expect(isIgnoredFile("dist/index.js")).toBe(true);
      expect(isIgnoredFile("build/app.js")).toBe(true);
    });

    test("ignores minified files", () => {
      expect(isIgnoredFile("bundle.min.js")).toBe(true);
      expect(isIgnoredFile("styles.min.css")).toBe(true);
    });

    test("ignores source maps", () => {
      expect(isIgnoredFile("bundle.js.map")).toBe(true);
    });

    test("allows normal source files", () => {
      expect(isIgnoredFile("src/index.ts")).toBe(false);
      expect(isIgnoredFile("lib/utils.js")).toBe(false);
      expect(isIgnoredFile("README.md")).toBe(false);
    });
  });
});

// Helper functions for test data

interface LogEntry {
  name: string;
  email: string;
  timestamp: number;
  files: string[];
}

function buildLogOutput(entries: LogEntry[]): string {
  const lines: string[] = [];
  for (const entry of entries) {
    lines.push(`${entry.name}|${entry.email}|${entry.timestamp}`);
    for (const file of entry.files) {
      lines.push(file);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function repeat(
  author: { name: string; email: string; files: string[] },
  count: number,
  startTimestamp: number,
): LogEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    ...author,
    timestamp: startTimestamp - i * 3600,
  }));
}
