import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { resetContextCache } from "../src/caching/context-cache";
import { loadConfigWithAutoDetect } from "../src/config";
import {
  CachedEmbeddingClient,
  createEmbeddingClient,
} from "../src/embeddings/provider";
import { createStorageBackend } from "../src/storage/factory";
import type { IStorageBackend } from "../src/storage/interface";
import {
  buildContextWithCache,
  type ContextEvidenceItem,
} from "../src/tools/context";
import { createVectorStore } from "../src/vectors";

type BenchmarkMode = "memory_only" | "mcp_full";

const AccessCodeFixtureSchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  expectedFilePaths: z.array(z.string().min(1)).min(1),
});

type AccessCodeFixture = z.infer<typeof AccessCodeFixtureSchema>;

interface AccessCodeRun {
  mode: BenchmarkMode;
  latencyMs: number;
  fileRecall: number;
  fileRecallIndexed: number;
  filePrecision: number;
  matchedFiles: string[];
  missingFiles: string[];
  retrievedTopK: string[];
}

interface AccessCodeModeSummary {
  mode: BenchmarkMode;
  runs: number;
  latencyMs: {
    avg: number;
    p50: number;
    p95: number;
  };
  quality: {
    fileRecallAvg: number;
    fileRecallIndexedAvg: number;
    filePrecisionAvg: number;
    matchedFiles: string[];
    missingFiles: string[];
    retrievedTopK: string[];
  };
}

interface AccessCodeBenchmarkReport {
  generatedAt: string;
  projectPath: string;
  fixturePath: string;
  queryId: string;
  query: string;
  recallK: number;
  tokenBudget: number;
  expectedFilePaths: string[];
  indexCoverage: {
    expectedCount: number;
    indexedExpectedCount: number;
    coverage: number;
    missingFromIndex: string[];
  };
  modes: AccessCodeModeSummary[];
  runs: AccessCodeRun[];
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.toLowerCase() === "true";
}

function toFixedNumber(value: number, decimals = 4): number {
  return Number(value.toFixed(decimals));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return toFixedNumber(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return toFixedNumber(sorted[index] ?? 0);
}

function ensureDirectory(path: string): void {
  const directory = dirname(path);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

function normalizeFilePath(path: string, projectPath: string): string {
  const normalizedProject = projectPath
    .replaceAll("\\", "/")
    .replace(/\/+$/, "");
  let normalized = path.replaceAll("\\", "/").trim();

  if (normalized.startsWith(`${normalizedProject}/`)) {
    normalized = normalized.slice(normalizedProject.length + 1);
  }

  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }

  return normalized.toLowerCase();
}

function collectTopKFiles(
  evidence: ContextEvidenceItem[],
  recallK: number,
  projectPath: string,
): Set<string> {
  const ranked = evidence
    .filter((item) => item.rank > 0)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, Math.max(1, recallK));

  const files = new Set<string>();

  for (const item of ranked) {
    if (item.code?.filePath) {
      files.add(normalizeFilePath(item.code.filePath, projectPath));
    }

    if (item.memory?.relatedFiles && item.memory.relatedFiles.length > 0) {
      for (const relatedFile of item.memory.relatedFiles) {
        const normalized = normalizeFilePath(relatedFile, projectPath);
        if (normalized.length > 0) {
          files.add(normalized);
        }
      }
    }
  }

  return files;
}

