import type { BuildContextInput, ContextRoute } from "./context";

export type RetrievalValueMode = "no_mcp" | "memory_only" | "mcp_full";

export interface RetrievalValueQuery {
  id: string;
  query: string;
  expectedMemoryIds?: string[];
  expectedEntityIds?: string[];
  expectedEntityNames?: string[];
  tokenBudget?: number;
  filters?: BuildContextInput["filters"];
}

export interface RetrievalValueQuality {
  memoryRecall: number;
  entityRecall: number;
  precisionAtK: number;
}

export interface RetrievalValueRun {
  queryId: string;
  query: string;
  mode: RetrievalValueMode;
  latencyMs: number;
  tokens: number;
  sectionsIncluded: number;
  ragSections: number;
  kagSections: number;
  graphragSections: number;
  route?: ContextRoute;
  quality?: RetrievalValueQuality;
}

export interface RetrievalValueModeSummary {
  mode: RetrievalValueMode;
  runs: number;
  latencyMs: {
    avg: number;
    p50: number;
    p95: number;
  };
  tokens: {
    avg: number;
  };
  sections: {
    avgIncluded: number;
    rag: number;
    kag: number;
    graphrag: number;
  };
  quality?: {
    memoryRecallAvg: number;
    entityRecallAvg: number;
    precisionAtKAvg: number;
    queriesWithExpectations: number;
  };
  routeDistribution: Partial<Record<ContextRoute, number>>;
}

export interface RetrievalValueLift {
  from: RetrievalValueMode;
  to: RetrievalValueMode;
  latencyP95DeltaMs: number;
  latencyP95Ratio: number;
  tokensAvgDelta: number;
  sectionsAvgDelta: number;
  memoryRecallDelta?: number;
  entityRecallDelta?: number;
  precisionAtKDelta?: number;
}

export interface RetrievalValueReport {
  generatedAt: string;
  projectPath: string;
  queryCount: number;
  recallK: number;
  modes: RetrievalValueModeSummary[];
  lifts: RetrievalValueLift[];
  runs: RetrievalValueRun[];
}

export interface RetrievalModeConfig {
  includeCodeGraph: boolean;
  includeGraphRAG: boolean;
}

function toFixedNumber(value: number, decimals = 4): number {
  return Number(value.toFixed(decimals));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
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

function safeRatio(current: number, baseline: number): number {
  return toFixedNumber(current / Math.max(0.01, baseline));
}

function summarizeMode(
  mode: RetrievalValueMode,
  runs: RetrievalValueRun[],
): RetrievalValueModeSummary {
  const modeRuns = runs.filter((run) => run.mode === mode);
  const routeDistribution: Partial<Record<ContextRoute, number>> = {};

  for (const run of modeRuns) {
    if (run.route) {
      routeDistribution[run.route] = (routeDistribution[run.route] ?? 0) + 1;
    }
  }

  const qualityRuns = modeRuns.filter((run) => run.quality);

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
    tokens: {
      avg: average(modeRuns.map((run) => run.tokens)),
    },
    sections: {
      avgIncluded: average(modeRuns.map((run) => run.sectionsIncluded)),
      rag: average(modeRuns.map((run) => run.ragSections)),
      kag: average(modeRuns.map((run) => run.kagSections)),
      graphrag: average(modeRuns.map((run) => run.graphragSections)),
    },
    ...(qualityRuns.length > 0
      ? {
          quality: {
            memoryRecallAvg: average(
              qualityRuns.map((run) => run.quality?.memoryRecall ?? 0),
            ),
            entityRecallAvg: average(
              qualityRuns.map((run) => run.quality?.entityRecall ?? 0),
            ),
            precisionAtKAvg: average(
              qualityRuns.map((run) => run.quality?.precisionAtK ?? 0),
            ),
            queriesWithExpectations: qualityRuns.length,
          },
        }
      : {}),
    routeDistribution,
  };
}

function buildLift(
  from: RetrievalValueModeSummary,
  to: RetrievalValueModeSummary,
): RetrievalValueLift {
  return {
    from: from.mode,
    to: to.mode,
    latencyP95DeltaMs: toFixedNumber(to.latencyMs.p95 - from.latencyMs.p95),
    latencyP95Ratio: safeRatio(to.latencyMs.p95, from.latencyMs.p95),
    tokensAvgDelta: toFixedNumber(to.tokens.avg - from.tokens.avg),
    sectionsAvgDelta: toFixedNumber(
      to.sections.avgIncluded - from.sections.avgIncluded,
    ),
    ...(from.quality && to.quality
      ? {
          memoryRecallDelta: toFixedNumber(
            to.quality.memoryRecallAvg - from.quality.memoryRecallAvg,
          ),
          entityRecallDelta: toFixedNumber(
            to.quality.entityRecallAvg - from.quality.entityRecallAvg,
          ),
          precisionAtKDelta: toFixedNumber(
            to.quality.precisionAtKAvg - from.quality.precisionAtKAvg,
          ),
        }
      : {}),
  };
}

