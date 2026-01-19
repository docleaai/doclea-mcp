import simpleGit from "simple-git";
import { z } from "zod";
import type { EmbeddingClient } from "@/embeddings/provider";
import type { IStorageBackend } from "@/storage/interface";
import type {
  Memory,
  ReviewerSuggestion,
  SuggestReviewersResult,
} from "@/types";
import type { VectorStore } from "@/vectors/interface";
import { suggestReviewers } from "../expertise/reviewers";

export const PRDescriptionInputSchema = z.object({
  branch: z
    .string()
    .optional()
    .describe("Current branch name. Auto-detected if not provided."),
  base: z.string().default("main").describe("Base branch to compare against"),
  projectPath: z
    .string()
    .optional()
    .describe("Project path. Defaults to current directory."),
});

export type PRDescriptionInput = z.infer<typeof PRDescriptionInputSchema>;

export interface PRDescriptionResult {
  title: string;
  body: string;
  commits: string[];
  filesChanged: string[];
  additions: number;
  deletions: number;
  suggestedReviewers: ReviewerSuggestion[];
  relatedDecisions: Array<{
    id: string;
    title: string;
    type: string;
    relevance: number;
  }>;
}

interface RelatedMemory {
  memory: Memory;
  score: number;
}

export async function generatePRDescription(
  input: PRDescriptionInput,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<PRDescriptionResult> {
  const projectPath = input.projectPath ?? process.cwd();
  const git = simpleGit(projectPath);

  // Get current branch if not provided
  const branch = input.branch ?? (await git.revparse(["--abbrev-ref", "HEAD"]));

  // Get commits between base and current branch
  const logResult = await git.log([`${input.base}..${branch}`]);
  const commits = logResult.all.map((c) => c.message);

  // Get diff stats
  const diffStat = await git.diffSummary([`${input.base}...${branch}`]);
  const filesChanged = diffStat.files.map((f) => f.file);

  // Get the actual diff for context search
  const diff = await git.diff([`${input.base}...${branch}`]);

  // Search for related memories
  const relatedMemories = await findRelatedMemories(
    filesChanged,
    commits,
    diff,
    storage,
    vectors,
    embeddings,
  );

  // Get suggested reviewers
  const reviewerResult = await suggestReviewers({
    files: filesChanged,
    projectPath,
    excludeAuthors: [],
    limit: 3,
  });

  // Combine required and optional reviewers for backwards compatibility
  const allReviewers = [...reviewerResult.required, ...reviewerResult.optional];

  // Generate PR title from branch name or first commit
  const title = generateTitle(branch, commits);

  // Generate PR body with context
  const body = generateBody(
    commits,
    filesChanged,
    diffStat.insertions,
    diffStat.deletions,
    relatedMemories,
    reviewerResult,
  );

  return {
    title,
    body,
    commits,
    filesChanged,
    additions: diffStat.insertions,
    deletions: diffStat.deletions,
    suggestedReviewers: allReviewers,
    relatedDecisions: relatedMemories.map((m) => ({
      id: m.memory.id,
      title: m.memory.title,
      type: m.memory.type,
      relevance: m.score,
    })),
  };
}

async function findRelatedMemories(
  files: string[],
  commits: string[],
  _diff: string,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<RelatedMemory[]> {
  const results: RelatedMemory[] = [];
  const seenIds = new Set<string>();

  // 1. Search by changed files
  if (files.length > 0) {
    const fileQuery = files.slice(0, 10).join(" ");
    const fileVector = await embeddings.embed(fileQuery);
    const fileResults = await vectors.search(
      fileVector,
      { relatedFiles: files },
      5,
    );

    for (const result of fileResults) {
      if (!seenIds.has(result.memoryId)) {
        const memory = storage.getMemory(result.memoryId);
        if (memory) {
          results.push({ memory, score: result.score });
          seenIds.add(result.memoryId);
        }
      }
    }
  }

  // 2. Search by commit messages (combined context)
  if (commits.length > 0) {
    const commitQuery = commits.slice(0, 5).join("\n");
    const commitVector = await embeddings.embed(commitQuery);
    const commitResults = await vectors.search(commitVector, {}, 5);

    for (const result of commitResults) {
      if (!seenIds.has(result.memoryId) && result.score > 0.5) {
        const memory = storage.getMemory(result.memoryId);
        if (memory) {
          results.push({ memory, score: result.score });
          seenIds.add(result.memoryId);
        }
      }
    }
  }

  // 3. Search for decisions specifically
  const branchContext = extractBranchContext(files, commits);
  if (branchContext) {
    const contextVector = await embeddings.embed(branchContext);
    const decisionResults = await vectors.search(
      contextVector,
      { type: "decision" },
      3,
    );

    for (const result of decisionResults) {
      if (!seenIds.has(result.memoryId) && result.score > 0.5) {
        const memory = storage.getMemory(result.memoryId);
        if (memory) {
          results.push({ memory, score: result.score });
          seenIds.add(result.memoryId);
        }
      }
    }
  }

  // 4. Search for patterns
  const patternResults = await vectors.search(
    await embeddings.embed(files.slice(0, 5).join(" ")),
    { type: "pattern" },
    2,
  );

  for (const result of patternResults) {
    if (!seenIds.has(result.memoryId) && result.score > 0.6) {
      const memory = storage.getMemory(result.memoryId);
      if (memory) {
        results.push({ memory, score: result.score });
        seenIds.add(result.memoryId);
      }
    }
  }

  // Sort by score and return top results
  return results.sort((a, b) => b.score - a.score).slice(0, 8);
}

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
    // Extract scope from conventional commits
    const scopeMatch = commit.match(/^\w+\(([^)]+)\):/);
    if (scopeMatch) {
      keywords.add(scopeMatch[1]);
    }
    // Extract key terms
    const terms = commit
      .toLowerCase()
      .match(/\b(auth|api|db|database|ui|config|test|security|performance)\b/g);
    if (terms) {
      for (const term of terms) keywords.add(term);
    }
  }
  if (keywords.size > 0) {
    parts.push(`Topics: ${[...keywords].slice(0, 5).join(", ")}`);
  }

  return parts.join(". ");
}

