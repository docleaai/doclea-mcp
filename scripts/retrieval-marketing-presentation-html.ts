import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type RetrievalValueMode = "no_mcp" | "memory_only" | "mcp_full";

interface RetrievalValueModeSummary {
  mode: RetrievalValueMode;
  latencyMs: {
    p50: number;
    p95: number;
  };
  sections: {
    avgIncluded: number;
  };
  quality?: {
    memoryRecallAvg: number;
    entityRecallAvg: number;
    precisionAtKAvg: number;
  };
}

interface RetrievalValueReport {
  generatedAt: string;
  projectPath: string;
  queryCount: number;
  recallK: number;
  modes: RetrievalValueModeSummary[];
  runs?: Array<{
    queryId: string;
    query: string;
  }>;
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
  };
}

interface ComponentMatrixReport {
  generatedAt: string;
  queryCount: number;
  scenarios: Record<string, BenchmarkScenario>;
}

interface BudgetPoint {
  budget: number;
  memoryP95: number;
  fullP95: number;
}

interface BudgetReportPath {
  budget: number;
  path: string;
}

interface ChoiceBenchmarkModeSummary {
  mode: "mcp_full" | "grep_tools";
  runs: number;
  latencyMs: {
    avg: number;
    p50: number;
    p95: number;
  };
  quality: {
    fileRecallAvg: number;
    filePrecisionAvg: number;
    hallucinatedRatioAvg: number;
  };
}

interface ChoiceBenchmarkRun {
  queryId: string;
  query: string;
  mode: "mcp_full" | "grep_tools";
  latencyMs: number;
  fileRecall: number;
  filePrecision: number;
  hallucinatedRatio: number;
}

interface ChoiceBenchmarkReport {
  generatedAt: string;
  tokenBudget: number;
  modes: ChoiceBenchmarkModeSummary[];
  runs: ChoiceBenchmarkRun[];
}

interface ChoiceBudgetPoint {
  budget: number;
  mcpLatencyAvg: number;
  grepLatencyAvg: number;
  mcpRecall: number;
  grepRecall: number;
  mcpPrecision: number;
  grepPrecision: number;
  mcpHallucinated: number;
  grepHallucinated: number;
}

interface ChoiceQueryComparison {
  query: string;
  mcpRecall: number;
  grepRecall: number;
  mcpPrecision: number;
  grepPrecision: number;
  mcpLatency: number;
  grepLatency: number;
  winner: "MCP Full" | "Grep/Tools" | "Tie";
}

