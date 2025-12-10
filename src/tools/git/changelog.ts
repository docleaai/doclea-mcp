import simpleGit from "simple-git";
import { z } from "zod";

export const ChangelogInputSchema = z.object({
  fromRef: z.string().describe("Starting git ref (tag, commit, branch)"),
  toRef: z.string().default("HEAD").describe("Ending git ref"),
  projectPath: z
    .string()
    .optional()
    .describe("Project path. Defaults to current directory."),
  format: z
    .enum(["markdown", "json"])
    .default("markdown")
    .describe("Output format"),
  audience: z
    .enum(["developers", "users"])
    .default("developers")
    .describe(
      "Target audience - developers get technical details, users get friendly summaries",
    ),
});

export type ChangelogInput = z.infer<typeof ChangelogInputSchema>;

export interface ChangelogEntry {
  message: string;
  scope?: string;
  issues: string[];
  hash: string;
  author: string;
}

export interface ChangelogResult {
  version: string;
  fromRef: string;
  toRef: string;
  date: string;
  markdown: string;
  features: ChangelogEntry[];
  fixes: ChangelogEntry[];
  breakingChanges: ChangelogEntry[];
  docs: ChangelogEntry[];
  refactor: ChangelogEntry[];
  performance: ChangelogEntry[];
  other: ChangelogEntry[];
  contributors: string[];
  issuesReferenced: string[];
  migrationNotes: string | null;
  stats: {
    totalCommits: number;
    additions: number;
    deletions: number;
    filesChanged: number;
  };
}

export async function generateChangelog(
  input: ChangelogInput,
): Promise<ChangelogResult> {
  const projectPath = input.projectPath ?? process.cwd();
  const git = simpleGit(projectPath);

  // Get commits between refs
  const logResult = await git.log([`${input.fromRef}..${input.toRef}`]);

  // Try to extract version from toRef (if it's a tag)
  const version = await extractVersion(git, input.toRef, input.fromRef);

  // Get diff stats
  const diffStat = await getDiffStats(git, input.fromRef, input.toRef);

  // Categorize commits
  const features: ChangelogEntry[] = [];
  const fixes: ChangelogEntry[] = [];
  const breakingChanges: ChangelogEntry[] = [];
  const docs: ChangelogEntry[] = [];
  const refactor: ChangelogEntry[] = [];
  const performance: ChangelogEntry[] = [];
  const other: ChangelogEntry[] = [];
  const contributorSet = new Set<string>();
  const allIssues = new Set<string>();

  for (const commit of logResult.all) {
    const message = commit.message;
    const author = commit.author_name;
    const hash = commit.hash.substring(0, 7);
    contributorSet.add(author);

    // Extract issues from commit message
    const issues = extractIssues(message);
    for (const issue of issues) {
      allIssues.add(issue);
    }

    const entry: ChangelogEntry = {
      message: cleanCommitMessage(message),
      scope: extractScope(message),
      issues,
      hash,
      author,
    };

    // Check for breaking changes first (highest priority)
    if (isBreakingChange(message)) {
      breakingChanges.push(entry);
      continue;
    }

    // Categorize by conventional commit type
    const type = extractCommitType(message);
    switch (type) {
      case "feat":
        features.push(entry);
        break;
      case "fix":
        fixes.push(entry);
        break;
      case "docs":
        docs.push(entry);
        break;
      case "refactor":
        refactor.push(entry);
        break;
      case "perf":
        performance.push(entry);
        break;
      default:
        other.push(entry);
    }
  }

  const contributors = [...contributorSet].sort();
  const issuesReferenced = [...allIssues].sort();

  // Check for migration notes
  const migrationNotes = await findMigrationNotes(
    git,
    input.fromRef,
    input.toRef,
    breakingChanges,
  );

  // Generate markdown based on audience
  const markdown =
    input.audience === "users"
      ? generateUserMarkdown(
          version,
          features,
          fixes,
          breakingChanges,
          performance,
        )
      : generateDeveloperMarkdown(
          version,
          input.fromRef,
          input.toRef,
          features,
          fixes,
          breakingChanges,
          docs,
          refactor,
          performance,
          other,
          contributors,
          issuesReferenced,
          migrationNotes,
          diffStat,
        );

  return {
    version,
    fromRef: input.fromRef,
    toRef: input.toRef,
    date: new Date().toISOString().split("T")[0]!,
    markdown,
    features,
    fixes,
    breakingChanges,
    docs,
    refactor,
    performance,
    other,
    contributors,
    issuesReferenced,
    migrationNotes,
    stats: diffStat,
  };
}

