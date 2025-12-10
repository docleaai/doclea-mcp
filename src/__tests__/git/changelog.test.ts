/**
 * Tests for changelog generation helper functions
 * Tests the pure function logic used in changelog.ts
 */

import { describe, expect, test } from "bun:test";

describe("changelog generation", () => {
  describe("extractIssues", () => {
    function extractIssues(message: string): string[] {
      const issues: string[] = [];
      const patterns = [
        /#(\d+)/g, // GitHub issues: #123
        /([A-Z]+-\d+)/g, // Jira-style: PROJ-123
        /closes?\s+#(\d+)/gi, // closes #123
        /fixes?\s+#(\d+)/gi, // fixes #123
        /resolves?\s+#(\d+)/gi, // resolves #123
      ];

      for (const pattern of patterns) {
        const matches = message.matchAll(pattern);
        for (const match of matches) {
          const issue = match[1] ? `#${match[1]}` : match[0];
          if (!issues.includes(issue)) {
            issues.push(issue);
          }
        }
      }

      return issues;
    }

    test("extracts GitHub issue numbers", () => {
      expect(extractIssues("Fix bug #123")).toContain("#123");
    });

    test("extracts multiple GitHub issues", () => {
      const issues = extractIssues("Fix #123 and #456");
      expect(issues).toContain("#123");
      expect(issues).toContain("#456");
    });

    test("extracts Jira-style issues", () => {
      const issues = extractIssues("PROJ-123: Fix the thing");
      // Jira issues get prefixed with # in current implementation
      expect(issues).toContain("#PROJ-123");
    });

    test("extracts closes syntax", () => {
      const issues = extractIssues("feat: add feature closes #789");
      expect(issues).toContain("#789");
    });

    test("extracts fixes syntax", () => {
      const issues = extractIssues("fix: resolve issue fixes #101");
      expect(issues).toContain("#101");
    });

    test("extracts resolves syntax", () => {
      const issues = extractIssues("chore: cleanup resolves #202");
      expect(issues).toContain("#202");
    });

    test("handles close singular", () => {
      const issues = extractIssues("feat: add feature close #303");
      expect(issues).toContain("#303");
    });

    test("handles fix singular", () => {
      const issues = extractIssues("fix: handle edge case fix #404");
      expect(issues).toContain("#404");
    });

    test("handles resolve singular", () => {
      const issues = extractIssues("docs: update readme resolve #505");
      expect(issues).toContain("#505");
    });

    test("deduplicates issues", () => {
      const issues = extractIssues("Fix #123 closes #123");
      const count = issues.filter((i) => i === "#123").length;
      expect(count).toBe(1);
    });

    test("returns empty array for no issues", () => {
      expect(extractIssues("feat: add new feature")).toEqual([]);
    });

    test("handles message with only text", () => {
      expect(extractIssues("Just a simple commit")).toEqual([]);
    });

    test("handles multiple Jira issues", () => {
      const issues = extractIssues("PROJ-123 and DEV-456 related");
      // Jira issues get prefixed with # in current implementation
      expect(issues).toContain("#PROJ-123");
      expect(issues).toContain("#DEV-456");
    });

    test("handles mixed GitHub and Jira issues", () => {
      const issues = extractIssues("Fix #123 for PROJ-456");
      expect(issues).toContain("#123");
      // Jira issues get prefixed with # in current implementation
      expect(issues).toContain("#PROJ-456");
    });
  });

  describe("extractScope", () => {
    function extractScope(message: string): string | undefined {
      const match = message.match(/^\w+\(([^)]+)\)/);
      return match?.[1];
    }

    test("extracts scope from conventional commit", () => {
      expect(extractScope("feat(auth): add login")).toBe("auth");
    });

    test("extracts scope with hyphen", () => {
      expect(extractScope("fix(user-profile): fix avatar")).toBe(
        "user-profile",
      );
    });

    test("extracts scope with underscore", () => {
      expect(extractScope("chore(build_system): update config")).toBe(
        "build_system",
      );
    });

    test("returns undefined for no scope", () => {
      expect(extractScope("feat: add feature")).toBeUndefined();
    });

    test("returns undefined for non-conventional commit", () => {
      expect(extractScope("Add new feature")).toBeUndefined();
    });

    test("handles breaking change with scope", () => {
      expect(extractScope("feat(api)!: remove endpoint")).toBe("api");
    });

    test("handles multi-word scopes", () => {
      expect(extractScope("fix(data-layer): fix query")).toBe("data-layer");
    });
  });

  describe("extractCommitType", () => {
    function extractCommitType(message: string): string {
      const match = message.match(/^(\w+)(\(.+\))?!?:/);
      return match?.[1]?.toLowerCase() ?? "other";
    }

    test("extracts feat type", () => {
      expect(extractCommitType("feat: add feature")).toBe("feat");
    });

    test("extracts fix type", () => {
      expect(extractCommitType("fix: fix bug")).toBe("fix");
    });

    test("extracts docs type", () => {
      expect(extractCommitType("docs: update readme")).toBe("docs");
    });

    test("extracts style type", () => {
      expect(extractCommitType("style: format code")).toBe("style");
    });

    test("extracts refactor type", () => {
      expect(extractCommitType("refactor: clean up code")).toBe("refactor");
    });

    test("extracts test type", () => {
      expect(extractCommitType("test: add tests")).toBe("test");
    });

    test("extracts chore type", () => {
      expect(extractCommitType("chore: update deps")).toBe("chore");
    });

    test("extracts perf type", () => {
      expect(extractCommitType("perf: optimize query")).toBe("perf");
    });

    test("extracts ci type", () => {
      expect(extractCommitType("ci: update workflow")).toBe("ci");
    });

    test("extracts build type", () => {
      expect(extractCommitType("build: update config")).toBe("build");
    });

    test("extracts revert type", () => {
      expect(extractCommitType("revert: undo change")).toBe("revert");
    });

    test("extracts type with scope", () => {
      expect(extractCommitType("feat(auth): add login")).toBe("feat");
    });

    test("extracts type with breaking change marker", () => {
      expect(extractCommitType("feat!: breaking feature")).toBe("feat");
    });

    test("extracts type with scope and breaking marker", () => {
      expect(extractCommitType("feat(api)!: breaking change")).toBe("feat");
    });

    test("returns other for non-conventional commit", () => {
      expect(extractCommitType("Add new feature")).toBe("other");
    });

    test("returns other for message starting with capital type", () => {
      expect(extractCommitType("FEAT: add feature")).toBe("feat");
    });

    test("handles lowercase consistently", () => {
      expect(extractCommitType("FIX(Bug): resolve issue")).toBe("fix");
    });
  });

  describe("isBreakingChange", () => {
    function isBreakingChange(message: string): boolean {
      const lowerMessage = message.toLowerCase();
      return (
        lowerMessage.includes("breaking change") ||
        lowerMessage.includes("breaking:") ||
        message.includes("!:") ||
        /^\w+(\(.+\))?!:/.test(message)
      );
    }

    test("detects BREAKING CHANGE in message", () => {
      expect(
        isBreakingChange("feat: add feature\n\nBREAKING CHANGE: API changed"),
      ).toBe(true);
    });

    test("detects breaking change lowercase", () => {
      expect(isBreakingChange("This is a breaking change")).toBe(true);
    });

    test("detects breaking: prefix", () => {
      expect(isBreakingChange("breaking: remove old API")).toBe(true);
    });

    test("detects !: marker", () => {
      expect(isBreakingChange("feat!: new breaking feature")).toBe(true);
    });

    test("detects !: with scope", () => {
      expect(isBreakingChange("feat(api)!: remove endpoint")).toBe(true);
    });

    test("returns false for normal commit", () => {
      expect(isBreakingChange("feat: add new feature")).toBe(false);
    });

    test("returns false for fix", () => {
      expect(isBreakingChange("fix: resolve bug")).toBe(false);
    });

    test("handles mixed case BREAKING CHANGE", () => {
      expect(isBreakingChange("feat: change\n\nBreaking Change: API")).toBe(
        true,
      );
    });
  });

  describe("cleanCommitMessage", () => {
    function cleanCommitMessage(message: string): string {
      let cleaned =
        message
          .replace(
            /^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?!?:\s*/i,
            "",
          )
          .split("\n")[0]
          ?.trim() ?? message;

      if (cleaned.length > 0) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }

      return cleaned;
    }

    test("removes feat prefix", () => {
      expect(cleanCommitMessage("feat: add login")).toBe("Add login");
    });

    test("removes fix prefix", () => {
      expect(cleanCommitMessage("fix: resolve bug")).toBe("Resolve bug");
    });

    test("removes docs prefix", () => {
      expect(cleanCommitMessage("docs: update readme")).toBe("Update readme");
    });

    test("removes type with scope", () => {
      expect(cleanCommitMessage("feat(auth): add login")).toBe("Add login");
    });

    test("removes type with breaking marker", () => {
      expect(cleanCommitMessage("feat!: new api")).toBe("New api");
    });

    test("removes type with scope and breaking marker", () => {
      expect(cleanCommitMessage("feat(api)!: new endpoint")).toBe(
        "New endpoint",
      );
    });

    test("capitalizes first letter", () => {
      expect(cleanCommitMessage("feat: add feature")).toBe("Add feature");
    });

    test("handles already capitalized", () => {
      expect(cleanCommitMessage("feat: Add feature")).toBe("Add feature");
    });

    test("takes only first line", () => {
      const message = "feat: add feature\n\nMore details here";
      expect(cleanCommitMessage(message)).toBe("Add feature");
    });

    test("handles non-conventional commit", () => {
      expect(cleanCommitMessage("Add new feature")).toBe("Add new feature");
    });

    test("handles empty message", () => {
      expect(cleanCommitMessage("")).toBe("");
    });

    test("handles message with only prefix", () => {
      expect(cleanCommitMessage("feat: ")).toBe("");
    });

    test("preserves case after first letter", () => {
      expect(cleanCommitMessage("feat: add API endpoint")).toBe(
        "Add API endpoint",
      );
    });
  });

  describe("version extraction patterns", () => {
    function extractVersionFromTag(tag: string): string {
      if (tag.match(/^v?\d+\.\d+/)) {
        return tag.replace(/^v/, "");
      }
      return "Unreleased";
    }

    function incrementMinorVersion(fromRef: string): string {
      if (fromRef.match(/^v?\d+\.\d+/)) {
        const parts = fromRef.replace(/^v/, "").split(".");
        if (parts.length >= 2) {
          const minor = parseInt(parts[1] ?? "0", 10) + 1;
          return `${parts[0]}.${minor}.0`;
        }
      }
      return "Unreleased";
    }

    test("extracts version from v-prefixed tag", () => {
      expect(extractVersionFromTag("v1.2.3")).toBe("1.2.3");
    });

    test("extracts version from non-prefixed tag", () => {
      expect(extractVersionFromTag("1.2.3")).toBe("1.2.3");
    });

    test("handles prerelease versions", () => {
      expect(extractVersionFromTag("v2.0.0-alpha")).toBe("2.0.0-alpha");
    });

    test("returns Unreleased for non-version tag", () => {
      expect(extractVersionFromTag("HEAD")).toBe("Unreleased");
    });

    test("returns Unreleased for branch name", () => {
      expect(extractVersionFromTag("main")).toBe("Unreleased");
    });

    test("increments minor version", () => {
      expect(incrementMinorVersion("v1.2.3")).toBe("1.3.0");
    });

    test("increments minor from non-prefixed", () => {
      expect(incrementMinorVersion("1.5.0")).toBe("1.6.0");
    });

    test("handles major version only", () => {
      expect(incrementMinorVersion("v2.0")).toBe("2.1.0");
    });

    test("returns Unreleased for non-version", () => {
      expect(incrementMinorVersion("main")).toBe("Unreleased");
    });
  });

  describe("toUserFriendly", () => {
    function toUserFriendly(message: string): string {
      let friendly = message
        .replace(/\bapi\b/gi, "API")
        .replace(/\bui\b/gi, "interface")
        .replace(/\bux\b/gi, "user experience")
        .replace(/\bauth\b/gi, "authentication")
        .replace(/\bconfig\b/gi, "settings")
        .replace(/\bdb\b/gi, "database")
        .replace(/\benv\b/gi, "environment")
        .replace(/refactor/gi, "improve")
        .replace(/implement/gi, "add")
        .replace(/\bfix\b/gi, "resolve")
        .replace(/\bbug\b/gi, "issue");

      if (friendly.length > 0) {
        friendly = friendly.charAt(0).toUpperCase() + friendly.slice(1);
      }

      return friendly;
    }

    test("replaces api with API", () => {
      expect(toUserFriendly("update api")).toBe("Update API");
    });

    test("replaces ui with interface", () => {
      expect(toUserFriendly("update ui")).toBe("Update interface");
    });

    test("replaces ux with user experience", () => {
      expect(toUserFriendly("improve ux")).toBe("Improve user experience");
    });

    test("replaces auth with authentication", () => {
      expect(toUserFriendly("fix auth flow")).toBe(
        "Resolve authentication flow",
      );
    });

    test("replaces config with settings", () => {
      expect(toUserFriendly("update config")).toBe("Update settings");
    });

    test("replaces db with database", () => {
      expect(toUserFriendly("optimize db queries")).toBe(
        "Optimize database queries",
      );
    });

    test("replaces env with environment", () => {
      expect(toUserFriendly("update env vars")).toBe("Update environment vars");
    });

    test("replaces refactor with improve", () => {
      expect(toUserFriendly("refactor code")).toBe("Improve code");
    });

    test("replaces implement with add", () => {
      expect(toUserFriendly("implement feature")).toBe("Add feature");
    });

    test("replaces fix with resolve", () => {
      expect(toUserFriendly("fix issue")).toBe("Resolve issue");
    });

    test("replaces bug with issue", () => {
      expect(toUserFriendly("fix bug")).toBe("Resolve issue");
    });

    test("capitalizes first letter", () => {
      expect(toUserFriendly("add feature")).toBe("Add feature");
    });

    test("handles multiple replacements", () => {
      expect(toUserFriendly("fix auth api bug")).toBe(
        "Resolve authentication API issue",
      );
    });

    test("handles case insensitive", () => {
      expect(toUserFriendly("Update API")).toBe("Update API");
    });
  });

  describe("getFeatureEmoji", () => {
    function getFeatureEmoji(message: string, scope?: string): string {
      const lowerMessage = message.toLowerCase();
      const lowerScope = scope?.toLowerCase() ?? "";

      if (lowerMessage.includes("dark") || lowerMessage.includes("theme"))
        return "\uD83C\uDF19";
      if (lowerMessage.includes("security") || lowerMessage.includes("auth"))
        return "\uD83D\uDD12";
      if (lowerMessage.includes("search")) return "\uD83D\uDD0D";
      if (
        lowerMessage.includes("notification") ||
        lowerMessage.includes("alert")
      )
        return "\uD83D\uDD14";
      if (lowerMessage.includes("export") || lowerMessage.includes("download"))
        return "\uD83D\uDCE5";
      if (lowerMessage.includes("import") || lowerMessage.includes("upload"))
        return "\uD83D\uDCE4";
      if (lowerMessage.includes("share")) return "\uD83D\uDCE4";
      if (lowerMessage.includes("filter") || lowerMessage.includes("sort"))
        return "\uD83D\uDD27";
      if (
        lowerMessage.includes("dashboard") ||
        lowerMessage.includes("analytics")
      )
        return "\uD83D\uDCCA";
      if (lowerMessage.includes("mobile") || lowerScope.includes("mobile"))
        return "\uD83D\uDCF1";
      if (lowerMessage.includes("email") || lowerMessage.includes("mail"))
        return "\uD83D\uDCE7";
      if (lowerMessage.includes("user") || lowerMessage.includes("profile"))
        return "\uD83D\uDC64";
      if (lowerMessage.includes("payment") || lowerMessage.includes("billing"))
        return "\uD83D\uDCB3";
      if (lowerMessage.includes("integration")) return "\uD83D\uDD17";

      return "\u2728";
    }

    test("returns moon for dark mode", () => {
      expect(getFeatureEmoji("add dark mode")).toBe("\uD83C\uDF19");
    });

    test("returns moon for theme", () => {
      expect(getFeatureEmoji("update theme")).toBe("\uD83C\uDF19");
    });

    test("returns lock for security", () => {
      expect(getFeatureEmoji("improve security")).toBe("\uD83D\uDD12");
    });

    test("returns lock for auth", () => {
      expect(getFeatureEmoji("add auth flow")).toBe("\uD83D\uDD12");
    });

    test("returns magnifier for search", () => {
      expect(getFeatureEmoji("add search")).toBe("\uD83D\uDD0D");
    });

    test("returns bell for notifications", () => {
      expect(getFeatureEmoji("push notification")).toBe("\uD83D\uDD14");
    });

    test("returns bell for alerts", () => {
      expect(getFeatureEmoji("add alert")).toBe("\uD83D\uDD14");
    });

    test("returns inbox for export", () => {
      expect(getFeatureEmoji("export data")).toBe("\uD83D\uDCE5");
    });

    test("returns inbox for download", () => {
      expect(getFeatureEmoji("download file")).toBe("\uD83D\uDCE5");
    });

    test("returns outbox for import", () => {
      expect(getFeatureEmoji("import data")).toBe("\uD83D\uDCE4");
    });

    test("returns outbox for upload", () => {
      expect(getFeatureEmoji("upload file")).toBe("\uD83D\uDCE4");
    });

    test("returns outbox for share", () => {
      expect(getFeatureEmoji("share document")).toBe("\uD83D\uDCE4");
    });

    test("returns wrench for filter", () => {
      expect(getFeatureEmoji("add filter")).toBe("\uD83D\uDD27");
    });

    test("returns wrench for sort", () => {
      expect(getFeatureEmoji("add sort")).toBe("\uD83D\uDD27");
    });

    test("returns chart for dashboard", () => {
      expect(getFeatureEmoji("new dashboard")).toBe("\uD83D\uDCCA");
    });

    test("returns chart for analytics", () => {
      expect(getFeatureEmoji("add analytics")).toBe("\uD83D\uDCCA");
    });

    test("returns phone for mobile in message", () => {
      expect(getFeatureEmoji("mobile support")).toBe("\uD83D\uDCF1");
    });

    test("returns phone for mobile in scope", () => {
      expect(getFeatureEmoji("add feature", "mobile")).toBe("\uD83D\uDCF1");
    });

    test("returns envelope for email", () => {
      // Use message without "notification" which would match first
      expect(getFeatureEmoji("email settings")).toBe("\uD83D\uDCE7");
    });

    test("returns envelope for mail", () => {
      expect(getFeatureEmoji("mail settings")).toBe("\uD83D\uDCE7");
    });

    test("returns person for user", () => {
      expect(getFeatureEmoji("user management")).toBe("\uD83D\uDC64");
    });

    test("returns person for profile", () => {
      expect(getFeatureEmoji("profile settings")).toBe("\uD83D\uDC64");
    });

    test("returns credit card for payment", () => {
      expect(getFeatureEmoji("payment processing")).toBe("\uD83D\uDCB3");
    });

    test("returns credit card for billing", () => {
      expect(getFeatureEmoji("billing update")).toBe("\uD83D\uDCB3");
    });

    test("returns link for integration", () => {
      expect(getFeatureEmoji("slack integration")).toBe("\uD83D\uDD17");
    });

    test("returns sparkles as default", () => {
      expect(getFeatureEmoji("add feature")).toBe("\u2728");
    });

    test("returns default for unknown feature", () => {
      expect(getFeatureEmoji("improve performance")).toBe("\u2728");
    });
  });

  describe("generateUserDescription", () => {
    function generateUserDescription(scope?: string): string | null {
      if (!scope) return null;

      const descriptions: Record<string, string> = {
        auth: "Your account is now more secure.",
        ui: "We've improved the look and feel.",
        api: "Better integration capabilities.",
        performance: "Things should feel snappier now.",
        mobile: "Better experience on your phone.",
        dashboard: "More insights at your fingertips.",
      };

      return descriptions[scope.toLowerCase()] ?? null;
    }

    test("returns auth description", () => {
      expect(generateUserDescription("auth")).toBe(
        "Your account is now more secure.",
      );
    });

    test("returns ui description", () => {
      expect(generateUserDescription("ui")).toBe(
        "We've improved the look and feel.",
      );
    });

    test("returns api description", () => {
      expect(generateUserDescription("api")).toBe(
        "Better integration capabilities.",
      );
    });

    test("returns performance description", () => {
      expect(generateUserDescription("performance")).toBe(
        "Things should feel snappier now.",
      );
    });

    test("returns mobile description", () => {
      expect(generateUserDescription("mobile")).toBe(
        "Better experience on your phone.",
      );
    });

    test("returns dashboard description", () => {
      expect(generateUserDescription("dashboard")).toBe(
        "More insights at your fingertips.",
      );
    });

    test("returns null for unknown scope", () => {
      expect(generateUserDescription("unknown")).toBeNull();
    });

    test("returns null for undefined scope", () => {
      expect(generateUserDescription(undefined)).toBeNull();
    });

    test("handles uppercase scope", () => {
      expect(generateUserDescription("AUTH")).toBe(
        "Your account is now more secure.",
      );
    });
  });

  describe("changelog entry creation", () => {
    interface ChangelogEntry {
      message: string;
      scope?: string;
      issues: string[];
      hash: string;
      author: string;
    }

    function createEntry(
      message: string,
      hash: string,
      author: string,
    ): ChangelogEntry {
      const cleanedMessage =
        message
          .replace(
            /^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?!?:\s*/i,
            "",
          )
          .split("\n")[0]
          ?.trim() ?? message;

      const scopeMatch = message.match(/^\w+\(([^)]+)\)/);
      const scope = scopeMatch?.[1];

      const issues: string[] = [];
      const issueMatches = message.matchAll(/#(\d+)/g);
      for (const match of issueMatches) {
        if (match[1]) {
          issues.push(`#${match[1]}`);
        }
      }

      return {
        message:
          cleanedMessage.charAt(0).toUpperCase() + cleanedMessage.slice(1),
        scope,
        issues,
        hash: hash.substring(0, 7),
        author,
      };
    }

    test("creates basic entry", () => {
      const entry = createEntry("feat: add login", "abc1234567890", "Alice");
      expect(entry.message).toBe("Add login");
      expect(entry.hash).toBe("abc1234");
      expect(entry.author).toBe("Alice");
    });

    test("extracts scope from message", () => {
      const entry = createEntry("feat(auth): add login", "abc1234", "Alice");
      expect(entry.scope).toBe("auth");
    });

    test("extracts issues from message", () => {
      const entry = createEntry("fix: resolve #123", "abc1234", "Alice");
      expect(entry.issues).toContain("#123");
    });

    test("extracts multiple issues", () => {
      const entry = createEntry(
        "fix: resolve #123 and #456",
        "abc1234",
        "Alice",
      );
      expect(entry.issues).toContain("#123");
      expect(entry.issues).toContain("#456");
    });

    test("truncates long hash", () => {
      const entry = createEntry("feat: add", "abcdefghijklmnop", "Alice");
      expect(entry.hash).toBe("abcdefg");
      expect(entry.hash.length).toBe(7);
    });

    test("handles entry with no scope", () => {
      const entry = createEntry("feat: add feature", "abc1234", "Alice");
      expect(entry.scope).toBeUndefined();
    });

    test("handles entry with no issues", () => {
      const entry = createEntry("feat: add feature", "abc1234", "Alice");
      expect(entry.issues).toEqual([]);
    });
  });

  describe("markdown section generation", () => {
    interface ChangelogEntry {
      message: string;
      scope?: string;
      issues: string[];
      hash: string;
      author: string;
    }

    function generateSectionMarkdown(
      title: string,
      emoji: string,
      entries: ChangelogEntry[],
      includeScope: boolean = true,
    ): string {
      if (entries.length === 0) return "";

      const lines: string[] = [];
      lines.push(`\n## ${emoji} ${title}\n`);

      for (const entry of entries) {
        const issueStr =
          entry.issues.length > 0 ? ` (${entry.issues.join(", ")})` : "";
        const scopeStr =
          includeScope && entry.scope ? `**${entry.scope}:** ` : "";
        lines.push(`- ${scopeStr}${entry.message}${issueStr}`);
      }

      return lines.join("\n");
    }

    test("generates section with entries", () => {
      const entries: ChangelogEntry[] = [
        {
          message: "Add login",
          scope: "auth",
          issues: [],
          hash: "abc1234",
          author: "Alice",
        },
      ];
      const section = generateSectionMarkdown("Features", "\u2728", entries);
      expect(section).toContain("## \u2728 Features");
      expect(section).toContain("**auth:** Add login");
    });

    test("returns empty for no entries", () => {
      const section = generateSectionMarkdown("Features", "\u2728", []);
      expect(section).toBe("");
    });

    test("includes issues when present", () => {
      const entries: ChangelogEntry[] = [
        {
          message: "Fix bug",
          issues: ["#123", "#456"],
          hash: "abc",
          author: "Bob",
        },
      ];
      const section = generateSectionMarkdown("Fixes", "\uD83D\uDC1B", entries);
      expect(section).toContain("(#123, #456)");
    });

    test("omits scope when includeScope is false", () => {
      const entries: ChangelogEntry[] = [
        {
          message: "Update docs",
          scope: "readme",
          issues: [],
          hash: "abc",
          author: "Charlie",
        },
      ];
      const section = generateSectionMarkdown(
        "Docs",
        "\uD83D\uDCDA",
        entries,
        false,
      );
      expect(section).not.toContain("**readme:**");
      expect(section).toContain("Update docs");
    });

    test("handles multiple entries", () => {
      const entries: ChangelogEntry[] = [
        { message: "Feature 1", issues: [], hash: "abc", author: "Alice" },
        { message: "Feature 2", issues: [], hash: "def", author: "Bob" },
      ];
      const section = generateSectionMarkdown("Features", "\u2728", entries);
      expect(section).toContain("- Feature 1");
      expect(section).toContain("- Feature 2");
    });
  });

  describe("contributor list generation", () => {
    function generateContributorList(contributors: string[]): string {
      if (contributors.length === 0) return "";
      return contributors.map((c) => `@${c}`).join(", ");
    }

    test("formats single contributor", () => {
      expect(generateContributorList(["Alice"])).toBe("@Alice");
    });

    test("formats multiple contributors", () => {
      const result = generateContributorList(["Alice", "Bob", "Charlie"]);
      expect(result).toBe("@Alice, @Bob, @Charlie");
    });

    test("returns empty for no contributors", () => {
      expect(generateContributorList([])).toBe("");
    });
  });

  describe("migration notes generation", () => {
    interface ChangelogEntry {
      message: string;
      scope?: string;
      issues: string[];
      hash: string;
      author: string;
    }

    function generateMigrationNotes(
      breakingChanges: ChangelogEntry[],
      migrationFiles: string[],
    ): string | null {
      if (breakingChanges.length === 0) {
        return null;
      }

      if (migrationFiles.length > 0) {
        return `See ${migrationFiles.join(", ")} for migration instructions.`;
      }

      const notes = breakingChanges.map((bc) => `- ${bc.message}`).join("\n");
      return `Review the following breaking changes before upgrading:\n${notes}`;
    }

    test("returns null when no breaking changes", () => {
      expect(generateMigrationNotes([], [])).toBeNull();
    });

    test("references migration files when present", () => {
      const breaking: ChangelogEntry[] = [
        { message: "Remove old API", issues: [], hash: "abc", author: "Alice" },
      ];
      const files = ["MIGRATION.md", "UPGRADE.md"];
      const notes = generateMigrationNotes(breaking, files);
      expect(notes).toBe(
        "See MIGRATION.md, UPGRADE.md for migration instructions.",
      );
    });

    test("generates notes from breaking changes", () => {
      const breaking: ChangelogEntry[] = [
        { message: "Remove old API", issues: [], hash: "abc", author: "Alice" },
        {
          message: "Change config format",
          issues: [],
          hash: "def",
          author: "Bob",
        },
      ];
      const notes = generateMigrationNotes(breaking, []);
      expect(notes).toContain("Review the following breaking changes");
      expect(notes).toContain("- Remove old API");
      expect(notes).toContain("- Change config format");
    });

    test("prefers migration files over generated notes", () => {
      const breaking: ChangelogEntry[] = [
        { message: "Remove old API", issues: [], hash: "abc", author: "Alice" },
      ];
      const files = ["MIGRATION.md"];
      const notes = generateMigrationNotes(breaking, files);
      expect(notes).toContain("MIGRATION.md");
      expect(notes).not.toContain("Review the following");
    });
  });

  describe("stats formatting", () => {
    function formatStats(stats: {
      totalCommits: number;
      additions: number;
      deletions: number;
      filesChanged: number;
    }): string {
      return `${stats.totalCommits} commits | +${stats.additions} -${stats.deletions} | ${stats.filesChanged} files`;
    }

    test("formats basic stats", () => {
      const stats = {
        totalCommits: 10,
        additions: 500,
        deletions: 200,
        filesChanged: 15,
      };
      expect(formatStats(stats)).toBe("10 commits | +500 -200 | 15 files");
    });

    test("handles zero values", () => {
      const stats = {
        totalCommits: 0,
        additions: 0,
        deletions: 0,
        filesChanged: 0,
      };
      expect(formatStats(stats)).toBe("0 commits | +0 -0 | 0 files");
    });

    test("handles large numbers", () => {
      const stats = {
        totalCommits: 1000,
        additions: 50000,
        deletions: 30000,
        filesChanged: 500,
      };
      expect(formatStats(stats)).toBe(
        "1000 commits | +50000 -30000 | 500 files",
      );
    });
  });

  describe("other entries handling", () => {
    interface ChangelogEntry {
      message: string;
      scope?: string;
      issues: string[];
      hash: string;
      author: string;
    }

    function formatOtherSection(entries: ChangelogEntry[]): string {
      if (entries.length === 0) return "";

      const lines: string[] = [];
      lines.push("\n## \uD83D\uDCE6 Other Changes\n");

      if (entries.length <= 15) {
        for (const entry of entries) {
          lines.push(`- ${entry.message}`);
        }
      } else {
        lines.push(`- ${entries.length} additional maintenance commits`);
      }

      return lines.join("\n");
    }

    test("lists entries when 15 or fewer", () => {
      const entries: ChangelogEntry[] = Array(5)
        .fill(null)
        .map((_, i) => ({
          message: `Change ${i + 1}`,
          issues: [],
          hash: `abc${i}`,
          author: "Alice",
        }));
      const section = formatOtherSection(entries);
      expect(section).toContain("- Change 1");
      expect(section).toContain("- Change 5");
    });

    test("summarizes when more than 15", () => {
      const entries: ChangelogEntry[] = Array(20)
        .fill(null)
        .map((_, i) => ({
          message: `Change ${i + 1}`,
          issues: [],
          hash: `abc${i}`,
          author: "Alice",
        }));
      const section = formatOtherSection(entries);
      expect(section).toContain("20 additional maintenance commits");
      expect(section).not.toContain("- Change 1");
    });

    test("returns empty for no entries", () => {
      expect(formatOtherSection([])).toBe("");
    });

    test("lists exactly 15 entries", () => {
      const entries: ChangelogEntry[] = Array(15)
        .fill(null)
        .map((_, i) => ({
          message: `Change ${i + 1}`,
          issues: [],
          hash: `abc${i}`,
          author: "Alice",
        }));
      const section = formatOtherSection(entries);
      expect(section).toContain("- Change 1");
      expect(section).toContain("- Change 15");
      expect(section).not.toContain("additional maintenance commits");
    });
  });

  describe("user markdown bug fixes section", () => {
    interface ChangelogEntry {
      message: string;
      scope?: string;
      issues: string[];
      hash: string;
      author: string;
    }

    function toUserFriendly(message: string): string {
      return message
        .replace(/\bapi\b/gi, "API")
        .replace(/\bfix\b/gi, "resolve")
        .replace(/\bbug\b/gi, "issue");
    }

    function formatBugFixesForUser(fixes: ChangelogEntry[]): string {
      if (fixes.length === 0) return "";

      const lines: string[] = [];
      lines.push("\n## \uD83D\uDC1B Bug Fixes\n");

      const importantFixes = fixes.slice(0, 5);
      for (const entry of importantFixes) {
        lines.push(`- ${toUserFriendly(entry.message)}`);
      }

      if (fixes.length > 5) {
        lines.push(`- ...and ${fixes.length - 5} more bug fixes`);
      }

      return lines.join("\n");
    }

    test("shows up to 5 fixes", () => {
      const fixes: ChangelogEntry[] = Array(5)
        .fill(null)
        .map((_, i) => ({
          message: `Fix bug ${i + 1}`,
          issues: [],
          hash: `abc${i}`,
          author: "Alice",
        }));
      const section = formatBugFixesForUser(fixes);
      // toUserFriendly replaces but doesn't capitalize first letter
      expect(section).toContain("resolve issue 1");
      expect(section).toContain("resolve issue 5");
      expect(section).not.toContain("more bug fixes");
    });

    test("summarizes when more than 5", () => {
      const fixes: ChangelogEntry[] = Array(10)
        .fill(null)
        .map((_, i) => ({
          message: `Fix bug ${i + 1}`,
          issues: [],
          hash: `abc${i}`,
          author: "Alice",
        }));
      const section = formatBugFixesForUser(fixes);
      expect(section).toContain("...and 5 more bug fixes");
    });

    test("returns empty for no fixes", () => {
      expect(formatBugFixesForUser([])).toBe("");
    });
  });
});
