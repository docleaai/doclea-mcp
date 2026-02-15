import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type ContextRoute = "memory" | "code" | "hybrid";
type RetrievalValueMode = "no_mcp" | "memory_only" | "mcp_full";

interface RetrievalValueQuality {
  memoryRecall: number;
  entityRecall: number;
  precisionAtK: number;
}

interface RetrievalValueRun {
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

interface RetrievalValueModeSummary {
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

interface RetrievalValueReport {
  generatedAt: string;
  projectPath: string;
  queryCount: number;
  recallK: number;
  modes: RetrievalValueModeSummary[];
  runs: RetrievalValueRun[];
}

type ContextStageName =
  | "rag"
  | "kag"
  | "graphrag"
  | "rerank"
  | "format"
  | "tokenize"
  | "evidence"
  | "total";

interface StageBenchmarkStats {
  stage: ContextStageName;
  p95: number;
}

interface BenchmarkScenario {
  id: string;
  label: string;
  includeCodeGraph: boolean;
  includeGraphRAG: boolean;
  result: {
    overall: {
      p50: number;
      p95: number;
    };
    stages: StageBenchmarkStats[];
    cache: {
      hitRate: number;
    };
  };
}

interface ComponentMatrixReport {
  generatedAt: string;
  projectPath: string;
  queryCount: number;
  runsPerQuery: number;
  warmupRuns: number;
  tokenBudget: number;
  template: "default" | "compact" | "detailed";
  cache: {
    disabled: boolean;
    clearCacheFirst: boolean;
    clearCacheBetweenScenarios: boolean;
  };
  scenarios: Record<string, BenchmarkScenario>;
  baselineScenarioId: string;
}

const MODE_LABEL: Record<RetrievalValueMode, string> = {
  no_mcp: "No MCP",
  memory_only: "Memory Only",
  mcp_full: "MCP Full",
};

const PALETTE = {
  warmP50: "#38bdf8",
  warmP95: "#0284c7",
  coldP50: "#f59e0b",
  coldP95: "#ea580c",
  memoryRecall: "#22c55e",
  entityRecall: "#14b8a6",
  precision: "#ef4444",
  budgetMcpP95: "#a855f7",
  budgetMemoryP95: "#fb7185",
  matrixP50: "#60a5fa",
  matrixP95: "#f97316",
  stageRag: "#60a5fa",
  stageKag: "#f59e0b",
  stageGraph: "#10b981",
};

const CHART_COLORS = {
  grid: "#243044",
  axis: "#4b5f7a",
  text: "#b8c7db",
};

function toFixed(value: number, decimals = 2): string {
  return Number(value).toFixed(decimals);
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function avg(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = avg(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function colorLegend(items: Array<{ label: string; color: string }>): string {
  return `<div class="legend">${items
    .map(
      (item) =>
        `<span class="legend-item"><span class="swatch" style="background:${item.color}"></span>${escapeHtml(item.label)}</span>`,
    )
    .join("")}</div>`;
}

function groupedBarSvg(input: {
  width?: number;
  height?: number;
  labels: string[];
  series: Array<{ name: string; color: string; values: number[] }>;
  yLabel: string;
}): string {
  const width = input.width ?? 860;
  const height = input.height ?? 350;
  const margin = { top: 20, right: 20, bottom: 60, left: 56 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const maxValue = Math.max(
    1,
    ...input.series.flatMap((series) => series.values),
  );

  const ticks = 5;
  const groupWidth = plotWidth / Math.max(1, input.labels.length);
  const barWidth = (groupWidth * 0.78) / Math.max(1, input.series.length || 1);
  const groupOffset = (groupWidth - barWidth * input.series.length) / 2;

  const gridLines: string[] = [];
  const yTicks: string[] = [];
  for (let i = 0; i <= ticks; i++) {
    const value = (maxValue / ticks) * i;
    const y = margin.top + plotHeight - (value / maxValue) * plotHeight;
    gridLines.push(
      `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="${CHART_COLORS.grid}" stroke-width="1" />`,
    );
    yTicks.push(
      `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="${CHART_COLORS.text}">${toFixed(value, maxValue < 10 ? 2 : 1)}</text>`,
    );
  }

  const bars: string[] = [];
  const xTicks: string[] = [];
  input.labels.forEach((label, labelIndex) => {
    const xGroup = margin.left + labelIndex * groupWidth;
    const labelX = xGroup + groupWidth / 2;
    xTicks.push(
      `<text x="${labelX}" y="${height - 22}" text-anchor="middle" font-size="11" fill="${CHART_COLORS.text}">${escapeHtml(label)}</text>`,
    );

    input.series.forEach((series, seriesIndex) => {
      const value = series.values[labelIndex] ?? 0;
      const barHeight = (value / maxValue) * plotHeight;
      const x = xGroup + groupOffset + seriesIndex * barWidth;
      const y = margin.top + plotHeight - barHeight;
      bars.push(
        `<rect x="${x}" y="${y}" width="${barWidth - 2}" height="${Math.max(0, barHeight)}" fill="${series.color}" rx="3"><title>${escapeHtml(series.name)}: ${toFixed(value)}</title></rect>`,
      );
    });
  });

  const yLabel = `<text x="16" y="${margin.top + plotHeight / 2}" transform="rotate(-90 16 ${margin.top + plotHeight / 2})" text-anchor="middle" font-size="11" fill="${CHART_COLORS.text}">${escapeHtml(input.yLabel)}</text>`;

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(input.yLabel)} chart">${gridLines.join("")}${bars.join("")}<line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" stroke="${CHART_COLORS.axis}" />${yTicks.join("")}${xTicks.join("")}${yLabel}</svg>`;
}

function getMode(
  report: RetrievalValueReport,
  mode: RetrievalValueMode,
): RetrievalValueModeSummary {
  const found = report.modes.find((entry) => entry.mode === mode);
  if (!found) {
    throw new Error(`Mode ${mode} not found in report ${report.generatedAt}`);
  }
  return found;
}

function aggregateQueryModeRows(runs: RetrievalValueRun[]): Array<{
  queryId: string;
  query: string;
  mode: RetrievalValueMode;
  latencyMs: number;
  memoryRecall: number;
  entityRecall: number;
  precisionAtK: number;
}> {
  const groups = new Map<string, RetrievalValueRun[]>();
  for (const run of runs) {
    const key = `${run.queryId}:::${run.mode}`;
    const existing = groups.get(key) ?? [];
    existing.push(run);
    groups.set(key, existing);
  }

  const rows: Array<{
    queryId: string;
    query: string;
    mode: RetrievalValueMode;
    latencyMs: number;
    memoryRecall: number;
    entityRecall: number;
    precisionAtK: number;
  }> = [];

  for (const [key, groupRuns] of groups.entries()) {
    const [queryId, mode] = key.split(":::") as [string, RetrievalValueMode];
    rows.push({
      queryId,
      query: groupRuns[0]?.query ?? "",
      mode,
      latencyMs: avg(groupRuns.map((run) => run.latencyMs)),
      memoryRecall: avg(groupRuns.map((run) => run.quality?.memoryRecall ?? 0)),
      entityRecall: avg(groupRuns.map((run) => run.quality?.entityRecall ?? 0)),
      precisionAtK: avg(groupRuns.map((run) => run.quality?.precisionAtK ?? 0)),
    });
  }

  return rows;
}

function parseBudgetReportsFromEnv(): Array<{ budget: number; path: string }> {
  const raw = process.env.DOCLEA_DEEP_BUDGET_REPORTS;
  if (!raw) {
    return [
      {
        budget: 1200,
        path: ".doclea/reports/mcp-value-report.thorough-budget-1200.json",
      },
      {
        budget: 4000,
        path: ".doclea/reports/mcp-value-report.thorough-budget-4000.json",
      },
      {
        budget: 8000,
        path: ".doclea/reports/mcp-value-report.thorough-budget-8000.json",
      },
    ];
  }

  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [budgetPart, pathPart] = entry.split("=");
      const budget = Number.parseInt(budgetPart ?? "", 10);
      return {
        budget,
        path: pathPart?.trim() ?? "",
      };
    })
    .filter((entry) => Number.isFinite(entry.budget) && entry.path.length > 0);

  return entries.length > 0 ? entries : [];
}

function renderDeepDiveHtml(input: {
  warm: RetrievalValueReport;
  cold: RetrievalValueReport;
  budgets: Array<{ budget: number; report: RetrievalValueReport }>;
  matrix: ComponentMatrixReport;
}): string {
  const warmMemory = getMode(input.warm, "memory_only");
  const warmFull = getMode(input.warm, "mcp_full");
  const coldMemory = getMode(input.cold, "memory_only");
  const coldFull = getMode(input.cold, "mcp_full");

  const warmModeRows = aggregateQueryModeRows(input.warm.runs);
  const warmMemoryRows = warmModeRows.filter(
    (row) => row.mode === "memory_only",
  );
  const warmFullRows = warmModeRows.filter((row) => row.mode === "mcp_full");

  const warmLatencyByMode = ["no_mcp", "memory_only", "mcp_full"] as const;

  const warmLatencies = input.warm.runs
    .filter((run) => run.mode === "mcp_full")
    .map((run) => run.latencyMs);
  const coldLatencies = input.cold.runs
    .filter((run) => run.mode === "mcp_full")
    .map((run) => run.latencyMs);
  const warmLatencyCv =
    avg(warmLatencies) > 0 ? stdev(warmLatencies) / avg(warmLatencies) : 0;
  const coldLatencyCv =
    avg(coldLatencies) > 0 ? stdev(coldLatencies) / avg(coldLatencies) : 0;

  const warmEntityLift =
    (warmFull.quality?.entityRecallAvg ?? 0) -
    (warmMemory.quality?.entityRecallAvg ?? 0);
  const warmMemoryLift =
    (warmFull.quality?.memoryRecallAvg ?? 0) -
    (warmMemory.quality?.memoryRecallAvg ?? 0);
  const warmPrecisionDelta =
    (warmFull.quality?.precisionAtKAvg ?? 0) -
    (warmMemory.quality?.precisionAtKAvg ?? 0);
  const warmSectionDelta =
    warmFull.sections.avgIncluded - warmMemory.sections.avgIncluded;
  const coldP95Ratio =
    coldMemory.latencyMs.p95 <= 0
      ? 0
      : coldFull.latencyMs.p95 / coldMemory.latencyMs.p95;

  let entityWinCount = 0;
  let memoryWinCount = 0;
  let precisionWinCount = 0;
  let comparedQueries = 0;
  const memoryRowsByQuery = new Map(
    warmMemoryRows.map((row) => [row.queryId, row]),
  );
  for (const fullRow of warmFullRows) {
    const memoryRow = memoryRowsByQuery.get(fullRow.queryId);
    if (!memoryRow) {
      continue;
    }
    comparedQueries++;
    if (fullRow.entityRecall > memoryRow.entityRecall) entityWinCount++;
    if (fullRow.memoryRecall > memoryRow.memoryRecall) memoryWinCount++;
    if (fullRow.precisionAtK > memoryRow.precisionAtK) precisionWinCount++;
  }

  const budgetRows = input.budgets
    .map((entry) => ({
      budget: entry.budget,
      memory: getMode(entry.report, "memory_only"),
      full: getMode(entry.report, "mcp_full"),
    }))
    .sort((left, right) => left.budget - right.budget);

  const matrixScenarios = Object.values(input.matrix.scenarios);
  const preferredOrder = ["memory_only", "code_only", "graph_only", "full"];
  matrixScenarios.sort(
    (left, right) =>
      preferredOrder.indexOf(left.id) - preferredOrder.indexOf(right.id),
  );

  const matrixLabels = matrixScenarios.map((scenario) => scenario.label);
  const matrixStage = (
    scenario: BenchmarkScenario,
    stage: ContextStageName,
  ): number =>
    scenario.result.stages.find((entry) => entry.stage === stage)?.p95 ?? 0;

  const warmVsColdChart = groupedBarSvg({
    labels: warmLatencyByMode.map((mode) => MODE_LABEL[mode]),
    series: [
      {
        name: "Warm p50",
        color: PALETTE.warmP50,
        values: warmLatencyByMode.map(
          (mode) => getMode(input.warm, mode).latencyMs.p50,
        ),
      },
      {
        name: "Warm p95",
        color: PALETTE.warmP95,
        values: warmLatencyByMode.map(
          (mode) => getMode(input.warm, mode).latencyMs.p95,
        ),
      },
      {
        name: "Cold p50",
        color: PALETTE.coldP50,
        values: warmLatencyByMode.map(
          (mode) => getMode(input.cold, mode).latencyMs.p50,
        ),
      },
      {
        name: "Cold p95",
        color: PALETTE.coldP95,
        values: warmLatencyByMode.map(
          (mode) => getMode(input.cold, mode).latencyMs.p95,
        ),
      },
    ],
    yLabel: "Latency (ms)",
  });

  const qualityChart = groupedBarSvg({
    labels: ["Memory Only", "MCP Full"],
    series: [
      {
        name: `Memory Recall@${input.warm.recallK}`,
        color: PALETTE.memoryRecall,
        values: [
          warmMemory.quality?.memoryRecallAvg ?? 0,
          warmFull.quality?.memoryRecallAvg ?? 0,
        ],
      },
      {
        name: `Entity Recall@${input.warm.recallK}`,
        color: PALETTE.entityRecall,
        values: [
          warmMemory.quality?.entityRecallAvg ?? 0,
          warmFull.quality?.entityRecallAvg ?? 0,
        ],
      },
      {
        name: `Precision@${input.warm.recallK}`,
        color: PALETTE.precision,
        values: [
          warmMemory.quality?.precisionAtKAvg ?? 0,
          warmFull.quality?.precisionAtKAvg ?? 0,
        ],
      },
    ],
    yLabel: "Quality score",
  });

  const budgetChart = groupedBarSvg({
    labels: budgetRows.map((row) => `${row.budget} tokens`),
    series: [
      {
        name: "MCP Full p95",
        color: PALETTE.budgetMcpP95,
        values: budgetRows.map((row) => row.full.latencyMs.p95),
      },
      {
        name: "Memory Only p95",
        color: PALETTE.budgetMemoryP95,
        values: budgetRows.map((row) => row.memory.latencyMs.p95),
      },
    ],
    yLabel: "Warm p95 latency (ms)",
  });

  const matrixChart = groupedBarSvg({
    labels: matrixLabels,
    series: [
      {
        name: "p50",
        color: PALETTE.matrixP50,
        values: matrixScenarios.map((scenario) => scenario.result.overall.p50),
      },
      {
        name: "p95",
        color: PALETTE.matrixP95,
        values: matrixScenarios.map((scenario) => scenario.result.overall.p95),
      },
    ],
    yLabel: "Uncached latency (ms)",
  });

  const stageChart = groupedBarSvg({
    labels: matrixLabels,
    series: [
      {
        name: "RAG p95",
        color: PALETTE.stageRag,
        values: matrixScenarios.map((scenario) => matrixStage(scenario, "rag")),
      },
      {
        name: "KAG p95",
        color: PALETTE.stageKag,
        values: matrixScenarios.map((scenario) => matrixStage(scenario, "kag")),
      },
      {
        name: "GraphRAG p95",
        color: PALETTE.stageGraph,
        values: matrixScenarios.map((scenario) =>
          matrixStage(scenario, "graphrag"),
        ),
      },
    ],
    yLabel: "Stage p95 latency (ms)",
  });

  const budgetTableRows = budgetRows
    .map(
      (row) => `
      <tr>
        <td>${row.budget}</td>
        <td>${toFixed(row.memory.latencyMs.p95, 4)}</td>
        <td>${toFixed(row.full.latencyMs.p95, 4)}</td>
        <td>${toFixed(row.full.latencyMs.p95 - row.memory.latencyMs.p95, 4)}</td>
        <td>${toFixed(row.memory.sections.avgIncluded, 3)}</td>
        <td>${toFixed(row.full.sections.avgIncluded, 3)}</td>
      </tr>`,
    )
    .join("");

  const matrixTableRows = matrixScenarios
    .map(
      (scenario) => `
      <tr>
        <td>${escapeHtml(scenario.label)}</td>
        <td>${scenario.includeCodeGraph ? "yes" : "no"}</td>
        <td>${scenario.includeGraphRAG ? "yes" : "no"}</td>
        <td>${toFixed(scenario.result.overall.p50)}</td>
        <td>${toFixed(scenario.result.overall.p95)}</td>
        <td>${toFixed(matrixStage(scenario, "rag"))}</td>
        <td>${toFixed(matrixStage(scenario, "kag"))}</td>
        <td>${toFixed(matrixStage(scenario, "graphrag"))}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MCP Deep Dive Report</title>
  <style>
    :root {
      --bg: #070c18;
      --card: #0f1628;
      --panel: #121d34;
      --ink: #e5edf9;
      --muted: #a0b0c7;
      --border: #24344f;
      --ok: #22c55e;
      --warn: #f59e0b;
      --bad: #ef4444;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: var(--ink);
      background: radial-gradient(1200px 700px at 15% -20%, #143256 0%, #0b1324 52%, #070c18 100%), var(--bg);
    }
    .wrap {
      max-width: 1220px;
      margin: 0 auto;
      padding: 26px 20px 48px;
    }
    h1, h2, h3, h4 { margin: 0 0 10px; }
    h1 { font-size: 30px; }
    h2 { font-size: 21px; margin-top: 30px; }
    h3 { font-size: 16px; margin-top: 0; }
    h4 { font-size: 13px; color: #d7e3f5; }
    p { margin: 0 0 10px; }
    .subtitle { color: var(--muted); margin-bottom: 16px; }
    .grid {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      margin-bottom: 16px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
    }
    .metric {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .metric.ok { color: var(--ok); }
    .metric.warn { color: var(--warn); }
    .metric.bad { color: var(--bad); }
    .small { color: var(--muted); font-size: 12px; }
    .chart {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
      margin-top: 10px;
    }
    .explain {
      margin-top: 10px;
      background: var(--panel);
      border: 1px solid #2a3f62;
      border-radius: 10px;
      padding: 12px;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    .legend-item { display: inline-flex; gap: 6px; align-items: center; }
    .swatch { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    th, td {
      padding: 9px 10px;
      border-bottom: 1px solid #1e2f4a;
      font-size: 13px;
      text-align: left;
    }
    th {
      background: #0f1a2f;
      color: #d8e5f8;
      font-weight: 600;
    }
    tr:last-child td { border-bottom: none; }
    .note {
      margin-top: 14px;
      border-left: 4px solid #64748b;
      background: #121a2d;
      color: #c9d6ea;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 13px;
    }
    .footer {
      margin-top: 26px;
      color: var(--muted);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>MCP Retrieval Deep Dive (Dark)</h1>
    <p class="subtitle">
      Project <strong>${escapeHtml(input.warm.projectPath)}</strong> | warm run ${escapeHtml(input.warm.generatedAt)} | cold run ${escapeHtml(input.cold.generatedAt)} | component matrix ${escapeHtml(input.matrix.generatedAt)}
    </p>

    <div class="grid">
      <div class="card">
        <h3>Warm MCP p95</h3>
        <div class="metric ok">${toFixed(warmFull.latencyMs.p95, 4)} ms</div>
        <p class="small">steady-state cache-enabled</p>
      </div>
      <div class="card">
        <h3>Cold MCP p95</h3>
        <div class="metric warn">${toFixed(coldFull.latencyMs.p95, 4)} ms</div>
        <p class="small">cache reset before every run</p>
      </div>
      <div class="card">
        <h3>Entity Recall Lift</h3>
        <div class="metric ok">+${toFixed(warmEntityLift, 4)}</div>
        <p class="small">MCP Full vs Memory Only</p>
      </div>
      <div class="card">
        <h3>Cold p95 Ratio</h3>
        <div class="metric ${coldP95Ratio > 1.2 ? "bad" : "ok"}">${toFixed(coldP95Ratio, 3)}x</div>
        <p class="small">MCP Full / Memory Only</p>
      </div>
    </div>

    <h2>1) Warm vs Cold Latency</h2>
    <div class="chart">
      ${colorLegend([
        { label: "Warm p50", color: PALETTE.warmP50 },
        { label: "Warm p95", color: PALETTE.warmP95 },
        { label: "Cold p50", color: PALETTE.coldP50 },
        { label: "Cold p95", color: PALETTE.coldP95 },
      ])}
      ${warmVsColdChart}
      <div class="explain">
        <h4>How to read this chart</h4>
        <p>Each mode has four bars. p50 is median latency (typical run). p95 is tail latency (slowest 5% region). Warm means cache-eligible repeated access; cold means cache reset before each measurement.</p>
        <h4>What this run shows</h4>
        <p>MCP Full is near Memory Only in warm mode (${toFixed(warmFull.latencyMs.p95, 4)} ms vs ${toFixed(warmMemory.latencyMs.p95, 4)} ms p95), but has a higher first-turn cost in cold mode (${toFixed(coldFull.latencyMs.p95, 4)} ms vs ${toFixed(coldMemory.latencyMs.p95, 4)} ms p95, ${toFixed(coldP95Ratio, 3)}x). This is the expected profile: rich retrieval costs more when cache is cold, then converges in steady-state.</p>
        <p>Stability check (MCP Full latency CV): warm ${toFixed(warmLatencyCv, 3)}, cold ${toFixed(coldLatencyCv, 3)}. Higher cold CV indicates more tail variability on first-turn retrieval.</p>
      </div>
    </div>

    <h2>2) Retrieval Quality Tradeoff</h2>
    <div class="chart">
      ${colorLegend([
        {
          label: `Memory Recall@${input.warm.recallK}`,
          color: PALETTE.memoryRecall,
        },
        {
          label: `Entity Recall@${input.warm.recallK}`,
          color: PALETTE.entityRecall,
        },
        { label: `Precision@${input.warm.recallK}`, color: PALETTE.precision },
      ])}
      ${qualityChart}
      <div class="explain">
        <h4>How to read this chart</h4>
        <p>Higher recall means more expected items are present in top-k retrieved evidence. Higher precision means fewer non-relevant items in top-k.</p>
        <h4>What this run shows</h4>
        <p>Memory recall is flat (${toFixed(warmMemory.quality?.memoryRecallAvg ?? 0, 4)} to ${toFixed(warmFull.quality?.memoryRecallAvg ?? 0, 4)}), while entity recall rises by ${toFixed(warmEntityLift, 4)} with MCP Full. Precision drops by ${toFixed(warmPrecisionDelta, 4)} because MCP Full adds broader context (avg sections +${toFixed(warmSectionDelta, 3)}), increasing coverage at the cost of concentration.</p>
        <p>Per-query win rates (MCP Full vs Memory Only): entity recall wins ${entityWinCount}/${comparedQueries}, memory recall wins ${memoryWinCount}/${comparedQueries}, precision wins ${precisionWinCount}/${comparedQueries}.</p>
      </div>
    </div>

    <h2>3) Token Budget Sensitivity (Warm)</h2>
    <div class="chart">
      ${colorLegend([
        { label: "MCP Full p95", color: PALETTE.budgetMcpP95 },
        { label: "Memory Only p95", color: PALETTE.budgetMemoryP95 },
      ])}
      ${budgetChart}
      <div class="explain">
        <h4>How to read this chart</h4>
        <p>Each x-axis point is a token budget configuration; bars show warm p95 latency for each retrieval mode.</p>
        <h4>What this run shows</h4>
        <p>Across 1200/4000/8000 budgets, warm p95 stays in a narrow band for both modes in this dataset, indicating token budget has low latency sensitivity under warm cache for these 12 prompts.</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Token Budget</th>
          <th>Memory p95 (ms)</th>
          <th>MCP p95 (ms)</th>
          <th>Delta (ms)</th>
          <th>Memory Sections</th>
          <th>MCP Sections</th>
        </tr>
      </thead>
      <tbody>${budgetTableRows}</tbody>
    </table>

    <h2>4) Uncached Component Ablation Matrix</h2>
    <div class="chart">
      ${colorLegend([
        { label: "p50", color: PALETTE.matrixP50 },
        { label: "p95", color: PALETTE.matrixP95 },
      ])}
      ${matrixChart}
      <div class="explain">
        <h4>How to read this chart</h4>
        <p>Each bar pair is a retrieval stack variant with cache disabled. This isolates true compute/IO retrieval cost from cache effects.</p>
        <h4>What this run shows</h4>
        <p>GraphRAG dominates added uncached latency in this workload: memory-only p95 is ${toFixed(matrixScenarios.find((s) => s.id === "memory_only")?.result.overall.p95 ?? 0)} ms, graph-only p95 is ${toFixed(matrixScenarios.find((s) => s.id === "graph_only")?.result.overall.p95 ?? 0)} ms, and full p95 is ${toFixed(matrixScenarios.find((s) => s.id === "full")?.result.overall.p95 ?? 0)} ms. Code-only remains close to memory-only.</p>
      </div>
    </div>

    <div class="chart">
      ${colorLegend([
        { label: "RAG p95", color: PALETTE.stageRag },
        { label: "KAG p95", color: PALETTE.stageKag },
        { label: "GraphRAG p95", color: PALETTE.stageGraph },
      ])}
      ${stageChart}
      <div class="explain">
        <h4>How to read this chart</h4>
        <p>This is stage-level p95 latency by scenario. It separates base semantic retrieval (RAG), code graph retrieval (KAG), and graph traversal/reports (GraphRAG).</p>
        <h4>What this run shows</h4>
        <p>RAG is the baseline floor for all scenarios; KAG adds a small increment; GraphRAG adds the largest increment. This clarifies why full MCP has the largest first-turn penalty while still delivering richer entity coverage.</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Scenario</th>
          <th>Code Graph</th>
          <th>GraphRAG</th>
          <th>p50 (ms)</th>
          <th>p95 (ms)</th>
          <th>RAG p95</th>
          <th>KAG p95</th>
          <th>GraphRAG p95</th>
        </tr>
      </thead>
      <tbody>${matrixTableRows}</tbody>
    </table>

    <div class="note">
      <strong>Interpretation guardrails</strong>: <code>no_mcp</code> is a synthetic control with zero retrieval work (latency=0, no tokens), so use it for quality/context lift framing, not raw latency competitiveness. For production UX estimates, use cold-path and uncached matrix numbers.
    </div>

    <p class="footer">Generated by scripts/retrieval-deep-dive-report-html.ts</p>
  </div>
</body>
</html>`;
}

function readJsonFile<T>(path: string): T {
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

async function main(): Promise<void> {
  const warmPath = resolve(
    process.env.DOCLEA_DEEP_WARM_JSON ??
      ".doclea/reports/mcp-value-report.thorough-budget-4000.json",
  );
  const coldPath = resolve(
    process.env.DOCLEA_DEEP_COLD_JSON ??
      ".doclea/reports/mcp-value-report.thorough-cold-r6.json",
  );
  const matrixPath = resolve(
    process.env.DOCLEA_DEEP_COMPONENT_MATRIX_JSON ??
      ".doclea/reports/retrieval-benchmark.component-matrix.uncached.json",
  );
  const outputPath = resolve(
    process.env.DOCLEA_DEEP_OUTPUT_HTML ??
      ".doclea/reports/mcp-value-report.deep-dive.dark.html",
  );

  const budgetPaths = parseBudgetReportsFromEnv();
  const warm = readJsonFile<RetrievalValueReport>(warmPath);
  const cold = readJsonFile<RetrievalValueReport>(coldPath);
  const matrix = readJsonFile<ComponentMatrixReport>(matrixPath);

  const budgets = budgetPaths
    .map((entry) => ({
      budget: entry.budget,
      path: resolve(entry.path),
    }))
    .filter((entry) => existsSync(entry.path))
    .map((entry) => ({
      budget: entry.budget,
      report: readJsonFile<RetrievalValueReport>(entry.path),
    }));

  const html = renderDeepDiveHtml({
    warm,
    cold,
    matrix,
    budgets,
  });
  writeFileSync(outputPath, html, "utf-8");

  console.log(
    JSON.stringify(
      {
        warmPath,
        coldPath,
        matrixPath,
        budgetCount: budgets.length,
        outputPath,
      },
      null,
      2,
    ),
  );
}

await main();
