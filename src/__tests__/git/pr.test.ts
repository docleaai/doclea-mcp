/**
 * Tests for PR description generation helper functions
 * Tests the pure function logic used in pr.ts
 */

import { describe, expect, test } from "bun:test";

describe("PR description generation", () => {
  describe("generateTitle", () => {
    function generateTitle(branch: string, commits: string[]): string {
      // Try to extract meaningful title from branch name
      const branchMatch = branch.match(
        /^(?:feature|feat|fix|bugfix|hotfix|chore|docs)[-/](.+)$/i,
      );
      if (branchMatch) {
        const rawTitle = branchMatch[1]
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        return rawTitle;
      }

      // Fall back to first commit message
      if (commits.length > 0) {
        const firstCommit = commits[commits.length - 1]; // Oldest commit
        if (firstCommit) {
          return firstCommit.replace(
            /^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?:\s*/i,
            "",
          );
        }
      }

      // Default
      return `Changes from ${branch}`;
    }

    test("extracts title from feature branch with slash", () => {
      expect(generateTitle("feature/add-login", [])).toBe("Add Login");
    });

    test("extracts title from feature branch with dash", () => {
      expect(generateTitle("feat-user-profile", [])).toBe("User Profile");
    });

    test("extracts title from fix branch", () => {
      expect(generateTitle("fix/broken-button", [])).toBe("Broken Button");
    });

    test("extracts title from bugfix branch", () => {
      expect(generateTitle("bugfix/memory-leak", [])).toBe("Memory Leak");
    });

    test("extracts title from hotfix branch", () => {
      expect(generateTitle("hotfix-critical-error", [])).toBe("Critical Error");
    });

    test("extracts title from chore branch", () => {
      expect(generateTitle("chore/update-deps", [])).toBe("Update Deps");
    });

    test("extracts title from docs branch", () => {
      expect(generateTitle("docs/api-reference", [])).toBe("Api Reference");
    });

    test("handles underscores in branch name", () => {
      expect(generateTitle("feature/user_auth_flow", [])).toBe(
        "User Auth Flow",
      );
    });

    test("falls back to oldest commit for unknown branch pattern", () => {
      const commits = ["feat: polish ui", "feat: add search"];
      expect(generateTitle("my-branch", commits)).toBe("add search");
    });

    test("removes conventional commit prefix from fallback", () => {
      const commits = ["fix(auth): resolve token issue"];
      expect(generateTitle("random-branch", commits)).toBe(
        "resolve token issue",
      );
    });

    test("defaults to branch name when no pattern and no commits", () => {
      expect(generateTitle("random-branch", [])).toBe(
        "Changes from random-branch",
      );
    });

    test("handles case insensitive branch patterns", () => {
      expect(generateTitle("FEATURE/big-feature", [])).toBe("Big Feature");
    });

    test("handles mixed case in branch name", () => {
      expect(generateTitle("Feature/Add-OAuth", [])).toBe("Add OAuth");
    });
  });

  describe("generateSummary", () => {
    function generateSummary(
      commits: string[],
      filesChanged: string[],
    ): string {
      const types = new Map<string, number>();
      const scopes = new Set<string>();

      for (const commit of commits) {
        const match = commit.match(
          /^(feat|fix|docs|style|refactor|test|chore)(?:\((.+)\))?:/i,
        );
        if (match) {
          const type = match[1].toLowerCase();
          types.set(type, (types.get(type) ?? 0) + 1);
          if (match[2]) scopes.add(match[2]);
        }
      }

      const parts: string[] = [];

      if (types.has("feat")) {
        parts.push(`Adds ${types.get("feat")} new feature(s)`);
      }
      if (types.has("fix")) {
        parts.push(`Fixes ${types.get("fix")} bug(s)`);
      }
      if (types.has("refactor")) {
        parts.push(`Refactors ${types.get("refactor")} component(s)`);
      }
      if (types.has("docs")) {
        parts.push("Updates documentation");
      }
      if (types.has("test")) {
        parts.push("Adds/updates tests");
      }

      if (parts.length === 0) {
        return `This PR includes ${commits.length} commit(s) affecting ${filesChanged.length} file(s).`;
      }

      return parts.join(". ") + ".";
    }

    test("summarizes single feature", () => {
      const commits = ["feat: add login button"];
      expect(generateSummary(commits, [])).toBe("Adds 1 new feature(s).");
    });

    test("summarizes multiple features", () => {
      const commits = [
        "feat: add login",
        "feat: add logout",
        "feat: add profile",
      ];
      expect(generateSummary(commits, [])).toBe("Adds 3 new feature(s).");
    });

    test("summarizes single fix", () => {
      const commits = ["fix: resolve crash"];
      expect(generateSummary(commits, [])).toBe("Fixes 1 bug(s).");
    });

    test("summarizes multiple fixes", () => {
      const commits = ["fix: resolve crash", "fix: fix memory leak"];
      expect(generateSummary(commits, [])).toBe("Fixes 2 bug(s).");
    });

    test("summarizes refactor commits", () => {
      const commits = ["refactor: clean up code", "refactor: simplify logic"];
      expect(generateSummary(commits, [])).toBe("Refactors 2 component(s).");
    });

    test("summarizes docs commits", () => {
      const commits = ["docs: update readme"];
      expect(generateSummary(commits, [])).toBe("Updates documentation.");
    });

    test("summarizes test commits", () => {
      const commits = ["test: add unit tests"];
      expect(generateSummary(commits, [])).toBe("Adds/updates tests.");
    });

    test("summarizes mixed commit types", () => {
      const commits = [
        "feat: add feature",
        "fix: fix bug",
        "docs: update docs",
      ];
      const summary = generateSummary(commits, []);
      expect(summary).toContain("Adds 1 new feature(s)");
      expect(summary).toContain("Fixes 1 bug(s)");
      expect(summary).toContain("Updates documentation");
    });

    test("falls back to generic summary for non-conventional commits", () => {
      const commits = ["add feature", "update code"];
      const files = ["src/index.ts", "src/utils.ts"];
      expect(generateSummary(commits, files)).toBe(
        "This PR includes 2 commit(s) affecting 2 file(s).",
      );
    });

    test("handles empty commits", () => {
      expect(generateSummary([], [])).toBe(
        "This PR includes 0 commit(s) affecting 0 file(s).",
      );
    });

    test("handles commits with scopes", () => {
      const commits = ["feat(auth): add login", "fix(api): fix endpoint"];
      const summary = generateSummary(commits, []);
      expect(summary).toContain("Adds 1 new feature(s)");
      expect(summary).toContain("Fixes 1 bug(s)");
    });

    test("ignores chore and style commits in summary", () => {
      const commits = ["chore: update deps", "style: format code"];
      expect(generateSummary(commits, ["package.json"])).toBe(
        "This PR includes 2 commit(s) affecting 1 file(s).",
      );
    });
  });

  describe("extractBranchContext", () => {
    function extractBranchContext(files: string[], commits: string[]): string {
      const parts: string[] = [];

      // Extract areas from file paths
      const areas = new Set<string>();
      for (const file of files) {
        const pathParts = file.split("/");
        if (pathParts.length > 1) {
          areas.add(pathParts[0]);
          if (pathParts.length > 2) {
            areas.add(pathParts.slice(0, 2).join("/"));
          }
        }
      }
      if (areas.size > 0) {
        parts.push(`Changes in: ${[...areas].slice(0, 5).join(", ")}`);
      }

      // Extract key terms from commits
      const keywords = new Set<string>();
      for (const commit of commits) {
        const scopeMatch = commit.match(/^\w+\(([^)]+)\):/);
        if (scopeMatch) {
          keywords.add(scopeMatch[1]);
        }
        const terms = commit
          .toLowerCase()
          .match(
            /\b(auth|api|db|database|ui|config|test|security|performance)\b/g,
          );
        if (terms) {
          for (const term of terms) keywords.add(term);
        }
      }
      if (keywords.size > 0) {
        parts.push(`Topics: ${[...keywords].slice(0, 5).join(", ")}`);
      }

      return parts.join(". ");
    }

    test("extracts top-level directory from files", () => {
      const files = ["src/index.ts", "src/utils.ts"];
      const context = extractBranchContext(files, []);
      expect(context).toContain("src");
    });

    test("extracts nested directories", () => {
      const files = ["src/components/Button.tsx"];
      const context = extractBranchContext(files, []);
      expect(context).toContain("src");
      expect(context).toContain("src/components");
    });

    test("extracts scope from conventional commits", () => {
      const commits = ["feat(auth): add login"];
      const context = extractBranchContext([], commits);
      expect(context).toContain("auth");
    });

    test("extracts auth keyword from commits", () => {
      const commits = ["implement auth flow"];
      const context = extractBranchContext([], commits);
      expect(context).toContain("auth");
    });

    test("extracts api keyword from commits", () => {
      const commits = ["update api endpoints"];
      const context = extractBranchContext([], commits);
      expect(context).toContain("api");
    });

    test("extracts database keywords", () => {
      const commits = ["optimize db queries", "update database schema"];
      const context = extractBranchContext([], commits);
      expect(context).toContain("db");
      expect(context).toContain("database");
    });

    test("extracts ui keyword", () => {
      const commits = ["improve ui components"];
      const context = extractBranchContext([], commits);
      expect(context).toContain("ui");
    });

    test("extracts config keyword", () => {
      const commits = ["update config files"];
      const context = extractBranchContext([], commits);
      expect(context).toContain("config");
    });

    test("extracts test keyword", () => {
      const commits = ["add test coverage"];
      const context = extractBranchContext([], commits);
      expect(context).toContain("test");
    });

    test("extracts security keyword", () => {
      const commits = ["improve security measures"];
      const context = extractBranchContext([], commits);
      expect(context).toContain("security");
    });

    test("extracts performance keyword", () => {
      const commits = ["optimize performance"];
      const context = extractBranchContext([], commits);
      expect(context).toContain("performance");
    });

    test("combines file areas and commit keywords", () => {
      const files = ["src/auth/login.ts"];
      const commits = ["feat(auth): add login", "improve security"];
      const context = extractBranchContext(files, commits);
      expect(context).toContain("Changes in:");
      expect(context).toContain("Topics:");
    });

    test("returns empty for root files and non-matching commits", () => {
      const files = ["index.ts"];
      const commits = ["add feature"];
      const context = extractBranchContext(files, commits);
      expect(context).toBe("");
    });

    test("limits areas to 5", () => {
      const files = [
        "a/file.ts",
        "b/file.ts",
        "c/file.ts",
        "d/file.ts",
        "e/file.ts",
        "f/file.ts",
        "g/file.ts",
      ];
      const context = extractBranchContext(files, []);
      // Should only include first 5
      const areaCount = (context.match(/,/g) || []).length + 1;
      expect(areaCount).toBeLessThanOrEqual(5);
    });
  });

  describe("groupFilesByDirectory", () => {
    function groupFilesByDirectory(files: string[]): Record<string, string[]> {
      const result: Record<string, string[]> = {};

      for (const file of files) {
        const parts = file.split("/");
        const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
        const fileName = parts[parts.length - 1];

        if (!result[dir]) result[dir] = [];
        if (fileName) {
          result[dir].push(fileName);
        }
      }

      return result;
    }

    test("groups files by directory", () => {
      const files = ["src/index.ts", "src/utils.ts"];
      const grouped = groupFilesByDirectory(files);
      expect(grouped["src"]).toContain("index.ts");
      expect(grouped["src"]).toContain("utils.ts");
    });

    test("handles nested directories", () => {
      const files = ["src/components/Button.tsx", "src/components/Input.tsx"];
      const grouped = groupFilesByDirectory(files);
      expect(grouped["src/components"]).toContain("Button.tsx");
      expect(grouped["src/components"]).toContain("Input.tsx");
    });

    test("handles root files", () => {
      const files = ["index.ts", "package.json"];
      const grouped = groupFilesByDirectory(files);
      expect(grouped[""]).toContain("index.ts");
      expect(grouped[""]).toContain("package.json");
    });

    test("handles mixed directories", () => {
      const files = ["src/index.ts", "test/test.ts", "index.ts"];
      const grouped = groupFilesByDirectory(files);
      expect(grouped["src"]).toContain("index.ts");
      expect(grouped["test"]).toContain("test.ts");
      expect(grouped[""]).toContain("index.ts");
    });

    test("handles deeply nested files", () => {
      const files = ["src/components/forms/Input.tsx"];
      const grouped = groupFilesByDirectory(files);
      expect(grouped["src/components/forms"]).toContain("Input.tsx");
    });

    test("returns empty object for empty input", () => {
      expect(groupFilesByDirectory([])).toEqual({});
    });
  });

  describe("extractRelatedIssues", () => {
    interface Memory {
      id: string;
      title: string;
      content: string;
      type: string;
      sourcePr?: string;
    }

    interface RelatedMemory {
      memory: Memory;
      score: number;
    }

    function extractRelatedIssues(memories: RelatedMemory[]): string[] {
      const issues: string[] = [];
      const issuePattern = /#(\d+)|([A-Z]+-\d+)/g;

      for (const { memory } of memories) {
        // Check sourcePr field
        if (memory.sourcePr) {
          const prMatch = memory.sourcePr.match(/\d+/);
          if (prMatch) {
            const issue = `#${prMatch[0]}`;
            if (!issues.includes(issue)) {
              issues.push(issue);
            }
          }
        }

        // Extract issues from content
        const contentMatches = memory.content.matchAll(issuePattern);
        for (const match of contentMatches) {
          const issue = match[1] ? `#${match[1]}` : match[2];
          if (issue && !issues.includes(issue)) {
            issues.push(issue);
          }
        }

        // Extract issues from title
        const titleMatches = memory.title.matchAll(issuePattern);
        for (const match of titleMatches) {
          const issue = match[1] ? `#${match[1]}` : match[2];
          if (issue && !issues.includes(issue)) {
            issues.push(issue);
          }
        }
      }

      return [...new Set(issues)].slice(0, 5);
    }

    test("extracts issue from sourcePr", () => {
      const memories: RelatedMemory[] = [
        {
          memory: {
            id: "1",
            title: "Decision",
            content: "Content",
            type: "decision",
            sourcePr: "https://github.com/org/repo/pull/123",
          },
          score: 0.9,
        },
      ];
      expect(extractRelatedIssues(memories)).toContain("#123");
    });

    test("extracts GitHub issue from content", () => {
      const memories: RelatedMemory[] = [
        {
          memory: {
            id: "1",
            title: "Decision",
            content: "This relates to #456",
            type: "decision",
          },
          score: 0.9,
        },
      ];
      expect(extractRelatedIssues(memories)).toContain("#456");
    });

    test("extracts Jira issue from content", () => {
      const memories: RelatedMemory[] = [
        {
          memory: {
            id: "1",
            title: "Decision",
            content: "Related to PROJ-789",
            type: "decision",
          },
          score: 0.9,
        },
      ];
      expect(extractRelatedIssues(memories)).toContain("PROJ-789");
    });

    test("extracts issue from title", () => {
      const memories: RelatedMemory[] = [
        {
          memory: {
            id: "1",
            title: "Fix for #101",
            content: "Content",
            type: "decision",
          },
          score: 0.9,
        },
      ];
      expect(extractRelatedIssues(memories)).toContain("#101");
    });

    test("deduplicates issues", () => {
      const memories: RelatedMemory[] = [
        {
          memory: {
            id: "1",
            title: "Fix #123",
            content: "Related to #123",
            type: "decision",
            sourcePr: "https://github.com/org/repo/pull/123",
          },
          score: 0.9,
        },
      ];
      const issues = extractRelatedIssues(memories);
      expect(issues.filter((i) => i === "#123").length).toBe(1);
    });

    test("limits to 5 issues", () => {
      const memories: RelatedMemory[] = [
        {
          memory: {
            id: "1",
            title: "Issues",
            content: "#1 #2 #3 #4 #5 #6 #7",
            type: "decision",
          },
          score: 0.9,
        },
      ];
      expect(extractRelatedIssues(memories).length).toBeLessThanOrEqual(5);
    });

    test("returns empty for no issues", () => {
      const memories: RelatedMemory[] = [
        {
          memory: {
            id: "1",
            title: "Decision",
            content: "No issues here",
            type: "decision",
          },
          score: 0.9,
        },
      ];
      expect(extractRelatedIssues(memories)).toEqual([]);
    });

    test("handles empty memories array", () => {
      expect(extractRelatedIssues([])).toEqual([]);
    });

    test("extracts from multiple memories", () => {
      const memories: RelatedMemory[] = [
        {
          memory: {
            id: "1",
            title: "First",
            content: "#100",
            type: "decision",
          },
          score: 0.9,
        },
        {
          memory: {
            id: "2",
            title: "Second",
            content: "#200",
            type: "decision",
          },
          score: 0.8,
        },
      ];
      const issues = extractRelatedIssues(memories);
      expect(issues).toContain("#100");
      expect(issues).toContain("#200");
    });
  });

  describe("PR body section generation", () => {
    function generateChangesSection(commits: string[]): string {
      if (commits.length === 0) return "";

      const lines: string[] = [];
      lines.push("\n## Changes\n");

      for (const commit of commits.slice(0, 10)) {
        lines.push(`- ${commit}`);
      }

      if (commits.length > 10) {
        lines.push(`- ... and ${commits.length - 10} more commits`);
      }

      return lines.join("\n");
    }

    test("generates changes section for commits", () => {
      const commits = ["feat: add login", "fix: resolve bug"];
      const section = generateChangesSection(commits);
      expect(section).toContain("## Changes");
      expect(section).toContain("- feat: add login");
      expect(section).toContain("- fix: resolve bug");
    });

    test("limits to 10 commits", () => {
      const commits = Array(15)
        .fill(null)
        .map((_, i) => `commit ${i + 1}`);
      const section = generateChangesSection(commits);
      expect(section).toContain("... and 5 more commits");
    });

    test("shows exactly 10 commits", () => {
      const commits = Array(10)
        .fill(null)
        .map((_, i) => `commit ${i + 1}`);
      const section = generateChangesSection(commits);
      expect(section).not.toContain("more commits");
    });

    test("returns empty for no commits", () => {
      expect(generateChangesSection([])).toBe("");
    });
  });

  describe("files changed section", () => {
    function groupFilesByDirectory(files: string[]): Record<string, string[]> {
      const result: Record<string, string[]> = {};
      for (const file of files) {
        const parts = file.split("/");
        const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
        const fileName = parts[parts.length - 1];
        if (!result[dir]) result[dir] = [];
        if (fileName) result[dir].push(fileName);
      }
      return result;
    }

    function generateFilesSection(
      filesChanged: string[],
      additions: number,
      deletions: number,
    ): string {
      if (filesChanged.length === 0) return "";

      const lines: string[] = [];
      lines.push("\n## Files Changed\n");
      lines.push(
        `**${filesChanged.length}** files changed, **${additions}** insertions(+), **${deletions}** deletions(-)\n`,
      );

      const byDir = groupFilesByDirectory(filesChanged);
      const dirEntries = Object.entries(byDir).slice(0, 5);

      for (const [dir, files] of dirEntries) {
        lines.push(`\n### ${dir || "root"}`);
        for (const file of files.slice(0, 5)) {
          lines.push(`- \`${file}\``);
        }
        if (files.length > 5) {
          lines.push(`- ... and ${files.length - 5} more`);
        }
      }

      return lines.join("\n");
    }

    test("generates files section with stats", () => {
      const files = ["src/index.ts"];
      const section = generateFilesSection(files, 100, 50);
      expect(section).toContain("## Files Changed");
      expect(section).toContain("**1** files changed");
      expect(section).toContain("**100** insertions(+)");
      expect(section).toContain("**50** deletions(-)");
    });

    test("groups files by directory", () => {
      const files = ["src/index.ts", "src/utils.ts"];
      const section = generateFilesSection(files, 10, 5);
      expect(section).toContain("### src");
      expect(section).toContain("`index.ts`");
      expect(section).toContain("`utils.ts`");
    });

    test("uses root for files without directory", () => {
      const files = ["index.ts", "package.json"];
      const section = generateFilesSection(files, 10, 5);
      expect(section).toContain("### root");
    });

    test("limits directories to 5", () => {
      const files = [
        "a/file.ts",
        "b/file.ts",
        "c/file.ts",
        "d/file.ts",
        "e/file.ts",
        "f/file.ts",
      ];
      const section = generateFilesSection(files, 10, 5);
      // Should not include 'f' directory
      const dirCount = (section.match(/### /g) || []).length;
      expect(dirCount).toBeLessThanOrEqual(5);
    });

    test("limits files per directory to 5", () => {
      const files = Array(10)
        .fill(null)
        .map((_, i) => `src/file${i}.ts`);
      const section = generateFilesSection(files, 10, 5);
      expect(section).toContain("... and 5 more");
    });

    test("returns empty for no files", () => {
      expect(generateFilesSection([], 0, 0)).toBe("");
    });
  });

  describe("reviewer section generation", () => {
    interface ReviewerSuggestion {
      name: string;
      email: string;
      expertise: number;
      reason: string;
      category: "required" | "optional";
    }

    interface SuggestReviewersResult {
      required: ReviewerSuggestion[];
      optional: ReviewerSuggestion[];
      noOwner: string[];
    }

    function generateReviewerSection(
      reviewers: SuggestReviewersResult,
    ): string {
      const hasReviewers =
        reviewers.required.length > 0 || reviewers.optional.length > 0;
      if (!hasReviewers) return "";

      const lines: string[] = [];
      lines.push("\n## Suggested Reviewers\n");

      for (const reviewer of reviewers.required) {
        lines.push(
          `- **@${reviewer.name}** (${reviewer.reason}) — **required**`,
        );
      }

      for (const reviewer of reviewers.optional) {
        lines.push(`- **@${reviewer.name}** (${reviewer.reason}) — optional`);
      }

      if (reviewers.noOwner.length > 0) {
        lines.push("");
        if (reviewers.noOwner.length <= 3) {
          lines.push(
            `> \u26A0\uFE0F No clear owner for: ${reviewers.noOwner.join(", ")}`,
          );
        } else {
          lines.push(
            `> \u26A0\uFE0F No clear owner for ${reviewers.noOwner.length} files`,
          );
        }
      }

      return lines.join("\n");
    }

    test("generates section with required reviewers", () => {
      const reviewers: SuggestReviewersResult = {
        required: [
          {
            name: "Alice",
            email: "alice@example.com",
            expertise: 80,
            reason: "80% ownership",
            category: "required",
          },
        ],
        optional: [],
        noOwner: [],
      };
      const section = generateReviewerSection(reviewers);
      expect(section).toContain("## Suggested Reviewers");
      expect(section).toContain("**@Alice**");
      expect(section).toContain("**required**");
    });

    test("generates section with optional reviewers", () => {
      const reviewers: SuggestReviewersResult = {
        required: [],
        optional: [
          {
            name: "Bob",
            email: "bob@example.com",
            expertise: 30,
            reason: "familiar with codebase",
            category: "optional",
          },
        ],
        noOwner: [],
      };
      const section = generateReviewerSection(reviewers);
      expect(section).toContain("**@Bob**");
      expect(section).toContain("optional");
    });

    test("generates section with mixed reviewers", () => {
      const reviewers: SuggestReviewersResult = {
        required: [
          {
            name: "Alice",
            email: "a@example.com",
            expertise: 80,
            reason: "owner",
            category: "required",
          },
        ],
        optional: [
          {
            name: "Bob",
            email: "b@example.com",
            expertise: 30,
            reason: "contributor",
            category: "optional",
          },
        ],
        noOwner: [],
      };
      const section = generateReviewerSection(reviewers);
      expect(section).toContain("**@Alice**");
      expect(section).toContain("**@Bob**");
    });

    test("shows warning for few unowned files", () => {
      const reviewers: SuggestReviewersResult = {
        required: [
          {
            name: "Alice",
            email: "a@example.com",
            expertise: 80,
            reason: "owner",
            category: "required",
          },
        ],
        optional: [],
        noOwner: ["file1.ts", "file2.ts"],
      };
      const section = generateReviewerSection(reviewers);
      expect(section).toContain("No clear owner for: file1.ts, file2.ts");
    });

    test("summarizes many unowned files", () => {
      const reviewers: SuggestReviewersResult = {
        required: [
          {
            name: "Alice",
            email: "a@example.com",
            expertise: 80,
            reason: "owner",
            category: "required",
          },
        ],
        optional: [],
        noOwner: ["file1.ts", "file2.ts", "file3.ts", "file4.ts", "file5.ts"],
      };
      const section = generateReviewerSection(reviewers);
      expect(section).toContain("No clear owner for 5 files");
    });

    test("returns empty when no reviewers", () => {
      const reviewers: SuggestReviewersResult = {
        required: [],
        optional: [],
        noOwner: [],
      };
      expect(generateReviewerSection(reviewers)).toBe("");
    });
  });

  describe("context section generation", () => {
    interface Memory {
      id: string;
      title: string;
      summary?: string;
      type: string;
    }

    interface RelatedMemory {
      memory: Memory;
      score: number;
    }

    function generateContextSection(memories: RelatedMemory[]): string {
      const decisions = memories.filter((m) => m.memory.type === "decision");
      if (decisions.length === 0) return "";

      const lines: string[] = [];
      lines.push("\n## Context\n");
      lines.push("This PR relates to the following architectural decisions:\n");

      for (const { memory, score } of decisions.slice(0, 3)) {
        const relevancePercent = Math.round(score * 100);
        lines.push(`- **${memory.title}** (${relevancePercent}% relevant)`);
        if (memory.summary) {
          lines.push(`  ${memory.summary}`);
        }
      }

      return lines.join("\n");
    }

    test("generates context with decisions", () => {
      const memories: RelatedMemory[] = [
        {
          memory: {
            id: "1",
            title: "Use TypeScript",
            summary: "For type safety",
            type: "decision",
          },
          score: 0.9,
        },
      ];
      const section = generateContextSection(memories);
      expect(section).toContain("## Context");
      expect(section).toContain("**Use TypeScript**");
      expect(section).toContain("90% relevant");
      expect(section).toContain("For type safety");
    });

    test("limits to 3 decisions", () => {
      const memories: RelatedMemory[] = Array(5)
        .fill(null)
        .map((_, i) => ({
          memory: {
            id: String(i),
            title: `Decision ${i}`,
            type: "decision",
          },
          score: 0.9 - i * 0.1,
        }));
      const section = generateContextSection(memories);
      expect(section).toContain("Decision 0");
      expect(section).toContain("Decision 2");
      expect(section).not.toContain("Decision 4");
    });

    test("filters non-decision memories", () => {
      const memories: RelatedMemory[] = [
        {
          memory: { id: "1", title: "Pattern", type: "pattern" },
          score: 0.9,
        },
      ];
      expect(generateContextSection(memories)).toBe("");
    });

    test("handles missing summary", () => {
      const memories: RelatedMemory[] = [
        {
          memory: { id: "1", title: "Decision", type: "decision" },
          score: 0.8,
        },
      ];
      const section = generateContextSection(memories);
      expect(section).toContain("**Decision**");
      expect(section).toContain("80% relevant");
    });

    test("returns empty for no memories", () => {
      expect(generateContextSection([])).toBe("");
    });
  });

  describe("patterns section generation", () => {
    interface Memory {
      id: string;
      title: string;
      type: string;
    }

    interface RelatedMemory {
      memory: Memory;
      score: number;
    }

    function generatePatternsSection(memories: RelatedMemory[]): string {
      const patterns = memories.filter((m) => m.memory.type === "pattern");
      if (patterns.length === 0) return "";

      const lines: string[] = [];
      lines.push("\n## Patterns Applied\n");

      for (const { memory } of patterns.slice(0, 2)) {
        lines.push(`- ${memory.title}`);
      }

      return lines.join("\n");
    }

    test("generates patterns section", () => {
      const memories: RelatedMemory[] = [
        {
          memory: { id: "1", title: "Repository Pattern", type: "pattern" },
          score: 0.9,
        },
      ];
      const section = generatePatternsSection(memories);
      expect(section).toContain("## Patterns Applied");
      expect(section).toContain("Repository Pattern");
    });

    test("limits to 2 patterns", () => {
      const memories: RelatedMemory[] = Array(5)
        .fill(null)
        .map((_, i) => ({
          memory: { id: String(i), title: `Pattern ${i}`, type: "pattern" },
          score: 0.9,
        }));
      const section = generatePatternsSection(memories);
      expect(section).toContain("Pattern 0");
      expect(section).toContain("Pattern 1");
      expect(section).not.toContain("Pattern 2");
    });

    test("filters non-pattern memories", () => {
      const memories: RelatedMemory[] = [
        {
          memory: { id: "1", title: "Decision", type: "decision" },
          score: 0.9,
        },
      ];
      expect(generatePatternsSection(memories)).toBe("");
    });

    test("returns empty for no patterns", () => {
      expect(generatePatternsSection([])).toBe("");
    });
  });

  describe("testing section", () => {
    function generateTestingSection(): string {
      const lines: string[] = [];
      lines.push("\n## Testing\n");
      lines.push("- [ ] Unit tests added/updated");
      lines.push("- [ ] Manual testing completed");
      return lines.join("\n");
    }

    test("generates testing checklist", () => {
      const section = generateTestingSection();
      expect(section).toContain("## Testing");
      expect(section).toContain("[ ] Unit tests added/updated");
      expect(section).toContain("[ ] Manual testing completed");
    });
  });
});
