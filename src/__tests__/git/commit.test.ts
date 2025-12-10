/**
 * Tests for generateCommitMessage function
 * Tests the internal pure functions and logic
 */

import { describe, expect, test } from "bun:test";

describe("commit message generation", () => {
  describe("analyzeDiff", () => {
    // Replicate the analyzeDiff function logic for testing
    interface DiffAnalysis {
      files: string[];
      additions: number;
      deletions: number;
      significantChanges: string[];
      patterns: {
        isNewFile: boolean;
        isDelete: boolean;
        isFix: boolean;
        isRefactor: boolean;
        isTest: boolean;
        isDocs: boolean;
        isConfig: boolean;
        isStyle: boolean;
      };
    }

    function analyzeDiff(diff: string): DiffAnalysis {
      const files: string[] = [];
      const significantChanges: string[] = [];
      let additions = 0;
      let deletions = 0;

      const patterns = {
        isNewFile: false,
        isDelete: false,
        isFix: false,
        isRefactor: false,
        isTest: false,
        isDocs: false,
        isConfig: false,
        isStyle: false,
      };

      const lines = diff.split("\n");

      for (const line of lines) {
        if (line.startsWith("diff --git")) {
          const match = line.match(/b\/(.+)$/);
          if (match) {
            files.push(match[1]);
          }
        }

        if (line.startsWith("+") && !line.startsWith("+++")) {
          additions++;
          if (
            line.match(
              /^[+]\s*(export\s+)?(function|class|const|interface|type)\s+\w+/,
            )
          ) {
            significantChanges.push(line.slice(1).trim());
          }
        }
        if (line.startsWith("-") && !line.startsWith("---")) {
          deletions++;
        }

        if (line.includes("new file mode")) patterns.isNewFile = true;
        if (line.includes("deleted file mode")) patterns.isDelete = true;
        if (
          line.toLowerCase().includes("fix") ||
          line.toLowerCase().includes("bug")
        )
          patterns.isFix = true;
      }

      for (const file of files) {
        if (
          file.match(/\.(test|spec)\.(ts|js|tsx|jsx)$/) ||
          file.includes("__tests__")
        ) {
          patterns.isTest = true;
        }
        if (
          file.match(/\.(md|mdx|txt|rst)$/) ||
          file.toLowerCase().includes("readme")
        ) {
          patterns.isDocs = true;
        }
        if (
          file.match(/\.(json|yaml|yml|toml|ini|env)$/) ||
          file.includes("config")
        ) {
          patterns.isConfig = true;
        }
        if (file.match(/\.(css|scss|less|styled)/) || file.includes("style")) {
          patterns.isStyle = true;
        }
      }

      if (deletions > additions * 0.5 && additions > 10) {
        patterns.isRefactor = true;
      }

      return { files, additions, deletions, significantChanges, patterns };
    }

    test("extracts file names from diff", () => {
      const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
+console.log("hello");`;

      const result = analyzeDiff(diff);
      expect(result.files).toContain("src/index.ts");
    });

    test("counts additions correctly", () => {
      const diff = `diff --git a/src/index.ts b/src/index.ts
+line1
+line2
+line3`;

      const result = analyzeDiff(diff);
      expect(result.additions).toBe(3);
    });

    test("counts deletions correctly", () => {
      const diff = `diff --git a/src/index.ts b/src/index.ts
-line1
-line2`;

      const result = analyzeDiff(diff);
      expect(result.deletions).toBe(2);
    });

    test("ignores +++ and --- lines in counts", () => {
      const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
+actual addition`;

      const result = analyzeDiff(diff);
      expect(result.additions).toBe(1);
      expect(result.deletions).toBe(0);
    });

    test("detects new file", () => {
      const diff = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
+content`;

      const result = analyzeDiff(diff);
      expect(result.patterns.isNewFile).toBe(true);
    });

    test("detects deleted file", () => {
      const diff = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
-content`;

      const result = analyzeDiff(diff);
      expect(result.patterns.isDelete).toBe(true);
    });

    test("detects fix in diff content", () => {
      const diff = `diff --git a/src/index.ts b/src/index.ts
+// fix for bug #123`;

      const result = analyzeDiff(diff);
      expect(result.patterns.isFix).toBe(true);
    });

    test("detects test files", () => {
      const diff = `diff --git a/src/index.test.ts b/src/index.test.ts
+test content`;

      const result = analyzeDiff(diff);
      expect(result.patterns.isTest).toBe(true);
    });

    test("detects spec files", () => {
      const diff = `diff --git a/src/index.spec.ts b/src/index.spec.ts
+test content`;

      const result = analyzeDiff(diff);
      expect(result.patterns.isTest).toBe(true);
    });

    test("detects __tests__ folder", () => {
      const diff = `diff --git a/__tests__/index.ts b/__tests__/index.ts
+test content`;

      const result = analyzeDiff(diff);
      expect(result.patterns.isTest).toBe(true);
    });

    test("detects markdown docs", () => {
      const diff = `diff --git a/README.md b/README.md
+documentation`;

      const result = analyzeDiff(diff);
      expect(result.patterns.isDocs).toBe(true);
    });

    test("detects config files", () => {
      const diff = `diff --git a/tsconfig.json b/tsconfig.json
+config`;

      const result = analyzeDiff(diff);
      expect(result.patterns.isConfig).toBe(true);
    });

    test("detects style files", () => {
      const diff = `diff --git a/styles.css b/styles.css
+.class {}`;

      const result = analyzeDiff(diff);
      expect(result.patterns.isStyle).toBe(true);
    });

    test("detects refactor (more deletions than additions)", () => {
      // 15 additions, 10 deletions (10 > 15 * 0.5 = 7.5, and 15 > 10)
      const additions = Array(15).fill("+line").join("\n");
      const deletions = Array(10).fill("-line").join("\n");
      const diff = `diff --git a/src/index.ts b/src/index.ts
${additions}
${deletions}`;

      const result = analyzeDiff(diff);
      expect(result.patterns.isRefactor).toBe(true);
    });

    test("extracts significant changes (function definitions)", () => {
      const diff = `diff --git a/src/index.ts b/src/index.ts
+function calculateTotal() {
+  return sum;
+}`;

      const result = analyzeDiff(diff);
      expect(result.significantChanges.length).toBeGreaterThan(0);
      expect(result.significantChanges[0]).toContain("function calculateTotal");
    });

    test("extracts significant changes (class definitions)", () => {
      const diff = `diff --git a/src/index.ts b/src/index.ts
+class UserService {
+}`;

      const result = analyzeDiff(diff);
      expect(result.significantChanges.length).toBeGreaterThan(0);
      expect(result.significantChanges[0]).toContain("class UserService");
    });

    test("extracts significant changes (const exports)", () => {
      const diff = `diff --git a/src/index.ts b/src/index.ts
+export const API_URL = "https://api.example.com";`;

      const result = analyzeDiff(diff);
      expect(result.significantChanges.length).toBeGreaterThan(0);
    });
  });

  describe("determineCommitType", () => {
    function determineCommitType(
      patterns: {
        isNewFile: boolean;
        isDelete: boolean;
        isFix: boolean;
        isRefactor: boolean;
        isTest: boolean;
        isDocs: boolean;
        isConfig: boolean;
        isStyle: boolean;
      },
      additions: number,
      deletions: number,
      hasBugMemory: boolean,
    ): string {
      if (hasBugMemory && !patterns.isNewFile) return "fix";
      if (patterns.isTest) return "test";
      if (patterns.isDocs) return "docs";
      if (patterns.isFix) return "fix";
      if (patterns.isConfig) return "chore";
      if (patterns.isStyle) return "style";
      if (patterns.isRefactor) return "refactor";
      if (patterns.isNewFile) return "feat";

      if (additions > deletions * 2) return "feat";
      if (deletions > additions) return "refactor";

      return "feat";
    }

    test("returns test for test files", () => {
      const type = determineCommitType(
        {
          isNewFile: false,
          isDelete: false,
          isFix: false,
          isRefactor: false,
          isTest: true,
          isDocs: false,
          isConfig: false,
          isStyle: false,
        },
        10,
        5,
        false,
      );
      expect(type).toBe("test");
    });

    test("returns docs for documentation files", () => {
      const type = determineCommitType(
        {
          isNewFile: false,
          isDelete: false,
          isFix: false,
          isRefactor: false,
          isTest: false,
          isDocs: true,
          isConfig: false,
          isStyle: false,
        },
        10,
        5,
        false,
      );
      expect(type).toBe("docs");
    });

    test("returns fix when fix pattern detected", () => {
      const type = determineCommitType(
        {
          isNewFile: false,
          isDelete: false,
          isFix: true,
          isRefactor: false,
          isTest: false,
          isDocs: false,
          isConfig: false,
          isStyle: false,
        },
        10,
        5,
        false,
      );
      expect(type).toBe("fix");
    });

    test("returns fix when bug memory exists", () => {
      const type = determineCommitType(
        {
          isNewFile: false,
          isDelete: false,
          isFix: false,
          isRefactor: false,
          isTest: false,
          isDocs: false,
          isConfig: false,
          isStyle: false,
        },
        10,
        5,
        true,
      );
      expect(type).toBe("fix");
    });

    test("returns chore for config files", () => {
      const type = determineCommitType(
        {
          isNewFile: false,
          isDelete: false,
          isFix: false,
          isRefactor: false,
          isTest: false,
          isDocs: false,
          isConfig: true,
          isStyle: false,
        },
        10,
        5,
        false,
      );
      expect(type).toBe("chore");
    });

    test("returns style for style files", () => {
      const type = determineCommitType(
        {
          isNewFile: false,
          isDelete: false,
          isFix: false,
          isRefactor: false,
          isTest: false,
          isDocs: false,
          isConfig: false,
          isStyle: true,
        },
        10,
        5,
        false,
      );
      expect(type).toBe("style");
    });

    test("returns refactor when refactor pattern detected", () => {
      const type = determineCommitType(
        {
          isNewFile: false,
          isDelete: false,
          isFix: false,
          isRefactor: true,
          isTest: false,
          isDocs: false,
          isConfig: false,
          isStyle: false,
        },
        10,
        5,
        false,
      );
      expect(type).toBe("refactor");
    });

    test("returns feat for new files", () => {
      const type = determineCommitType(
        {
          isNewFile: true,
          isDelete: false,
          isFix: false,
          isRefactor: false,
          isTest: false,
          isDocs: false,
          isConfig: false,
          isStyle: false,
        },
        10,
        5,
        false,
      );
      expect(type).toBe("feat");
    });

    test("returns feat when additions greatly exceed deletions", () => {
      const type = determineCommitType(
        {
          isNewFile: false,
          isDelete: false,
          isFix: false,
          isRefactor: false,
          isTest: false,
          isDocs: false,
          isConfig: false,
          isStyle: false,
        },
        100,
        10,
        false, // 100 > 10 * 2 = 20
      );
      expect(type).toBe("feat");
    });

    test("returns refactor when deletions exceed additions", () => {
      const type = determineCommitType(
        {
          isNewFile: false,
          isDelete: false,
          isFix: false,
          isRefactor: false,
          isTest: false,
          isDocs: false,
          isConfig: false,
          isStyle: false,
        },
        10,
        20,
        false, // 20 > 10
      );
      expect(type).toBe("refactor");
    });

    test("defaults to feat", () => {
      const type = determineCommitType(
        {
          isNewFile: false,
          isDelete: false,
          isFix: false,
          isRefactor: false,
          isTest: false,
          isDocs: false,
          isConfig: false,
          isStyle: false,
        },
        10,
        10,
        false,
      );
      expect(type).toBe("feat");
    });
  });

  describe("determineScope", () => {
    function determineScope(files: string[]): string | null {
      if (files.length === 0) return null;

      const dirs = files
        .map((f) => {
          const parts = f.split("/");
          return parts.length > 1 ? parts[0] : null;
        })
        .filter(Boolean);

      if (dirs.length === 0) return null;

      const uniqueDirs = [...new Set(dirs)];
      if (uniqueDirs.length === 1 && uniqueDirs[0]) return uniqueDirs[0];

      if (files.some((f) => f.includes("auth"))) return "auth";
      if (files.some((f) => f.includes("api"))) return "api";
      if (files.some((f) => f.includes("db") || f.includes("database")))
        return "db";
      if (files.some((f) => f.includes("ui") || f.includes("component")))
        return "ui";

      return null;
    }

    test("returns null for empty files", () => {
      expect(determineScope([])).toBeNull();
    });

    test("returns directory when all files in same dir", () => {
      const files = ["src/index.ts", "src/utils.ts", "src/helper.ts"];
      expect(determineScope(files)).toBe("src");
    });

    test("returns null for root files only", () => {
      const files = ["index.ts", "utils.ts"];
      expect(determineScope(files)).toBeNull();
    });

    test("returns auth when auth files in different dirs", () => {
      // When files are in different top-level dirs, keyword matching kicks in
      const files = ["auth/login.ts", "config/settings.ts"];
      expect(determineScope(files)).toBe("auth");
    });

    test("returns api when api files in different dirs", () => {
      const files = ["api/users.ts", "config/settings.ts"];
      expect(determineScope(files)).toBe("api");
    });

    test("returns db when database files in different dirs", () => {
      const files = ["db/schema.ts", "config/settings.ts"];
      expect(determineScope(files)).toBe("db");
    });

    test("returns ui when component files in different dirs", () => {
      const files = ["components/Button.tsx", "config/settings.ts"];
      expect(determineScope(files)).toBe("ui");
    });

    test("returns common dir when all files share same top-level dir", () => {
      // Even with 'auth' in path, common dir takes precedence
      const files = ["src/auth/login.ts", "src/utils.ts"];
      expect(determineScope(files)).toBe("src");
    });
  });

  describe("generateSummary", () => {
    function generateSummary(
      files: string[],
      significantChanges: string[],
      patterns: { isNewFile: boolean; isDelete: boolean },
    ): string {
      if (significantChanges.length > 0) {
        const first = significantChanges[0];
        const match = first?.match(
          /(function|class|const|interface|type)\s+(\w+)/,
        );
        if (match) {
          const [, kind, name] = match;
          if (patterns.isNewFile) return `add ${kind} ${name}`;
          return `update ${kind} ${name}`;
        }
      }

      if (files.length === 1) {
        const file = files[0]?.split("/").pop() ?? files[0];
        if (patterns.isNewFile) return `add ${file}`;
        if (patterns.isDelete) return `remove ${file}`;
        return `update ${file}`;
      }

      if (patterns.isNewFile) return `add ${files.length} files`;
      if (patterns.isDelete) return `remove ${files.length} files`;
      return `update ${files.length} files`;
    }

    test("describes function addition", () => {
      const summary = generateSummary(
        ["src/utils.ts"],
        ["function calculateTotal() {"],
        { isNewFile: true, isDelete: false },
      );
      expect(summary).toBe("add function calculateTotal");
    });

    test("describes function update", () => {
      const summary = generateSummary(
        ["src/utils.ts"],
        ["function calculateTotal() {"],
        { isNewFile: false, isDelete: false },
      );
      expect(summary).toBe("update function calculateTotal");
    });

    test("describes single file addition", () => {
      const summary = generateSummary(["src/utils.ts"], [], {
        isNewFile: true,
        isDelete: false,
      });
      expect(summary).toBe("add utils.ts");
    });

    test("describes single file deletion", () => {
      const summary = generateSummary(["src/old.ts"], [], {
        isNewFile: false,
        isDelete: true,
      });
      expect(summary).toBe("remove old.ts");
    });

    test("describes single file update", () => {
      const summary = generateSummary(["src/utils.ts"], [], {
        isNewFile: false,
        isDelete: false,
      });
      expect(summary).toBe("update utils.ts");
    });

    test("describes multiple file addition", () => {
      const summary = generateSummary(
        ["src/a.ts", "src/b.ts", "src/c.ts"],
        [],
        { isNewFile: true, isDelete: false },
      );
      expect(summary).toBe("add 3 files");
    });

    test("describes multiple file update", () => {
      const summary = generateSummary(["src/a.ts", "src/b.ts"], [], {
        isNewFile: false,
        isDelete: false,
      });
      expect(summary).toBe("update 2 files");
    });
  });

  describe("extractRelatedIssues", () => {
    function extractRelatedIssues(
      memories: Array<{ sourcePr?: string; content: string; title: string }>,
    ): string[] {
      const issues: string[] = [];
      const issuePattern = /#(\d+)|([A-Z]+-\d+)/g;

      for (const memory of memories) {
        if (memory.sourcePr) {
          const prMatch = memory.sourcePr.match(/\d+/);
          if (prMatch) {
            issues.push(`#${prMatch[0]}`);
          }
        }

        const contentMatches = memory.content.matchAll(issuePattern);
        for (const match of contentMatches) {
          const issue = match[1] ? `#${match[1]}` : match[2];
          if (issue && !issues.includes(issue)) {
            issues.push(issue);
          }
        }

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
      const issues = extractRelatedIssues([
        { sourcePr: "123", content: "", title: "" },
      ]);
      expect(issues).toContain("#123");
    });

    test("extracts GitHub issue from content", () => {
      const issues = extractRelatedIssues([
        { content: "Fixes #456", title: "" },
      ]);
      expect(issues).toContain("#456");
    });

    test("extracts Jira issue from content", () => {
      const issues = extractRelatedIssues([
        { content: "Relates to PROJ-789", title: "" },
      ]);
      expect(issues).toContain("PROJ-789");
    });

    test("extracts issue from title", () => {
      const issues = extractRelatedIssues([
        { content: "", title: "Fix bug #100" },
      ]);
      expect(issues).toContain("#100");
    });

    test("deduplicates issues", () => {
      const issues = extractRelatedIssues([
        { content: "See #123 and #123", title: "#123" },
      ]);
      expect(issues.filter((i) => i === "#123").length).toBe(1);
    });

    test("limits to 5 issues", () => {
      const issues = extractRelatedIssues([
        { content: "#1 #2 #3 #4 #5 #6 #7", title: "" },
      ]);
      expect(issues.length).toBeLessThanOrEqual(5);
    });
  });

  describe("conventional commit format", () => {
    test("formats message without scope", () => {
      const type = "feat";
      const scope: string | null = null;
      const summary = "add new feature";
      const body: string | null = null;

      const scopePart = scope ? `(${scope})` : "";
      const message = body
        ? `${type}${scopePart}: ${summary}\n\n${body}`
        : `${type}${scopePart}: ${summary}`;

      expect(message).toBe("feat: add new feature");
    });

    test("formats message with scope", () => {
      const type = "fix";
      const scope = "auth";
      const summary = "resolve login issue";
      const body: string | null = null;

      const scopePart = scope ? `(${scope})` : "";
      const message = body
        ? `${type}${scopePart}: ${summary}\n\n${body}`
        : `${type}${scopePart}: ${summary}`;

      expect(message).toBe("fix(auth): resolve login issue");
    });

    test("formats message with body", () => {
      const type = "feat";
      const scope = "api";
      const summary = "add user endpoint";
      const body = "This adds a new user endpoint.";

      const scopePart = scope ? `(${scope})` : "";
      const message = body
        ? `${type}${scopePart}: ${summary}\n\n${body}`
        : `${type}${scopePart}: ${summary}`;

      expect(message).toBe(
        "feat(api): add user endpoint\n\nThis adds a new user endpoint.",
      );
    });
  });
});
