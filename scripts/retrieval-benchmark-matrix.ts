import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { resetContextCache } from "../src/caching/context-cache";
import type { ContextCacheConfig } from "../src/caching/types";
import { loadConfigWithAutoDetect } from "../src/config";
import {
  CachedEmbeddingClient,
  createEmbeddingClient,
} from "../src/embeddings/provider";
import { createStorageBackend } from "../src/storage/factory";
import type { IStorageBackend } from "../src/storage/interface";
import { benchmarkContextRetrieval } from "../src/tools/context";
import { createVectorStore } from "../src/vectors";

const DEFAULT_QUERIES = [
  "How do I configure Doclea storage backend and vector provider?",
  "How does zero config setup work and where is config generated?",
  "What is the implementation plan for Doclea MCP?",
  "Explain retrieval quality gate and benchmark history workflows",
  "What does the vector search architecture look like?",
  "What retrieval strategies are recommended for large codebases?",
  "How is data stored and what are the storage components?",
  "Summarize the API tool categories and what each group does",
  "What are the key troubleshooting steps when Doclea setup fails?",
  "What are the most important frequently asked questions for Doclea users?",
  "How does detectProjectStack() determine project technologies?",
  "What does analyzeDockerConfig() inspect?",
];

const ScenarioSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  includeCodeGraph: z.boolean(),
  includeGraphRAG: z.boolean(),
  template: z.enum(["default", "compact", "detailed"]).optional(),
});

type Scenario = z.infer<typeof ScenarioSchema>;

const DEFAULT_SCENARIOS: Scenario[] = [
  {
    id: "memory_only",
    label: "Memory Only (RAG)",
    includeCodeGraph: false,
    includeGraphRAG: false,
  },
  {
    id: "code_only",
    label: "Code Graph + RAG",
    includeCodeGraph: true,
    includeGraphRAG: false,
  },
  {
    id: "graph_only",
    label: "GraphRAG + RAG",
    includeCodeGraph: false,
    includeGraphRAG: true,
  },
  {
    id: "full",
    label: "MCP Full (RAG + KAG + GraphRAG)",
    includeCodeGraph: true,
    includeGraphRAG: true,
  },
];

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

function parseScenarios(): Scenario[] {
  const raw = process.env.DOCLEA_BENCH_MATRIX_SCENARIOS_JSON;
  if (!raw) {
    return DEFAULT_SCENARIOS;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return DEFAULT_SCENARIOS;
    }
    const scenarios = z.array(ScenarioSchema).parse(parsed);
    return scenarios.length > 0 ? scenarios : DEFAULT_SCENARIOS;
  } catch {
    return DEFAULT_SCENARIOS;
  }
}

function parseQueriesFromFixture(input: unknown): string[] {
  if (!input || typeof input !== "object") {
    return [];
  }
  const object = input as Record<string, unknown>;
  if (!Array.isArray(object.queries)) {
    return [];
  }

  const queries = object.queries
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }
      if (entry && typeof entry === "object") {
        const candidate = entry as Record<string, unknown>;
        if (typeof candidate.query === "string") {
          return candidate.query.trim();
        }
      }
      return "";
    })
    .filter((query): query is string => query.length > 0);

  return queries;
}

function parseQueries(): string[] {
  const rawJson = process.env.DOCLEA_BENCH_QUERIES_JSON;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((entry) => typeof entry === "string" && entry.length > 0)
      ) {
        return parsed;
      }
    } catch {
      // Fall back to file/default.
    }
  }

  const fixturePath =
    process.env.DOCLEA_BENCH_QUERIES_PATH ??
    "documentation/retrieval/current-app-value-queries.thorough.json";
  const resolved = resolve(fixturePath);
  if (existsSync(resolved)) {
    try {
      const parsed = JSON.parse(readFileSync(resolved, "utf-8"));
      const fixtureQueries = parseQueriesFromFixture(parsed);
      if (fixtureQueries.length > 0) {
        return fixtureQueries;
      }
    } catch {
      // Fall back to default.
    }
  }

  return DEFAULT_QUERIES;
}

