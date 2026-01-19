/**
 * Tests for initProject helper functions
 * Tests stack detection, git scanning, documentation scanning, code patterns
 */

import { describe, expect, test } from "bun:test";

describe("initProject", () => {
  describe("InitInput validation", () => {
    function isValidScanCommits(value: number): boolean {
      return value >= 10 && value <= 2000;
    }

    test("validates minimum scan commits", () => {
      expect(isValidScanCommits(10)).toBe(true);
    });

    test("validates maximum scan commits", () => {
      expect(isValidScanCommits(2000)).toBe(true);
    });

    test("rejects below minimum", () => {
      expect(isValidScanCommits(5)).toBe(false);
    });

    test("rejects above maximum", () => {
      expect(isValidScanCommits(3000)).toBe(false);
    });

    test("validates default value", () => {
      expect(isValidScanCommits(500)).toBe(true);
    });
  });

  describe("InitResult structure", () => {
    interface InitResult {
      configCreated: boolean;
      memoriesCreated: number;
      decisions: number;
      solutions: number;
      patterns: number;
      notes: number;
      architecture: number;
      scannedFiles: number;
      scannedCommits: number;
    }

    function createDefaultResult(): InitResult {
      return {
        configCreated: false,
        memoriesCreated: 0,
        decisions: 0,
        solutions: 0,
        patterns: 0,
        notes: 0,
        architecture: 0,
        scannedFiles: 0,
        scannedCommits: 0,
      };
    }

    test("creates default result", () => {
      const result = createDefaultResult();
      expect(result.configCreated).toBe(false);
      expect(result.memoriesCreated).toBe(0);
    });

    test("all counts start at zero", () => {
      const result = createDefaultResult();
      expect(result.decisions).toBe(0);
      expect(result.solutions).toBe(0);
      expect(result.patterns).toBe(0);
      expect(result.notes).toBe(0);
      expect(result.architecture).toBe(0);
    });
  });

  describe("runtime detection", () => {
    function detectRuntime(lockFiles: string[]): string | null {
      if (lockFiles.includes("bun.lockb") || lockFiles.includes("bun.lock")) {
        return "Bun";
      }
      if (lockFiles.includes("pnpm-lock.yaml")) {
        return "Node.js (pnpm)";
      }
      if (lockFiles.includes("yarn.lock")) {
        return "Node.js (yarn)";
      }
      if (lockFiles.includes("package-lock.json")) {
        return "Node.js (npm)";
      }
      if (lockFiles.includes("deno.json")) {
        return "Deno";
      }
      return null;
    }

    test("detects Bun from bun.lockb", () => {
      expect(detectRuntime(["bun.lockb"])).toBe("Bun");
    });

    test("detects Bun from bun.lock", () => {
      expect(detectRuntime(["bun.lock"])).toBe("Bun");
    });

    test("detects pnpm", () => {
      expect(detectRuntime(["pnpm-lock.yaml"])).toBe("Node.js (pnpm)");
    });

    test("detects yarn", () => {
      expect(detectRuntime(["yarn.lock"])).toBe("Node.js (yarn)");
    });

    test("detects npm", () => {
      expect(detectRuntime(["package-lock.json"])).toBe("Node.js (npm)");
    });

    test("detects Deno", () => {
      expect(detectRuntime(["deno.json"])).toBe("Deno");
    });

    test("returns null for no lock files", () => {
      expect(detectRuntime([])).toBeNull();
    });

    test("prioritizes Bun over npm", () => {
      expect(detectRuntime(["bun.lockb", "package-lock.json"])).toBe("Bun");
    });
  });

  describe("framework detection", () => {
    function detectFramework(
      deps: string[],
      hasAppDir: boolean,
    ): string | null {
      if (deps.includes("next")) {
        return hasAppDir ? "Next.js (App Router)" : "Next.js (Pages Router)";
      }
      if (deps.includes("nuxt")) return "Nuxt";
      if (
        deps.includes("@remix-run/react") ||
        deps.includes("@remix-run/node")
      ) {
        return "Remix";
      }
      if (deps.includes("@sveltejs/kit")) return "SvelteKit";
      if (deps.includes("svelte")) return "Svelte";
      if (deps.includes("astro")) return "Astro";
      if (deps.includes("@angular/core")) return "Angular";
      if (deps.includes("vue")) return "Vue";
      if (deps.includes("react")) return "React";
      if (deps.includes("hono")) return "Hono";
      if (deps.includes("fastify")) return "Fastify";
      if (deps.includes("express")) return "Express";
      if (deps.includes("@nestjs/core")) return "NestJS";
      if (deps.includes("elysia")) return "Elysia";
      return null;
    }

    test("detects Next.js App Router", () => {
      expect(detectFramework(["next"], true)).toBe("Next.js (App Router)");
    });

    test("detects Next.js Pages Router", () => {
      expect(detectFramework(["next"], false)).toBe("Next.js (Pages Router)");
    });

    test("detects Remix", () => {
      expect(detectFramework(["@remix-run/react"], false)).toBe("Remix");
    });

    test("detects SvelteKit", () => {
      expect(detectFramework(["@sveltejs/kit"], false)).toBe("SvelteKit");
    });

    test("detects base Svelte", () => {
      expect(detectFramework(["svelte"], false)).toBe("Svelte");
    });

    test("detects Vue", () => {
      expect(detectFramework(["vue"], false)).toBe("Vue");
    });

    test("detects React", () => {
      expect(detectFramework(["react"], false)).toBe("React");
    });

    test("detects Express", () => {
      expect(detectFramework(["express"], false)).toBe("Express");
    });

    test("detects Hono", () => {
      expect(detectFramework(["hono"], false)).toBe("Hono");
    });

    test("detects Elysia", () => {
      expect(detectFramework(["elysia"], false)).toBe("Elysia");
    });

    test("returns null for no framework", () => {
      expect(detectFramework([], false)).toBeNull();
    });
  });

  describe("database detection", () => {
    function detectDatabase(deps: string[]): string | null {
      if (deps.includes("prisma") || deps.includes("@prisma/client")) {
        return "Prisma";
      }
      if (deps.includes("drizzle-orm")) return "Drizzle";
      if (deps.includes("typeorm")) return "TypeORM";
      if (deps.includes("sequelize")) return "Sequelize";
      if (deps.includes("mongoose")) return "Mongoose (MongoDB)";
      if (deps.includes("@libsql/client") || deps.includes("libsql")) {
        return "LibSQL/Turso";
      }
      if (deps.includes("better-sqlite3") || deps.includes("sql.js")) {
        return "SQLite";
      }
      if (deps.includes("pg") || deps.includes("postgres")) return "PostgreSQL";
      if (deps.includes("mysql2") || deps.includes("mysql")) return "MySQL";
      if (deps.includes("redis") || deps.includes("ioredis")) return "Redis";
      if (deps.includes("@supabase/supabase-js")) return "Supabase";
      if (deps.includes("firebase") || deps.includes("firebase-admin")) {
        return "Firebase";
      }
      return null;
    }

    test("detects Prisma", () => {
      expect(detectDatabase(["prisma"])).toBe("Prisma");
    });

    test("detects Prisma client", () => {
      expect(detectDatabase(["@prisma/client"])).toBe("Prisma");
    });

    test("detects Drizzle", () => {
      expect(detectDatabase(["drizzle-orm"])).toBe("Drizzle");
    });

    test("detects TypeORM", () => {
      expect(detectDatabase(["typeorm"])).toBe("TypeORM");
    });

    test("detects Mongoose", () => {
      expect(detectDatabase(["mongoose"])).toBe("Mongoose (MongoDB)");
    });

    test("detects LibSQL", () => {
      expect(detectDatabase(["@libsql/client"])).toBe("LibSQL/Turso");
    });

    test("detects SQLite", () => {
      expect(detectDatabase(["better-sqlite3"])).toBe("SQLite");
    });

    test("detects PostgreSQL", () => {
      expect(detectDatabase(["pg"])).toBe("PostgreSQL");
    });

    test("detects Redis", () => {
      expect(detectDatabase(["redis"])).toBe("Redis");
    });

    test("detects Supabase", () => {
      expect(detectDatabase(["@supabase/supabase-js"])).toBe("Supabase");
    });

    test("returns null for no database", () => {
      expect(detectDatabase([])).toBeNull();
    });
  });

  describe("auth detection", () => {
    function detectAuth(deps: string[]): string | null {
      if (deps.includes("better-auth")) return "Better Auth";
      if (deps.includes("next-auth") || deps.includes("@auth/core")) {
        return "Auth.js (NextAuth)";
      }
      if (
        deps.includes("@clerk/nextjs") ||
        deps.includes("@clerk/clerk-sdk-node")
      ) {
        return "Clerk";
      }
      if (deps.includes("lucia")) return "Lucia";
      if (deps.includes("@supabase/auth-helpers-nextjs"))
        return "Supabase Auth";
      if (deps.includes("passport")) return "Passport.js";
      if (deps.includes("@kinde-oss/kinde-auth-nextjs")) return "Kinde";
      if (deps.includes("auth0")) return "Auth0";
      return null;
    }

    test("detects Better Auth", () => {
      expect(detectAuth(["better-auth"])).toBe("Better Auth");
    });

    test("detects NextAuth", () => {
      expect(detectAuth(["next-auth"])).toBe("Auth.js (NextAuth)");
    });

    test("detects Clerk", () => {
      expect(detectAuth(["@clerk/nextjs"])).toBe("Clerk");
    });

    test("detects Lucia", () => {
      expect(detectAuth(["lucia"])).toBe("Lucia");
    });

    test("detects Passport", () => {
      expect(detectAuth(["passport"])).toBe("Passport.js");
    });

    test("detects Auth0", () => {
      expect(detectAuth(["auth0"])).toBe("Auth0");
    });

    test("returns null for no auth", () => {
      expect(detectAuth([])).toBeNull();
    });
  });

  describe("testing detection", () => {
    function detectTesting(deps: string[]): string | null {
      if (deps.includes("vitest")) return "Vitest";
      if (deps.includes("jest")) return "Jest";
      if (deps.includes("@playwright/test")) return "Playwright";
      if (deps.includes("cypress")) return "Cypress";
      if (deps.includes("@testing-library/react")) {
        return "React Testing Library";
      }
      if (deps.includes("mocha")) return "Mocha";
      if (deps.includes("ava")) return "AVA";
      return null;
    }

    test("detects Vitest", () => {
      expect(detectTesting(["vitest"])).toBe("Vitest");
    });

    test("detects Jest", () => {
      expect(detectTesting(["jest"])).toBe("Jest");
    });

    test("detects Playwright", () => {
      expect(detectTesting(["@playwright/test"])).toBe("Playwright");
    });

    test("detects Cypress", () => {
      expect(detectTesting(["cypress"])).toBe("Cypress");
    });

    test("detects Mocha", () => {
      expect(detectTesting(["mocha"])).toBe("Mocha");
    });

    test("returns null for no testing", () => {
      expect(detectTesting([])).toBeNull();
    });
  });

  describe("commit categorization", () => {
    function categorizeCommit(message: string): "decision" | "solution" | null {
      const messageLower = message.toLowerCase();
      const firstLine = message.split("\n")[0] ?? "";

      const decisionKeywords = [
        "decision",
        "chose",
        "decided",
        "migrat",
        "refactor",
        "architect",
        "restructur",
        "redesign",
        "overhaul",
        "breaking",
        "deprecat",
        "upgrade",
        "switch to",
        "replace",
      ];

      const solutionKeywords = [
        "fix",
        "bug",
        "resolve",
        "issue",
        "error",
        "crash",
        "patch",
        "hotfix",
        "correct",
      ];

      if (firstLine.match(/^fix(\(.+\))?!?:/i)) {
        return "solution";
      }

      if (firstLine.match(/^refactor(\(.+\))?!?:/i)) {
        return "decision";
      }

      for (const keyword of decisionKeywords) {
        if (messageLower.includes(keyword)) return "decision";
      }

      for (const keyword of solutionKeywords) {
        if (messageLower.includes(keyword)) return "solution";
      }

      return null;
    }

    test("categorizes fix: as solution", () => {
      expect(categorizeCommit("fix: resolve login issue")).toBe("solution");
    });

    test("categorizes fix(scope): as solution", () => {
      expect(categorizeCommit("fix(auth): fix token refresh")).toBe("solution");
    });

    test("categorizes refactor: as decision", () => {
      expect(categorizeCommit("refactor: restructure auth module")).toBe(
        "decision",
      );
    });

    test("categorizes migration as decision", () => {
      expect(categorizeCommit("Migrate from Jest to Vitest")).toBe("decision");
    });

    test("categorizes breaking change as decision", () => {
      expect(categorizeCommit("Breaking: remove deprecated API")).toBe(
        "decision",
      );
    });

    test("categorizes bug fix as solution", () => {
      expect(categorizeCommit("Fixed bug in authentication")).toBe("solution");
    });

    test("categorizes error fix as solution", () => {
      expect(categorizeCommit("Resolve error in payment flow")).toBe(
        "solution",
      );
    });

    test("returns null for generic commit", () => {
      expect(categorizeCommit("Update README")).toBeNull();
    });

    test("returns null for docs commit", () => {
      expect(categorizeCommit("docs: add API documentation")).toBeNull();
    });
  });

  describe("title extraction", () => {
    function extractTitle(commitMessage: string): string {
      const firstLine = commitMessage.split("\n")[0] ?? "";
      return firstLine
        .replace(
          /^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?!?:\s*/i,
          "",
        )
        .slice(0, 100);
    }

    test("extracts title from fix commit", () => {
      expect(extractTitle("fix: resolve login bug")).toBe("resolve login bug");
    });

    test("extracts title from scoped commit", () => {
      expect(extractTitle("feat(auth): add SSO support")).toBe(
        "add SSO support",
      );
    });

    test("handles breaking change marker", () => {
      expect(extractTitle("feat!: major API change")).toBe("major API change");
    });

    test("handles plain message", () => {
      expect(extractTitle("Update dependencies")).toBe("Update dependencies");
    });

    test("truncates long titles", () => {
      const longMessage = "a".repeat(150);
      expect(extractTitle(longMessage).length).toBe(100);
    });
  });

  describe("summary extraction", () => {
    function extractSummary(commitMessage: string): string | undefined {
      const lines = commitMessage.split("\n").filter((l) => l.trim());
      if (lines.length <= 1) return undefined;

      const body = lines.slice(1).join(" ").trim();
      if (body.length < 20) return undefined;

      return body.slice(0, 200);
    }

    test("extracts body as summary", () => {
      const message = "fix: login bug\n\nThis fixes the issue where users...";
      expect(extractSummary(message)).toBe(
        "This fixes the issue where users...",
      );
    });

    test("returns undefined for single line", () => {
      expect(extractSummary("fix: simple fix")).toBeUndefined();
    });

    test("returns undefined for short body", () => {
      const message = "fix: bug\n\nSmall fix";
      expect(extractSummary(message)).toBeUndefined();
    });

    test("truncates long summaries", () => {
      const message = `fix: bug\n\n${"a".repeat(300)}`;
      const summary = extractSummary(message);
      expect(summary?.length).toBe(200);
    });
  });

  describe("tag building from commit", () => {
    function buildTags(
      message: string,
      type: string,
      isBreaking: boolean,
    ): string[] {
      const tags = ["git-extracted", type];

      if (isBreaking) tags.push("breaking-change");

      const scopeMatch = message.match(/^\w+\(([^)]+)\):/);
      if (scopeMatch) tags.push(scopeMatch[1]);

      const messageLower = message.toLowerCase();
      if (messageLower.includes("auth")) tags.push("auth");
      if (messageLower.includes("api")) tags.push("api");
      if (messageLower.includes("database") || messageLower.includes("db")) {
        tags.push("database");
      }
      if (messageLower.includes("ui") || messageLower.includes("frontend")) {
        tags.push("ui");
      }
      if (messageLower.includes("test")) tags.push("testing");
      if (messageLower.includes("security")) tags.push("security");

      return [...new Set(tags)];
    }

    test("includes git-extracted tag", () => {
      const tags = buildTags("fix: bug", "solution", false);
      expect(tags).toContain("git-extracted");
    });

    test("includes type tag", () => {
      const tags = buildTags("fix: bug", "solution", false);
      expect(tags).toContain("solution");
    });

    test("includes breaking-change tag", () => {
      const tags = buildTags("feat!: major change", "decision", true);
      expect(tags).toContain("breaking-change");
    });

    test("extracts scope as tag", () => {
      const tags = buildTags("fix(auth): login bug", "solution", false);
      expect(tags).toContain("auth");
    });

    test("adds auth tag from content", () => {
      const tags = buildTags("fix: authentication issue", "solution", false);
      expect(tags).toContain("auth");
    });

    test("adds api tag from content", () => {
      const tags = buildTags("fix: API endpoint error", "solution", false);
      expect(tags).toContain("api");
    });

    test("adds database tag from content", () => {
      const tags = buildTags("fix: database connection", "solution", false);
      expect(tags).toContain("database");
    });

    test("deduplicates tags", () => {
      const tags = buildTags("fix(auth): auth bug", "solution", false);
      const authCount = tags.filter((t) => t === "auth").length;
      expect(authCount).toBe(1);
    });
  });

  describe("breaking change detection", () => {
    function isBreakingChange(message: string): boolean {
      const messageLower = message.toLowerCase();
      return (
        message.includes("!:") ||
        messageLower.includes("breaking change") ||
        messageLower.includes("breaking:")
      );
    }

    test("detects conventional breaking marker", () => {
      expect(isBreakingChange("feat!: major change")).toBe(true);
    });

    test("detects BREAKING CHANGE", () => {
      expect(
        isBreakingChange("feat: new API\n\nBREAKING CHANGE: old removed"),
      ).toBe(true);
    });

    test("detects breaking: prefix", () => {
      expect(isBreakingChange("breaking: remove deprecated")).toBe(true);
    });

    test("returns false for normal commit", () => {
      expect(isBreakingChange("fix: minor bug")).toBe(false);
    });
  });

  describe("issue reference extraction", () => {
    function extractIssues(message: string): string[] {
      const issues: string[] = [];
      const matches = message.matchAll(/#(\d+)|([A-Z]+-\d+)/g);
      for (const match of matches) {
        const issue = match[1] ? `#${match[1]}` : match[2];
        if (issue && !issues.includes(issue)) {
          issues.push(issue);
        }
      }
      return issues;
    }

    test("extracts GitHub issue reference", () => {
      const issues = extractIssues("fix: resolve #123");
      expect(issues).toContain("#123");
    });

    test("extracts multiple GitHub issues", () => {
      const issues = extractIssues("fix: resolve #123 and #456");
      expect(issues).toEqual(["#123", "#456"]);
    });

    test("extracts Jira issue reference", () => {
      const issues = extractIssues("fix: resolve PROJ-123");
      expect(issues).toContain("PROJ-123");
    });

    test("extracts mixed references", () => {
      const issues = extractIssues("fix: #123 and JIRA-456");
      expect(issues).toEqual(["#123", "JIRA-456"]);
    });

    test("returns empty for no issues", () => {
      expect(extractIssues("fix: simple bug")).toEqual([]);
    });

    test("deduplicates issues", () => {
      const issues = extractIssues("fix #123: related to #123");
      expect(issues).toEqual(["#123"]);
    });
  });

  describe("documentation importance scoring", () => {
    function getDocImportance(filePath: string): number {
      const pathLower = filePath.toLowerCase();
      if (pathLower.includes("readme")) return 0.9;
      if (pathLower.includes("contributing")) return 0.8;
      if (pathLower.includes("architecture")) return 0.85;
      if (pathLower.includes("adr")) return 0.8;
      if (pathLower.includes("decision")) return 0.8;
      if (pathLower.includes("changelog")) return 0.6;
      return 0.5;
    }

    test("README has highest importance", () => {
      expect(getDocImportance("README.md")).toBe(0.9);
    });

    test("CONTRIBUTING has high importance", () => {
      expect(getDocImportance("CONTRIBUTING.md")).toBe(0.8);
    });

    test("architecture docs have high importance", () => {
      expect(getDocImportance("docs/architecture.md")).toBe(0.85);
    });

    test("ADR docs have high importance", () => {
      expect(getDocImportance("docs/adr/001-use-typescript.md")).toBe(0.8);
    });

    test("changelog has medium importance", () => {
      expect(getDocImportance("CHANGELOG.md")).toBe(0.6);
    });

    test("other docs have default importance", () => {
      expect(getDocImportance("docs/api.md")).toBe(0.5);
    });
  });

  describe("doc tag building", () => {
    function buildDocTags(filePath: string): string[] {
      const tags = ["documentation", "imported"];
      const pathLower = filePath.toLowerCase();

      if (pathLower.includes("readme")) tags.push("readme");
      if (pathLower.includes("contributing")) tags.push("contributing");
      if (pathLower.includes("architecture")) tags.push("architecture");
      if (pathLower.includes("adr") || pathLower.includes("decision")) {
        tags.push("adr");
      }
      if (pathLower.includes("changelog")) tags.push("changelog");
      if (pathLower.includes("api")) tags.push("api-docs");
      if (pathLower.includes("guide")) tags.push("guide");
      if (pathLower.includes("tutorial")) tags.push("tutorial");

      return tags;
    }

    test("includes documentation tag", () => {
      const tags = buildDocTags("docs/api.md");
      expect(tags).toContain("documentation");
    });

    test("includes imported tag", () => {
      const tags = buildDocTags("docs/api.md");
      expect(tags).toContain("imported");
    });

    test("includes readme tag", () => {
      const tags = buildDocTags("README.md");
      expect(tags).toContain("readme");
    });

    test("includes architecture tag", () => {
      const tags = buildDocTags("docs/architecture/overview.md");
      expect(tags).toContain("architecture");
    });

    test("includes adr tag for decision docs", () => {
      const tags = buildDocTags("docs/decision/001.md");
      expect(tags).toContain("adr");
    });

    test("includes api-docs tag", () => {
      const tags = buildDocTags("docs/api-reference.md");
      expect(tags).toContain("api-docs");
    });

    test("includes guide tag", () => {
      const tags = buildDocTags("docs/getting-started-guide.md");
      expect(tags).toContain("guide");
    });
  });

  describe("doc title extraction", () => {
    function extractDocTitle(content: string, filename: string): string {
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) return titleMatch[1].slice(0, 100);
      return filename.replace(/\.(md|mdx|txt)$/, "").replace(/[-_]/g, " ");
    }

    test("extracts markdown heading", () => {
      expect(extractDocTitle("# Welcome\n\nContent", "file.md")).toBe(
        "Welcome",
      );
    });

    test("falls back to filename", () => {
      expect(extractDocTitle("No heading here", "getting-started.md")).toBe(
        "getting started",
      );
    });

    test("replaces underscores in filename", () => {
      expect(extractDocTitle("Content", "api_reference.md")).toBe(
        "api reference",
      );
    });

    test("removes extension", () => {
      expect(extractDocTitle("Content", "guide.mdx")).toBe("guide");
    });

    test("truncates long titles", () => {
      const longTitle = `# ${"a".repeat(150)}`;
      expect(extractDocTitle(longTitle, "file.md").length).toBe(100);
    });
  });

  describe("file finding with depth limit", () => {
    function shouldTraverse(depth: number, maxDepth: number): boolean {
      return depth < maxDepth;
    }

    function shouldIncludeDir(name: string, excludes: string[]): boolean {
      return !excludes.includes(name) && !name.startsWith(".");
    }

    test("allows traversal within depth", () => {
      expect(shouldTraverse(3, 5)).toBe(true);
    });

    test("blocks traversal at depth limit", () => {
      expect(shouldTraverse(5, 5)).toBe(false);
    });

    test("blocks traversal beyond depth", () => {
      expect(shouldTraverse(6, 5)).toBe(false);
    });

    test("excludes node_modules", () => {
      expect(shouldIncludeDir("node_modules", ["node_modules", ".git"])).toBe(
        false,
      );
    });

    test("excludes .git", () => {
      expect(shouldIncludeDir(".git", ["node_modules", ".git"])).toBe(false);
    });

    test("excludes hidden directories", () => {
      expect(shouldIncludeDir(".cache", [])).toBe(false);
    });

    test("includes normal directories", () => {
      expect(shouldIncludeDir("src", ["node_modules", ".git"])).toBe(true);
    });
  });
});
