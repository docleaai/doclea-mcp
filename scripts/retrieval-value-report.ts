import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { resetContextCache } from "../src/caching/context-cache";
import { loadConfigWithAutoDetect } from "../src/config";
import {
  CachedEmbeddingClient,
  createEmbeddingClient,
} from "../src/embeddings/provider";
import { GraphRAGStorage } from "../src/graphrag/graph/graphrag-storage";
import { createStorageBackend } from "../src/storage/factory";
import type { IStorageBackend } from "../src/storage/interface";
import { buildContextWithCache } from "../src/tools/context";
import { evaluateGoldenQuery } from "../src/tools/context-quality-gate";
import {
  buildRetrievalValueMarkdownReport,
  createRetrievalValueReport,
  getModeConfig,
  type RetrievalValueMode,
  type RetrievalValueQuery,
  type RetrievalValueRun,
} from "../src/tools/context-value-report";
import { createVectorStore } from "../src/vectors";

const DEFAULT_QUERY_CASES: RetrievalValueQuery[] = [
  {
    id: "q-auth-decisions",
    query: "What are our authentication decisions?",
  },
  {
    id: "q-token-callers",
    query: "What calls validateToken?",
  },
  {
    id: "q-payment-impact",
    query: "What breaks if I change PaymentService?",
  },
  {
    id: "q-cache-architecture",
    query: "Show architecture context for caching strategy",
  },
];

const QueryCaseSchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  expectedMemoryIds: z.array(z.string()).optional(),
  expectedEntityIds: z.array(z.string()).optional(),
  expectedEntityNames: z.array(z.string()).optional(),
  tokenBudget: z.number().int().positive().optional(),
  filters: z
    .object({
      type: z
        .enum(["decision", "solution", "pattern", "architecture", "note"])
        .optional(),
      tags: z.array(z.string()).optional(),
      minImportance: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

const QueryCasesArraySchema = z.array(QueryCaseSchema);

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

function parseModes(): RetrievalValueMode[] {
  const raw = process.env.DOCLEA_VALUE_MODES;
  if (!raw) {
    return ["no_mcp", "memory_only", "mcp_full"];
  }

  const requested = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is RetrievalValueMode =>
      ["no_mcp", "memory_only", "mcp_full"].includes(value),
    );

  return requested.length > 0
    ? Array.from(new Set(requested))
    : ["no_mcp", "memory_only", "mcp_full"];
}

function parseQueriesFromFixture(input: unknown): RetrievalValueQuery[] | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const object = input as Record<string, unknown>;
  const rawQueries = object.queries;
  if (!Array.isArray(rawQueries)) {
    return null;
  }

  const normalized = rawQueries.map((query, index) => {
    if (typeof query === "string") {
      return {
        id: `query-${index + 1}`,
        query,
      };
    }
    if (query && typeof query === "object") {
      const candidate = query as Record<string, unknown>;
      return {
        id:
          typeof candidate.id === "string" && candidate.id.length > 0
            ? candidate.id
            : `query-${index + 1}`,
        query: String(candidate.query ?? ""),
        ...(Array.isArray(candidate.expectedMemoryIds)
          ? {
              expectedMemoryIds: candidate.expectedMemoryIds.map(String),
            }
          : {}),
        ...(Array.isArray(candidate.expectedEntityIds)
          ? {
              expectedEntityIds: candidate.expectedEntityIds.map(String),
            }
          : {}),
        ...(Array.isArray(candidate.expectedEntityNames)
          ? {
              expectedEntityNames: candidate.expectedEntityNames.map(String),
            }
          : {}),
        ...(typeof candidate.tokenBudget === "number"
          ? { tokenBudget: candidate.tokenBudget }
          : {}),
        ...(candidate.filters && typeof candidate.filters === "object"
          ? { filters: candidate.filters }
          : {}),
      };
    }

    return {
      id: `query-${index + 1}`,
      query: String(query),
    };
  });

  return QueryCasesArraySchema.parse(normalized);
}

