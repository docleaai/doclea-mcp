import simpleGit from "simple-git";
import { z } from "zod";
import type { IStorageBackend } from "@/storage/interface";
import type { EmbeddingClient } from "@/embeddings/provider";
import type { Memory } from "@/types";
import type { VectorStore } from "@/vectors/interface";

export const CommitMessageInputSchema = z.object({
  diff: z
    .string()
    .optional()
    .describe("Git diff to analyze. If not provided, uses staged changes."),
  projectPath: z
    .string()
    .optional()
    .describe("Project path. Defaults to current directory."),
});

export type CommitMessageInput = z.infer<typeof CommitMessageInputSchema>;

export interface CommitMessageResult {
  suggestedMessage: string;
  type: string;
  scope: string | null;
  summary: string;
  body: string | null;
  filesChanged: string[];
  relatedMemories: Array<{
    id: string;
    title: string;
    type: string;
    relevance: number;
  }>;
  relatedIssues: string[];
}

export async function generateCommitMessage(
  input: CommitMessageInput,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<CommitMessageResult> {
  const projectPath = input.projectPath ?? process.cwd();
  const git = simpleGit(projectPath);

  // Get staged diff if not provided
  const diff = input.diff ?? (await git.diff(["--cached"]));

  if (!diff.trim()) {
    throw new Error(
      "No staged changes found. Stage changes with 'git add' first.",
    );
  }

  // Parse the diff to understand what changed
  const analysis = analyzeDiff(diff);

  // Search for related memories based on files and diff content
  const relatedMemories = await findRelatedMemories(
    analysis,
    diff,
    storage,
    vectors,
    embeddings,
  );

  // Extract related issues from memories
  const relatedIssues = extractRelatedIssues(relatedMemories);

  // Generate conventional commit message with context
  const type = determineCommitType(analysis, relatedMemories);
  const scope = determineScope(analysis);
  const summary = generateSummary(analysis, relatedMemories);
  const body = generateBody(analysis, relatedMemories, relatedIssues);

  const scopePart = scope ? `(${scope})` : "";
  const suggestedMessage = body
    ? `${type}${scopePart}: ${summary}\n\n${body}`
    : `${type}${scopePart}: ${summary}`;

  return {
    suggestedMessage,
    type,
    scope,
    summary,
    body,
    filesChanged: analysis.files,
    relatedMemories: relatedMemories.map((m) => ({
      id: m.memory.id,
      title: m.memory.title,
      type: m.memory.type,
      relevance: m.score,
    })),
    relatedIssues,
  };
}

interface RelatedMemory {
  memory: Memory;
  score: number;
}

async function findRelatedMemories(
  analysis: DiffAnalysis,
  diff: string,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<RelatedMemory[]> {
  const results: RelatedMemory[] = [];
  const seenIds = new Set<string>();

  // 1. Search by changed files
  if (analysis.files.length > 0) {
    const fileSearchResults = await vectors.search(
      await embeddings.embed(analysis.files.join(" ")),
      { relatedFiles: analysis.files },
      5,
    );

    for (const result of fileSearchResults) {
      if (!seenIds.has(result.memoryId)) {
        const memory = storage.getMemory(result.memoryId);
        if (memory) {
          results.push({ memory, score: result.score });
          seenIds.add(result.memoryId);
        }
      }
    }
  }

  // 2. Search by significant changes content
  if (analysis.significantChanges.length > 0) {
    const changesQuery = analysis.significantChanges.slice(0, 5).join("\n");
    const changesVector = await embeddings.embed(changesQuery);
    const changesResults = await vectors.search(changesVector, {}, 5);

    for (const result of changesResults) {
      if (!seenIds.has(result.memoryId) && result.score > 0.5) {
        const memory = storage.getMemory(result.memoryId);
        if (memory) {
          results.push({ memory, score: result.score });
          seenIds.add(result.memoryId);
        }
      }
    }
  }

  // 3. Search for decisions/patterns related to the diff summary
  const diffSummary = `${analysis.patterns.isNewFile ? "adding" : "modifying"} ${analysis.files.slice(0, 3).join(", ")}`;
  const summaryVector = await embeddings.embed(diffSummary);
  const decisionResults = await vectors.search(
    summaryVector,
    { type: "decision" },
    3,
  );

  for (const result of decisionResults) {
    if (!seenIds.has(result.memoryId) && result.score > 0.6) {
      const memory = storage.getMemory(result.memoryId);
      if (memory) {
        results.push({ memory, score: result.score });
        seenIds.add(result.memoryId);
      }
    }
  }

  // Sort by score and limit to top 5
  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}

function extractRelatedIssues(memories: RelatedMemory[]): string[] {
  const issues: string[] = [];
  const issuePattern = /#(\d+)|([A-Z]+-\d+)/g;

  for (const { memory } of memories) {
    // Check sourcePr field
    if (memory.sourcePr) {
      const prMatch = memory.sourcePr.match(/\d+/);
      if (prMatch) {
        issues.push(`#${prMatch[0]}`);
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
    // Extract file names
    if (line.startsWith("diff --git")) {
      const match = line.match(/b\/(.+)$/);
      if (match) {
        files.push(match[1]);
      }
    }

    // Count additions/deletions
    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions++;
      // Capture significant additions (function definitions, class definitions, etc.)
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

    // Detect patterns
    if (line.includes("new file mode")) patterns.isNewFile = true;
    if (line.includes("deleted file mode")) patterns.isDelete = true;
    if (
      line.toLowerCase().includes("fix") ||
      line.toLowerCase().includes("bug")
    )
      patterns.isFix = true;
  }

  // Detect file type patterns
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

  // Detect refactor (mostly deletions with additions)
  if (deletions > additions * 0.5 && additions > 10) {
    patterns.isRefactor = true;
  }

  return { files, additions, deletions, significantChanges, patterns };
}

function determineCommitType(
  analysis: DiffAnalysis,
  relatedMemories: RelatedMemory[],
): string {
  const { patterns } = analysis;

  // Check if related memories suggest a fix (bug reports, solutions)
  const hasBugMemory = relatedMemories.some(
    (m) =>
      m.memory.type === "solution" ||
      m.memory.title.toLowerCase().includes("fix") ||
      m.memory.title.toLowerCase().includes("bug"),
  );
  if (hasBugMemory && !patterns.isNewFile) return "fix";

  if (patterns.isDelete && analysis.files.length === analysis.deletions)
    return "chore";
  if (patterns.isTest) return "test";
  if (patterns.isDocs) return "docs";
  if (patterns.isFix) return "fix";
  if (patterns.isConfig) return "chore";
  if (patterns.isStyle) return "style";
  if (patterns.isRefactor) return "refactor";
  if (patterns.isNewFile) return "feat";

  // Default based on a change ratio
  if (analysis.additions > analysis.deletions * 2) return "feat";
  if (analysis.deletions > analysis.additions) return "refactor";

  return "feat";
}

function determineScope(analysis: DiffAnalysis): string | null {
  if (analysis.files.length === 0) return null;

  // Find common directory
  const dirs = analysis.files
    .map((f) => {
      const parts = f.split("/");
      return parts.length > 1 ? parts[0] : null;
    })
    .filter(Boolean);

  if (dirs.length === 0) return null;

  // If all files in same directory, use it as scope
  const uniqueDirs = [...new Set(dirs)];
  if (uniqueDirs.length === 1 && uniqueDirs[0]) return uniqueDirs[0];

  // Common patterns
  if (analysis.files.some((f) => f.includes("auth"))) return "auth";
  if (analysis.files.some((f) => f.includes("api"))) return "api";
  if (analysis.files.some((f) => f.includes("db") || f.includes("database")))
    return "db";
  if (analysis.files.some((f) => f.includes("ui") || f.includes("component")))
    return "ui";

  return null;
}

function generateSummary(
  analysis: DiffAnalysis,
  relatedMemories: RelatedMemory[],
): string {
  const { files, patterns, significantChanges } = analysis;

  // If high-relevance memory exists, try to use context from it
  const topMemory = relatedMemories.find((m) => m.score > 0.7);
  if (topMemory && topMemory.memory.type === "solution") {
    // For bug fixes, try to capture the essence
    const title = topMemory.memory.title.toLowerCase();
    if (title.length < 50) {
      return title.startsWith("fix") ? title : `fix ${title}`;
    }
  }

  // If we have significant changes, describe the first one
  if (significantChanges.length > 0) {
    const first = significantChanges[0];
    const match = first?.match(/(function|class|const|interface|type)\s+(\w+)/);
    if (match) {
      const [, kind, name] = match;
      if (patterns.isNewFile) return `add ${kind} ${name}`;
      return `update ${kind} ${name}`;
    }
  }

  // Describe based on files
  if (files.length === 1) {
    const file = files[0]?.split("/").pop() ?? files[0];
    if (patterns.isNewFile) return `add ${file}`;
    if (patterns.isDelete) return `remove ${file}`;
    return `update ${file}`;
  }

  // Multiple files
  if (patterns.isNewFile) return `add ${files.length} files`;
  if (patterns.isDelete) return `remove ${files.length} files`;
  return `update ${files.length} files`;
}

function generateBody(
  analysis: DiffAnalysis,
  relatedMemories: RelatedMemory[],
  relatedIssues: string[],
): string | null {
  const lines: string[] = [];

  // Add context from related memories
  if (relatedMemories.length > 0) {
    const decisions = relatedMemories.filter(
      (m) => m.memory.type === "decision",
    );
    const patterns = relatedMemories.filter((m) => m.memory.type === "pattern");

    if (decisions.length > 0) {
      lines.push("Related decisions:");
      for (const { memory } of decisions.slice(0, 2)) {
        lines.push(`- ${memory.title}`);
      }
      lines.push("");
    }

    if (patterns.length > 0) {
      lines.push("Follows patterns:");
      for (const { memory } of patterns.slice(0, 2)) {
        lines.push(`- ${memory.title}`);
      }
      lines.push("");
    }
  }

  // Add significant code changes
  if (analysis.significantChanges.length > 0) {
    lines.push("Changes:");
    for (const change of analysis.significantChanges.slice(0, 5)) {
      lines.push(`- ${change}`);
    }
    if (analysis.significantChanges.length > 5) {
      lines.push(`- ... and ${analysis.significantChanges.length - 5} more`);
    }
    lines.push("");
  }

  // Add files if multiple
  if (analysis.files.length > 3) {
    lines.push("Files:");
    for (const file of analysis.files.slice(0, 10)) {
      lines.push(`- ${file}`);
    }
    if (analysis.files.length > 10) {
      lines.push(`- ... and ${analysis.files.length - 10} more`);
    }
    lines.push("");
  }

  // Add related issues
  if (relatedIssues.length > 0) {
    lines.push(`Relates to: ${relatedIssues.join(", ")}`);
  }

  const body = lines.join("\n").trim();
  return body.length > 0 ? body : null;
}
