import simpleGit from "simple-git";
import { z } from "zod";
import type { ReviewerSuggestion, SuggestReviewersResult } from "@/types";

export const SuggestReviewersInputSchema = z.object({
  files: z.array(z.string()).describe("List of files that changed"),
  projectPath: z
    .string()
    .optional()
    .describe("Project path. Defaults to current directory."),
  excludeAuthors: z
    .array(z.string())
    .default([])
    .describe("Authors to exclude (e.g., PR author)"),
  limit: z
    .number()
    .min(1)
    .max(10)
    .default(3)
    .describe("Maximum reviewers to suggest"),
});

export type SuggestReviewersInput = z.infer<typeof SuggestReviewersInputSchema>;

// Threshold for "significant" ownership
const REQUIRED_THRESHOLD = 50; // Primary expert with 50%+ = required
const MIN_OWNERSHIP_THRESHOLD = 10; // Need at least 10% to be suggested

export async function suggestReviewers(
  input: SuggestReviewersInput,
): Promise<SuggestReviewersResult> {
  const projectPath = input.projectPath ?? process.cwd();
  const git = simpleGit(projectPath);
  const excludeSet = new Set(input.excludeAuthors.map((a) => a.toLowerCase()));

  // Track expertise per reviewer across all files
  const reviewerMap = new Map<
    string,
    {
      name: string;
      email: string;
      filesOwned: Map<string, number>; // file -> ownership percentage
      totalCommits: number;
      recentCommits: number;
      lastCommitTime: number;
    }
  >();

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const filesWithNoOwner: string[] = [];

  // Analyze each file
  for (const file of input.files) {
    const fileOwnership = await analyzeFileOwnership(
      git,
      file,
      excludeSet,
      thirtyDaysAgo,
    );

    if (fileOwnership.length === 0) {
      filesWithNoOwner.push(file);
      continue;
    }

    // Check if any owner has significant ownership
    const hasSignificantOwner = fileOwnership.some(
      (o) => o.percentage >= MIN_OWNERSHIP_THRESHOLD,
    );
    if (!hasSignificantOwner) {
      filesWithNoOwner.push(file);
    }

    // Merge into global reviewer map
    for (const owner of fileOwnership) {
      const key = owner.email.toLowerCase();
      const existing = reviewerMap.get(key);

      if (existing) {
        existing.filesOwned.set(file, owner.percentage);
        existing.totalCommits += owner.commits;
        existing.recentCommits += owner.recentCommits;
        if (owner.lastCommitTime > existing.lastCommitTime) {
          existing.lastCommitTime = owner.lastCommitTime;
        }
      } else {
        const filesOwned = new Map<string, number>();
        filesOwned.set(file, owner.percentage);
        reviewerMap.set(key, {
          name: owner.name,
          email: owner.email,
          filesOwned,
          totalCommits: owner.commits,
          recentCommits: owner.recentCommits,
          lastCommitTime: owner.lastCommitTime,
        });
      }
    }
  }

  // Build suggestions
  const suggestions: ReviewerSuggestion[] = [];
  const totalFiles = input.files.length;
  const filesWithOwner = totalFiles - filesWithNoOwner.length;

  for (const [, reviewer] of reviewerMap) {
    const filesOwnedList = Array.from(reviewer.filesOwned.keys());
    const ownerships = Array.from(reviewer.filesOwned.values());

    // Calculate average ownership percentage across files they touched
    const avgOwnership =
      ownerships.reduce((sum, pct) => sum + pct, 0) / ownerships.length;

    // Calculate overall expertise (weighted by file coverage and ownership)
    const fileCoverage = filesOwnedList.length / Math.max(1, filesWithOwner);
    const expertisePct = Math.round(avgOwnership * fileCoverage);

    // Skip if below minimum threshold
    if (
      expertisePct < MIN_OWNERSHIP_THRESHOLD &&
      reviewer.recentCommits === 0
    ) {
      continue;
    }

    // Determine category
    const isPrimaryExpert = avgOwnership >= REQUIRED_THRESHOLD;
    const hasRecentActivity = reviewer.recentCommits > 0;
    const category: "required" | "optional" =
      isPrimaryExpert && fileCoverage > 0.3 ? "required" : "optional";

    // Generate reason
    const reason = generateReason(
      reviewer.name,
      filesOwnedList,
      avgOwnership,
      hasRecentActivity,
      reviewer.recentCommits,
      totalFiles,
    );

    // Calculate relevance for backwards compat (0-1 score)
    const recencyBonus = hasRecentActivity ? 0.1 : 0;
    const relevance = Math.min(
      1,
      fileCoverage * 0.7 + (avgOwnership / 100) * 0.3 + recencyBonus,
    );

    suggestions.push({
      name: reviewer.name,
      email: reviewer.email,
      reason,
      relevance: Math.round(relevance * 100) / 100,
      expertisePct,
      category,
      filesOwned: filesOwnedList,
    });
  }

  // Sort by expertise percentage, then by relevance
  suggestions.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category === "required" ? -1 : 1;
    }
    if (b.expertisePct !== a.expertisePct) {
      return b.expertisePct - a.expertisePct;
    }
    return b.relevance - a.relevance;
  });

  // Split into required and optional, respecting limit
  const required = suggestions
    .filter((s) => s.category === "required")
    .slice(0, Math.ceil(input.limit / 2));

  const optional = suggestions
    .filter((s) => s.category === "optional")
    .slice(0, input.limit - required.length);

  // Generate summary
  const summary = generateSummary(
    input.files,
    required,
    optional,
    filesWithNoOwner,
  );

  return {
    required,
    optional,
    noOwner: filesWithNoOwner,
    summary,
  };
}

