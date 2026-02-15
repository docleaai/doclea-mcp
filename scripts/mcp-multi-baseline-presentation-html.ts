import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type BenchmarkMode =
  | "mcp_full"
  | "grep_tools"
  | "filename_tools"
  | "symbol_index_tools"
  | "lsp_tools"
  | "hybrid_tools"
  | string;

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
    budgetUtilizationAvg?: number;
  };
  estimatedTimingMs?: {
    llmProcessingAvg: number;
    endToEndAvg: number;
    endToEndP95: number;
  };
}

interface ChoiceBenchmarkReport {
  generatedAt: string;
  fixturePath: string;
  tokenBudget: number;
  recallK: number;
  comparisonModel?: {
    grepOpenFiles: number;
    grepFileCharLimit: number;
    estimatedOutputTokens: number;
    inputTokensPerSecond: number;
    outputTokensPerSecond: number;
    activeModes?: string[];
  };
  modes: ChoiceModeSummary[];
}

interface BudgetReportPath {
  budget: number;
  path: string;
}

interface BudgetEntry {
  budget: number;
  report: ChoiceBenchmarkReport;
}

interface AggregateRow {
  mode: BenchmarkMode;
  recall: number;
  precision: number;
  wrongPath: number;
  inputTokens: number;
  utilization: number;
  retrievalMs: number;
  endToEndMs: number;
  tokensPerMatched: number;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function parseReports(projectPath: string): BudgetReportPath[] {
  const raw = process.env.DOCLEA_MULTI_BASELINE_REPORTS;
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
            `Invalid budget in DOCLEA_MULTI_BASELINE_REPORTS entry: ${entry}`,
          );
        }
        const path = resolve(pathParts.join(":"));
        return { budget, path };
      })
      .sort((left, right) => left.budget - right.budget);
  }

  return [1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000].map(
    (budget) => ({
      budget,
      path: resolve(
        projectPath,
        `.doclea/reports/mcp-vs-grep-choice-benchmark.multi.${budget}.json`,
      ),
    }),
  );
}

function modeLabel(mode: BenchmarkMode): string {
  switch (mode) {
    case "mcp_full":
      return "Doclea Full";
    case "mcp_hybrid_guardrail":
      return "Doclea Guardrail";
    case "grep_tools":
      return "Grep/Open";
    case "filename_tools":
      return "Filename";
    case "symbol_index_tools":
      return "Symbol Index";
    case "lsp_tools":
      return "LSP Graph";
    case "hybrid_tools":
      return "Hybrid";
    default:
      return mode.replaceAll("_", " ");
  }
}

function modeColor(mode: BenchmarkMode): string {
  switch (mode) {
    case "mcp_full":
      return "#22c55e";
    case "mcp_hybrid_guardrail":
      return "#14b8a6";
    case "grep_tools":
      return "#fb923c";
    case "filename_tools":
      return "#60a5fa";
    case "symbol_index_tools":
      return "#f472b6";
    case "lsp_tools":
      return "#a78bfa";
    case "hybrid_tools":
      return "#facc15";
    default:
      return "#94a3b8";
  }
}

function toFixed(value: number, decimals = 2): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : "0.00";
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildAggregate(entries: BudgetEntry[]): AggregateRow[] {
  const rows = new Map<BenchmarkMode, AggregateRow>();

  for (const entry of entries) {
    for (const mode of entry.report.modes) {
      const current = rows.get(mode.mode) ?? {
        mode: mode.mode,
        recall: 0,
        precision: 0,
        wrongPath: 0,
        inputTokens: 0,
        utilization: 0,
        retrievalMs: 0,
        endToEndMs: 0,
        tokensPerMatched: 0,
      };

      current.recall += mode.quality.fileRecallAvg;
      current.precision += mode.quality.filePrecisionAvg;
      current.wrongPath += 1 - mode.quality.filePrecisionAvg;
      current.inputTokens += mode.tokenUsage?.inputTokensAvg ?? 0;
      current.utilization += mode.tokenUsage?.budgetUtilizationAvg ?? 0;
      current.retrievalMs += mode.latencyMs.avg;
      current.endToEndMs +=
        mode.estimatedTimingMs?.endToEndAvg ?? mode.latencyMs.avg;
      current.tokensPerMatched += mode.tokenUsage?.tokensPerMatchedFileAvg ?? 0;

      rows.set(mode.mode, current);
    }
  }

  const divisor = Math.max(1, entries.length);
  return Array.from(rows.values())
    .map((row) => ({
      mode: row.mode,
      recall: row.recall / divisor,
      precision: row.precision / divisor,
      wrongPath: row.wrongPath / divisor,
      inputTokens: row.inputTokens / divisor,
      utilization: row.utilization / divisor,
      retrievalMs: row.retrievalMs / divisor,
      endToEndMs: row.endToEndMs / divisor,
      tokensPerMatched: row.tokensPerMatched / divisor,
    }))
    .sort((left, right) => {
      if (left.mode === "mcp_full") return -1;
      if (right.mode === "mcp_full") return 1;
      return right.recall - left.recall;
    });
}

