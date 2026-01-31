import type { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { CodeGraphStorage } from "@/database/code-graph";
import type { EmbeddingClient } from "@/embeddings/provider";
import {
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_INCLUDE_PATTERNS,
  discoverFiles,
} from "@/utils";
import type { VectorStore } from "@/vectors";
import { ChangeDetector } from "./change-detector";
import { IncrementalScanner } from "./incremental-scanner";
import { runScipScan } from "./scip-scanner";
import { CodeSummarizer } from "./summarizer";
import type { IncrementalScanResult } from "./types";
import { CodeWatcher } from "./watcher";

export const ScanCodeInputSchema = z.object({
  patterns: z
    .array(z.string())
    .optional()
    .describe("Glob patterns to scan (default: **/*.{ts,tsx,js,jsx,py,go,rs})"),
  exclude: z
    .array(z.string())
    .optional()
    .describe("Patterns to exclude (default: node_modules, .git, dist, etc.)"),
  incremental: z
    .boolean()
    .default(true)
    .describe("Only scan changed files (true) or full scan (false)"),
  watch: z
    .boolean()
    .default(false)
    .describe("Start file watcher for continuous updates"),
  extractSummaries: z
    .boolean()
    .default(true)
    .describe("Extract summaries from JSDoc/docstrings"),
  batchSize: z
    .number()
    .default(50)
    .describe("Number of files to process per batch (default: 50)"),
  maxFiles: z
    .number()
    .optional()
    .describe("Maximum files to scan (for testing on huge repos)"),
  projectPath: z
    .string()
    .optional()
    .describe("Project root path to scan (default: current working directory)"),
  useScip: z
    .boolean()
    .default(true)
    .describe(
      "Use SCIP indexer for compiler-accurate analysis (default: true for TS/JS projects)",
    ),
});

export type ScanCodeInput = z.infer<typeof ScanCodeInputSchema>;

// Global watcher instance
let globalWatcher: CodeWatcher | null = null;

export async function scanCode(
  input: ScanCodeInput,
  db: Database,
  vectorStore?: VectorStore,
  embeddings?: EmbeddingClient,
): Promise<{
  result: IncrementalScanResult | null;
  watcherStarted: boolean;
  message: string;
}> {
  const codeGraph = new CodeGraphStorage(db);
  const rootDir = input.projectPath || process.cwd();

  console.log(`[scan] Scanning project at: ${rootDir}`);

  // Check if SCIP should be used (TypeScript/JavaScript project with tsconfig or package.json)
  const useScip =
    input.useScip !== false &&
    (existsSync(join(rootDir, "tsconfig.json")) ||
      existsSync(join(rootDir, "package.json")));

  if (useScip) {
    console.log("[scan] Using SCIP for compiler-accurate analysis");
    const result = await runScipScan(
      rootDir,
      codeGraph,
      vectorStore,
      embeddings,
    );

    // Start watcher if requested (legacy watcher for now)
    let watcherStarted = false;
    if (input.watch && !globalWatcher) {
      const changeDetector = new ChangeDetector(db);
      const summarizer = input.extractSummaries
        ? new CodeSummarizer({ enabled: true })
        : undefined;
      const scanner = new IncrementalScanner(
        changeDetector,
        codeGraph,
        summarizer,
        vectorStore,
        embeddings,
      );
      const patterns = input.patterns || [...DEFAULT_INCLUDE_PATTERNS];
      const exclude = input.exclude || [...DEFAULT_EXCLUDE_PATTERNS];
      globalWatcher = new CodeWatcher(scanner);
      await globalWatcher.start({ patterns, exclude });
      watcherStarted = true;
    }

    const message = `SCIP scan complete. Nodes: +${result.stats.nodesAdded}. Edges: +${result.stats.edgesAdded}. Files: ${result.stats.filesScanned}.${watcherStarted ? " File watcher started." : ""}`;
    return { result, watcherStarted, message };
  }

  // Legacy file-by-file scanning (for non-TS projects or when SCIP is disabled)
  console.log("[scan] Using legacy file-by-file scanner");
  const changeDetector = new ChangeDetector(db);
  const summarizer = input.extractSummaries
    ? new CodeSummarizer({ enabled: true })
    : undefined;
  const scanner = new IncrementalScanner(
    changeDetector,
    codeGraph,
    summarizer,
    vectorStore,
    embeddings,
  );

  // Discover files using native glob
  const patterns = input.patterns || [...DEFAULT_INCLUDE_PATTERNS];
  const exclude = input.exclude || [...DEFAULT_EXCLUDE_PATTERNS];

  let files = await discoverFiles({
    include: patterns,
    exclude,
    cwd: rootDir,
    debug: process.env.DOCLEA_DEBUG === "true",
  });

  // Apply maxFiles limit if specified
  if (input.maxFiles && files.length > input.maxFiles) {
    console.log(
      `[scan] Limiting to ${input.maxFiles} files (found ${files.length})`,
    );
    files = files.slice(0, input.maxFiles);
  }

  const batchSize = input.batchSize || 50;
  const totalFiles = files.length;

  console.log(
    `[scan] Found ${totalFiles} files, processing in batches of ${batchSize}`,
  );

  // Aggregate stats across all batches
  const aggregatedStats = {
    filesScanned: 0,
    nodesAdded: 0,
    nodesUpdated: 0,
    nodesDeleted: 0,
    edgesAdded: 0,
    edgesDeleted: 0,
    documentsUpdated: 0,
    embeddingsRegenerated: 0,
  };

  // Process files in batches to prevent timeout
  for (let i = 0; i < files.length; i += batchSize) {
    const batchFiles = files.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(files.length / batchSize);

    console.log(
      `[scan] Processing batch ${batchNum}/${totalBatches} (${batchFiles.length} files)`,
    );

    // Read file contents for this batch only
    const fileData = batchFiles
      .map((path) => {
        try {
          return { path, content: readFileSync(path, "utf-8") };
        } catch (error) {
          console.warn(`[scan] Failed to read ${path}:`, error);
          return null;
        }
      })
      .filter((f): f is { path: string; content: string } => f !== null);

    // Scan this batch with error handling
    let batchResult: IncrementalScanResult;
    try {
      batchResult = input.incremental
        ? await scanner.scanIncremental(fileData)
        : await fullScan(scanner, fileData);
    } catch (error) {
      console.error(`[scan] Batch ${batchNum} failed:`, error);
      continue; // Skip failed batch and continue with next
    }

    // Aggregate stats
    aggregatedStats.filesScanned += batchResult.stats.filesScanned;
    aggregatedStats.nodesAdded += batchResult.stats.nodesAdded;
    aggregatedStats.nodesUpdated += batchResult.stats.nodesUpdated;
    aggregatedStats.nodesDeleted += batchResult.stats.nodesDeleted;
    aggregatedStats.edgesAdded += batchResult.stats.edgesAdded;
    aggregatedStats.edgesDeleted += batchResult.stats.edgesDeleted;
    aggregatedStats.documentsUpdated += batchResult.stats.documentsUpdated;
    aggregatedStats.embeddingsRegenerated +=
      batchResult.stats.embeddingsRegenerated;

    // Log progress
    const progress = Math.round(((i + batchFiles.length) / totalFiles) * 100);
    console.log(
      `[scan] Progress: ${progress}% (${aggregatedStats.nodesAdded} nodes added)`,
    );
  }

  // Start watcher if requested
  let watcherStarted = false;
  if (input.watch && !globalWatcher) {
    globalWatcher = new CodeWatcher(scanner);
    await globalWatcher.start({
      patterns,
      exclude,
    });
    watcherStarted = true;
  }

  const message = `Scanned ${aggregatedStats.filesScanned} files. Nodes: +${aggregatedStats.nodesAdded} ~${aggregatedStats.nodesUpdated} -${aggregatedStats.nodesDeleted}. Edges: +${aggregatedStats.edgesAdded} -${aggregatedStats.edgesDeleted}.${watcherStarted ? " File watcher started." : ""}`;

  return {
    result: { changes: [], stats: aggregatedStats },
    watcherStarted,
    message,
  };
}

export async function stopCodeWatch(): Promise<{ message: string }> {
  if (globalWatcher) {
    await globalWatcher.stop();
    globalWatcher = null;
    return { message: "File watcher stopped" };
  }
  return { message: "No file watcher running" };
}

async function fullScan(
  scanner: IncrementalScanner,
  files: Array<{ path: string; content: string }>,
): Promise<IncrementalScanResult> {
  // For full scan, treat all files as "added"
  return scanner.scanIncremental(files);
}