function generateTitle(branch: string, commits: string[]): string {
  // Try to extract meaningful title from branch name
  // Common patterns: feature/xxx, fix/xxx, feat-xxx, etc.
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
    // Remove conventional commit prefix for title
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

function generateBody(
  commits: string[],
  filesChanged: string[],
  additions: number,
  deletions: number,
  relatedMemories: RelatedMemory[],
  reviewers: SuggestReviewersResult,
): string {
  const sections: string[] = [];

  // Summary section
  sections.push("## Summary\n");
  sections.push(generateSummary(commits, filesChanged));

  // Why section - from related decisions
  const decisions = relatedMemories.filter((m) => m.memory.type === "decision");
  if (decisions.length > 0) {
    sections.push("\n## Context\n");
    sections.push(
      "This PR relates to the following architectural decisions:\n",
    );
    for (const { memory, score } of decisions.slice(0, 3)) {
      const relevancePercent = Math.round(score * 100);
      sections.push(`- **${memory.title}** (${relevancePercent}% relevant)`);
      if (memory.summary) {
        sections.push(`  ${memory.summary}`);
      }
    }
  }

  // Patterns followed
  const patterns = relatedMemories.filter((m) => m.memory.type === "pattern");
  if (patterns.length > 0) {
    sections.push("\n## Patterns Applied\n");
    for (const { memory } of patterns.slice(0, 2)) {
      sections.push(`- ${memory.title}`);
    }
  }

  // Changes section
  if (commits.length > 0) {
    sections.push("\n## Changes\n");
    for (const commit of commits.slice(0, 10)) {
      sections.push(`- ${commit}`);
    }
    if (commits.length > 10) {
      sections.push(`- ... and ${commits.length - 10} more commits`);
    }
  }

  // Files section
  if (filesChanged.length > 0) {
    sections.push("\n## Files Changed\n");
    sections.push(
      `**${filesChanged.length}** files changed, **${additions}** insertions(+), **${deletions}** deletions(-)\n`,
    );

    // Group by directory
    const byDir = groupFilesByDirectory(filesChanged);
    const dirEntries = Object.entries(byDir).slice(0, 5);
    for (const [dir, files] of dirEntries) {
      sections.push(`\n### ${dir || "root"}`);
      for (const file of files.slice(0, 5)) {
        sections.push(`- \`${file}\``);
      }
      if (files.length > 5) {
        sections.push(`- ... and ${files.length - 5} more`);
      }
    }
  }

  // Related issues from memories
  const relatedIssues = extractRelatedIssues(relatedMemories);
  if (relatedIssues.length > 0) {
    sections.push("\n## Related Issues\n");
    sections.push(relatedIssues.join(", "));
  }

  // Testing section
  sections.push("\n## Testing\n");
  sections.push("- [ ] Unit tests added/updated");
  sections.push("- [ ] Manual testing completed");

  // Suggested reviewers
  const hasReviewers =
    reviewers.required.length > 0 || reviewers.optional.length > 0;
  if (hasReviewers) {
    sections.push("\n## Suggested Reviewers\n");

    // Required reviewers
    for (const reviewer of reviewers.required) {
      sections.push(
        `- **@${reviewer.name}** (${reviewer.reason}) — **required**`,
      );
    }

    // Optional reviewers
    for (const reviewer of reviewers.optional) {
      sections.push(`- **@${reviewer.name}** (${reviewer.reason}) — optional`);
    }

    // Warning for files with no owner
    if (reviewers.noOwner.length > 0) {
      sections.push("");
      if (reviewers.noOwner.length <= 3) {
        sections.push(
          `> ⚠️ No clear owner for: ${reviewers.noOwner.join(", ")}`,
        );
      } else {
        sections.push(
          `> ⚠️ No clear owner for ${reviewers.noOwner.length} files`,
        );
      }
    }
  }

  return sections.join("\n");
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

function generateSummary(commits: string[], filesChanged: string[]): string {
  // Analyze commits to generate a summary
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

  return `${parts.join(". ")}.`;
}

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