function aggregateTable(rows: AggregateRow[]): string {
  const mcp = rows.find((row) => row.mode === "mcp_full");
  return `
  <table class="metric-table aggregate">
    <thead>
      <tr>
        <th>Mode</th>
        <th>Recall</th>
        <th>Precision</th>
        <th>Wrong-Path</th>
        <th>Input Tokens</th>
        <th>Cap Use</th>
        <th>Retrieval</th>
        <th>Est E2E</th>
        <th>Tok/Match</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map((row) => {
          const mcpRecallEdge = mcp ? (mcp.recall - row.recall) * 100 : 0;
          const modeClass = row.mode === "mcp_full" ? "mode-mcp" : "";
          return `<tr class="${modeClass}">
            <td>${escapeHtml(modeLabel(row.mode))}</td>
            <td>${toFixed(row.recall * 100, 2)}%</td>
            <td>${toFixed(row.precision * 100, 2)}%</td>
            <td>${toFixed(row.wrongPath * 100, 2)}%</td>
            <td>${toFixed(row.inputTokens, 0)}</td>
            <td>${toFixed(row.utilization * 100, 1)}%</td>
            <td>${toFixed(row.retrievalMs, 2)} ms</td>
            <td>${toFixed(row.endToEndMs, 2)} ms</td>
            <td>${toFixed(row.tokensPerMatched, 0)}</td>
          </tr>
          <tr class="edge-row ${modeClass}">
            <td colspan="9">Doclea recall edge vs ${escapeHtml(modeLabel(row.mode))}: ${row.mode === "mcp_full" ? "0.00" : toFixed(mcpRecallEdge, 2)} percentage points</td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>
`;
}

function modeChart(input: {
  title: string;
  rows: Array<{ mode: BenchmarkMode; value: number }>;
  direction: "higher" | "lower";
  unit?: string;
  decimals?: number;
}): string {
  const unit = input.unit ?? "";
  const decimals = input.decimals ?? 2;
  const values = input.rows.map((row) => row.value);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 1);
  const range = Math.max(0.000001, maxValue - minValue);

  const sorted = [...input.rows].sort((left, right) =>
    input.direction === "higher"
      ? right.value - left.value
      : left.value - right.value,
  );

  return `
    <div class="mini-chart">
      <h4>${escapeHtml(input.title)}</h4>
      ${sorted
        .map((row) => {
          const width = ((row.value - minValue) / range) * 100;
          return `
          <div class="mini-row">
            <div class="mini-top">
              <span>${escapeHtml(modeLabel(row.mode))}</span>
              <span>${toFixed(row.value, decimals)}${unit}</span>
            </div>
            <div class="mini-track">
              <div class="mini-fill" style="width:${toFixed(Math.max(4, width), 2)}%; background:${modeColor(row.mode)}"></div>
            </div>
          </div>`;
        })
        .join("")}
    </div>
  `;
}

function budgetTables(entries: BudgetEntry[]): string {
  return entries
    .map((entry) => {
      const rows = [...entry.report.modes].sort((left, right) => {
        if (left.mode === "mcp_full") return -1;
        if (right.mode === "mcp_full") return 1;
        return right.quality.fileRecallAvg - left.quality.fileRecallAvg;
      });
      const mcp = rows.find((row) => row.mode === "mcp_full");
      return `
      <div class="card">
        <h3>${entry.budget} input context cap</h3>
        <div class="budget-layout">
          <div class="table-pane">
            <table class="metric-table dense">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>Recall</th>
                  <th>Precision</th>
                  <th>Input Tok</th>
                  <th>Cap Use</th>
                  <th>Est E2E</th>
                  <th>Doclea Edge (Recall)</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map((row) => {
                    const edge = mcp
                      ? (mcp.quality.fileRecallAvg -
                          row.quality.fileRecallAvg) *
                        100
                      : 0;
                    const edgeClass =
                      row.mode === "mcp_full"
                        ? "edge-neutral"
                        : edge > 0
                          ? "edge-good"
                          : edge < 0
                            ? "edge-bad"
                            : "edge-neutral";
                    return `<tr class="${row.mode === "mcp_full" ? "mode-mcp" : ""}">
                      <td>${escapeHtml(modeLabel(row.mode))}</td>
                      <td>${toFixed(row.quality.fileRecallAvg * 100, 2)}%</td>
                      <td>${toFixed(row.quality.filePrecisionAvg * 100, 2)}%</td>
                      <td>${toFixed(row.tokenUsage?.inputTokensAvg ?? 0, 0)}</td>
                      <td>${toFixed((row.tokenUsage?.budgetUtilizationAvg ?? 0) * 100, 1)}%</td>
                      <td>${toFixed(row.estimatedTimingMs?.endToEndAvg ?? row.latencyMs.avg, 2)} ms</td>
                      <td class="${edgeClass}">${row.mode === "mcp_full" ? "0.00" : `${toFixed(edge, 2)} points`}</td>
                    </tr>`;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
          <div class="chart-pane">
            <div class="chart-stack">
            ${modeChart({
              title: "Recall",
              rows: rows.map((row) => ({
                mode: row.mode,
                value: row.quality.fileRecallAvg * 100,
              })),
              direction: "higher",
              unit: " %",
              decimals: 2,
            })}
            ${modeChart({
              title: "Estimated End-to-End",
              rows: rows.map((row) => ({
                mode: row.mode,
                value: row.estimatedTimingMs?.endToEndAvg ?? row.latencyMs.avg,
              })),
              direction: "lower",
              unit: " ms",
              decimals: 1,
            })}
            ${modeChart({
              title: "Budget Utilization",
              rows: rows.map((row) => ({
                mode: row.mode,
                value: (row.tokenUsage?.budgetUtilizationAvg ?? 0) * 100,
              })),
              direction: "higher",
              unit: " %",
              decimals: 1,
            })}
            </div>
          </div>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderHtml(input: {
  entries: BudgetEntry[];
  aggregateRows: AggregateRow[];
  generatedAt: string;
  fixturePath: string;
  comparisonModel: ChoiceBenchmarkReport["comparisonModel"] | null;
}): string {
  const mcp = input.aggregateRows.find((row) => row.mode === "mcp_full");
  const others = input.aggregateRows.filter((row) => row.mode !== "mcp_full");
  const bestNonMcpRecall = others.sort((a, b) => b.recall - a.recall)[0];
  const bestNonMcpE2E = [...others].sort(
    (a, b) => a.endToEndMs - b.endToEndMs,
  )[0];
  const bestNonMcpPrecision = [...others].sort(
    (a, b) => b.precision - a.precision,
  )[0];

  const recallLift =
    mcp && bestNonMcpRecall ? (mcp.recall - bestNonMcpRecall.recall) * 100 : 0;
  const precisionLift =
    mcp && bestNonMcpPrecision
      ? (mcp.precision - bestNonMcpPrecision.precision) * 100
      : 0;
  const tokenCut =
    mcp && bestNonMcpRecall && bestNonMcpRecall.inputTokens > 0
      ? ((bestNonMcpRecall.inputTokens - mcp.inputTokens) /
          bestNonMcpRecall.inputTokens) *
        100
      : 0;
  const e2eDelta =
    mcp && bestNonMcpE2E ? bestNonMcpE2E.endToEndMs - mcp.endToEndMs : 0;

  return (
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Doclea Multi-Baseline Benchmark</title>
  <style>
    :root {
      --bg: #060c18;
      --surface: #0f172a;
      --panel: #111f3a;
      --ink: #e5edf9;
      --muted: #9eb1ce;
      --border: #2b4063;
      --mcp: #22c55e;
      --warn: #f59e0b;
      --bad: #fb923c;
      --good: #4ade80;
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
      overflow-x: hidden;
    }
    .slide {
      min-height: 100vh;
      max-width: 1320px;
      width: 100%;
      margin: 0 auto;
      padding: 30px 22px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      justify-content: center;
      scroll-snap-align: start;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: clamp(30px, 4.2vw, 50px); letter-spacing: -0.02em; }
    h2 { font-size: clamp(24px, 3vw, 36px); letter-spacing: -0.02em; }
    h3 { font-size: 18px; }
    .kicker {
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #9ac8ff;
      font-size: 12px;
      font-weight: 700;
    }
    .subtitle { color: var(--muted); font-size: 16px; max-width: 1050px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px;
      overflow: hidden;
    }
    .metric {
      margin-top: 4px;
      font-size: 30px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--mcp);
    }
    .small { color: var(--muted); font-size: 12px; margin-top: 4px; }
    .cards-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }
    .split-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
      gap: 12px;
    }
    .budget-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(320px, 1fr);
      gap: 10px;
      align-items: start;
    }
    .table-pane {
      min-width: 0;
      max-width: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      padding-bottom: 2px;
    }
    .chart-pane {
      min-width: 0;
    }
    .chart-stack {
      display: grid;
      gap: 8px;
    }
    .metric-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .metric-table.aggregate { min-width: 860px; }
    .metric-table th,
    .metric-table td {
      border-bottom: 1px solid #243752;
      padding: 7px 8px;
      text-align: right;
      white-space: nowrap;
    }
    .metric-table.dense { min-width: 690px; }
    .metric-table th {
      color: #b6c8e2;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .metric-table th:first-child,
    .metric-table td:first-child {
      text-align: left;
    }
    .mode-mcp td {
      color: #bbf7d0;
      font-weight: 700;
    }
    .edge-row td {
      text-align: left;
      font-size: 12px;
      color: #94a3b8;
      background: rgba(11, 23, 45, 0.55);
    }
    .edge-good { color: var(--good); font-weight: 700; }
    .edge-bad { color: var(--bad); font-weight: 700; }
    .edge-neutral { color: #93c5fd; font-weight: 700; }
    .mini-chart {
      background: rgba(9, 20, 39, 0.65);
      border: 1px solid #243752;
      border-radius: 10px;
      padding: 9px;
    }
    .mini-chart h4 {
      font-size: 12px;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: #bfdbfe;
      margin-bottom: 7px;
    }
    .mini-row {
      margin-bottom: 7px;
    }
    .mini-row:last-child {
      margin-bottom: 0;
    }
    .mini-top {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #dbeafe;
      margin-bottom: 3px;
      gap: 8px;
    }
    .mini-track {
      height: 8px;
      border-radius: 999px;
      background: #182742;
      border: 1px solid #274067;
      overflow: hidden;
    }
    .mini-fill {
      height: 100%;
      border-radius: 999px;
    }
    .note {
      background: var(--panel);
      border: 1px solid #2b4368;
      border-radius: 10px;
      padding: 10px 12px;
      color: #d7e2f4;
      font-size: 14px;
    }
    @media (max-width: 1280px) {
      .split-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 820px) {
      .slide { padding: 18px 10px; }
      .cards-grid { grid-template-columns: 1fr; }
      .split-grid { grid-template-columns: 1fr; }
      .budget-layout { grid-template-columns: 1fr; }
      .metric-table.dense { min-width: 100%; }
    }
  </style>
</head>
<body>
  <section class="slide">
    <div class="kicker">Multi-Baseline Benchmark</div>
    <h1>Doclea vs Real Agent Tooling Baselines</h1>
    <p class="subtitle">Compared against grep/open-file, filename search, symbol-index search, and hybrid fusion on hard cross-app prompts with explicit ground-truth files.</p>
    <div class="grid">
      <div class="card">
        <h3>Recall Edge vs Best Baseline</h3>
        <div class="metric">${recallLift >= 0 ? "+" : "-"}${toFixed(Math.abs(recallLift), 2)} percentage points</div>
        <p class="small">Doclea vs ${escapeHtml(modeLabel(bestNonMcpRecall?.mode ?? "n/a"))}</p>
      </div>
      <div class="card">
        <h3>Precision Edge vs Best Baseline</h3>
        <div class="metric">${precisionLift >= 0 ? "+" : "-"}${toFixed(Math.abs(precisionLift), 2)} percentage points</div>
        <p class="small">Doclea vs ${escapeHtml(modeLabel(bestNonMcpPrecision?.mode ?? "n/a"))}</p>
      </div>
      <div class="card">
        <h3>Input Token Cut</h3>
        <div class="metric">-${toFixed(tokenCut, 2)}%</div>
        <p class="small">Doclea vs highest-recall non-Doclea baseline</p>
      </div>
      <div class="card">
        <h3>Estimated E2E Edge</h3>
        <div class="metric">${e2eDelta >= 0 ? "-" : "+"}${toFixed(Math.abs(e2eDelta), 2)} ms</div>
        <p class="small">Doclea vs fastest non-Doclea baseline (${escapeHtml(modeLabel(bestNonMcpE2E?.mode ?? "n/a"))})</p>
      </div>
    </div>
    <div class="split-grid">
      <div class="card">
        <h3>Aggregate League Table (avg across budgets)</h3>
        <div class="table-pane">
          ${aggregateTable(input.aggregateRows)}
        </div>
      </div>
      <div class="card">
        <h3>Aggregate Charts</h3>
        <div class="chart-stack">
          ${modeChart({
            title: "Recall",
            rows: input.aggregateRows.map((row) => ({
              mode: row.mode,
              value: row.recall * 100,
            })),
            direction: "higher",
            unit: " %",
            decimals: 2,
          })}
          ${modeChart({
            title: "Estimated End-to-End",
            rows: input.aggregateRows.map((row) => ({
              mode: row.mode,
              value: row.endToEndMs,
            })),
            direction: "lower",
            unit: " ms",
            decimals: 1,
          })}
          ${modeChart({
            title: "Input Tokens",
            rows: input.aggregateRows.map((row) => ({
              mode: row.mode,
              value: row.inputTokens,
            })),
            direction: "lower",
            unit: " tok",
            decimals: 0,
          })}
          ${modeChart({
            title: "Budget Utilization",
            rows: input.aggregateRows.map((row) => ({
              mode: row.mode,
              value: row.utilization * 100,
            })),
            direction: "higher",
            unit: " %",
            decimals: 1,
          })}
        </div>
      </div>
    </div>
  </section>

  <section class="slide">
    <div class="kicker">Slide 2</div>
    <h2>Budget-by-Budget Comparison Tables</h2>
    <div class="cards-grid">
      ${budgetTables(input.entries)}
    </div>
  </section>

  <section class="slide">
    <div class="kicker">Slide 3</div>
    <h2>Method Notes</h2>
    <div class="note">` +
    escapeHtml(
      `Input context cap ("token budget") is enforced on all modes. If a mode cannot fit additional file content within the cap, it stops adding evidence.`,
    ) +
    `</div>
    <div class="note">` +
    escapeHtml(
      `End-to-end time model: retrieval latency + input_tokens/input_tps + output_tokens/output_tps.`,
    ) +
    `</div>
    <div class="note">` +
    escapeHtml(
      `Tool baselines included: grep/open-file, filename search, symbol-index query, LSP-style graph traversal, and a hybrid rank-fusion baseline.`,
    ) +
    `</div>
    <div class="note">` +
    escapeHtml(
      `Fairness update: tool baselines now use snippet/chunk packing to utilize token caps instead of stopping at first oversized full-file block.`,
    ) +
    `</div>
    <div class="note">` +
    escapeHtml(
      `Fixture: ${input.fixturePath}. Generated: ${input.generatedAt}.`,
    ) +
    `</div>
    <div class="note">` +
    escapeHtml(
      `Token/time assumptions: ${input.comparisonModel ? `${input.comparisonModel.grepOpenFiles} open files, ${input.comparisonModel.grepFileCharLimit} chars/file, ${input.comparisonModel.estimatedOutputTokens} output tokens, ${input.comparisonModel.inputTokensPerSecond} in tok/s, ${input.comparisonModel.outputTokensPerSecond} out tok/s.` : "N/A"}`,
    ) +
    `</div>
  </section>
</body>
</html>`
  );
}

async function main(): Promise<void> {
  const projectPath = resolve(
    process.env.DOCLEA_BENCH_PROJECT_PATH ?? process.cwd(),
  );
  const reportPaths = parseReports(projectPath).filter(({ path }) =>
    existsSync(path),
  );
  if (reportPaths.length === 0) {
    throw new Error("No multi-baseline reports found.");
  }

  const entries: BudgetEntry[] = reportPaths
    .map(({ budget, path }) => ({
      budget,
      report: readJson<ChoiceBenchmarkReport>(path),
    }))
    .sort((left, right) => left.budget - right.budget);

  const aggregateRows = buildAggregate(entries);
  const anchor = entries[entries.length - 1]?.report;
  if (!anchor) {
    throw new Error("Missing anchor report.");
  }
  const outputPath = resolve(
    process.env.DOCLEA_MULTI_BASELINE_OUTPUT_HTML ??
      `${projectPath}/.doclea/reports/mcp-value-presentation.marketing.dark.html`,
  );
  const html = renderHtml({
    entries,
    aggregateRows,
    generatedAt: new Date().toISOString(),
    fixturePath: anchor.fixturePath,
    comparisonModel: anchor.comparisonModel ?? null,
  });
  writeFileSync(outputPath, html, "utf-8");

  console.log(
    JSON.stringify(
      {
        outputPath,
        budgets: entries.map((entry) => entry.budget),
        modes: Array.from(
          new Set(
            entries.flatMap((entry) =>
              entry.report.modes.map((mode) => mode.mode),
            ),
          ),
        ),
        fixturePath: anchor.fixturePath,
      },
      null,
      2,
    ),
  );
}

await main();
