import { loadConfigWithAutoDetect } from "../src/config";
import {
  CachedEmbeddingClient,
  createEmbeddingClient,
} from "../src/embeddings/provider";
import { createStorageBackend } from "../src/storage/factory";
import type { IStorageBackend } from "../src/storage/interface";
import {
  benchmarkContextRetrieval,
  type ContextStageName,
  type RetrievalBenchmarkInput,
} from "../src/tools/context";
import {
  appendHistoryRecord,
  compareHistoryRecords,
  createHistoryRecord,
  findBaselineRecord,
  loadHistoryRecords,
} from "../src/tools/context-benchmark-history";
import { createVectorStore } from "../src/vectors";

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalFloatEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.toLowerCase() === "true";
}

function runGitCommand(args: string[]): string | undefined {
  try {
    const command = Bun.spawnSync({
      cmd: ["git", ...args],
      stdout: "pipe",
      stderr: "ignore",
    });
    if (command.exitCode !== 0) {
      return undefined;
    }
    const output = new TextDecoder().decode(command.stdout).trim();
    return output.length > 0 ? output : undefined;
  } catch {
    return undefined;
  }
}

function resolveCommitSha(): string {
  return (
    process.env.DOCLEA_PERF_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    runGitCommand(["rev-parse", "HEAD"]) ||
    "unknown"
  );
}

function resolveBranchName(): string {
  const githubRef = process.env.GITHUB_REF_NAME?.trim();
  if (githubRef && githubRef.length > 0) {
    return githubRef;
  }

  return (
    process.env.DOCLEA_PERF_BRANCH?.trim() ||
    runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"]) ||
    "unknown"
  );
}

function parseQueriesEnv(): string[] | undefined {
  const raw = process.env.DOCLEA_PERF_QUERIES_JSON;
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((q) => typeof q === "string" && q.length > 0)
    ) {
      return parsed;
    }
  } catch {
    // fall through
  }

  console.warn(
    "[doclea] Invalid DOCLEA_PERF_QUERIES_JSON; expected JSON string array.",
  );
  return undefined;
}

const CONTEXT_STAGE_NAMES: ContextStageName[] = [
  "rag",
  "kag",
  "graphrag",
  "rerank",
  "format",
  "tokenize",
  "evidence",
  "total",
];

const STAGE_ENV_BY_NAME: Record<ContextStageName, string> = {
  rag: "DOCLEA_PERF_GATE_MAX_RAG_P95_MS",
  kag: "DOCLEA_PERF_GATE_MAX_KAG_P95_MS",
  graphrag: "DOCLEA_PERF_GATE_MAX_GRAPHRAG_P95_MS",
  rerank: "DOCLEA_PERF_GATE_MAX_RERANK_P95_MS",
  format: "DOCLEA_PERF_GATE_MAX_FORMAT_P95_MS",
  tokenize: "DOCLEA_PERF_GATE_MAX_TOKENIZE_P95_MS",
  evidence: "DOCLEA_PERF_GATE_MAX_EVIDENCE_P95_MS",
  total: "DOCLEA_PERF_GATE_MAX_TOTAL_STAGE_P95_MS",
};

function isContextStageName(value: string): value is ContextStageName {
  return CONTEXT_STAGE_NAMES.includes(value as ContextStageName);
}

function parseStageThresholdsEnv(): Partial<Record<ContextStageName, number>> {
  const thresholds: Partial<Record<ContextStageName, number>> = {};

  const jsonRaw = process.env.DOCLEA_PERF_GATE_STAGE_P95_MS_JSON;
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          if (!isContextStageName(key)) {
            continue;
          }
          const numeric =
            typeof value === "number"
              ? value
              : Number.parseFloat(String(value));
          if (Number.isFinite(numeric) && numeric > 0) {
            thresholds[key] = numeric;
          }
        }
      } else {
        console.warn(
          "[doclea] DOCLEA_PERF_GATE_STAGE_P95_MS_JSON must be a JSON object.",
        );
      }
    } catch {
      console.warn(
        "[doclea] Invalid DOCLEA_PERF_GATE_STAGE_P95_MS_JSON; expected JSON object keyed by stage name.",
      );
    }
  }

  for (const stage of CONTEXT_STAGE_NAMES) {
    const envName = STAGE_ENV_BY_NAME[stage];
    const raw = process.env[envName];
    if (!raw) {
      continue;
    }
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      thresholds[stage] = parsed;
    } else {
      console.warn(`[doclea] Ignoring invalid ${envName}=${raw}`);
    }
  }

  return thresholds;
}