function parseQueryCases(): RetrievalValueQuery[] {
  const jsonRaw = process.env.DOCLEA_VALUE_QUERIES_JSON;
  if (jsonRaw) {
    const parsed = JSON.parse(jsonRaw);
    if (Array.isArray(parsed)) {
      const normalized = parsed.map((entry, index) => {
        if (typeof entry === "string") {
          return {
            id: `query-${index + 1}`,
            query: entry,
          };
        }
        return {
          id:
            typeof (entry as Record<string, unknown>).id === "string"
              ? ((entry as Record<string, unknown>).id as string)
              : `query-${index + 1}`,
          ...(entry as Record<string, unknown>),
        };
      });

      return QueryCasesArraySchema.parse(normalized);
    }
  }

  const filePath =
    process.env.DOCLEA_VALUE_QUERIES_PATH ??
    "documentation/retrieval/golden-queries.json";
  const resolvedPath = resolve(filePath);

  if (existsSync(resolvedPath)) {
    const parsed = JSON.parse(readFileSync(resolvedPath, "utf-8"));
    const fixtureQueries = parseQueriesFromFixture(parsed);
    if (fixtureQueries && fixtureQueries.length > 0) {
      return fixtureQueries;
    }
  }

  return DEFAULT_QUERY_CASES;
}

function hasExpectations(query: RetrievalValueQuery): boolean {
  return Boolean(
    (query.expectedMemoryIds && query.expectedMemoryIds.length > 0) ||
      (query.expectedEntityIds && query.expectedEntityIds.length > 0) ||
      (query.expectedEntityNames && query.expectedEntityNames.length > 0),
  );
}