function scoreRetrievedFiles(expected: Set<string>, retrieved: Set<string>) {
  const matched = new Set<string>();
  const missing = new Set<string>();

  for (const expectedPath of expected) {
    if (retrieved.has(expectedPath)) {
      matched.add(expectedPath);
    } else {
      missing.add(expectedPath);
    }
  }

  const recall =
    expected.size === 0 ? 1 : toFixedNumber(matched.size / expected.size, 4);
  const precision =
    retrieved.size === 0
      ? expected.size === 0
        ? 1
        : 0
      : toFixedNumber(matched.size / retrieved.size, 4);

  return {
    fileRecall: recall,
    filePrecision: precision,
    matchedFiles: Array.from(matched).sort((left, right) =>
      left.localeCompare(right),
    ),
    missingFiles: Array.from(missing).sort((left, right) =>
      left.localeCompare(right),
    ),
    retrievedTopK: Array.from(retrieved).sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

function summarizeMode(
  mode: BenchmarkMode,
  runs: AccessCodeRun[],
): AccessCodeModeSummary {
  const modeRuns = runs.filter((run) => run.mode === mode);
  const bestRun = [...modeRuns].sort((left, right) => {
    if (right.fileRecall !== left.fileRecall) {
      return right.fileRecall - left.fileRecall;
    }
    return right.filePrecision - left.filePrecision;
  })[0];

  return {
    mode,
    runs: modeRuns.length,
    latencyMs: {
      avg: average(modeRuns.map((run) => run.latencyMs)),
      p50: percentile(
        modeRuns.map((run) => run.latencyMs),
        50,
      ),
      p95: percentile(
        modeRuns.map((run) => run.latencyMs),
        95,
      ),
    },
    quality: {
      fileRecallAvg: average(modeRuns.map((run) => run.fileRecall)),
      fileRecallIndexedAvg: average(
        modeRuns.map((run) => run.fileRecallIndexed),
      ),
      filePrecisionAvg: average(modeRuns.map((run) => run.filePrecision)),
      matchedFiles: bestRun?.matchedFiles ?? [],
      missingFiles: bestRun?.missingFiles ?? [],
      retrievedTopK: bestRun?.retrievedTopK ?? [],
    },
  };
}

function resolveIndexedExpectedFiles(
  storage: IStorageBackend,
  projectPath: string,
  expectedFilePaths: string[],
): Set<string> {
  if (typeof (storage as Partial<IStorageBackend>).getDatabase !== "function") {
    return new Set(expectedFilePaths);
  }

  try {
    const db = storage.getDatabase();
    const existsQuery = db.query(
      "SELECT 1 FROM code_nodes WHERE file_path = ? LIMIT 1",
    );
    const indexed = new Set<string>();

    for (const relativePath of expectedFilePaths) {
      const absolutePath = `${projectPath}/${relativePath}`;
      const found = existsQuery.get(absolutePath) as unknown;
      if (found) {
        indexed.add(relativePath);
      }
    }

    return indexed;
  } catch {
    return new Set(expectedFilePaths);
  }
}

function loadFixture(projectPath: string): {
  fixturePath: string;
  fixture: AccessCodeFixture;
} {
  const fixturePath = process.env.DOCLEA_ACCESS_FIXTURE_PATH
    ? resolve(process.env.DOCLEA_ACCESS_FIXTURE_PATH)
    : resolve(projectPath, ".doclea/access-code-file-benchmark.json");

  if (!existsSync(fixturePath)) {
    throw new Error(
      `Missing access code fixture at ${fixturePath}. Provide DOCLEA_ACCESS_FIXTURE_PATH or create .doclea/access-code-file-benchmark.json.`,
    );
  }

  const parsed = JSON.parse(readFileSync(fixturePath, "utf-8"));
  return {
    fixturePath,
    fixture: AccessCodeFixtureSchema.parse(parsed),
  };
}

async function main(): Promise<void> {
  const projectPath = resolve(
    process.env.DOCLEA_BENCH_PROJECT_PATH ?? process.cwd(),
  );
  const { fixturePath, fixture } = loadFixture(projectPath);
  const config = await loadConfigWithAutoDetect(projectPath);

  const storage = createStorageBackend(config.storage, projectPath);
  await storage.initialize();

  const vectors = createVectorStore(config.vector, projectPath);
  await vectors.initialize();

  const baseEmbeddings = createEmbeddingClient(config.embedding);
  const modelName =
    config.embedding.provider === "local"
      ? "local-tei"
      : config.embedding.model;
  const embeddings = new CachedEmbeddingClient(
    baseEmbeddings,
    storage,
    modelName,
  );

  const runsPerMode = parseIntEnv("DOCLEA_ACCESS_RUNS_PER_MODE", 6);
  const warmupRuns = parseIntEnv("DOCLEA_ACCESS_WARMUP_RUNS", 1);
  const tokenBudget = parseIntEnv("DOCLEA_ACCESS_TOKEN_BUDGET", 32000);
  const recallK = parseIntEnv("DOCLEA_ACCESS_RECALL_K", 10);
  const clearCacheBeforeRun = parseBoolEnv(
    "DOCLEA_ACCESS_CLEAR_CACHE_BEFORE_RUN",
    false,
  );
  const template =
    (process.env.DOCLEA_ACCESS_TEMPLATE as
      | "default"
      | "compact"
      | "detailed") || "compact";

  const expectedFilePaths = fixture.expectedFilePaths.map((path) =>
    normalizeFilePath(path, projectPath),
  );
  const expectedFileSet = new Set<string>(expectedFilePaths);
  const indexedExpectedFileSet = resolveIndexedExpectedFiles(
    storage,
    projectPath,
    expectedFilePaths,
  );
  const modes: BenchmarkMode[] = ["memory_only", "mcp_full"];
  const runs: AccessCodeRun[] = [];

  try {
    for (const mode of modes) {
      const includeCodeGraph = mode === "mcp_full";
      const includeGraphRAG = mode === "mcp_full";

      const input = {
        query: fixture.query,
        tokenBudget,
        includeCodeGraph,
        includeGraphRAG,
        includeEvidence: true,
        template,
      } as const;

      for (let warmup = 0; warmup < warmupRuns; warmup++) {
        if (clearCacheBeforeRun) {
          resetContextCache();
        }
        await buildContextWithCache(
          input,
          storage,
          vectors,
          embeddings,
          config.cache,
          config.scoring,
        );
      }

      for (let runIndex = 0; runIndex < runsPerMode; runIndex++) {
        if (clearCacheBeforeRun) {
          resetContextCache();
        }

        const startedAt = performance.now();
        const result = await buildContextWithCache(
          input,
          storage,
          vectors,
          embeddings,
          config.cache,
          config.scoring,
        );
        const latencyMs = toFixedNumber(performance.now() - startedAt, 4);
        const retrievedFiles = collectTopKFiles(
          result.evidence ?? [],
          recallK,
          projectPath,
        );
        const score = scoreRetrievedFiles(expectedFileSet, retrievedFiles);
        const indexedScore = scoreRetrievedFiles(
          indexedExpectedFileSet,
          retrievedFiles,
        );

        runs.push({
          mode,
          latencyMs,
          fileRecall: score.fileRecall,
          fileRecallIndexed: indexedScore.fileRecall,
          filePrecision: score.filePrecision,
          matchedFiles: score.matchedFiles,
          missingFiles: score.missingFiles,
          retrievedTopK: score.retrievedTopK,
        });
      }
    }

    const report: AccessCodeBenchmarkReport = {
      generatedAt: new Date().toISOString(),
      projectPath,
      fixturePath,
      queryId: fixture.id,
      query: fixture.query,
      recallK,
      tokenBudget,
      expectedFilePaths: Array.from(expectedFileSet).sort((left, right) =>
        left.localeCompare(right),
      ),
      indexCoverage: {
        expectedCount: expectedFileSet.size,
        indexedExpectedCount: indexedExpectedFileSet.size,
        coverage: toFixedNumber(
          indexedExpectedFileSet.size / Math.max(1, expectedFileSet.size),
          4,
        ),
        missingFromIndex: Array.from(expectedFileSet)
          .filter((path) => !indexedExpectedFileSet.has(path))
          .sort((left, right) => left.localeCompare(right)),
      },
      modes: modes.map((mode) => summarizeMode(mode, runs)),
      runs,
    };

    const outputPath = resolve(
      process.env.DOCLEA_ACCESS_REPORT_JSON_PATH ??
        `${projectPath}/.doclea/reports/access-code-file-benchmark.json`,
    );
    ensureDirectory(outputPath);
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

    console.log(
      JSON.stringify(
        {
          reportPath: outputPath,
          queryId: report.queryId,
          expectedFileCount: report.expectedFilePaths.length,
          modes: report.modes.map((mode) => ({
            mode: mode.mode,
            runs: mode.runs,
            p95Ms: mode.latencyMs.p95,
            fileRecallAvg: mode.quality.fileRecallAvg,
            fileRecallIndexedAvg: mode.quality.fileRecallIndexedAvg,
            filePrecisionAvg: mode.quality.filePrecisionAvg,
            matchedFiles: mode.quality.matchedFiles.length,
            missingFiles: mode.quality.missingFiles.length,
          })),
          indexCoverage: report.indexCoverage,
        },
        null,
        2,
      ),
    );
  } finally {
    if (typeof vectors.close === "function") {
      vectors.close();
    }
    storage.close();
  }
}

await main();