async function main(): Promise<void> {
  const projectPath = process.cwd();
  const config = await loadConfigWithAutoDetect(projectPath);

  const storage: IStorageBackend = createStorageBackend(
    config.storage,
    projectPath,
  );
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

  const runsPerQuery = parseIntEnv("DOCLEA_PERF_RUNS_PER_QUERY", 3);
  const warmupRuns = parseIntEnv("DOCLEA_PERF_WARMUP_RUNS", 1);
  const tokenBudget = parseIntEnv("DOCLEA_PERF_TOKEN_BUDGET", 4000);
  const maxP95Ms = parseIntEnv("DOCLEA_PERF_GATE_MAX_P95_MS", 400);
  const includeCodeGraph = parseBoolEnv("DOCLEA_PERF_INCLUDE_CODE_GRAPH", true);
  const includeGraphRAG = parseBoolEnv("DOCLEA_PERF_INCLUDE_GRAPHRAG", true);
  const clearCacheFirst = parseBoolEnv("DOCLEA_PERF_CLEAR_CACHE_FIRST", true);
  const compareAgainstMemoryOnly = parseBoolEnv(
    "DOCLEA_PERF_COMPARE_MEMORY_ONLY",
    true,
  );
  const maxP95Ratio = parseFloatEnv("DOCLEA_PERF_GATE_MAX_P95_RATIO", 8);
  const stageThresholds = parseStageThresholdsEnv();
  const queries = parseQueriesEnv();
  const historyEnabled = parseBoolEnv("DOCLEA_PERF_HISTORY_ENABLED", true);
  const historyPath =
    process.env.DOCLEA_PERF_HISTORY_PATH ??
    ".doclea/benchmarks/retrieval-history.jsonl";
  const historyRetention = parseIntEnv("DOCLEA_PERF_HISTORY_RETENTION", 250);
  const historyCompareLookback = parseIntEnv(
    "DOCLEA_PERF_HISTORY_COMPARE_LOOKBACK",
    50,
  );
  const historyCompareSameBranch = parseBoolEnv(
    "DOCLEA_PERF_HISTORY_COMPARE_SAME_BRANCH",
    true,
  );
  const historyCompareSameConfig = parseBoolEnv(
    "DOCLEA_PERF_HISTORY_COMPARE_SAME_CONFIG",
    true,
  );
  const historyRequireBaseline = parseBoolEnv(
    "DOCLEA_PERF_HISTORY_REQUIRE_BASELINE",
    false,
  );
  const historyMaxP95Ratio = parseOptionalFloatEnv(
    "DOCLEA_PERF_HISTORY_MAX_P95_RATIO",
  );
  const historyMaxP95DeltaMs = parseOptionalFloatEnv(
    "DOCLEA_PERF_HISTORY_MAX_P95_DELTA_MS",
  );
  const benchmarkInput: RetrievalBenchmarkInput = {
    queries,
    runsPerQuery,
    warmupRuns,
    tokenBudget,
    includeCodeGraph,
    includeGraphRAG,
    clearCacheFirst,
    compareAgainstMemoryOnly,
    template: "compact",
  };

  try {
    const result = await benchmarkContextRetrieval(
      benchmarkInput,
      storage,
      vectors,
      embeddings,
      config.cache,
      config.scoring,
    );

    console.log(JSON.stringify(result, null, 2));

    if (historyEnabled) {
      const source = process.env.GITHUB_ACTIONS === "true" ? "ci" : "local";
      const historyRecord = createHistoryRecord(result, benchmarkInput, {
        commitSha: resolveCommitSha(),
        branch: resolveBranchName(),
        source,
        projectPath,
      });
      const appendResult = appendHistoryRecord(
        historyPath,
        historyRecord,
        historyRetention,
      );
      console.log(
        `[doclea] Persisted retrieval benchmark history at ${historyPath} (${appendResult.totalRecords} records, pruned ${appendResult.prunedRecords})`,
      );

      const historyRecords = loadHistoryRecords(historyPath);
      const currentRecord =
        historyRecords.find(
          (record) => record.metadata.runId === historyRecord.metadata.runId,
        ) ?? historyRecord;

      const baselineRecord = findBaselineRecord(historyRecords, currentRecord, {
        sameBranch: historyCompareSameBranch,
        sameConfig: historyCompareSameConfig,
        maxLookback: historyCompareLookback,
      });

      if (!baselineRecord) {
        const message =
          "[doclea] No matching retrieval history baseline found for comparison.";
        if (historyRequireBaseline) {
          console.error(message);
          process.exitCode = 1;
          return;
        }
        console.log(message);
      } else {
        const historyComparison = compareHistoryRecords(
          baselineRecord,
          currentRecord,
        );
        console.log(
          `[doclea] History baseline ${baselineRecord.metadata.commitSha.slice(0, 12)} @ ${baselineRecord.metadata.timestamp}`,
        );
        console.log(
          `[doclea] History delta: p95 ${historyComparison.overall.p95DeltaMs}ms (${historyComparison.overall.p95Ratio}x), p50 ${historyComparison.overall.p50DeltaMs}ms, hitRate ${historyComparison.overall.hitRateDelta}%`,
        );

        const regressedStages = historyComparison.stages
          .filter((stage) => stage.deltaMs > 0)
          .sort((left, right) => right.deltaMs - left.deltaMs)
          .slice(0, 3);
        if (regressedStages.length > 0) {
          console.log(
            `[doclea] Stage deltas vs baseline: ${regressedStages
              .map(
                (stage) =>
                  `${stage.stage} +${stage.deltaMs}ms (${stage.ratio}x)`,
              )
              .join(", ")}`,
          );
        }

        if (
          historyMaxP95Ratio !== undefined &&
          historyComparison.overall.p95Ratio > historyMaxP95Ratio
        ) {
          console.error(
            `[doclea] Retrieval perf gate failed: history p95 ratio=${historyComparison.overall.p95Ratio}x exceeds limit ${historyMaxP95Ratio}x`,
          );
          process.exitCode = 1;
          return;
        }

        if (
          historyMaxP95DeltaMs !== undefined &&
          historyComparison.overall.p95DeltaMs > historyMaxP95DeltaMs
        ) {
          console.error(
            `[doclea] Retrieval perf gate failed: history p95 delta=${historyComparison.overall.p95DeltaMs}ms exceeds limit ${historyMaxP95DeltaMs}ms`,
          );
          process.exitCode = 1;
          return;
        }
      }
    }

    if (result.overall.p95 > maxP95Ms) {
      console.error(
        `[doclea] Retrieval perf gate failed: p95=${result.overall.p95}ms exceeds limit ${maxP95Ms}ms`,
      );
      process.exitCode = 1;
      return;
    }

    if (compareAgainstMemoryOnly && result.comparison) {
      const p95Ratio = result.comparison.overhead.ratios.p95;
      if (p95Ratio > maxP95Ratio) {
        console.error(
          `[doclea] Retrieval perf gate failed: p95 slowdown ratio=${p95Ratio}x exceeds limit ${maxP95Ratio}x`,
        );
        process.exitCode = 1;
        return;
      }
    }

    const stageFailures: string[] = [];
    for (const [stage, threshold] of Object.entries(stageThresholds) as Array<
      [ContextStageName, number]
    >) {
      const stageStats = result.stages.find((entry) => entry.stage === stage);
      if (!stageStats) {
        continue;
      }

      if (stageStats.p95 > threshold) {
        stageFailures.push(
          `${stage} p95=${stageStats.p95}ms exceeds ${threshold}ms`,
        );
      }
    }

    if (stageFailures.length > 0) {
      console.error(
        `[doclea] Retrieval perf gate failed: stage p95 limits exceeded\n- ${stageFailures.join("\n- ")}`,
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      `[doclea] Retrieval perf gate passed: p95=${result.overall.p95}ms (limit ${maxP95Ms}ms)`,
    );
    if (compareAgainstMemoryOnly && result.comparison) {
      console.log(
        `[doclea] Memory baseline comparison passed: p95 slowdown=${result.comparison.overhead.ratios.p95}x (limit ${maxP95Ratio}x)`,
      );
    }
    if (Object.keys(stageThresholds).length > 0) {
      console.log(
        `[doclea] Stage latency gates passed for ${Object.keys(stageThresholds).length} configured stage(s)`,
      );
    }
  } finally {
    if (typeof vectors.close === "function") {
      vectors.close();
    }
    storage.close();
  }
}

await main();