async function extractVersion(
  git: ReturnType<typeof simpleGit>,
  toRef: string,
  fromRef: string,
): Promise<string> {
  // Try to get version from toRef if it looks like a tag
  if (toRef.match(/^v?\d+\.\d+/)) {
    return toRef.replace(/^v/, "");
  }

  // Try to describe the commit with tags
  try {
    const described = await git.raw([
      "describe",
      "--tags",
      "--abbrev=0",
      toRef,
    ]);
    const tag = described.trim();
    if (tag.match(/^v?\d+\.\d+/)) {
      return tag.replace(/^v/, "");
    }
  } catch {
    // No tag found
  }

  // Try to get next version from fromRef
  if (fromRef.match(/^v?\d+\.\d+/)) {
    const parts = fromRef.replace(/^v/, "").split(".");
    if (parts.length >= 2) {
      const minor = parseInt(parts[1] ?? "0", 10) + 1;
      return `${parts[0]}.${minor}.0`;
    }
  }

  // Default to "Unreleased"
  return "Unreleased";
}

async function getDiffStats(
  git: ReturnType<typeof simpleGit>,
  fromRef: string,
  toRef: string,
): Promise<{
  totalCommits: number;
  additions: number;
  deletions: number;
  filesChanged: number;
}> {
  try {
    const diffStat = await git.diffSummary([`${fromRef}...${toRef}`]);
    const logResult = await git.log([`${fromRef}..${toRef}`]);

    return {
      totalCommits: logResult.total,
      additions: diffStat.insertions,
      deletions: diffStat.deletions,
      filesChanged: diffStat.files.length,
    };
  } catch {
    return { totalCommits: 0, additions: 0, deletions: 0, filesChanged: 0 };
  }
}

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

function extractScope(message: string): string | undefined {
  const match = message.match(/^\w+\(([^)]+)\)/);
  return match?.[1];
}

function extractCommitType(message: string): string {
  const match = message.match(/^(\w+)(\(.+\))?!?:/);
  return match?.[1]?.toLowerCase() ?? "other";
}

function isBreakingChange(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("breaking change") ||
    lowerMessage.includes("breaking:") ||
    message.includes("!:") ||
    /^\w+(\(.+\))?!:/.test(message)
  );
}

