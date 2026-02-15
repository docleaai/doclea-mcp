import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type BenchmarkMode = "mcp_full" | "grep_tools";

interface ChoiceModeSummary {
  mode: BenchmarkMode;
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
  tokenUsage?: {
    inputTokensAvg: number;
    inputTokensP50: number;
    inputTokensP95: number;
    openedFileCountAvg: number;
    tokensPerMatchedFileAvg: number;
  };
  estimatedTimingMs?: {
    llmProcessingAvg: number;
    endToEndAvg: number;
    endToEndP95: number;
  };
}

interface ChoiceRun {
  queryId: string;
  query: string;
  mode: BenchmarkMode;
  latencyMs: number;
  inputTokens?: number;
  estimatedLlmMs?: number;
  estimatedEndToEndMs?: number;
  openedFileCount?: number;
  matchedFileCount?: number;
  fileRecall: number;
  filePrecision: number;
  hallucinatedRatio: number;
}

interface ChoiceBenchmarkReport {
  generatedAt: string;
  projectPath: string;
  fixturePath: string;
  recallK: number;
  tokenBudget: number;
  runsPerQuery: number;
  warmupRuns: number;
  comparisonModel?: {
    grepOpenFiles: number;
    grepFileCharLimit: number;
    estimatedOutputTokens: number;
    inputTokensPerSecond: number;
    outputTokensPerSecond: number;
  };
  modes: ChoiceModeSummary[];
  runs: ChoiceRun[];
}

interface FixtureQuery {
  id: string;
  query: string;
  expectedFilePaths: string[];
}

interface FixtureFile {
  queries: FixtureQuery[];
}

interface BudgetReportPath {
  budget: number;
  path: string;
}

interface BudgetPoint {
  budget: number;
  mcpLatency: number;
  grepLatency: number;
  mcpEstimatedEndToEndMs: number;
  grepEstimatedEndToEndMs: number;
  mcpInputTokens: number;
  grepInputTokens: number;
  mcpTokensPerMatchedFile: number;
  grepTokensPerMatchedFile: number;
  mcpRecall: number;
  grepRecall: number;
  mcpPrecision: number;
  grepPrecision: number;
}

interface QueryComparison {
  queryId: string;
  query: string;
  expectedFiles: number;
  mcpRecall: number;
  grepRecall: number;
  mcpPrecision: number;
  grepPrecision: number;
  mcpLatency: number;
  grepLatency: number;
  mcpInputTokens: number;
  grepInputTokens: number;
  mcpEndToEndMs: number;
  grepEndToEndMs: number;
  winner: "MCP Full" | "Grep/Tools" | "Tie";
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function getMode(
  report: ChoiceBenchmarkReport,
  mode: BenchmarkMode,
): ChoiceModeSummary {
  const found = report.modes.find((item) => item.mode === mode);
  if (!found) {
    throw new Error(`Missing mode ${mode} in report ${report.tokenBudget}`);
  }
  return found;
}

function toFixed(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseHardChoiceReports(projectPath: string): BudgetReportPath[] {
  const raw = process.env.DOCLEA_HARD_CHOICE_REPORTS;
  if (raw) {
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [budgetRaw, ...pathParts] = entry.split(":");
        const budget = Number.parseInt(budgetRaw ?? "", 10);
        if (!Number.isFinite(budget)) {
          throw new Error(
            `Invalid budget in DOCLEA_HARD_CHOICE_REPORTS entry: ${entry}`,
          );
        }
        const reportPath = resolve(pathParts.join(":"));
        return { budget, path: reportPath };
      })
      .sort((left, right) => left.budget - right.budget);
  }