interface FileOwnership {
  name: string;
  email: string;
  commits: number;
  percentage: number;
  recentCommits: number;
  lastCommitTime: number;
}

async function analyzeFileOwnership(
  git: ReturnType<typeof simpleGit>,
  file: string,
  excludeSet: Set<string>,
  recentThreshold: number,
): Promise<FileOwnership[]> {
  try {
    // Get all commits for this file
    const logOutput = await git.raw([
      "log",
      "--format=%an|%ae|%ct",
      "--follow",
      "--",
      file,
    ]);

    const lines = logOutput.split("\n").filter(Boolean);
    const authorMap = new Map<
      string,
      {
        name: string;
        email: string;
        commits: number;
        recentCommits: number;
        lastCommitTime: number;
      }
    >();

    for (const line of lines) {
      const match = line.match(/^(.+)\|(.+)\|(\d+)$/);
      if (!match) continue;

      const [, name, email, timeStr] = match;
      const emailLower = email.toLowerCase();
      const commitTime = parseInt(timeStr, 10) * 1000;
      const isRecent = commitTime > recentThreshold;

      // Skip excluded authors
      if (excludeSet.has(emailLower) || excludeSet.has(name.toLowerCase())) {
        continue;
      }

      const existing = authorMap.get(emailLower);
      if (existing) {
        existing.commits++;
        if (isRecent) existing.recentCommits++;
        if (commitTime > existing.lastCommitTime) {
          existing.lastCommitTime = commitTime;
        }
      } else {
        authorMap.set(emailLower, {
          name,
          email,
          commits: 1,
          recentCommits: isRecent ? 1 : 0,
          lastCommitTime: commitTime,
        });
      }
    }

    // Calculate percentages
    const totalCommits = Array.from(authorMap.values()).reduce(
      (sum, a) => sum + a.commits,
      0,
    );

    if (totalCommits === 0) return [];

    return Array.from(authorMap.values()).map((author) => ({
      name: author.name,
      email: author.email,
      commits: author.commits,
      percentage: Math.round((author.commits / totalCommits) * 100),
      recentCommits: author.recentCommits,
      lastCommitTime: author.lastCommitTime,
    }));
  } catch {
    return [];
  }
}

function generateReason(
  _name: string,
  filesOwned: string[],
  avgOwnership: number,
  hasRecentActivity: boolean,
  recentCommits: number,
  totalFiles: number,
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
  if (filesOwned.length === totalFiles) {
    parts.push(`all ${totalFiles} files`);
  } else if (filesOwned.length > 1) {
    parts.push(`${filesOwned.length}/${totalFiles} files`);
  } else {
    // Single file - show which one
    const fileName = filesOwned[0]?.split("/").pop() ?? filesOwned[0];
    parts.push(fileName ?? "1 file");
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

function generateSummary(
  files: string[],
  required: ReviewerSuggestion[],
  optional: ReviewerSuggestion[],
  noOwner: string[],
): string {
  const lines: string[] = [];

  // Files touched
  if (files.length <= 3) {
    lines.push(`PR touches: ${files.join(", ")}`);
  } else {
    const dirs = new Set(
      files.map((f) => f.split("/").slice(0, -1).join("/") || "."),
    );
    lines.push(`PR touches: ${files.length} files in ${dirs.size} directories`);
  }

  lines.push("");
  lines.push("Suggested reviewers:");

  // Required reviewers
  for (const r of required) {
    lines.push(`├── @${r.name} (${r.reason}) — required`);
  }

  // Optional reviewers
  for (let i = 0; i < optional.length; i++) {
    const r = optional[i];
    const prefix =
      i === optional.length - 1 && noOwner.length === 0 ? "└──" : "├──";
    lines.push(`${prefix} @${r.name} (${r.reason}) — optional`);
  }

  // No owner warning
  if (noOwner.length > 0) {
    lines.push("");
    if (noOwner.length <= 3) {
      lines.push(`⚠️ No clear owner: ${noOwner.join(", ")}`);
    } else {
      lines.push(`⚠️ No clear owner for ${noOwner.length} files`);
    }
  }

  return lines.join("\n");
}