export function getModeConfig(mode: RetrievalValueMode): RetrievalModeConfig {
  switch (mode) {
    case "no_mcp":
      return {
        includeCodeGraph: false,
        includeGraphRAG: false,
      };
    case "memory_only":
      return {
        includeCodeGraph: false,
        includeGraphRAG: false,
      };
    case "mcp_full":
      return {
        includeCodeGraph: true,
        includeGraphRAG: true,
      };
  }
}

export function createRetrievalValueReport(input: {
  projectPath: string;
  recallK: number;
  runs: RetrievalValueRun[];
  generatedAt?: string;
}): RetrievalValueReport {
  const modes: RetrievalValueMode[] = ["no_mcp", "memory_only", "mcp_full"];
  const summaries = modes
    .map((mode) => summarizeMode(mode, input.runs))
    .filter((summary) => summary.runs > 0);

  const summaryByMode = new Map(
    summaries.map((summary) => [summary.mode, summary]),
  );
  const lifts: RetrievalValueLift[] = [];

  const noMcp = summaryByMode.get("no_mcp");
  const memoryOnly = summaryByMode.get("memory_only");
  const full = summaryByMode.get("mcp_full");

  if (noMcp && full) {
    lifts.push(buildLift(noMcp, full));
  }
  if (memoryOnly && full) {
    lifts.push(buildLift(memoryOnly, full));
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    projectPath: input.projectPath,
    queryCount: new Set(input.runs.map((run) => run.queryId)).size,
    recallK: input.recallK,
    modes: summaries,
    lifts,
    runs: input.runs,
  };
}

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

export function buildRetrievalValueMarkdownReport(
  report: RetrievalValueReport,
): string {
  const lines: string[] = [];

  lines.push("# MCP Value Report");
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Project: ${report.projectPath}`);
  lines.push(`- Queries evaluated: ${report.queryCount}`);
  lines.push(`- Recall@k: ${report.recallK}`);
  lines.push("");

  lines.push("## Mode Summary");
  lines.push("");
  lines.push(
    "| Mode | Runs | p50 (ms) | p95 (ms) | Avg Tokens | Avg Sections | Avg Memory Recall | Avg Entity Recall | Avg Precision@k |",
  );
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");

  for (const mode of report.modes) {
    lines.push(
      `| ${mode.mode} | ${mode.runs} | ${fmt(mode.latencyMs.p50)} | ${fmt(mode.latencyMs.p95)} | ${fmt(mode.tokens.avg)} | ${fmt(mode.sections.avgIncluded)} | ${fmt(mode.quality?.memoryRecallAvg ?? 0)} | ${fmt(mode.quality?.entityRecallAvg ?? 0)} | ${fmt(mode.quality?.precisionAtKAvg ?? 0)} |`,
    );
  }

  lines.push("");
  lines.push("## Structure Mix");
  lines.push("");

  for (const mode of report.modes) {
    lines.push(`### ${mode.mode}`);
    lines.push("");
    lines.push(
      `- Section avg: rag=${fmt(mode.sections.rag)}, kag=${fmt(mode.sections.kag)}, graphrag=${fmt(mode.sections.graphrag)}`,
    );
    lines.push(
      `- Route distribution: memory=${mode.routeDistribution.memory ?? 0}, code=${mode.routeDistribution.code ?? 0}, hybrid=${mode.routeDistribution.hybrid ?? 0}`,
    );
    lines.push("");
  }

  if (report.lifts.length > 0) {
    lines.push("## Lift Summary");
    lines.push("");
    lines.push(
      "| From | To | p95 Delta (ms) | p95 Ratio | Memory Recall Delta | Entity Recall Delta | Precision@k Delta |",
    );
    lines.push("|---|---|---:|---:|---:|---:|---:|");

    for (const lift of report.lifts) {
      lines.push(
        `| ${lift.from} | ${lift.to} | ${fmt(lift.latencyP95DeltaMs)} | ${fmt(lift.latencyP95Ratio)} | ${fmt(lift.memoryRecallDelta ?? 0)} | ${fmt(lift.entityRecallDelta ?? 0)} | ${fmt(lift.precisionAtKDelta ?? 0)} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Query Detail");
  lines.push("");

  const queryIds = Array.from(new Set(report.runs.map((run) => run.queryId)));
  for (const queryId of queryIds) {
    const queryRuns = report.runs.filter((run) => run.queryId === queryId);
    if (queryRuns.length === 0) {
      continue;
    }

    lines.push(`### ${queryId}`);
    lines.push("");
    lines.push(`Query: ${queryRuns[0]?.query ?? ""}`);
    lines.push("");
    lines.push(
      "| Mode | Latency (ms) | Tokens | Sections | Route | Memory Recall | Entity Recall | Precision@k |",
    );
    lines.push("|---|---:|---:|---:|---|---:|---:|---:|");

    for (const run of queryRuns) {
      lines.push(
        `| ${run.mode} | ${fmt(run.latencyMs)} | ${run.tokens} | ${run.sectionsIncluded} | ${run.route ?? "-"} | ${fmt(run.quality?.memoryRecall ?? 0)} | ${fmt(run.quality?.entityRecall ?? 0)} | ${fmt(run.quality?.precisionAtK ?? 0)} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
