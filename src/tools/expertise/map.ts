import { format, subMonths } from "date-fns";
import simpleGit from "simple-git";
import { z } from "zod";
import type { Expert, ExpertiseEntry, ExpertiseRecommendation } from "@/types";

export const ExpertiseInputSchema = z.object({
  path: z
    .string()
    .optional()
    .describe(
      "Specific path to analyze. Analyzes entire repo if not provided.",
    ),
  projectPath: z
    .string()
    .optional()
    .describe("Project path. Defaults to current directory."),
  depth: z
    .number()
    .min(1)
    .max(5)
    .default(2)
    .describe("Directory depth to analyze"),
  includeStale: z
    .boolean()
    .default(true)
    .describe("Include paths with no recent activity (>6 months)"),
  busFactorThreshold: z
    .number()
    .min(50)
    .max(100)
    .default(80)
    .describe("Percentage threshold for bus factor risk (default: 80%)"),
});

export type ExpertiseInput = z.infer<typeof ExpertiseInputSchema>;

export interface ExpertiseResult {
  entries: ExpertiseEntry[];
  recommendations: ExpertiseRecommendation[];
  summary: {
    totalFiles: number;
    totalContributors: number;
    totalDirectories: number;
    avgBusFactor: number;
    riskyPaths: string[];
    stalePaths: string[];
    healthScore: number; // 0-100, higher is better
  };
}

// Helper to get timestamp N months ago
function getMonthsAgoTimestamp(months: number): number {
  return subMonths(new Date(), months).getTime();
}

export async function mapExpertise(
  input: ExpertiseInput,
): Promise<ExpertiseResult> {
  const projectPath = input.projectPath ?? process.cwd();
  const git = simpleGit(projectPath);
  const busFactorThreshold = input.busFactorThreshold;

  // Get list of files to analyze
  const targetPath = input.path ?? ".";
  const files = await git.raw(["ls-files", targetPath]);
  const fileList = files
    .split("\n")
    .filter(Boolean)
    .filter((f) => !isIgnoredFile(f));

  // Group files by directory at specified depth
  const dirGroups = groupByDirectory(fileList, input.depth);

  const entries: ExpertiseEntry[] = [];
  const allContributors = new Set<string>();
  const now = Date.now();

  // Process directories in parallel batches for better performance
  const dirEntries = Object.entries(dirGroups);
  const batchSize = 5;

  for (let i = 0; i < dirEntries.length; i += batchSize) {
    const batch = dirEntries.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(([dir, dirFiles]) =>
        analyzeDirectory(
          git,
          dir,
          dirFiles,
          busFactorThreshold,
          allContributors,
        ),
      ),
    );

    for (const result of batchResults) {
      if (result) {
        entries.push(result);
      }
    }
  }

  // Filter stale paths if not included
  const filteredEntries = input.includeStale
    ? entries
    : entries.filter((e) => {
        const lastActivityTime = parseDate(e.lastActivity);
        return lastActivityTime > getMonthsAgoTimestamp(6);
      });

  // Sort by bus factor risk (highest risk first)
  filteredEntries.sort((a, b) => {
    // Risky paths first
    if (a.busFactorRisk !== b.busFactorRisk) {
      return a.busFactorRisk ? -1 : 1;
    }
    // Then by bus factor (lower = riskier)
    return a.busFactor - b.busFactor;
  });

  // Generate recommendations
  const recommendations = generateRecommendations(filteredEntries, now);

  // Calculate summary stats
  const avgBusFactor =
    filteredEntries.length > 0
      ? filteredEntries.reduce((sum, e) => sum + e.busFactor, 0) /
        filteredEntries.length
      : 0;

  const riskyPaths = filteredEntries
    .filter((e) => e.busFactorRisk)
    .map((e) => e.path);

  const stalePaths = filteredEntries
    .filter((e) => {
      const lastActivityTime = parseDate(e.lastActivity);
      return lastActivityTime < getMonthsAgoTimestamp(6);
    })
    .map((e) => e.path);

  // Calculate health score (0-100)
  const healthScore = calculateHealthScore(
    filteredEntries,
    riskyPaths.length,
    stalePaths.length,
    avgBusFactor,
  );

  return {
    entries: filteredEntries,
    recommendations,
    summary: {
      totalFiles: fileList.length,
      totalContributors: allContributors.size,
      totalDirectories: filteredEntries.length,
      avgBusFactor: Math.round(avgBusFactor * 10) / 10,
      riskyPaths,
      stalePaths,
      healthScore,
    },
  };
}