function ensureDirectory(path: string): void {
  const directory = dirname(path);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

function withCacheDisabled(
  config: ContextCacheConfig | undefined,
): ContextCacheConfig {
  return {
    enabled: false,
    maxEntries: config?.maxEntries ?? 100,
    ttlMs: config?.ttlMs ?? 300_000,
  };
}

function ratio(current: number, baseline: number): number {
  const safeBaseline = Math.max(0.01, baseline);
  return Number((current / safeBaseline).toFixed(3));
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

  const queries = parseQueries();
  const scenarios = parseScenarios();
  const runsPerQuery = parseIntEnv("DOCLEA_BENCH_RUNS_PER_QUERY", 2);
  const warmupRuns = parseIntEnv("DOCLEA_BENCH_WARMUP_RUNS", 0);
  const tokenBudget = parseIntEnv("DOCLEA_BENCH_TOKEN_BUDGET", 4000);
  const template =
    (process.env.DOCLEA_BENCH_TEMPLATE as "default" | "compact" | "detailed") ??
    "compact";
  const clearCacheFirst = parseBoolEnv("DOCLEA_BENCH_CLEAR_CACHE_FIRST", true);
  const clearCacheBetweenScenarios = parseBoolEnv(
    "DOCLEA_BENCH_CLEAR_CACHE_BETWEEN_SCENARIOS",
    true,
  );
  const disableCache = parseBoolEnv("DOCLEA_BENCH_DISABLE_CACHE", true);
  const baselineScenarioId =
    process.env.DOCLEA_BENCH_BASELINE_SCENARIO_ID ?? "memory_only";
  const outputPath = resolve(
    process.env.DOCLEA_BENCH_MATRIX_OUTPUT_PATH ??
      ".doclea/reports/retrieval-benchmark.component-matrix.uncached.json",
  );

  const cacheConfig = disableCache
    ? withCacheDisabled(config.cache)
    : config.cache;
  const scenarioResults: Record<
    string,
    {
      id: string;
      label: string;
      includeCodeGraph: boolean;
      includeGraphRAG: boolean;
      template: "default" | "compact" | "detailed";
      result: Awaited<ReturnType<typeof benchmarkContextRetrieval>>;
    }
  > = {};

  try {
    for (const [index, scenario] of scenarios.entries()) {
      if (clearCacheBetweenScenarios || index === 0) {
        resetContextCache();
      }

      const result = await benchmarkContextRetrieval(
        {
          queries,
          runsPerQuery,
          warmupRuns,
          tokenBudget,
          includeCodeGraph: scenario.includeCodeGraph,
          includeGraphRAG: scenario.includeGraphRAG,
          template: scenario.template ?? template,
          clearCacheFirst,
          compareAgainstMemoryOnly: false,
        },
        storage,
        vectors,
        embeddings,
        cacheConfig,
        config.scoring,
      );

      scenarioResults[scenario.id] = {
        id: scenario.id,
        label: scenario.label ?? scenario.id,
        includeCodeGraph: scenario.includeCodeGraph,
        includeGraphRAG: scenario.includeGraphRAG,
        template: scenario.template ?? template,
        result,
      };
    }

    const baseline = scenarioResults[baselineScenarioId];
    const comparisonsVsBaseline = baseline
      ? Object.values(scenarioResults)
          .filter((scenario) => scenario.id !== baseline.id)
          .map((scenario) => {
            const stageDeltas = scenario.result.stages.map((stage) => {
              const baselineStage = baseline.result.stages.find(
                (candidate) => candidate.stage === stage.stage,
              );
              const baselineP95 = baselineStage?.p95 ?? 0;
              return {
                stage: stage.stage,
                currentP95: stage.p95,
                baselineP95,
                deltaMs: Number((stage.p95 - baselineP95).toFixed(3)),
                ratio: ratio(stage.p95, baselineP95),
              };
            });

            return {
              scenarioId: scenario.id,
              scenarioLabel: scenario.label,
              baselineId: baseline.id,
              baselineLabel: baseline.label,
              overall: {
                currentP50: scenario.result.overall.p50,
                baselineP50: baseline.result.overall.p50,
                p50DeltaMs: Number(
                  (
                    scenario.result.overall.p50 - baseline.result.overall.p50
                  ).toFixed(3),
                ),
                p50Ratio: ratio(
                  scenario.result.overall.p50,
                  baseline.result.overall.p50,
                ),
                currentP95: scenario.result.overall.p95,
                baselineP95: baseline.result.overall.p95,
                p95DeltaMs: Number(
                  (
                    scenario.result.overall.p95 - baseline.result.overall.p95
                  ).toFixed(3),
                ),
                p95Ratio: ratio(
                  scenario.result.overall.p95,
                  baseline.result.overall.p95,
                ),
              },
              stageP95Deltas: stageDeltas,
            };
          })
      : [];

    const output = {
      generatedAt: new Date().toISOString(),
      projectPath,
      queryCount: queries.length,
      runsPerQuery,
      warmupRuns,
      tokenBudget,
      template,
      cache: {
        disabled: disableCache,
        clearCacheFirst,
        clearCacheBetweenScenarios,
      },
      baselineScenarioId: baselineScenarioId,
      scenarios: scenarioResults,
      comparisonsVsBaseline,
    };

    ensureDirectory(outputPath);
    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf-8");

    console.log(
      JSON.stringify(
        {
          outputPath,
          queryCount: output.queryCount,
          runsPerQuery: output.runsPerQuery,
          warmupRuns: output.warmupRuns,
          cache: output.cache,
          scenarios: Object.values(output.scenarios).map((scenario) => ({
            id: scenario.id,
            label: scenario.label,
            p50Ms: scenario.result.overall.p50,
            p95Ms: scenario.result.overall.p95,
            hitRate: scenario.result.cache.hitRate,
          })),
          comparisonsVsBaseline: output.comparisonsVsBaseline.map(
            (comparison) => ({
              scenarioId: comparison.scenarioId,
              p95DeltaMs: comparison.overall.p95DeltaMs,
              p95Ratio: comparison.overall.p95Ratio,
            }),
          ),
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