function cleanCommitMessage(message: string): string {
  // Remove conventional commit prefix
  let cleaned =
    message
      .replace(
        /^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?!?:\s*/i,
        "",
      )
      .split("\n")[0] // First line only
      ?.trim() ?? message;

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

async function findMigrationNotes(
  git: ReturnType<typeof simpleGit>,
  fromRef: string,
  toRef: string,
  breakingChanges: ChangelogEntry[],
): Promise<string | null> {
  if (breakingChanges.length === 0) {
    return null;
  }

  // Check for migration docs in the diff
  try {
    const diff = await git.diff([`${fromRef}...${toRef}`, "--name-only"]);
    const files = diff.split("\n").filter(Boolean);

    const migrationFiles = files.filter(
      (f) =>
        f.toLowerCase().includes("migration") ||
        f.toLowerCase().includes("upgrade") ||
        f.toLowerCase().includes("breaking"),
    );

    if (migrationFiles.length > 0) {
      return `See ${migrationFiles.join(", ")} for migration instructions.`;
    }
  } catch {
    // Ignore errors
  }

  // Generate migration notes from breaking changes
  if (breakingChanges.length > 0) {
    const notes = breakingChanges.map((bc) => `- ${bc.message}`).join("\n");
    return `Review the following breaking changes before upgrading:\n${notes}`;
  }

  return null;
}

function generateDeveloperMarkdown(
  version: string,
  fromRef: string,
  toRef: string,
  features: ChangelogEntry[],
  fixes: ChangelogEntry[],
  breakingChanges: ChangelogEntry[],
  docs: ChangelogEntry[],
  refactor: ChangelogEntry[],
  performance: ChangelogEntry[],
  other: ChangelogEntry[],
  contributors: string[],
  issues: string[],
  migrationNotes: string | null,
  stats: {
    totalCommits: number;
    additions: number;
    deletions: number;
    filesChanged: number;
  },
): string {
  const sections: string[] = [];
  const date = new Date().toISOString().split("T")[0];

  sections.push(`# Changelog v${version}\n`);
  sections.push(
    `**${date}** | ${stats.totalCommits} commits | +${stats.additions} -${stats.deletions} | ${stats.filesChanged} files\n`,
  );

  if (breakingChanges.length > 0) {
    sections.push(`\n## ⚠️ Breaking Changes\n`);
    for (const entry of breakingChanges) {
      const issueStr =
        entry.issues.length > 0 ? ` (${entry.issues.join(", ")})` : "";
      sections.push(`- ${entry.message}${issueStr}`);
    }

    if (migrationNotes) {
      sections.push(`\n### Migration Guide\n`);
      sections.push(migrationNotes);
    }
  }

  if (features.length > 0) {
    sections.push(`\n## ✨ Features\n`);
    for (const entry of features) {
      const issueStr =
        entry.issues.length > 0 ? ` (${entry.issues.join(", ")})` : "";
      const scopeStr = entry.scope ? `**${entry.scope}:** ` : "";
      sections.push(`- ${scopeStr}${entry.message}${issueStr}`);
    }
  }

  if (fixes.length > 0) {
    sections.push(`\n## 🐛 Bug Fixes\n`);
    for (const entry of fixes) {
      const issueStr =
        entry.issues.length > 0 ? ` (${entry.issues.join(", ")})` : "";
      const scopeStr = entry.scope ? `**${entry.scope}:** ` : "";
      sections.push(`- ${scopeStr}${entry.message}${issueStr}`);
    }
  }

  if (performance.length > 0) {
    sections.push(`\n## ⚡ Performance\n`);
    for (const entry of performance) {
      const scopeStr = entry.scope ? `**${entry.scope}:** ` : "";
      sections.push(`- ${scopeStr}${entry.message}`);
    }
  }

  if (docs.length > 0) {
    sections.push(`\n## 📚 Documentation\n`);
    for (const entry of docs) {
      sections.push(`- ${entry.message}`);
    }
  }

  if (refactor.length > 0) {
    sections.push(`\n## ♻️ Refactoring\n`);
    for (const entry of refactor) {
      const scopeStr = entry.scope ? `**${entry.scope}:** ` : "";
      sections.push(`- ${scopeStr}${entry.message}`);
    }
  }

  if (other.length > 0 && other.length <= 15) {
    sections.push(`\n## 📦 Other Changes\n`);
    for (const entry of other) {
      sections.push(`- ${entry.message}`);
    }
  } else if (other.length > 15) {
    sections.push(`\n## 📦 Other Changes\n`);
    sections.push(`- ${other.length} additional maintenance commits`);
  }

  if (issues.length > 0) {
    sections.push(`\n## 🔗 Related Issues\n`);
    sections.push(issues.join(", "));
  }

  if (contributors.length > 0) {
    sections.push(`\n## 👥 Contributors\n`);
    sections.push(contributors.map((c) => `@${c}`).join(", "));
  }

  sections.push(`\n---\n`);
  sections.push(`*Comparing \`${fromRef}\`...\`${toRef}\`*`);

  return sections.join("\n");
}

function generateUserMarkdown(
  version: string,
  features: ChangelogEntry[],
  fixes: ChangelogEntry[],
  breakingChanges: ChangelogEntry[],
  performance: ChangelogEntry[],
): string {
  const sections: string[] = [];

  sections.push(`# What's New in v${version}\n`);

  if (breakingChanges.length > 0) {
    sections.push(`\n## ⚠️ Important Changes\n`);
    sections.push(
      `This update includes changes that may affect your workflow:\n`,
    );
    for (const entry of breakingChanges) {
      sections.push(`- ${toUserFriendly(entry.message)}`);
    }
  }

  if (features.length > 0) {
    sections.push(`\n## 🎉 New Features\n`);
    for (const entry of features) {
      const friendly = toUserFriendly(entry.message);
      const emoji = getFeatureEmoji(entry.message, entry.scope);
      sections.push(`${emoji} **${friendly}**`);
      const description = generateUserDescription(entry);
      if (description) {
        sections.push(`${description}\n`);
      }
    }
  }

  if (fixes.length > 0) {
    sections.push(`\n## 🐛 Bug Fixes\n`);
    const importantFixes = fixes.slice(0, 5); // Show top 5 fixes
    for (const entry of importantFixes) {
      sections.push(`- ${toUserFriendly(entry.message)}`);
    }
    if (fixes.length > 5) {
      sections.push(`- ...and ${fixes.length - 5} more bug fixes`);
    }
  }

  if (performance.length > 0) {
    sections.push(`\n## ⚡ Performance Improvements\n`);
    sections.push(`We've made the app faster and more responsive!\n`);
    for (const entry of performance.slice(0, 3)) {
      sections.push(`- ${toUserFriendly(entry.message)}`);
    }
  }

  sections.push(`\n---\n`);
  sections.push(
    `*Thank you for using our product! We appreciate your feedback.*`,
  );

  return sections.join("\n");
}

function toUserFriendly(message: string): string {
  // Remove technical jargon and make more user-friendly
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

  // Ensure first letter is capitalized
  if (friendly.length > 0) {
    friendly = friendly.charAt(0).toUpperCase() + friendly.slice(1);
  }

  return friendly;
}

function getFeatureEmoji(message: string, scope?: string): string {
  const lowerMessage = message.toLowerCase();
  const lowerScope = scope?.toLowerCase() ?? "";

  if (lowerMessage.includes("dark") || lowerMessage.includes("theme"))
    return "🌙";
  if (lowerMessage.includes("security") || lowerMessage.includes("auth"))
    return "🔒";
  if (lowerMessage.includes("search")) return "🔍";
  if (lowerMessage.includes("notification") || lowerMessage.includes("alert"))
    return "🔔";
  if (lowerMessage.includes("export") || lowerMessage.includes("download"))
    return "📥";
  if (lowerMessage.includes("import") || lowerMessage.includes("upload"))
    return "📤";
  if (lowerMessage.includes("share")) return "📤";
  if (lowerMessage.includes("filter") || lowerMessage.includes("sort"))
    return "🔧";
  if (lowerMessage.includes("dashboard") || lowerMessage.includes("analytics"))
    return "📊";
  if (lowerMessage.includes("mobile") || lowerScope.includes("mobile"))
    return "📱";
  if (lowerMessage.includes("email") || lowerMessage.includes("mail"))
    return "📧";
  if (lowerMessage.includes("user") || lowerMessage.includes("profile"))
    return "👤";
  if (lowerMessage.includes("payment") || lowerMessage.includes("billing"))
    return "💳";
  if (lowerMessage.includes("integration")) return "🔗";

  return "✨";
}

function generateUserDescription(entry: ChangelogEntry): string | null {
  // Generate a brief user-friendly description based on scope
  const scope = entry.scope?.toLowerCase();

  if (!scope) return null;

  const descriptions: Record<string, string> = {
    auth: "Your account is now more secure.",
    ui: "We've improved the look and feel.",
    api: "Better integration capabilities.",
    performance: "Things should feel snappier now.",
    mobile: "Better experience on your phone.",
    dashboard: "More insights at your fingertips.",
  };

  return descriptions[scope] ?? null;
}