interface AccessCodeBenchmarkModeSummary {
  mode: RetrievalValueMode;
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

interface AccessCodeFileBenchmarkReport {
  generatedAt: string;
  queryId: string;
  query: string;
  recallK: number;
  expectedFilePaths: string[];
  indexCoverage?: {
    expectedCount: number;
    indexedExpectedCount: number;
    coverage: number;
    missingFromIndex: string[];
  };
  modes: AccessCodeBenchmarkModeSummary[];
}

function readJsonFile<T>(path: string): T {
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

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

function getMode(
  report: RetrievalValueReport,
  mode: RetrievalValueMode,
): RetrievalValueModeSummary {
  const found = report.modes.find((entry) => entry.mode === mode);
  if (!found) {
    throw new Error(`Mode ${mode} not found in report.`);
  }
  return found;
}

function getAccessMode(
  report: AccessCodeFileBenchmarkReport,
  mode: RetrievalValueMode,
): AccessCodeBenchmarkModeSummary | null {
  return report.modes.find((entry) => entry.mode === mode) ?? null;
}

function getChoiceMode(
  report: ChoiceBenchmarkReport,
  mode: "mcp_full" | "grep_tools",
): ChoiceBenchmarkModeSummary {
  const found = report.modes.find((entry) => entry.mode === mode);
  if (!found) {
    throw new Error(`Choice mode ${mode} not found in report.`);
  }
  return found;
}

function parseBudgetReports(): BudgetReportPath[] {
  const raw = process.env.DOCLEA_MARKETING_BUDGET_REPORTS;
  if (raw) {
    const parsed: BudgetReportPath[] = [];

    for (const entry of raw.split(",")) {
      const [budgetRaw, ...pathParts] = entry.split("=");
      const pathRaw = pathParts.join("=").trim();
      const budget = Number.parseInt((budgetRaw ?? "").trim(), 10);
      if (!Number.isFinite(budget) || budget <= 0 || pathRaw.length === 0) {
        continue;
      }
      parsed.push({ budget, path: resolve(pathRaw) });
    }

    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [
    {
      budget: 16000,
      path: resolve(
        process.env.DOCLEA_MARKETING_BUDGET_16000_JSON ??
          ".doclea/reports/mcp-value-report.thorough-budget-16000.json",
      ),
    },
    {
      budget: 32000,
      path: resolve(
        process.env.DOCLEA_MARKETING_BUDGET_32000_JSON ??
          ".doclea/reports/mcp-value-report.thorough-budget-32000.json",
      ),
    },
    {
      budget: 64000,
      path: resolve(
        process.env.DOCLEA_MARKETING_BUDGET_64000_JSON ??
          ".doclea/reports/mcp-value-report.thorough-budget-64000.json",
      ),
    },
    {
      budget: 128000,
      path: resolve(
        process.env.DOCLEA_MARKETING_BUDGET_128000_JSON ??
          ".doclea/reports/mcp-value-report.thorough-budget-128000.json",
      ),
    },
  ];
}

function parseChoiceReports(): BudgetReportPath[] {
  const raw = process.env.DOCLEA_MARKETING_CHOICE_REPORTS;
  if (raw) {
    const parsed: BudgetReportPath[] = [];

    for (const entry of raw.split(",")) {
      const [budgetRaw, ...pathParts] = entry.split("=");
      const pathRaw = pathParts.join("=").trim();
      const budget = Number.parseInt((budgetRaw ?? "").trim(), 10);
      if (!Number.isFinite(budget) || budget <= 0 || pathRaw.length === 0) {
        continue;
      }
      parsed.push({ budget, path: resolve(pathRaw) });
    }

    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [
    {
      budget: 16000,
      path: resolve(
        process.env.DOCLEA_MARKETING_CHOICE_16000_JSON ??
          ".doclea/reports/mcp-vs-grep-choice-benchmark.16000.json",
      ),
    },
    {
      budget: 32000,
      path: resolve(
        process.env.DOCLEA_MARKETING_CHOICE_32000_JSON ??
          ".doclea/reports/mcp-vs-grep-choice-benchmark.32000.json",
      ),
    },
    {
      budget: 64000,
      path: resolve(
        process.env.DOCLEA_MARKETING_CHOICE_64000_JSON ??
          ".doclea/reports/mcp-vs-grep-choice-benchmark.64000.json",
      ),
    },
    {
      budget: 128000,
      path: resolve(
        process.env.DOCLEA_MARKETING_CHOICE_128000_JSON ??
          ".doclea/reports/mcp-vs-grep-choice-benchmark.128000.json",
      ),
    },
  ];
}

function comparisonBars(input: {
  title: string;
  direction: "higher" | "lower";
  unit?: string;
  decimals?: number;
  leftLabel: string;
  leftValue: number;
  rightLabel: string;
  rightValue: number;
  leftColor?: string;
  rightColor?: string;
}): string {
  const unit = input.unit ?? "";
  const decimals = input.decimals ?? 3;
  const maxValue = Math.max(input.leftValue, input.rightValue, 0.0001);
  const leftWidth = (input.leftValue / maxValue) * 100;
  const rightWidth = (input.rightValue / maxValue) * 100;
  const directionClass =
    input.direction === "higher" ? "direction-up" : "direction-down";
  const directionLabel =
    input.direction === "higher" ? "Higher is better" : "Lower is better";

  return `
    <div class="chart-card">
      <div class="chart-head">
        <h3>${escapeHtml(input.title)}</h3>
        <span class="direction ${directionClass}">${directionLabel}</span>
      </div>
      <div class="bar-row">
        <div class="bar-top">
          <span>${escapeHtml(input.leftLabel)}</span>
          <span>${toFixed(input.leftValue, decimals)}${unit}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${toFixed(leftWidth, 1)}%; background:${input.leftColor ?? "#38bdf8"}"></div>
        </div>
      </div>
      <div class="bar-row">
        <div class="bar-top">
          <span>${escapeHtml(input.rightLabel)}</span>
          <span>${toFixed(input.rightValue, decimals)}${unit}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${toFixed(rightWidth, 1)}%; background:${input.rightColor ?? "#f59e0b"}"></div>
        </div>
      </div>
    </div>
  `;
}

function groupedBudgetChart(input: { points: BudgetPoint[] }): string {
  const maxValue = Math.max(
    0.0001,
    ...input.points.map((point) => Math.max(point.memoryP95, point.fullP95)),
  );

  const rows = input.points
    .map((point) => {
      const memoryWidth = (point.memoryP95 / maxValue) * 100;
      const fullWidth = (point.fullP95 / maxValue) * 100;
      return `
        <div class="budget-group">
          <div class="budget-title">${point.budget} token budget</div>
          <div class="bar-row">
            <div class="bar-top">
              <span>Memory Only</span>
              <span>${toFixed(point.memoryP95, 4)} ms</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${toFixed(memoryWidth, 1)}%; background:#f472b6"></div>
            </div>
          </div>
          <div class="bar-row">
            <div class="bar-top">
              <span>MCP Full</span>
              <span>${toFixed(point.fullP95, 4)} ms</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${toFixed(fullWidth, 1)}%; background:#a78bfa"></div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="chart-card">
      <div class="chart-head">
        <h3>Speed Across Token Budgets</h3>
        <span class="direction direction-down">Lower is better</span>
      </div>
      ${rows}
    </div>
  `;
}

function groupedChoiceChart(input: {
  title: string;
  direction: "higher" | "lower";
  points: ChoiceBudgetPoint[];
  mcpValue: (point: ChoiceBudgetPoint) => number;
  grepValue: (point: ChoiceBudgetPoint) => number;
  unit?: string;
  decimals?: number;
}): string {
  const unit = input.unit ?? "";
  const decimals = input.decimals ?? 4;
  const maxValue = Math.max(
    0.0001,
    ...input.points.map((point) =>
      Math.max(input.mcpValue(point), input.grepValue(point)),
    ),
  );
  const directionClass =
    input.direction === "higher" ? "direction-up" : "direction-down";
  const directionLabel =
    input.direction === "higher" ? "Higher is better" : "Lower is better";

  const rows = input.points
    .map((point) => {
      const mcpValue = input.mcpValue(point);
      const grepValue = input.grepValue(point);
      const mcpWidth = (mcpValue / maxValue) * 100;
      const grepWidth = (grepValue / maxValue) * 100;
      return `
        <div class="budget-group">
          <div class="budget-title">${point.budget} token budget</div>
          <div class="bar-row">
            <div class="bar-top">
              <span>MCP Full</span>
              <span>${toFixed(mcpValue, decimals)}${unit}</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${toFixed(mcpWidth, 1)}%; background:#22c55e"></div>
            </div>
          </div>
          <div class="bar-row">
            <div class="bar-top">
              <span>Grep/Tools</span>
              <span>${toFixed(grepValue, decimals)}${unit}</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${toFixed(grepWidth, 1)}%; background:#f97316"></div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="chart-card">
      <div class="chart-head">
        <h3>${escapeHtml(input.title)}</h3>
        <span class="direction ${directionClass}">${directionLabel}</span>
      </div>
      ${rows}
    </div>
  `;
}

function scenarioChart(scenarios: BenchmarkScenario[]): string {
  const maxP95 = Math.max(
    0.0001,
    ...scenarios.map((scenario) => scenario.result.overall.p95),
  );

  const rows = scenarios
    .map((scenario) => {
      const width = (scenario.result.overall.p95 / maxP95) * 100;
      return `
        <div class="bar-row">
          <div class="bar-top">
            <span>${escapeHtml(scenario.label)}</span>
            <span>${toFixed(scenario.result.overall.p95)} ms</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${toFixed(width, 1)}%; background:#fb923c"></div>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="chart-card">
      <div class="chart-head">
        <h3>First-Question Cost By Retrieval Setup</h3>
        <span class="direction direction-down">Lower is better</span>
      </div>
      ${rows}
    </div>
  `;
}

function stageChart(fullScenario: BenchmarkScenario): string {
  const stages: Array<{ label: string; value: number; color: string }> = [
    {
      label: "RAG stage (semantic memory search)",
      value:
        fullScenario.result.stages.find((stage) => stage.stage === "rag")
          ?.p95 ?? 0,
      color: "#60a5fa",
    },
    {
      label: "KAG stage (code graph lookup)",
      value:
        fullScenario.result.stages.find((stage) => stage.stage === "kag")
          ?.p95 ?? 0,
      color: "#f59e0b",
    },
    {
      label: "GraphRAG stage (relationship traversal)",
      value:
        fullScenario.result.stages.find((stage) => stage.stage === "graphrag")
          ?.p95 ?? 0,
      color: "#34d399",
    },
  ];

  const maxValue = Math.max(0.0001, ...stages.map((stage) => stage.value));
  const rows = stages
    .map((stage) => {
      const width = (stage.value / maxValue) * 100;
      return `
        <div class="bar-row">
          <div class="bar-top">
            <span>${escapeHtml(stage.label)}</span>
            <span>${toFixed(stage.value)} ms</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${toFixed(width, 1)}%; background:${stage.color}"></div>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="chart-card">
      <div class="chart-head">
        <h3>What Adds Time Inside Full MCP</h3>
        <span class="direction direction-down">Lower is better</span>
      </div>
      ${rows}
    </div>
  `;
}

function extractRepresentativeQueries(
  report: RetrievalValueReport,
  limit = 5,
): string[] {
  const runs = report.runs ?? [];
  const uniqueQueries = new Set<string>();

  for (const run of runs) {
    const query = run.query?.trim();
    if (!query || uniqueQueries.has(query)) {
      continue;
    }
    uniqueQueries.add(query);
    if (uniqueQueries.size >= limit) {
      break;
    }
  }

  return Array.from(uniqueQueries);
}

function buildChoiceQueryComparisons(
  report: ChoiceBenchmarkReport,
): ChoiceQueryComparison[] {
  interface Bucket {
    query: string;
    mcp: { recall: number; precision: number; latency: number; count: number };
    grep: { recall: number; precision: number; latency: number; count: number };
  }

  const buckets = new Map<string, Bucket>();

  for (const run of report.runs) {
    const key = run.queryId;
    const existing = buckets.get(key) ?? {
      query: run.query,
      mcp: { recall: 0, precision: 0, latency: 0, count: 0 },
      grep: { recall: 0, precision: 0, latency: 0, count: 0 },
    };

    if (run.mode === "mcp_full") {
      existing.mcp.recall += run.fileRecall;
      existing.mcp.precision += run.filePrecision;
      existing.mcp.latency += run.latencyMs;
      existing.mcp.count += 1;
    } else {
      existing.grep.recall += run.fileRecall;
      existing.grep.precision += run.filePrecision;
      existing.grep.latency += run.latencyMs;
      existing.grep.count += 1;
    }

    buckets.set(key, existing);
  }

  const comparisons: ChoiceQueryComparison[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.mcp.count === 0 || bucket.grep.count === 0) {
      continue;
    }

    const mcpRecall = bucket.mcp.recall / bucket.mcp.count;
    const grepRecall = bucket.grep.recall / bucket.grep.count;
    const mcpPrecision = bucket.mcp.precision / bucket.mcp.count;
    const grepPrecision = bucket.grep.precision / bucket.grep.count;
    const mcpLatency = bucket.mcp.latency / bucket.mcp.count;
    const grepLatency = bucket.grep.latency / bucket.grep.count;

    let winner: "MCP Full" | "Grep/Tools" | "Tie" = "Tie";
    const recallGap = mcpRecall - grepRecall;
    if (Math.abs(recallGap) > 0.0001) {
      winner = recallGap > 0 ? "MCP Full" : "Grep/Tools";
    } else {
      const precisionGap = mcpPrecision - grepPrecision;
      if (Math.abs(precisionGap) > 0.0001) {
        winner = precisionGap > 0 ? "MCP Full" : "Grep/Tools";
      } else if (Math.abs(mcpLatency - grepLatency) > 0.0001) {
        winner = mcpLatency < grepLatency ? "MCP Full" : "Grep/Tools";
      }
    }

    comparisons.push({
      query: bucket.query,
      mcpRecall,
      grepRecall,
      mcpPrecision,
      grepPrecision,
      mcpLatency,
      grepLatency,
      winner,
    });
  }

  return comparisons.sort((left, right) => {
    const leftGap = Math.abs(left.mcpRecall - left.grepRecall);
    const rightGap = Math.abs(right.mcpRecall - right.grepRecall);
    return rightGap - leftGap;
  });
}

function renderPresentation(input: {
  warm: RetrievalValueReport;
  cold: RetrievalValueReport;
  budgetPoints: BudgetPoint[];
  choiceBudgetPoints: ChoiceBudgetPoint[];
  choiceQueryComparisons: ChoiceQueryComparison[];
  choiceGeneratedAt: string | null;
  matrix: ComponentMatrixReport;
  accessCode: AccessCodeFileBenchmarkReport | null;
}): string {
  const warmMemory = getMode(input.warm, "memory_only");
  const warmFull = getMode(input.warm, "mcp_full");
  const coldMemory = getMode(input.cold, "memory_only");
  const coldFull = getMode(input.cold, "mcp_full");

  const connectionCoverageMemory = warmMemory.quality?.entityRecallAvg ?? 0;
  const connectionCoverageFull = warmFull.quality?.entityRecallAvg ?? 0;
  const contextDepthMemory = warmMemory.sections.avgIncluded;
  const contextDepthFull = warmFull.sections.avgIncluded;
  const knownAnswerRecallMemory = warmMemory.quality?.memoryRecallAvg ?? 0;
  const knownAnswerRecallFull = warmFull.quality?.memoryRecallAvg ?? 0;
  const hitPrecisionMemory = warmMemory.quality?.precisionAtKAvg ?? 0;
  const hitPrecisionFull = warmFull.quality?.precisionAtKAvg ?? 0;

  const contextDepthMultiplier =
    contextDepthMemory > 0 ? contextDepthFull / contextDepthMemory : 0;
  const connectionCoverageLift =
    connectionCoverageFull - connectionCoverageMemory;
  const warmSpeedDelta = warmFull.latencyMs.p95 - warmMemory.latencyMs.p95;
  const coldSpeedDelta = coldFull.latencyMs.p95 - coldMemory.latencyMs.p95;

  const scenarios = Object.values(input.matrix.scenarios);
  const scenarioOrder = ["memory_only", "code_only", "graph_only", "full"];
  scenarios.sort(
    (left, right) =>
      scenarioOrder.indexOf(left.id) - scenarioOrder.indexOf(right.id),
  );
  const fullScenario =
    scenarios.find((scenario) => scenario.id === "full") ?? scenarios[0];
  const representativeQueries = extractRepresentativeQueries(input.warm, 5);
  const accessCodeMemory = input.accessCode
    ? getAccessMode(input.accessCode, "memory_only")
    : null;
  const accessCodeFull = input.accessCode
    ? getAccessMode(input.accessCode, "mcp_full")
    : null;
  const hasChoiceSlide =
    input.choiceBudgetPoints.length > 0 &&
    input.choiceQueryComparisons.length > 0;
  const choiceSlideNumber = 7;
  const accessCodeSlideNumber = hasChoiceSlide ? 8 : 7;
  const hasAccessCodeSlide = Boolean(
    input.accessCode && accessCodeMemory && accessCodeFull,
  );
  const finalSlideNumber = hasChoiceSlide
    ? hasAccessCodeSlide
      ? "Slide 9"
      : "Slide 8"
    : hasAccessCodeSlide
      ? "Slide 8"
      : "Slide 7";
  const choiceSlide = hasChoiceSlide
    ? `
  <section class="slide">
    <div class="kicker">Slide ${choiceSlideNumber}</div>
    <h2>Agent Strategy Benchmark: MCP vs Grep/Tools</h2>
    <p class="subtitle">Convoluted multi-file prompts where the model needs traversal across apps, packages, and infrastructure files.</p>
    <div class="chart-grid">
      ${groupedChoiceChart({
        title: "Average Retrieval Latency",
        direction: "lower",
        points: input.choiceBudgetPoints,
        mcpValue: (point) => point.mcpLatencyAvg,
        grepValue: (point) => point.grepLatencyAvg,
        unit: " ms",
        decimals: 2,
      })}
      ${groupedChoiceChart({
        title: "File Recall (% of expected files found)",
        direction: "higher",
        points: input.choiceBudgetPoints,
        mcpValue: (point) => point.mcpRecall * 100,
        grepValue: (point) => point.grepRecall * 100,
        unit: " %",
        decimals: 2,
      })}
      ${groupedChoiceChart({
        title: "File Precision (% of retrieved files that are correct)",
        direction: "higher",
        points: input.choiceBudgetPoints,
        mcpValue: (point) => point.mcpPrecision * 100,
        grepValue: (point) => point.grepPrecision * 100,
        unit: " %",
        decimals: 2,
      })}
      ${groupedChoiceChart({
        title: "Wrong-Path Ratio (irrelevant retrieved files)",
        direction: "lower",
        points: input.choiceBudgetPoints,
        mcpValue: (point) => (1 - point.mcpPrecision) * 100,
        grepValue: (point) => (1 - point.grepPrecision) * 100,
        unit: " %",
        decimals: 2,
      })}
    </div>
    <div class="bullets">
      ${input.choiceQueryComparisons
        .slice(0, 8)
        .map(
          (comparison) => `
      <div class="bullet">
        <strong>${comparison.winner} on this prompt:</strong> ${escapeHtml(comparison.query)}
        <div class="small">Recall MCP ${toFixed(comparison.mcpRecall * 100, 2)}% vs Grep ${toFixed(comparison.grepRecall * 100, 2)}% | Precision MCP ${toFixed(comparison.mcpPrecision * 100, 2)}% vs Grep ${toFixed(comparison.grepPrecision * 100, 2)}% | Latency MCP ${toFixed(comparison.mcpLatency, 2)}ms vs Grep ${toFixed(comparison.grepLatency, 2)}ms</div>
      </div>
      `,
        )
        .join("")}
    </div>
    <p class="meaning">What this means: this benchmark reflects the real operator choice: use structured MCP retrieval or ad-hoc grep/tool traversal. Correctness and speed are shown together per token budget and per real prompt. Example: 34.68% recall means MCP recovered 34.68% of expected ground-truth files in top-k (not milliseconds).</p>
    <p class="small">Wrong-Path Ratio counts all retrieved files that are not in ground truth, even if those files exist on disk. This is the practical irrelevance/hallucination penalty for multi-file retrieval.</p>
  </section>
`
    : "";
  const accessCodeSlide =
    input.accessCode && accessCodeMemory && accessCodeFull
      ? `
  <section class="slide">
    <div class="kicker">Slide ${accessCodeSlideNumber}</div>
    <h2>Access Code File Retrieval Benchmark</h2>
    <p class="subtitle">Question: ${escapeHtml(input.accessCode.query)}</p>
    <div class="chart-grid">
      ${comparisonBars({
        title: "Access Code File Recall (Strict)",
        direction: "higher",
        leftLabel: "Memory Only",
        leftValue: accessCodeMemory.quality.fileRecallAvg,
        rightLabel: "MCP Full",
        rightValue: accessCodeFull.quality.fileRecallAvg,
        decimals: 4,
        leftColor: "#38bdf8",
        rightColor: "#22c55e",
      })}
      ${comparisonBars({
        title: "Access Code File Recall (Indexed Scope)",
        direction: "higher",
        leftLabel: "Memory Only",
        leftValue: accessCodeMemory.quality.fileRecallIndexedAvg,
        rightLabel: "MCP Full",
        rightValue: accessCodeFull.quality.fileRecallIndexedAvg,
        decimals: 4,
        leftColor: "#60a5fa",
        rightColor: "#22c55e",
      })}
      ${comparisonBars({
        title: "Access Code File Precision",
        direction: "higher",
        leftLabel: "Memory Only",
        leftValue: accessCodeMemory.quality.filePrecisionAvg,
        rightLabel: "MCP Full",
        rightValue: accessCodeFull.quality.filePrecisionAvg,
        decimals: 4,
        leftColor: "#f59e0b",
        rightColor: "#22c55e",
      })}
    </div>
    <div class="grid">
      <div class="card">
        <h3>Expected Files</h3>
        <div class="metric">${input.accessCode.expectedFilePaths.length}</div>
        <p class="small">Ground-truth files across apps and packages</p>
      </div>
      <div class="card">
        <h3>Index Coverage</h3>
        <div class="metric ${input.accessCode.indexCoverage && input.accessCode.indexCoverage.coverage >= 0.95 ? "good" : "warn"}">${toFixed((input.accessCode.indexCoverage?.coverage ?? 0) * 100, 2)}%</div>
        <p class="small">Expected files present in code index</p>
      </div>
      <div class="card">
        <h3>MCP Full Missing Files</h3>
        <div class="metric ${accessCodeFull.quality.missingFiles.length === 0 ? "good" : "warn"}">${accessCodeFull.quality.missingFiles.length}</div>
        <p class="small">Missing from top-${input.accessCode.recallK} evidence</p>
      </div>
    </div>
    <p class="meaning">What this means: this is a concrete file-location correctness test. We score whether retrieval returns the real files where Access Code logic lives across web, API, shared types, and database packages.</p>
    <p class="small">Files missing from code index: ${escapeHtml(
      (input.accessCode.indexCoverage?.missingFromIndex ?? [])
        .slice(0, 8)
        .join(", ") || "None",
    )}</p>
    <p class="small">MCP Full matched files: ${escapeHtml(
      accessCodeFull.quality.matchedFiles.slice(0, 8).join(", ") || "None",
    )}</p>
  </section>
`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MCP Value Presentation</title>
  <style>
    :root {
      --bg: #070c18;
      --surface: #0f1628;
      --panel: #111b31;
      --ink: #e5edf9;
      --muted: #9eb1ce;
      --border: #253650;
      --good: #22c55e;
      --warn: #f59e0b;
      --bad: #ef4444;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      color: var(--ink);
      background: radial-gradient(1200px 700px at 12% -18%, #163760 0%, #0b1325 52%, #070c18 100%), var(--bg);
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      overflow-y: auto;
      scroll-snap-type: y mandatory;
    }
    .slide {
      min-height: 100vh;
      padding: 34px 30px;
      max-width: 1240px;
      margin: 0 auto;
      scroll-snap-align: start;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 16px;
    }
    h1, h2, h3, h4, p { margin: 0; }
    h1 { font-size: clamp(34px, 5vw, 56px); letter-spacing: -0.03em; }
    h2 { font-size: clamp(24px, 3.2vw, 40px); letter-spacing: -0.02em; }
    h3 { font-size: 20px; }
    p { line-height: 1.45; }
    .subtitle { color: var(--muted); font-size: 18px; max-width: 980px; }
    .kicker {
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #9ac8ff;
      font-size: 12px;
      font-weight: 700;
    }
    .grid {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }
    .card, .chart-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 14px;
    }
    .metric {
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-top: 6px;
    }
    .metric.good { color: var(--good); }
    .metric.warn { color: var(--warn); }
    .metric.bad { color: var(--bad); }
    .small { color: var(--muted); font-size: 13px; margin-top: 6px; }
    .chart-grid {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    }
    .chart-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }
    .direction {
      border-radius: 999px;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }
    .direction-up {
      background: rgba(34, 197, 94, 0.18);
      color: #7ee2a8;
      border: 1px solid rgba(34, 197, 94, 0.45);
    }
    .direction-down {
      background: rgba(245, 158, 11, 0.18);
      color: #f8d08b;
      border: 1px solid rgba(245, 158, 11, 0.45);
    }
    .bar-row { margin-top: 10px; }
    .bar-top {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 10px;
      font-size: 14px;
      margin-bottom: 6px;
    }
    .bar-track {
      width: 100%;
      height: 12px;
      border-radius: 999px;
      background: #16233b;
      border: 1px solid #233757;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 999px;
    }
    .budget-group {
      border-top: 1px solid #243752;
      padding-top: 10px;
      margin-top: 10px;
    }
    .budget-group:first-of-type {
      border-top: none;
      margin-top: 0;
      padding-top: 0;
    }
    .budget-title {
      font-size: 13px;
      color: #b6c8e2;
      margin-bottom: 6px;
      font-weight: 700;
    }
    .meaning {
      background: var(--panel);
      border: 1px solid #2b4368;
      border-radius: 12px;
      padding: 12px;
      color: #d7e2f4;
      font-size: 15px;
    }
    .bullets {
      display: grid;
      gap: 8px;
      margin-top: 4px;
    }
    .bullet {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
    }
    .footer {
      color: var(--muted);
      font-size: 12px;
    }
    @media (max-width: 820px) {
      .slide { padding: 22px 14px; }
      .chart-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <section class="slide">
    <div class="kicker">Presentation</div>
    <h1>MCP Value Story: Clear, Complete Answers Without Killing Speed</h1>
    <p class="subtitle">Non-technical readout from real app tests (${input.warm.queryCount} questions, repeated warm and cold runs). Everything below is designed for business and marketing audiences.</p>
    <div class="grid">
      <div class="card">
        <h3>Answer Depth</h3>
        <div class="metric good">${toFixed(contextDepthMultiplier, 2)}x</div>
        <p class="small">More supporting context with MCP Full</p>
      </div>
      <div class="card">
        <h3>Connection Coverage</h3>
        <div class="metric good">+${toFixed(connectionCoverageLift, 4)}</div>
        <p class="small">MCP finds more related concepts</p>
      </div>
      <div class="card">
        <h3>Repeat-Use Speed Gap</h3>
        <div class="metric ${warmSpeedDelta <= 0.05 ? "warn" : "bad"}">${toFixed(warmSpeedDelta, 4)} ms</div>
        <p class="small">MCP vs Memory Only (warm p95)</p>
      </div>
      <div class="card">
        <h3>First-Question Cost</h3>
        <div class="metric warn">+${toFixed(coldSpeedDelta, 4)} ms</div>
        <p class="small">MCP vs Memory Only (cold p95)</p>
      </div>
    </div>
    <p class="meaning">Headline: MCP gives richer, more complete answers. In repeated use, speed is nearly tied. On first question, MCP pays an extra cost to gather deeper context.</p>
  </section>

  <section class="slide">
    <div class="kicker">Slide 2</div>
    <h2>Coverage and Completeness Gains</h2>
    <div class="chart-grid">
      ${comparisonBars({
        title: "Connection Coverage (related concepts found)",
        direction: "higher",
        leftLabel: "Memory Only",
        leftValue: connectionCoverageMemory,
        rightLabel: "MCP Full",
        rightValue: connectionCoverageFull,
        decimals: 4,
        leftColor: "#38bdf8",
        rightColor: "#22c55e",
      })}
      ${comparisonBars({
        title: "Context Depth (supporting context blocks)",
        direction: "higher",
        leftLabel: "Memory Only",
        leftValue: contextDepthMemory,
        rightLabel: "MCP Full",
        rightValue: contextDepthFull,
        decimals: 3,
        leftColor: "#38bdf8",
        rightColor: "#22c55e",
      })}
    </div>
    <p class="meaning">What this means: MCP is not a small tweak. It brings in much broader context and many more meaningful connections, which helps with “full picture” responses.</p>
  </section>

  <section class="slide">
    <div class="kicker">Slide 3</div>
    <h2>Quality Mix: Focus vs Breadth</h2>
    <div class="chart-grid">
      ${comparisonBars({
        title: "Known-Answer Recall",
        direction: "higher",
        leftLabel: "Memory Only",
        leftValue: knownAnswerRecallMemory,
        rightLabel: "MCP Full",
        rightValue: knownAnswerRecallFull,
        decimals: 4,
        leftColor: "#60a5fa",
        rightColor: "#60a5fa",
      })}
      ${comparisonBars({
        title: "Hit Precision",
        direction: "higher",
        leftLabel: "Memory Only",
        leftValue: hitPrecisionMemory,
        rightLabel: "MCP Full",
        rightValue: hitPrecisionFull,
        decimals: 4,
        leftColor: "#f97316",
        rightColor: "#ef4444",
      })}
    </div>
    <p class="meaning">What this means: MCP keeps core recall strong while widening context. That broader pull can reduce precision concentration, so messaging should position MCP as “more complete” rather than “more narrowly filtered.”</p>
  </section>

  <section class="slide">
    <div class="kicker">Slide 4</div>
    <h2>Speed Story: Repeat Use vs First Question</h2>
    <div class="chart-grid">
      ${comparisonBars({
        title: "Repeat Use Speed (Warm p95)",
        direction: "lower",
        leftLabel: "Memory Only",
        leftValue: warmMemory.latencyMs.p95,
        rightLabel: "MCP Full",
        rightValue: warmFull.latencyMs.p95,
        unit: " ms",
        decimals: 4,
        leftColor: "#f472b6",
        rightColor: "#a78bfa",
      })}
      ${comparisonBars({
        title: "First Question Speed (Cold p95)",
        direction: "lower",
        leftLabel: "Memory Only",
        leftValue: coldMemory.latencyMs.p95,
        rightLabel: "MCP Full",
        rightValue: coldFull.latencyMs.p95,
        unit: " ms",
        decimals: 4,
        leftColor: "#f472b6",
        rightColor: "#a78bfa",
      })}
    </div>
    <p class="meaning">What this means: after warm-up, MCP speed is almost the same. The main cost is the first turn, where MCP does extra retrieval work to assemble richer context.</p>
  </section>

  <section class="slide">
    <div class="kicker">Slide 5</div>
    <h2>Real-World Stability Across Token Budgets</h2>
    ${
      hasChoiceSlide
        ? `
    <div class="chart-grid">
      ${groupedChoiceChart({
        title: "Average Retrieval Latency",
        direction: "lower",
        points: input.choiceBudgetPoints,
        mcpValue: (point) => point.mcpLatencyAvg,
        grepValue: (point) => point.grepLatencyAvg,
        unit: " ms",
        decimals: 2,
      })}
      ${groupedChoiceChart({
        title: "File Recall (% of expected files found)",
        direction: "higher",
        points: input.choiceBudgetPoints,
        mcpValue: (point) => point.mcpRecall * 100,
        grepValue: (point) => point.grepRecall * 100,
        unit: " %",
        decimals: 2,
      })}
    </div>
    <p class="meaning">What this means: across 16k-128k token budgets on convoluted traversal prompts, MCP keeps a higher recall profile while remaining in the same latency band as grep/tools. Token budget shifts do not erase the MCP quality advantage.</p>
`
        : `${groupedBudgetChart({ points: input.budgetPoints })}
    <p class="meaning">What this means: changing token budget had small impact on repeat-use speed in this dataset. The major business choice remains coverage depth vs first-turn cost.</p>`
    }
    ${
      representativeQueries.length > 0
        ? `
    <div class="bullets">
      ${representativeQueries
        .map(
          (query) =>
            `<div class="bullet"><strong>Traversal benchmark prompt:</strong> ${escapeHtml(query)}</div>`,
        )
        .join("")}
    </div>
`
        : ""
    }
  </section>

  <section class="slide">
    <div class="kicker">Slide 6</div>
    <h2>Where First-Turn Cost Comes From</h2>
    <div class="chart-grid">
      ${scenarioChart(scenarios)}
      ${stageChart(fullScenario)}
    </div>
    <p class="meaning">What this means: Graph-style retrieval is the biggest extra cost driver in first-turn latency. This is also where much of the additional context value comes from.</p>
  </section>

  ${choiceSlide}

  ${accessCodeSlide}

  <section class="slide">
    <div class="kicker">${finalSlideNumber}</div>
    <h2>How Marketing Can Position This</h2>
    <div class="bullets">
      <div class="bullet"><strong>Core message:</strong> “MCP gives a fuller answer, not just a faster lookup.”</div>
      <div class="bullet"><strong>Value promise:</strong> Better completeness and stronger cross-topic coverage for complex questions.</div>
      <div class="bullet"><strong>Honest tradeoff:</strong> Slightly slower first question, near-tied repeat-use speed.</div>
      <div class="bullet"><strong>Best fit buyers:</strong> Teams that care about answer confidence, context depth, and fewer missed dependencies.</div>
      <div class="bullet"><strong>Simple one-liner:</strong> “Basic memory is faster to simple; MCP is better for complete.”</div>
    </div>
    <p class="footer">Sources: ${escapeHtml(input.warm.generatedAt)} warm run, ${escapeHtml(input.cold.generatedAt)} cold run, ${escapeHtml(input.matrix.generatedAt)} component matrix${input.choiceGeneratedAt ? `, ${escapeHtml(input.choiceGeneratedAt)} MCP-vs-grep strategy benchmark` : ""}.</p>
  </section>
</body>
</html>`;
}

async function main(): Promise<void> {
  const warmPath = resolve(
    process.env.DOCLEA_MARKETING_WARM_JSON ??
      ".doclea/reports/mcp-value-report.thorough-budget-32000.json",
  );
  const coldPath = resolve(
    process.env.DOCLEA_MARKETING_COLD_JSON ??
      ".doclea/reports/mcp-value-report.thorough-cold-r6-32000.json",
  );
  const matrixPath = resolve(
    process.env.DOCLEA_MARKETING_MATRIX_JSON ??
      ".doclea/reports/retrieval-benchmark.component-matrix.uncached.qwen.32000.json",
  );
  const accessCodePath = resolve(
    process.env.DOCLEA_MARKETING_ACCESS_CODE_JSON ??
      ".doclea/reports/access-code-file-benchmark.json",
  );
  const budgetReports = parseBudgetReports();
  const choiceReports = parseChoiceReports();
  const outputPath = resolve(
    process.env.DOCLEA_MARKETING_OUTPUT_HTML ??
      ".doclea/reports/mcp-value-presentation.marketing.dark.html",
  );

  const warm = readJsonFile<RetrievalValueReport>(warmPath);
  const cold = readJsonFile<RetrievalValueReport>(coldPath);
  const matrix = readJsonFile<ComponentMatrixReport>(matrixPath);
  const accessCode = existsSync(accessCodePath)
    ? readJsonFile<AccessCodeFileBenchmarkReport>(accessCodePath)
    : null;
  const budgetPoints: BudgetPoint[] = budgetReports.map(
    ({ budget, path }): BudgetPoint => {
      const report = readJsonFile<RetrievalValueReport>(path);
      return {
        budget,
        memoryP95: getMode(report, "memory_only").latencyMs.p95,
        fullP95: getMode(report, "mcp_full").latencyMs.p95,
      };
    },
  );
  const choiceLoaded = choiceReports
    .filter(({ path }) => existsSync(path))
    .map(({ budget, path }) => ({
      budget,
      path,
      report: readJsonFile<ChoiceBenchmarkReport>(path),
    }))
    .sort((left, right) => left.budget - right.budget);
  const choiceBudgetPoints: ChoiceBudgetPoint[] = choiceLoaded.map(
    ({ budget, report }): ChoiceBudgetPoint => {
      const mcp = getChoiceMode(report, "mcp_full");
      const grep = getChoiceMode(report, "grep_tools");
      return {
        budget,
        mcpLatencyAvg: mcp.latencyMs.avg,
        grepLatencyAvg: grep.latencyMs.avg,
        mcpRecall: mcp.quality.fileRecallAvg,
        grepRecall: grep.quality.fileRecallAvg,
        mcpPrecision: mcp.quality.filePrecisionAvg,
        grepPrecision: grep.quality.filePrecisionAvg,
        mcpHallucinated: mcp.quality.hallucinatedRatioAvg,
        grepHallucinated: grep.quality.hallucinatedRatioAvg,
      };
    },
  );
  const choiceAnchorReport =
    choiceLoaded.length > 0
      ? (choiceLoaded[choiceLoaded.length - 1]?.report ?? null)
      : null;
  const choiceQueryComparisons = choiceAnchorReport
    ? buildChoiceQueryComparisons(choiceAnchorReport)
    : [];
  const choiceGeneratedAt = choiceAnchorReport?.generatedAt ?? null;

  const html = renderPresentation({
    warm,
    cold,
    budgetPoints,
    choiceBudgetPoints,
    choiceQueryComparisons,
    choiceGeneratedAt,
    matrix,
    accessCode,
  });
  writeFileSync(outputPath, html, "utf-8");

  console.log(
    JSON.stringify(
      {
        warmPath,
        coldPath,
        matrixPath,
        accessCodePath: accessCode ? accessCodePath : null,
        budgetPaths: budgetReports,
        choicePaths: choiceLoaded.map(({ budget, path }) => ({ budget, path })),
        outputPath,
      },
      null,
      2,
    ),
  );
}

await main();