async function analyzeDirectory(
  git: ReturnType<typeof simpleGit>,
  dir: string,
  dirFiles: string[],
  busFactorThreshold: number,
  allContributors: Set<string>,
): Promise<ExpertiseEntry | null> {
  const expertMap = new Map<
    string,
    {
      name: string;
      email: string;
      commits: number;
      lastCommitTime: number;
      lastCommit: string;
    }
  >();

  let latestActivity = 0;
  let _totalCommitsInDir = 0;

  // Use git log for the entire directory instead of per-file for efficiency
  try {
    const logOutput = await git.raw([
      "log",
      "--format=%an|%ae|%ct",
      "--name-only",
      "--",
      dir,
    ]);

    const lines = logOutput.split("\n");
    let currentAuthor: { name: string; email: string; time: number } | null =
      null;

    for (const line of lines) {
      if (!line.trim()) continue;

      // Check if it's an author line (contains |)
      const authorMatch = line.match(/^(.+)\|(.+)\|(\d+)$/);
      if (authorMatch) {
        const [, name, email, timeStr] = authorMatch;
        const time = parseInt(timeStr, 10) * 1000;
        currentAuthor = { name, email, time };
        _totalCommitsInDir++;

        if (time > latestActivity) {
          latestActivity = time;
        }
      } else if (currentAuthor && line.trim()) {
        // It's a file path - attribute to current author
        const key = currentAuthor.email.toLowerCase();
        allContributors.add(key);

        const existing = expertMap.get(key);
        if (existing) {
          existing.commits++;
          if (currentAuthor.time > existing.lastCommitTime) {
            existing.lastCommitTime = currentAuthor.time;
            existing.lastCommit = formatDate(currentAuthor.time);
          }
        } else {
          expertMap.set(key, {
            name: currentAuthor.name,
            email: currentAuthor.email,
            commits: 1,
            lastCommitTime: currentAuthor.time,
            lastCommit: formatDate(currentAuthor.time),
          });
        }
      }
    }
  } catch {
    // Directory might not exist in git history
    return null;
  }

  if (expertMap.size === 0) return null;

  // Calculate totals and percentages
  const totalCommits = Array.from(expertMap.values()).reduce(
    (sum, e) => sum + e.commits,
    0,
  );

  const experts: Expert[] = Array.from(expertMap.values())
    .map((e) => ({
      name: e.name,
      email: e.email,
      commits: e.commits,
      percentage: Math.round((e.commits / totalCommits) * 100),
      lastCommit: e.lastCommit,
    }))
    .sort((a, b) => b.commits - a.commits);

  // Calculate bus factor (how many people have >5% contribution)
  const significantContributors = experts.filter(
    (e) => e.percentage >= 5,
  ).length;
  const busFactor = Math.max(1, significantContributors);

  // Determine primary and secondary experts
  const primaryExpert = experts[0] ?? null;
  const secondaryExperts = experts.slice(1, 4); // Top 3 after primary

  // Check bus factor risk (primary expert has >= threshold%)
  const busFactorRisk = primaryExpert
    ? primaryExpert.percentage >= busFactorThreshold
    : false;

  return {
    path: dir,
    primaryExpert,
    secondaryExperts,
    experts,
    busFactor,
    busFactorRisk,
    lastActivity: formatDate(latestActivity),
    totalCommits,
    totalFiles: dirFiles.length,
  };
}