function ensureDirectory(path: string): void {
  const directory = dirname(path);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

function loadEntityNameMap(storage: IStorageBackend): Record<string, string> {
  if (typeof (storage as Partial<IStorageBackend>).getDatabase !== "function") {
    return {};
  }

  try {
    const graphStorage = new GraphRAGStorage(storage.getDatabase());
    const entities = graphStorage.listEntities({ limit: 5000 });
    const map: Record<string, string> = {};

    for (const entity of entities) {
      map[entity.id.toLowerCase()] = entity.canonicalName.toLowerCase();
    }

    return map;
  } catch {
    return {};
  }
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

  const recallK = parseIntEnv("DOCLEA_VALUE_RECALL_K", 5);
  const defaultTokenBudget = parseIntEnv("DOCLEA_VALUE_TOKEN_BUDGET", 4000);
  const warmupRuns = parseIntEnv("DOCLEA_VALUE_WARMUP_RUNS", 1);
  const runsPerQuery = parseIntEnv("DOCLEA_VALUE_RUNS_PER_QUERY", 2);
  const clearCacheBeforeQuery = parseBoolEnv(
    "DOCLEA_VALUE_CLEAR_CACHE_BEFORE_QUERY",
    false,
  );
  const clearCacheBeforeRun = parseBoolEnv(
    "DOCLEA_VALUE_CLEAR_CACHE_BEFORE_RUN",
    false,
  );
  const template =
    (process.env.DOCLEA_VALUE_TEMPLATE as "default" | "compact" | "detailed") ||
    "compact";
  const modes = parseModes();
  const queryCases = parseQueryCases();
  const entityNameMap = loadEntityNameMap(storage);

  const runs: RetrievalValueRun[] = [];

  try {
    for (const queryCase of queryCases) {
      for (const mode of modes) {
        if (mode === "no_mcp") {
          for (let runIndex = 0; runIndex < runsPerQuery; runIndex++) {
            const quality = hasExpectations(queryCase)
              ? evaluateGoldenQuery(
                  {
                    id: queryCase.id,
                    query: queryCase.query,
                    expectedMemoryIds: queryCase.expectedMemoryIds,
                    expectedEntityIds: queryCase.expectedEntityIds,
                    expectedEntityNames: queryCase.expectedEntityNames,
                  },
                  [],
                  {
                    recallK,
                    minMemoryRecall: 0,
                    minEntityRecall: 0,
                    minPrecisionAtK: 0,
                  },
                  entityNameMap,
                )
              : undefined;

            runs.push({
              queryId: queryCase.id,
              query: queryCase.query,
              mode,
              latencyMs: 0,
              tokens: 0,
              sectionsIncluded: 0,
              ragSections: 0,
              kagSections: 0,
              graphragSections: 0,
              ...(quality
                ? {
                    quality: {
                      memoryRecall: quality.memory.recall,
                      entityRecall: quality.entity.recall,
                      precisionAtK: quality.precisionAtK,
                    },
                  }
                : {}),
            });
          }
          continue;
        }

        const modeConfig = getModeConfig(mode);
        const input = {
          query: queryCase.query,
          tokenBudget: queryCase.tokenBudget ?? defaultTokenBudget,
          includeCodeGraph: modeConfig.includeCodeGraph,
          includeGraphRAG: modeConfig.includeGraphRAG,
          includeEvidence: true,
          template,
          filters: queryCase.filters,
        } as const;

        if (clearCacheBeforeQuery) {
          resetContextCache();
        }

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

        for (let runIndex = 0; runIndex < runsPerQuery; runIndex++) {
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
          const latencyMs = Number((performance.now() - startedAt).toFixed(4));

          const quality = hasExpectations(queryCase)
            ? evaluateGoldenQuery(
                {
                  id: queryCase.id,
                  query: queryCase.query,
                  expectedMemoryIds: queryCase.expectedMemoryIds,
                  expectedEntityIds: queryCase.expectedEntityIds,
                  expectedEntityNames: queryCase.expectedEntityNames,
                },
                result.evidence ?? [],
                {
                  recallK,
                  minMemoryRecall: 0,
                  minEntityRecall: 0,
                  minPrecisionAtK: 0,
                },
                entityNameMap,
              )
            : undefined;

          runs.push({
            queryId: queryCase.id,
            query: queryCase.query,
            mode,
            latencyMs,
            tokens: result.metadata.totalTokens,
            sectionsIncluded: result.metadata.sectionsIncluded,
            ragSections: result.metadata.ragSections,
            kagSections: result.metadata.kagSections,
            graphragSections: result.metadata.graphragSections,
            route: result.metadata.route,
            ...(quality
              ? {
                  quality: {
                    memoryRecall: quality.memory.recall,
                    entityRecall: quality.entity.recall,
                    precisionAtK: quality.precisionAtK,
                  },
                }
              : {}),
          });
        }
      }
    }

    const report = createRetrievalValueReport({
      projectPath,
      recallK,
      runs,
    });
    const markdown = buildRetrievalValueMarkdownReport(report);
    const retrievedSectionRuns = report.runs.filter(
      (run) => run.mode !== "no_mcp" && run.sectionsIncluded > 0,
    ).length;
    const qualityRuns = report.runs.filter(
      (run) => run.mode !== "no_mcp" && run.quality !== undefined,
    );
    const qualitySignalRuns = qualityRuns.filter(
      (run) =>
        (run.quality?.memoryRecall ?? 0) > 0 ||
        (run.quality?.entityRecall ?? 0) > 0 ||
        (run.quality?.precisionAtK ?? 0) > 0,
    ).length;

    const jsonPath = resolve(
      process.env.DOCLEA_VALUE_REPORT_JSON_PATH ??
        ".doclea/reports/mcp-value-report.json",
    );
    const markdownPath = resolve(
      process.env.DOCLEA_VALUE_REPORT_MD_PATH ??
        ".doclea/reports/mcp-value-report.md",
    );

    ensureDirectory(jsonPath);
    ensureDirectory(markdownPath);

    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
    writeFileSync(markdownPath, `${markdown}\n`, "utf-8");

    console.log(
      JSON.stringify(
        {
          queryCount: report.queryCount,
          warmupRuns,
          runsPerQuery,
          clearCacheBeforeQuery,
          clearCacheBeforeRun,
          modes: report.modes.map((mode) => ({
            mode: mode.mode,
            runs: mode.runs,
            p95Ms: mode.latencyMs.p95,
            memoryRecallAvg: mode.quality?.memoryRecallAvg ?? 0,
            entityRecallAvg: mode.quality?.entityRecallAvg ?? 0,
            precisionAtKAvg: mode.quality?.precisionAtKAvg ?? 0,
          })),
          lifts: report.lifts,
          reportPaths: {
            json: jsonPath,
            markdown: markdownPath,
          },
          warnings: [
            ...(retrievedSectionRuns === 0
              ? [
                  "No MCP retrieval sections were returned in evaluated runs. Scan/index your app knowledge first (memories + code graph + GraphRAG) before using this report for business conclusions.",
                ]
              : []),
            ...(qualityRuns.length > 0 && qualitySignalRuns === 0
              ? [
                  "Expectation-based quality metrics are all zero. Query expectations likely do not match the current app dataset.",
                ]
              : []),
          ],
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