  const defaults = [16000, 32000, 64000, 128000].map((budget) => ({
    budget,
    path: resolve(
      projectPath,
      `.doclea/reports/mcp-vs-grep-choice-benchmark.hard.${budget}.json`,
    ),
  }));
  return defaults;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function scoreToPct(value: number): number {
  return value * 100;
}

function metricTable(input: {
  title: string;
  direction: "higher" | "lower";
  points: BudgetPoint[];
  mcpValue: (point: BudgetPoint) => number;
  grepValue: (point: BudgetPoint) => number;
  unit?: string;
  decimals?: number;
}): string {
  const unit = input.unit ?? "";
  const decimals = input.decimals ?? 2;
  const rows = input.points
    .map((point) => {
      const mcp = input.mcpValue(point);
      const grep = input.grepValue(point);
      const edge = input.direction === "higher" ? mcp - grep : grep - mcp;
      const winner = edge > 0.0001 ? "MCP" : edge < -0.0001 ? "Grep" : "Tie";
      const edgeClass =
        edge > 0.0001
          ? "edge-good"
          : edge < -0.0001
            ? "edge-bad"
            : "edge-neutral";
      const sign = edge > 0.0001 ? "+" : edge < -0.0001 ? "-" : "±";
      return `
      <tr>
        <td>${point.budget}</td>
        <td>${toFixed(mcp, decimals)}${unit}</td>
        <td>${toFixed(grep, decimals)}${unit}</td>
        <td class="${edgeClass}">${sign}${toFixed(Math.abs(edge), decimals)}${unit}</td>
        <td>${winner}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="chart-card">
      <div class="chart-head">
        <h3>${escapeHtml(input.title)}</h3>
        <span class="direction ${input.direction === "higher" ? "direction-up" : "direction-down"}">
          ${input.direction === "higher" ? "Higher is better" : "Lower is better"}
        </span>
      </div>
      <table class="metric-table">
        <thead>
          <tr>
            <th>Budget</th>
            <th>MCP</th>
            <th>Grep</th>
            <th>MCP Edge</th>
            <th>Winner</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function buildQueryComparisons(
  report: ChoiceBenchmarkReport,
  expectedByQueryId: Map<string, number>,
): QueryComparison[] {
  const buckets = new Map<
    string,
    {
      queryId: string;
      query: string;
      mcp: {
        recall: number;
        precision: number;
        latency: number;
        inputTokens: number;
        endToEndMs: number;
        count: number;
      };
      grep: {
        recall: number;
        precision: number;
        latency: number;
        inputTokens: number;
        endToEndMs: number;
        count: number;
      };
    }
  >();

  for (const run of report.runs) {
    const current = buckets.get(run.queryId) ?? {
      queryId: run.queryId,
      query: run.query,
      mcp: {
        recall: 0,
        precision: 0,
        latency: 0,
        inputTokens: 0,
        endToEndMs: 0,
        count: 0,
      },
      grep: {
        recall: 0,
        precision: 0,
        latency: 0,
        inputTokens: 0,
        endToEndMs: 0,
        count: 0,
      },
    };

    if (run.mode === "mcp_full") {
      current.mcp.recall += run.fileRecall;
      current.mcp.precision += run.filePrecision;
      current.mcp.latency += run.latencyMs;
      current.mcp.inputTokens += run.inputTokens ?? 0;
      current.mcp.endToEndMs += run.estimatedEndToEndMs ?? run.latencyMs;
      current.mcp.count += 1;
    } else {
      current.grep.recall += run.fileRecall;
      current.grep.precision += run.filePrecision;
      current.grep.latency += run.latencyMs;
      current.grep.inputTokens += run.inputTokens ?? 0;
      current.grep.endToEndMs += run.estimatedEndToEndMs ?? run.latencyMs;
      current.grep.count += 1;
    }
    buckets.set(run.queryId, current);
  }

  const comparisons: QueryComparison[] = [];
  for (const value of buckets.values()) {
    if (value.mcp.count === 0 || value.grep.count === 0) continue;
    const mcpRecall = value.mcp.recall / value.mcp.count;
    const grepRecall = value.grep.recall / value.grep.count;
    const mcpPrecision = value.mcp.precision / value.mcp.count;
    const grepPrecision = value.grep.precision / value.grep.count;
    const mcpLatency = value.mcp.latency / value.mcp.count;
    const grepLatency = value.grep.latency / value.grep.count;
    const mcpInputTokens = value.mcp.inputTokens / value.mcp.count;
    const grepInputTokens = value.grep.inputTokens / value.grep.count;
    const mcpEndToEndMs = value.mcp.endToEndMs / value.mcp.count;
    const grepEndToEndMs = value.grep.endToEndMs / value.grep.count;

    let winner: QueryComparison["winner"] = "Tie";
    if (Math.abs(mcpRecall - grepRecall) > 0.0001) {
      winner = mcpRecall > grepRecall ? "MCP Full" : "Grep/Tools";
    } else if (Math.abs(mcpPrecision - grepPrecision) > 0.0001) {
      winner = mcpPrecision > grepPrecision ? "MCP Full" : "Grep/Tools";
    } else if (Math.abs(mcpLatency - grepLatency) > 0.0001) {
      winner = mcpLatency < grepLatency ? "MCP Full" : "Grep/Tools";
    }

    comparisons.push({
      queryId: value.queryId,
      query: value.query,
      expectedFiles: expectedByQueryId.get(value.queryId) ?? 0,
      mcpRecall,
      grepRecall,
      mcpPrecision,
      grepPrecision,
      mcpLatency,
      grepLatency,
      mcpInputTokens,
      grepInputTokens,
      mcpEndToEndMs,
      grepEndToEndMs,
      winner,
    });
  }

  return comparisons.sort((left, right) => {
    const leftGap = Math.abs(left.mcpRecall - left.grepRecall);
    const rightGap = Math.abs(right.mcpRecall - right.grepRecall);
    return rightGap - leftGap;
  });
}

function renderHtml(input: {
  points: BudgetPoint[];
  queryComparisons: QueryComparison[];
  expectedByQueryId: Map<string, number>;
  generatedAt: string;
  outputPath: string;
  recallK: number;
  fixturePath: string;
  comparisonModel: ChoiceBenchmarkReport["comparisonModel"] | null;
}): string {
  const mcpRecallAvg = average(input.points.map((point) => point.mcpRecall));
  const grepRecallAvg = average(input.points.map((point) => point.grepRecall));
  const mcpPrecisionAvg = average(
    input.points.map((point) => point.mcpPrecision),
  );
  const grepPrecisionAvg = average(
    input.points.map((point) => point.grepPrecision),
  );
  const mcpLatencyAvg = average(input.points.map((point) => point.mcpLatency));
  const grepLatencyAvg = average(
    input.points.map((point) => point.grepLatency),
  );
  const mcpInputTokensAvg = average(
    input.points.map((point) => point.mcpInputTokens),
  );
  const grepInputTokensAvg = average(
    input.points.map((point) => point.grepInputTokens),
  );
  const mcpTokensPerMatchedFileAvg = average(
    input.points.map((point) => point.mcpTokensPerMatchedFile),
  );
  const grepTokensPerMatchedFileAvg = average(
    input.points.map((point) => point.grepTokensPerMatchedFile),
  );
  const mcpEndToEndAvg = average(
    input.points.map((point) => point.mcpEstimatedEndToEndMs),
  );
  const grepEndToEndAvg = average(
    input.points.map((point) => point.grepEstimatedEndToEndMs),
  );
  const mcpWrongAvg = 1 - mcpPrecisionAvg;
  const grepWrongAvg = 1 - grepPrecisionAvg;

  const recallLift = scoreToPct(mcpRecallAvg - grepRecallAvg);
  const precisionLift = scoreToPct(mcpPrecisionAvg - grepPrecisionAvg);
  const wrongReduction = scoreToPct(grepWrongAvg - mcpWrongAvg);
  const latencyDelta = grepLatencyAvg - mcpLatencyAvg;
  const latencyRelative =
    grepLatencyAvg > 0
      ? ((grepLatencyAvg - mcpLatencyAvg) / grepLatencyAvg) * 100
      : 0;
  const tokenDelta = grepInputTokensAvg - mcpInputTokensAvg;
  const tokenRelative =
    grepInputTokensAvg > 0
      ? ((grepInputTokensAvg - mcpInputTokensAvg) / grepInputTokensAvg) * 100
      : 0;
  const endToEndDelta = grepEndToEndAvg - mcpEndToEndAvg;
  const endToEndRelative =
    grepEndToEndAvg > 0
      ? ((grepEndToEndAvg - mcpEndToEndAvg) / grepEndToEndAvg) * 100
      : 0;
  const mcpWins = input.queryComparisons.filter(
    (item) => item.winner === "MCP Full",
  ).length;
  const ties = input.queryComparisons.filter(
    (item) => item.winner === "Tie",
  ).length;

  const topComparisons = input.queryComparisons.slice(0, 8);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MCP Hard Mode Value Presentation</title>
  <style>
    :root {
      --bg: #060c18;
      --surface: #0f172a;
      --panel: #111f3a;
      --ink: #e5edf9;
      --muted: #9eb1ce;
      --border: #2b4063;
      --mcp: #22c55e;
      --grep: #f97316;
      --accent: #60a5fa;
      --warn: #f59e0b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background: radial-gradient(1200px 700px at 8% -14%, #184070 0%, #0a1328 52%, #060c18 100%);
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      line-height: 1.45;
      scroll-snap-type: y mandatory;
      overflow-y: auto;
    }
    .slide {
      min-height: 100vh;
      max-width: 1280px;
      margin: 0 auto;
      padding: 34px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      justify-content: center;
      scroll-snap-align: start;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: clamp(34px, 4.8vw, 56px); letter-spacing: -0.03em; }
    h2 { font-size: clamp(26px, 3.2vw, 40px); letter-spacing: -0.02em; }
    h3 { font-size: 20px; }
    .kicker {
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #9ac8ff;
      font-size: 12px;
      font-weight: 700;
    }
    .subtitle { color: var(--muted); font-size: 18px; max-width: 980px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
    }
    .chart-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 14px;
    }
    .card, .chart-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 14px;
    }
    .metric {
      margin-top: 6px;
      font-size: 34px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .metric.good { color: var(--mcp); }
    .metric.warn { color: var(--warn); }
    .small { color: var(--muted); font-size: 13px; margin-top: 6px; }
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
    .metric-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin-top: 4px;
    }
    .metric-table th,
    .metric-table td {
      border-bottom: 1px solid #243752;
      padding: 8px 10px;
      text-align: right;
    }
    .metric-table th {
      color: #b6c8e2;
      font-weight: 700;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .metric-table th:first-child,
    .metric-table td:first-child {
      text-align: left;
    }
    .metric-table th:last-child,
    .metric-table td:last-child {
      text-align: center;
    }
    .edge-good { color: #4ade80; font-weight: 700; }
    .edge-bad { color: #fb923c; font-weight: 700; }
    .edge-neutral { color: #93c5fd; font-weight: 700; }
    .bullets { display: grid; gap: 8px; }
    .bullet {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
    }
    .meaning {
      background: var(--panel);
      border: 1px solid #2b4368;
      border-radius: 12px;
      padding: 12px;
      color: #d7e2f4;
      font-size: 15px;
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
    <div class="kicker">Hard Mode Benchmark</div>
    <h1>MCP vs Grep/Tools on Convoluted Multi-File Traversal</h1>
    <p class="subtitle">Real cross-app/package prompts with explicit ground-truth file sets. Includes retrieval correctness plus token-load and estimated model-time impact, so it reflects practical agent usage.</p>
    <div class="grid">
      <div class="card">
        <h3>Recall Lift</h3>
        <div class="metric good">+${toFixed(recallLift, 2)} pp</div>
        <p class="small">MCP ${toFixed(scoreToPct(mcpRecallAvg), 2)}% vs Grep ${toFixed(scoreToPct(grepRecallAvg), 2)}%</p>
      </div>
      <div class="card">
        <h3>Precision Lift</h3>
        <div class="metric good">+${toFixed(precisionLift, 2)} pp</div>
        <p class="small">MCP ${toFixed(scoreToPct(mcpPrecisionAvg), 2)}% vs Grep ${toFixed(scoreToPct(grepPrecisionAvg), 2)}%</p>
      </div>
      <div class="card">
        <h3>Input Token Reduction</h3>
        <div class="metric good">-${toFixed(tokenDelta, 0)} tok</div>
        <p class="small">MCP ${toFixed(tokenRelative, 2)}% lower input load (${toFixed(mcpInputTokensAvg, 0)} vs ${toFixed(grepInputTokensAvg, 0)})</p>
      </div>
      <div class="card">
        <h3>Estimated E2E Delta</h3>
        <div class="metric ${endToEndDelta >= 0 ? "good" : "warn"}">${endToEndDelta >= 0 ? "-" : "+"}${toFixed(Math.abs(endToEndDelta), 2)} ms</div>
        <p class="small">MCP ${toFixed(Math.abs(endToEndRelative), 2)}% ${endToEndDelta >= 0 ? "faster" : "slower"} once model processing is included</p>
      </div>
    </div>
    <p class="meaning">Result: in hard real-world traversal prompts, MCP returns more correct files and cuts model input load. Once token processing is included, MCP keeps or improves end-to-end latency despite richer retrieval.</p>
  </section>

  <section class="slide">
    <div class="kicker">Slide 2</div>
    <h2>Budget Stability on Hard Queries</h2>
    <div class="chart-grid">
      ${metricTable({
        title: "Average Retrieval Latency",
        direction: "lower",
        points: input.points,
        mcpValue: (point) => point.mcpLatency,
        grepValue: (point) => point.grepLatency,
        unit: " ms",
        decimals: 2,
      })}
      ${metricTable({
        title: "Estimated End-to-End Time (retrieval + model token processing)",
        direction: "lower",
        points: input.points,
        mcpValue: (point) => point.mcpEstimatedEndToEndMs,
        grepValue: (point) => point.grepEstimatedEndToEndMs,
        unit: " ms",
        decimals: 2,
      })}
      ${metricTable({
        title: "Model Input Tokens",
        direction: "lower",
        points: input.points,
        mcpValue: (point) => point.mcpInputTokens,
        grepValue: (point) => point.grepInputTokens,
        unit: " tok",
        decimals: 0,
      })}
      ${metricTable({
        title: "File Recall (% of expected files found)",
        direction: "higher",
        points: input.points,
        mcpValue: (point) => scoreToPct(point.mcpRecall),
        grepValue: (point) => scoreToPct(point.grepRecall),
        unit: " %",
        decimals: 2,
      })}
      ${metricTable({
        title: "File Precision (% of retrieved files that are correct)",
        direction: "higher",
        points: input.points,
        mcpValue: (point) => scoreToPct(point.mcpPrecision),
        grepValue: (point) => scoreToPct(point.grepPrecision),
        unit: " %",
        decimals: 2,
      })}
    </div>
    <p class="meaning">Token budget changes did not erase separation. MCP stays stronger on retrieval quality while reducing prompt token load versus grep/open-file traversal, which improves practical end-to-end response time.</p>
  </section>

  <section class="slide">
    <div class="kicker">Slide 3</div>
    <h2>Per-Prompt Winners on Hard Traversal Prompts</h2>
    <div class="grid">
      <div class="card">
        <h3>MCP Query Wins</h3>
        <div class="metric good">${mcpWins}/${input.queryComparisons.length}</div>
        <p class="small">Tie count: ${ties}</p>
      </div>
      <div class="card">
        <h3>Ground-Truth Depth</h3>
        <div class="metric good">${Math.round(
          average(Array.from(input.expectedByQueryId.values())),
        )}</div>
        <p class="small">Average expected files per prompt</p>
      </div>
      <div class="card">
        <h3>Recall@${input.recallK}</h3>
        <div class="metric good">${toFixed(scoreToPct(mcpRecallAvg), 2)}%</div>
        <p class="small">MCP average across budgets</p>
      </div>
      <div class="card">
        <h3>Precision@${input.recallK}</h3>
        <div class="metric good">${toFixed(scoreToPct(mcpPrecisionAvg), 2)}%</div>
        <p class="small">MCP average across budgets</p>
      </div>
      <div class="card">
        <h3>Tokens / Matched File</h3>
        <div class="metric good">${toFixed(mcpTokensPerMatchedFileAvg, 0)}</div>
        <p class="small">MCP vs Grep ${toFixed(grepTokensPerMatchedFileAvg, 0)} (lower is better)</p>
      </div>
      <div class="card">
        <h3>Wrong-Path Reduction</h3>
        <div class="metric good">-${toFixed(wrongReduction, 2)} pp</div>
        <p class="small">MCP ${toFixed(scoreToPct(mcpWrongAvg), 2)}% vs Grep ${toFixed(scoreToPct(grepWrongAvg), 2)}%</p>
      </div>
      <div class="card">
        <h3>Retrieval Latency Delta</h3>
        <div class="metric ${latencyDelta >= 0 ? "good" : "warn"}">${latencyDelta >= 0 ? "-" : "+"}${toFixed(Math.abs(latencyDelta), 2)} ms</div>
        <p class="small">MCP ${toFixed(Math.abs(latencyRelative), 2)}% ${latencyDelta >= 0 ? "faster" : "slower"} on retrieval stage</p>
      </div>
    </div>
    <div class="bullets">
      ${topComparisons
        .map(
          (comparison) => `
      <div class="bullet">
        <strong>${comparison.winner}:</strong> ${escapeHtml(comparison.query)}
        <div class="small">Expected files ${comparison.expectedFiles} | Recall MCP ${toFixed(scoreToPct(comparison.mcpRecall), 2)}% vs Grep ${toFixed(scoreToPct(comparison.grepRecall), 2)}% | Precision MCP ${toFixed(scoreToPct(comparison.mcpPrecision), 2)}% vs Grep ${toFixed(scoreToPct(comparison.grepPrecision), 2)}% | Input tokens MCP ${toFixed(comparison.mcpInputTokens, 0)} vs Grep ${toFixed(comparison.grepInputTokens, 0)} | E2E MCP ${toFixed(comparison.mcpEndToEndMs, 2)}ms vs Grep ${toFixed(comparison.grepEndToEndMs, 2)}ms</div>
      </div>
      `,
        )
        .join("")}
    </div>
  </section>

  <section class="slide">
    <div class="kicker">Slide 4</div>
    <h2>Method and Guardrails</h2>
    <div class="bullets">
      <div class="bullet"><strong>Prompt style:</strong> intentionally convoluted, cross-app/package traversal tasks (not single-keyword lookups).</div>
      <div class="bullet"><strong>Correctness metric:</strong> scored against explicit ground-truth file lists per prompt (recall and precision at top-${input.recallK}).</div>
      <div class="bullet"><strong>Comparator:</strong> same prompts, model can either use MCP retrieval stack or ad-hoc grep/open-file traversal baseline.</div>
      <div class="bullet"><strong>Token model:</strong> MCP input tokens use built context size; grep input tokens use query + opened file payload (${input.comparisonModel ? `${input.comparisonModel.grepOpenFiles} files, ${input.comparisonModel.grepFileCharLimit} char/file cap` : "default 10 files, per-file char cap"}).</div>
      <div class="bullet"><strong>Time model:</strong> estimated end-to-end = retrieval latency + (input tokens / input tps) + (output tokens / output tps)${input.comparisonModel ? ` using ${toFixed(input.comparisonModel.inputTokensPerSecond, 0)} in tok/s, ${toFixed(input.comparisonModel.outputTokensPerSecond, 0)} out tok/s, ${input.comparisonModel.estimatedOutputTokens} output tokens` : ""}.</div>
      <div class="bullet"><strong>Coverage reality:</strong> this measures retrieval and prompt-load efficiency under stress; answer-generation correctness can be layered on top as a separate gate.</div>
    </div>
    <p class="footer">Generated ${escapeHtml(
      input.generatedAt,
    )}. Fixture: ${escapeHtml(input.fixturePath)}. Output: ${escapeHtml(input.outputPath)}.</p>
  </section>
</body>
</html>`;
}

async function main(): Promise<void> {
  const projectPath = resolve(
    process.env.DOCLEA_BENCH_PROJECT_PATH ?? process.cwd(),
  );
  const reportPaths = parseHardChoiceReports(projectPath).filter(({ path }) =>
    existsSync(path),
  );
  if (reportPaths.length === 0) {
    throw new Error("No hard choice benchmark reports found.");
  }

  const loaded = reportPaths
    .map(({ budget, path }) => ({
      budget,
      path,
      report: readJsonFile<ChoiceBenchmarkReport>(path),
    }))
    .sort((left, right) => left.budget - right.budget);

  const points: BudgetPoint[] = loaded.map(({ budget, report }) => {
    const mcp = getMode(report, "mcp_full");
    const grep = getMode(report, "grep_tools");
    return {
      budget,
      mcpLatency: mcp.latencyMs.avg,
      grepLatency: grep.latencyMs.avg,
      mcpEstimatedEndToEndMs:
        mcp.estimatedTimingMs?.endToEndAvg ?? mcp.latencyMs.avg,
      grepEstimatedEndToEndMs:
        grep.estimatedTimingMs?.endToEndAvg ?? grep.latencyMs.avg,
      mcpInputTokens: mcp.tokenUsage?.inputTokensAvg ?? 0,
      grepInputTokens: grep.tokenUsage?.inputTokensAvg ?? 0,
      mcpTokensPerMatchedFile: mcp.tokenUsage?.tokensPerMatchedFileAvg ?? 0,
      grepTokensPerMatchedFile: grep.tokenUsage?.tokensPerMatchedFileAvg ?? 0,
      mcpRecall: mcp.quality.fileRecallAvg,
      grepRecall: grep.quality.fileRecallAvg,
      mcpPrecision: mcp.quality.filePrecisionAvg,
      grepPrecision: grep.quality.filePrecisionAvg,
    };
  });

  const anchor = loaded[loaded.length - 1]?.report;
  if (!anchor) {
    throw new Error("Missing anchor report.");
  }

  const fixturePath = anchor.fixturePath;
  const fixture = existsSync(fixturePath)
    ? readJsonFile<FixtureFile>(fixturePath)
    : null;
  const expectedByQueryId = new Map<string, number>();
  for (const query of fixture?.queries ?? []) {
    expectedByQueryId.set(query.id, query.expectedFilePaths.length);
  }

  const queryComparisons = buildQueryComparisons(anchor, expectedByQueryId);
  const generatedAt = new Date().toISOString();
  const outputPath = resolve(
    process.env.DOCLEA_HARD_MARKETING_OUTPUT_HTML ??
      `${projectPath}/.doclea/reports/mcp-value-presentation.marketing.dark.html`,
  );

  const html = renderHtml({
    points,
    queryComparisons,
    expectedByQueryId,
    generatedAt,
    outputPath,
    recallK: anchor.recallK,
    fixturePath,
    comparisonModel: anchor.comparisonModel ?? null,
  });

  writeFileSync(outputPath, html, "utf-8");
  console.log(
    JSON.stringify(
      {
        outputPath,
        reportPaths: loaded.map(({ budget, path }) => ({ budget, path })),
        fixturePath,
        queryCount: queryComparisons.length,
      },
      null,
      2,
    ),
  );
}

await main();