function generateRecommendations(
  entries: ExpertiseEntry[],
  now: number,
): ExpertiseRecommendation[] {
  const recommendations: ExpertiseRecommendation[] = [];

  for (const entry of entries) {
    const lastActivityTime = parseDate(entry.lastActivity);
    const isStale = lastActivityTime < getMonthsAgoTimestamp(6);
    const isInactive = lastActivityTime < getMonthsAgoTimestamp(3);

    // High priority: Bus factor risk with active code
    if (entry.busFactorRisk && !isStale && entry.primaryExpert) {
      const secondary = entry.secondaryExperts[0];
      if (secondary) {
        recommendations.push({
          type: "knowledge_transfer",
          priority: "high",
          path: entry.path,
          message: `Pair ${secondary.name} with ${entry.primaryExpert.name} on ${entry.path} for knowledge transfer (${entry.primaryExpert.percentage}% owned by one person)`,
          involvedExperts: [entry.primaryExpert.name, secondary.name],
        });
      } else {
        recommendations.push({
          type: "mentorship",
          priority: "high",
          path: entry.path,
          message: `Consider ${entry.primaryExpert.name} mentoring someone on ${entry.path} (${entry.primaryExpert.percentage}% single-owner, no backup)`,
          involvedExperts: [entry.primaryExpert.name],
        });
      }
    }

    // Medium priority: Stale code that needs documentation
    if (isStale && entry.totalCommits > 10) {
      const experts = entry.experts.slice(0, 2).map((e) => e.name);
      recommendations.push({
        type: "documentation",
        priority: "medium",
        path: entry.path,
        message: `Document ${entry.path} before institutional knowledge is lost (last activity: ${entry.lastActivity})`,
        involvedExperts: experts,
      });
    }

    // Medium priority: Inactive code with bus factor risk
    if (isInactive && entry.busFactorRisk && entry.primaryExpert) {
      recommendations.push({
        type: "stale_code",
        priority: "medium",
        path: entry.path,
        message: `${entry.path} has bus factor risk and hasn't been touched in 3+ months - review ownership`,
        involvedExperts: [entry.primaryExpert.name],
      });
    }

    // Low priority: Good coverage but could use more reviewers
    if (
      !entry.busFactorRisk &&
      entry.busFactor === 2 &&
      entry.secondaryExperts.length < 2
    ) {
      const experts = entry.experts.slice(0, 2).map((e) => e.name);
      recommendations.push({
        type: "review_coverage",
        priority: "low",
        path: entry.path,
        message: `${entry.path} has adequate coverage but could benefit from a third reviewer`,
        involvedExperts: experts,
      });
    }
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
  );

  // Limit to top 10 recommendations
  return recommendations.slice(0, 10);
}

function calculateHealthScore(
  entries: ExpertiseEntry[],
  riskyCount: number,
  staleCount: number,
  avgBusFactor: number,
): number {
  if (entries.length === 0) return 100;

  // Start at 100 and deduct points
  let score = 100;

  // Deduct for risky paths (up to 30 points)
  const riskyRatio = riskyCount / entries.length;
  score -= Math.min(30, riskyRatio * 50);

  // Deduct for stale paths (up to 20 points)
  const staleRatio = staleCount / entries.length;
  score -= Math.min(20, staleRatio * 30);

  // Deduct for low average bus factor (up to 30 points)
  // avgBusFactor of 1 = -30, avgBusFactor of 3+ = 0
  if (avgBusFactor < 3) {
    score -= (3 - avgBusFactor) * 15;
  }

  // Bonus for high bus factor (up to 10 points)
  if (avgBusFactor >= 3) {
    score = Math.min(100, score + 10);
  }

  return Math.max(0, Math.round(score));
}

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

function formatDate(timestamp: number): string {
  if (!timestamp) return "unknown";
  const date = new Date(timestamp);
  return format(date, "yyyy-MM-dd");
}

function parseDate(dateStr: string): number {
  if (dateStr === "unknown") return 0;
  return new Date(dateStr).getTime();
}
