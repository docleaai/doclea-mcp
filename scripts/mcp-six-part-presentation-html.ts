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

interface ModeSnapshot {
  mode: BenchmarkMode;
  recall: number;
  precision: number;
  wrongPath: number;
  inputTokens: number;
  budgetUtilization: number;
  retrievalMs: number;
  endToEndMs: number;
}

interface SixPartReport {
  generatedAt: string;
  projectPath: string;
  sourceReports: Array<{ budget: number; path: string }>;
  anchorBudget: number;
  lowBudget: number;
  highBudget: number;
  fixturePath: string;
  queryCount: number;
  parts: {
    issueLocalization: {
      budget: number;
      modes: ModeSnapshot[];
      mcpRecallEdgeVsBestBaselinePoints: number;
      mcpTokenCutVsBestRecallBaselinePct: number;
      hardestQueries: Array<{
        queryId: string;
        expectedFiles: number;
        expectedScopes: number;
        mcpRecall: number;
        bestBaselineRecall: number;
        edgePoints: number;
      }>;
    };
    citationGroundedQa: {
      budget: number;
      queryComplexity: {
        avgExpectedFiles: number;
        avgExpectedScopes: number;
      };
      modes: Array<{
        mode: BenchmarkMode;
        citationRecall: number;
        citationPrecision: number;
        hallucinatedCitationRate: number;
        crossScopeCoverage: number;
        strictCitationScore: number;
      }>;
    };
    contextRetentionProxy: {
      lowBudget: number;
      highBudget: number;
      modes: Array<{
        mode: BenchmarkMode;
        lowRecall: number;
        highRecall: number;
        retentionRatio: number;
        recallDropPoints: number;
        lowInputTokens: number;
        highInputTokens: number;
      }>;
    };
    docDriftDetection: {
      docsScanned: number;
      staleReferencesFound: number;
      staleReferenceRate: number;
      driftHotspotScore: number;
      generatedQueries: number;
      triageComparison: {
        budget: number;
        docleaMode: BenchmarkMode;
        llmMode: BenchmarkMode;
        docleaFoundRate: number;
        llmFoundRate: number;
        foundEdgePoints: number;
        docleaInputTokens: number;
        llmInputTokens: number;
        tokenCutPct: number;
        docleaEndToEndMs: number;
        llmEndToEndMs: number;
        endToEndSpeedupX: number;
      } | null;
      triageComparisons: Array<{
        budget: number;
        docleaMode: BenchmarkMode;
        llmMode: BenchmarkMode;
        docleaFoundRate: number;
        llmFoundRate: number;
        foundEdgePoints: number;
        docleaInputTokens: number;
        llmInputTokens: number;
        tokenCutPct: number;
        docleaEndToEndMs: number;
        llmEndToEndMs: number;
        endToEndSpeedupX: number;
      }>;
      topDocsByDrift: Array<{
        docPath: string;
        staleRefs: number;
      }>;
      topScopesByDrift: Array<{
        scope: string;
        staleRefs: number;
      }>;
      sampleStaleReferences: Array<{
        docPath: string;
        referencedPath: string;
        suggestedCurrentPath: string;
      }>;
    };
    fixedQualityCostLatency: {
      targetRecall: number;
      targetPrecision: number;
      inputPricePerMTokenUsd: number;
      outputPricePerMTokenUsd: number;
      estimatedOutputTokens: number;
      modes: Array<{
        mode: BenchmarkMode;
        selectedBudget: number;
        metTarget: boolean;
        recall: number;
        precision: number;
        inputTokens: number;
        endToEndMs: number;
        estimatedCostUsdPerQuery: number;
      }>;
    };
    modeledHumanTaskAB: {
      budget: number;
      successThresholdRecall: number;
      successThresholdPrecision: number;
      retryPenaltyMinutes: number;
      verificationPenaltyMinutes: number;
      searchPenaltyMinutes: number;
      modes: Array<{
        mode: BenchmarkMode;
        successRate: number;
        modeledMinutesToCorrectAnswer: number;
        recall: number;
        precision: number;
        endToEndMs: number;
        productivityIndex: number;
      }>;
    };
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
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

let chartCounter = 0;

function nextChartId(prefix: string): string {
  chartCounter += 1;
  return `${prefix}-${chartCounter}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toFixed(value: number, decimals = 2): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : "0.00";
}

function pct(value: number, decimals = 2): string {
  return `${toFixed(value * 100, decimals)}%`;
}

function bars(input: {
  title: string;
  direction: "higher" | "lower";
  rows: Array<{ mode: BenchmarkMode; value: number }>;
  unit: string;
  decimals?: number;
}): string {
  const decimals = input.decimals ?? 2;
  const directionLabel =
    input.direction === "higher" ? "Higher is better" : "Lower is better";
  const sorted = [...input.rows].sort((left, right) =>
    input.direction === "higher"
      ? right.value - left.value
      : left.value - right.value,
  );
  const chartId = nextChartId("metric-mode");
  const payload = JSON.stringify({
    chartId,
    labels: sorted.map((row) => modeLabel(row.mode)),
    ids: sorted.map((row) => String(row.mode)),
    values: sorted.map((row) =>
      Number.isFinite(row.value) ? Number(row.value.toFixed(decimals)) : 0,
    ),
    unit: input.unit,
    decimals,
    direction: input.direction,
    metricLabel: input.title,
  }).replaceAll("<", "\\u003c");

  return `
  <div class="mini-chart">
    <div class="mini-head">
      <h4>${escapeHtml(input.title)}</h4>
      <span class="mini-badge ${input.direction === "higher" ? "mini-good" : "mini-low"}">${directionLabel}</span>
    </div>
    <div class="drift-canvas-wrap">
      <canvas id="${chartId}" class="drift-canvas"></canvas>
    </div>
  </div>
  <script type="application/json" id="metric-data-${chartId}">${payload}</script>`;
}

function labelBars(input: {
  title: string;
  direction: "higher" | "lower";
  rows: Array<{ label: string; value: number }>;
  unit: string;
  decimals?: number;
  badgeLabel?: string;
}): string {
  const decimals = input.decimals ?? 2;
  const directionLabel =
    input.badgeLabel ??
    (input.direction === "higher" ? "Higher is better" : "Lower is better");
  const sorted = [...input.rows].sort((left, right) =>
    input.direction === "higher"
      ? right.value - left.value
      : left.value - right.value,
  );
  const chartId = nextChartId("metric-label");
  const payload = JSON.stringify({
    chartId,
    labels: sorted.map((row) => row.label),
    ids: sorted.map((row, index) => `label-${index}`),
    values: sorted.map((row) =>
      Number.isFinite(row.value) ? Number(row.value.toFixed(decimals)) : 0,
    ),
    unit: input.unit,
    decimals,
    direction: input.direction,
    metricLabel: input.title,
  }).replaceAll("<", "\\u003c");

  return `
  <div class="mini-chart">
    <div class="mini-head">
      <h4>${escapeHtml(input.title)}</h4>
      <span class="mini-badge ${input.direction === "higher" ? "mini-good" : "mini-low"}">${directionLabel}</span>
    </div>
    <div class="drift-canvas-wrap">
      <canvas id="${chartId}" class="drift-canvas"></canvas>
    </div>
  </div>
  <script type="application/json" id="metric-data-${chartId}">${payload}</script>`;
}

function stackedSplitChart(input: {
  title: string;
  direction: "higher" | "lower";
  leftLabel: string;
  rightLabel: string;
  leftColor: string;
  rightColor: string;
  rows: Array<{
    label: string;
    leftValue: number;
    rightValue: number;
    unit: string;
    decimals?: number;
  }>;
}): string {
  const directionLabel =
    input.direction === "higher" ? "Higher is better" : "Lower is better";
  return `
  <div class="mini-chart">
    <div class="mini-head">
      <h4>${escapeHtml(input.title)}</h4>
      <span class="mini-badge ${input.direction === "higher" ? "mini-good" : "mini-low"}">${directionLabel}</span>
    </div>
    <div class="split-legend">
      <span><i style="background:${input.leftColor}"></i>${escapeHtml(input.leftLabel)}</span>
      <span><i style="background:${input.rightColor}"></i>${escapeHtml(input.rightLabel)}</span>
    </div>
    ${input.rows
      .map((row) => {
        const decimals = row.decimals ?? 2;
        const total = Math.max(0.000001, row.leftValue + row.rightValue);
        const leftPct = (row.leftValue / total) * 100;
        const rightPct = Math.max(0, 100 - leftPct);
        return `
        <div class="mini-row">
          <div class="mini-top">
            <span>${escapeHtml(row.label)}</span>
            <span>${toFixed(row.leftValue, decimals)}${escapeHtml(row.unit)} / ${toFixed(row.rightValue, decimals)}${escapeHtml(row.unit)}</span>
          </div>
          <div class="stacked-track">
            <div class="stacked-left" style="width:${toFixed(leftPct, 2)}%; background:${input.leftColor}"></div>
            <div class="stacked-right" style="width:${toFixed(rightPct, 2)}%; background:${input.rightColor}"></div>
          </div>
        </div>
      `;
      })
      .join("")}
  </div>`;
}

function renderIssueTable(rows: ModeSnapshot[]): string {
  const sorted = [...rows].sort((left, right) => {
    if (left.mode === "mcp_full") return -1;
    if (right.mode === "mcp_full") return 1;
    return right.recall - left.recall;
  });
  return `
  <table class="metric-table dense">
    <thead>
      <tr>
        <th>Mode</th>
        <th>Recall</th>
        <th>Precision</th>
        <th>Wrong-Path</th>
        <th>Input Tok</th>
        <th>Cap Use</th>
        <th>Est E2E</th>
      </tr>
    </thead>
    <tbody>
      ${sorted
        .map(
          (row) => `
        <tr class="${row.mode === "mcp_full" ? "mode-mcp" : ""}">
          <td>${escapeHtml(modeLabel(row.mode))}</td>
          <td>${pct(row.recall, 2)}</td>
          <td>${pct(row.precision, 2)}</td>
          <td>${pct(row.wrongPath, 2)}</td>
          <td>${toFixed(row.inputTokens, 0)}</td>
          <td>${pct(row.budgetUtilization, 1)}</td>
          <td>${toFixed(row.endToEndMs, 1)} ms</td>
        </tr>
      `,
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderCitationTable(
  rows: SixPartReport["parts"]["citationGroundedQa"]["modes"],
): string {
  const sorted = [...rows].sort((left, right) => {
    if (left.mode === "mcp_full") return -1;
    if (right.mode === "mcp_full") return 1;
    return right.strictCitationScore - left.strictCitationScore;
  });
  return `
  <table class="metric-table dense">
    <thead>
      <tr>
        <th>Mode</th>
        <th>Citation Recall</th>
        <th>Citation Precision</th>
        <th>Hallucinated Citation</th>
        <th>Cross-Scope Coverage</th>
        <th>Strict Score</th>
      </tr>
    </thead>
    <tbody>
      ${sorted
        .map(
          (row) => `
        <tr class="${row.mode === "mcp_full" ? "mode-mcp" : ""}">
          <td>${escapeHtml(modeLabel(row.mode))}</td>
          <td>${pct(row.citationRecall, 2)}</td>
          <td>${pct(row.citationPrecision, 2)}</td>
          <td>${pct(row.hallucinatedCitationRate, 2)}</td>
          <td>${pct(row.crossScopeCoverage, 2)}</td>
          <td>${pct(row.strictCitationScore, 2)}</td>
        </tr>
      `,
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderRetentionTable(
  rows: SixPartReport["parts"]["contextRetentionProxy"]["modes"],
): string {
  return `
  <table class="metric-table dense">
    <thead>
      <tr>
        <th>Mode</th>
        <th>Low Recall</th>
        <th>High Recall</th>
        <th>Retention Ratio</th>
        <th>Recall Drop</th>
        <th>Low Tok</th>
        <th>High Tok</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (row) => `
        <tr class="${row.mode === "mcp_full" ? "mode-mcp" : ""}">
          <td>${escapeHtml(modeLabel(row.mode))}</td>
          <td>${pct(row.lowRecall, 2)}</td>
          <td>${pct(row.highRecall, 2)}</td>
          <td>${toFixed(row.retentionRatio, 3)}x</td>
          <td>${toFixed(row.recallDropPoints, 2)} points</td>
          <td>${toFixed(row.lowInputTokens, 0)}</td>
          <td>${toFixed(row.highInputTokens, 0)}</td>
        </tr>
      `,
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderFixedQualityTable(
  rows: SixPartReport["parts"]["fixedQualityCostLatency"]["modes"],
): string {
  return `
  <table class="metric-table dense">
    <thead>
      <tr>
        <th>Mode</th>
        <th>Selected Cap</th>
        <th>Target Met</th>
        <th>Recall</th>
        <th>Precision</th>
        <th>Input Tok</th>
        <th>Est E2E</th>
        <th>Cost / Query</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (row) => `
        <tr class="${row.mode === "mcp_full" ? "mode-mcp" : ""}">
          <td>${escapeHtml(modeLabel(row.mode))}</td>
          <td>${row.selectedBudget}</td>
          <td>${row.metTarget ? "yes" : "no"}</td>
          <td>${pct(row.recall, 2)}</td>
          <td>${pct(row.precision, 2)}</td>
          <td>${toFixed(row.inputTokens, 0)}</td>
          <td>${toFixed(row.endToEndMs, 1)} ms</td>
          <td>$${toFixed(row.estimatedCostUsdPerQuery, 6)}</td>
        </tr>
      `,
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderModeledAbTable(
  rows: SixPartReport["parts"]["modeledHumanTaskAB"]["modes"],
): string {
  return `
  <table class="metric-table dense">
    <thead>
      <tr>
        <th>Mode</th>
        <th>Success Rate</th>
        <th>Modeled Minutes</th>
        <th>Productivity Index</th>
        <th>Recall</th>
        <th>Precision</th>
        <th>Est E2E</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (row) => `
        <tr class="${row.mode === "mcp_full" ? "mode-mcp" : ""}">
          <td>${escapeHtml(modeLabel(row.mode))}</td>
          <td>${pct(row.successRate, 2)}</td>
          <td>${toFixed(row.modeledMinutesToCorrectAnswer, 2)} min</td>
          <td>${toFixed(row.productivityIndex, 2)}x</td>
          <td>${pct(row.recall, 2)}</td>
          <td>${pct(row.precision, 2)}</td>
          <td>${toFixed(row.endToEndMs, 1)} ms</td>
        </tr>
      `,
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderDocDriftTriageTable(
  comparisons: SixPartReport["parts"]["docDriftDetection"]["triageComparisons"],
): string {
  if (comparisons.length === 0) {
    return `<p class="small">No drift triage mode comparison was generated.</p>`;
  }
  const grouped = new Map<BenchmarkMode, Array<(typeof comparisons)[number]>>();
  for (const comparison of comparisons) {
    const current = grouped.get(comparison.docleaMode) ?? [];
    current.push(comparison);
    grouped.set(comparison.docleaMode, current);
  }

  const modeOrder = ["mcp_hybrid_guardrail", "mcp_full"];
  const sortedModes = [
    ...modeOrder.filter((mode) => grouped.has(mode)),
    ...Array.from(grouped.keys()).filter((mode) => !modeOrder.includes(mode)),
  ];

  return sortedModes
    .map((mode) => {
      const rows = [...(grouped.get(mode) ?? [])].sort(
        (left, right) => right.foundEdgePoints - left.foundEdgePoints,
      );
      if (rows.length === 0) return "";
      const head = rows[0]!;
      const wins = rows.filter((row) => row.foundEdgePoints > 0).length;
      const modeName = modeLabel(mode);
      const modeSlug = String(mode).replaceAll("_", "-");
      const methods = [
        {
          id: mode,
          label: modeName,
          found: Number((head.docleaFoundRate * 100).toFixed(2)),
          tokens: Number(head.docleaInputTokens.toFixed(2)),
          e2e: Number(head.docleaEndToEndMs.toFixed(2)),
        },
        ...rows.map((row) => ({
          id: row.llmMode,
          label: modeLabel(row.llmMode),
          found: Number((row.llmFoundRate * 100).toFixed(2)),
          tokens: Number(row.llmInputTokens.toFixed(2)),
          e2e: Number(row.llmEndToEndMs.toFixed(2)),
        })),
      ];
      const chartPayload = JSON.stringify({
        mode,
        modeSlug,
        modeName,
        methods,
      }).replaceAll("<", "\\u003c");

      return `
      <div class="triage-block">
        <div class="chips triage-chips">
          <span class="chip"><strong>${escapeHtml(modeName)}</strong></span>
          <span class="chip">Found: ${pct(head.docleaFoundRate, 2)}</span>
          <span class="chip">Input: ${toFixed(head.docleaInputTokens, 0)} tok</span>
          <span class="chip">E2E: ${toFixed(head.docleaEndToEndMs, 1)} ms</span>
          <span class="chip">Wins: ${wins}/${rows.length}</span>
        </div>
        <div class="triage-chart-grid">
          <div class="mini-chart">
            <div class="mini-head">
              <h4>${escapeHtml(modeName)} vs Other Methods (Found Rate)</h4>
              <span class="mini-badge mini-good">Higher is better</span>
            </div>
            <div class="drift-canvas-wrap">
              <canvas id="drift-${modeSlug}-found-group" class="drift-canvas"></canvas>
            </div>
          </div>
          <div class="mini-chart">
            <div class="mini-head">
              <h4>${escapeHtml(modeName)} vs Other Methods (Input Tokens)</h4>
              <span class="mini-badge mini-low">Lower is better</span>
            </div>
            <div class="drift-canvas-wrap">
              <canvas id="drift-${modeSlug}-tokens-group" class="drift-canvas"></canvas>
            </div>
          </div>
          <div class="mini-chart">
            <div class="mini-head">
              <h4>${escapeHtml(modeName)} vs Other Methods (E2E Time)</h4>
              <span class="mini-badge mini-low">Lower is better</span>
            </div>
            <div class="drift-canvas-wrap">
              <canvas id="drift-${modeSlug}-time-group" class="drift-canvas"></canvas>
            </div>
          </div>
        </div>
        <script type="application/json" id="drift-data-${modeSlug}">${chartPayload}</script>
        <div class="table-wrap">
          <table class="metric-table dense">
            <thead>
              <tr>
                <th>Other Method</th>
                <th>Other Found</th>
                <th>Edge vs ${escapeHtml(modeLabel(mode))}</th>
                <th>Other Tok</th>
                <th>Token Cut</th>
                <th>Other E2E</th>
                <th>Speedup</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row) => `
                <tr>
                  <td>${escapeHtml(modeLabel(row.llmMode))}</td>
                  <td>${pct(row.llmFoundRate, 2)}</td>
                  <td class="${row.foundEdgePoints >= 0 ? "edge-good" : "edge-bad"}">${toFixed(row.foundEdgePoints, 2)} pts</td>
                  <td>${toFixed(row.llmInputTokens, 0)}</td>
                  <td>${toFixed(row.tokenCutPct, 2)}%</td>
                  <td>${toFixed(row.llmEndToEndMs, 1)} ms</td>
                  <td>${toFixed(row.endToEndSpeedupX, 2)}x</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>`;
    })
    .join("");
}

function renderHtml(report: SixPartReport): string {
  chartCounter = 0;
  const issueModes = report.parts.issueLocalization.modes;
  const citationModes = report.parts.citationGroundedQa.modes;
  const retentionModes = report.parts.contextRetentionProxy.modes;
  const driftTriageComparison = report.parts.docDriftDetection.triageComparison;
  const driftTriageComparisons =
    report.parts.docDriftDetection.triageComparisons?.length > 0
      ? report.parts.docDriftDetection.triageComparisons
      : driftTriageComparison
        ? [driftTriageComparison]
        : [];
  const guardrailComparisons = driftTriageComparisons.filter(
    (row) => row.docleaMode === "mcp_hybrid_guardrail",
  );
  const fullComparisons = driftTriageComparisons.filter(
    (row) => row.docleaMode === "mcp_full",
  );
  const bestGuardrailVsLlm = [...guardrailComparisons].sort(
    (left, right) => right.foundEdgePoints - left.foundEdgePoints,
  )[0];
  const bestFullVsLlm = [...fullComparisons].sort(
    (left, right) => right.foundEdgePoints - left.foundEdgePoints,
  )[0];
  const guardrailWins = guardrailComparisons.filter(
    (row) => row.foundEdgePoints > 0,
  ).length;
  const fullWins = fullComparisons.filter(
    (row) => row.foundEdgePoints > 0,
  ).length;
  const fixedModes = report.parts.fixedQualityCostLatency.modes;
  const modeledModes = report.parts.modeledHumanTaskAB.modes;

  const mcpIssue = issueModes.find((row) => row.mode === "mcp_full");
  const bestIssueBaseline = issueModes
    .filter((row) => row.mode !== "mcp_full")
    .sort((left, right) => right.recall - left.recall)[0];
  const mcpModeled = modeledModes.find((row) => row.mode === "mcp_full");
  const bestModeledBaseline = modeledModes
    .filter((row) => row.mode !== "mcp_full")
    .sort(
      (left, right) =>
        left.modeledMinutesToCorrectAnswer -
        right.modeledMinutesToCorrectAnswer,
    )[0];
  const modeledEdgeMinutes =
    mcpModeled && bestModeledBaseline
      ? bestModeledBaseline.modeledMinutesToCorrectAnswer -
        mcpModeled.modeledMinutesToCorrectAnswer
      : 0;
  const techStack = [
    "Doclea MCP retrieval graph",
    "Qdrant vector store",
    "SQLite code graph + symbol index",
    "ripgrep + open-file tooling baselines",
    "LSP graph traversal baseline",
    "Chart.js visualization",
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Doclea Six-Part Benchmark</title>
  <style>
    :root {
      --bg: #050a16;
      --panel: #0d1730;
      --surface: #0f1d38;
      --card: #101f3d;
      --ink: #e5edf9;
      --muted: #9eb1ce;
      --line: #2a4063;
      --good: #22c55e;
      --warn: #f59e0b;
      --bad: #fb923c;
      --accent: #60a5fa;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background: radial-gradient(1200px 700px at 8% -16%, #194173 0%, #0a1328 50%, #050a16 100%);
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      line-height: 1.42;
      overflow-x: hidden;
    }
    .deck {
      max-width: 1400px;
      margin: 0 auto;
      padding: 22px 16px 34px;
      display: grid;
      gap: 14px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px;
      overflow: hidden;
    }
    .hero {
      display: grid;
      gap: 12px;
      grid-template-columns: 1.5fr 1fr;
    }
    .kicker {
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #9ac8ff;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    h1, h2, h3, h4, p { margin: 0; }
    h1 { font-size: clamp(30px, 4vw, 46px); letter-spacing: -0.02em; }
    h2 { font-size: clamp(20px, 2.6vw, 30px); letter-spacing: -0.02em; }
    h3 { font-size: 16px; margin-bottom: 6px; }
    .subtitle { color: var(--muted); margin-top: 4px; font-size: 14px; max-width: 980px; }
    .tech-chips { margin-top: 10px; }
    .hero-metrics {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .metric-box {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px;
    }
    .metric-label { color: #bfd0e8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    .metric-value { font-size: 30px; line-height: 1.05; font-weight: 700; letter-spacing: -0.02em; color: #bff5cf; margin-top: 4px; }
    .metric-sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
    .section {
      display: grid;
      gap: 8px;
    }
    .split {
      display: grid;
      gap: 10px;
      grid-template-columns: minmax(0, 1.35fr) minmax(300px, 1fr);
      align-items: start;
    }
    .table-wrap {
      min-width: 0;
      overflow-x: auto;
      overflow-y: hidden;
      padding-bottom: 2px;
    }
    .chart-col { min-width: 0; display: grid; gap: 8px; }
    .metric-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .metric-table.dense { min-width: 760px; }
    .metric-table th,
    .metric-table td {
      border-bottom: 1px solid #233755;
      padding: 7px 8px;
      white-space: nowrap;
      text-align: right;
    }
    .metric-table th:first-child,
    .metric-table td:first-child { text-align: left; }
    .metric-table th {
      color: #b6c8e2;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 11px;
    }
    .mode-mcp td { color: #bbf7d0; font-weight: 700; }
    .group-row td {
      text-align: left !important;
      font-size: 12px;
      color: #93c5fd;
      background: rgba(11, 24, 46, 0.78);
      border-top: 1px solid #2a4368;
      border-bottom: 1px solid #2a4368;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .mode-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid #2a4368;
      letter-spacing: 0.02em;
    }
    .pill-guardrail {
      color: #99f6e4;
      background: rgba(15, 118, 110, 0.35);
      border-color: rgba(20, 184, 166, 0.55);
    }
    .pill-full {
      color: #bbf7d0;
      background: rgba(22, 101, 52, 0.35);
      border-color: rgba(34, 197, 94, 0.55);
    }
    .mini-chart {
      background: rgba(9, 20, 39, 0.65);
      border: 1px solid #233755;
      border-radius: 10px;
      padding: 9px;
    }
    .mini-chart h4 {
      font-size: 12px;
      color: #bfdbfe;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .mini-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 7px;
    }
    .mini-badge {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid #2b4368;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }
    .mini-good {
      color: #86efac;
      border-color: rgba(34, 197, 94, 0.45);
      background: rgba(22, 101, 52, 0.35);
    }
    .mini-low {
      color: #fcd34d;
      border-color: rgba(245, 158, 11, 0.45);
      background: rgba(120, 53, 15, 0.35);
    }
    .mini-row { margin-bottom: 7px; }
    .mini-row:last-child { margin-bottom: 0; }
    .mini-top {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 3px;
      font-size: 12px;
      color: #dbeafe;
    }
    .mini-track {
      height: 8px;
      border-radius: 999px;
      background: #182742;
      border: 1px solid #274067;
      overflow: hidden;
    }
    .mini-fill { height: 100%; border-radius: 999px; }
    .note {
      color: #d6e2f5;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 13px;
    }
    .small {
      color: var(--muted);
      font-size: 12px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      font-size: 12px;
      color: #d8e7fb;
      border: 1px solid #2b4368;
      background: #0b1730;
      border-radius: 999px;
      padding: 4px 10px;
    }
    .triage-block {
      display: grid;
      gap: 8px;
      margin-bottom: 10px;
    }
    .triage-block:last-child {
      margin-bottom: 0;
    }
    .triage-chips {
      align-items: center;
    }
    .triage-chart-grid {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .drift-canvas-wrap {
      width: 100%;
      height: 220px;
      position: relative;
    }
    .drift-canvas {
      width: 100% !important;
      height: 100% !important;
      display: block;
    }
    .split-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 7px;
      color: #cfe2fb;
      font-size: 11px;
    }
    .split-legend span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .split-legend i {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      display: inline-block;
    }
    .stacked-track {
      height: 9px;
      border-radius: 999px;
      background: #182742;
      border: 1px solid #274067;
      overflow: hidden;
      display: flex;
    }
    .stacked-left,
    .stacked-right {
      height: 100%;
    }
    @media (max-width: 1280px) {
      .hero { grid-template-columns: 1fr; }
      .split { grid-template-columns: 1fr; }
      .triage-chart-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 880px) {
      .deck { padding: 12px 8px 20px; }
      .hero-metrics { grid-template-columns: 1fr; }
      .metric-table.dense { min-width: 100%; }
    }
  </style>
</head>
<body>
  <main class="deck">
    <section class="card hero">
      <div>
        <div class="kicker">Six-Part Real-World Benchmark</div>
        <h1>Doclea Superiority Report: Retrieval, Cost, and Developer Throughput</h1>
        <p class="subtitle">Hard cross-app queries on ${escapeHtml(report.projectPath)}. This report combines issue localization, citation grounding, context-pressure retention, doc-drift workload, fixed-quality cost/latency, and modeled human task throughput.</p>
        <div class="chips tech-chips">
          ${techStack.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}
        </div>
      </div>
      <div class="hero-metrics">
        <div class="metric-box">
          <div class="metric-label">Issue Recall Edge</div>
          <div class="metric-value">${toFixed(report.parts.issueLocalization.mcpRecallEdgeVsBestBaselinePoints, 2)} pts</div>
          <div class="metric-sub">Doclea vs best non-Doclea @ ${report.parts.issueLocalization.budget} cap</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Input Token Cut</div>
          <div class="metric-value">${toFixed(report.parts.issueLocalization.mcpTokenCutVsBestRecallBaselinePct, 2)}%</div>
          <div class="metric-sub">Doclea vs highest-recall baseline</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Modeled Task-Time Edge</div>
          <div class="metric-value">${toFixed(modeledEdgeMinutes, 2)} min</div>
          <div class="metric-sub">Doclea faster than fastest non-Doclea mode</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Detected Stale Doc Refs</div>
          <div class="metric-value">${report.parts.docDriftDetection.staleReferencesFound}</div>
          <div class="metric-sub">from ${report.parts.docDriftDetection.docsScanned} scanned markdown files</div>
        </div>
      </div>
    </section>

    <section class="card section">
      <h2>1. Issue Localization (SWE-style file targeting)</h2>
      <p class="small">Anchor budget: ${report.parts.issueLocalization.budget} input tokens.</p>
      <div class="split">
        <div class="table-wrap">
          ${renderIssueTable(issueModes)}
        </div>
        <div class="chart-col">
          ${bars({
            title: "Recall",
            direction: "higher",
            rows: issueModes.map((row) => ({
              mode: row.mode,
              value: row.recall * 100,
            })),
            unit: " %",
            decimals: 2,
          })}
          ${bars({
            title: "Input Tokens",
            direction: "lower",
            rows: issueModes.map((row) => ({
              mode: row.mode,
              value: row.inputTokens,
            })),
            unit: " tok",
            decimals: 0,
          })}
          ${bars({
            title: "Estimated End-to-End",
            direction: "lower",
            rows: issueModes.map((row) => ({
              mode: row.mode,
              value: row.endToEndMs,
            })),
            unit: " ms",
            decimals: 1,
          })}
        </div>
      </div>
      <div class="table-wrap">
        <table class="metric-table dense">
          <thead>
            <tr>
              <th>Hard Query</th>
              <th>Expected Files</th>
              <th>Expected Scopes</th>
              <th>Doclea Recall</th>
              <th>Best Baseline Recall</th>
              <th>Doclea Edge</th>
            </tr>
          </thead>
          <tbody>
            ${report.parts.issueLocalization.hardestQueries
              .map(
                (row) => `
              <tr>
                <td>${escapeHtml(row.queryId)}</td>
                <td>${row.expectedFiles}</td>
                <td>${row.expectedScopes}</td>
                <td>${pct(row.mcpRecall, 2)}</td>
                <td>${pct(row.bestBaselineRecall, 2)}</td>
                <td>${toFixed(row.edgePoints, 2)} points</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>

    <section class="card section">
      <h2>2. Citation-Grounded Cross-Package QA</h2>
      <div class="chips">
        <span class="chip">Avg expected files/query: ${toFixed(report.parts.citationGroundedQa.queryComplexity.avgExpectedFiles, 2)}</span>
        <span class="chip">Avg expected scopes/query: ${toFixed(report.parts.citationGroundedQa.queryComplexity.avgExpectedScopes, 2)}</span>
      </div>
      <div class="split">
        <div class="table-wrap">
          ${renderCitationTable(citationModes)}
        </div>
        <div class="chart-col">
          ${bars({
            title: "Strict Citation Score",
            direction: "higher",
            rows: citationModes.map((row) => ({
              mode: row.mode,
              value: row.strictCitationScore * 100,
            })),
            unit: " %",
            decimals: 2,
          })}
          ${bars({
            title: "Hallucinated Citation Rate",
            direction: "lower",
            rows: citationModes.map((row) => ({
              mode: row.mode,
              value: row.hallucinatedCitationRate * 100,
            })),
            unit: " %",
            decimals: 2,
          })}
          ${bars({
            title: "Cross-Scope Coverage",
            direction: "higher",
            rows: citationModes.map((row) => ({
              mode: row.mode,
              value: row.crossScopeCoverage * 100,
            })),
            unit: " %",
            decimals: 2,
          })}
        </div>
      </div>
    </section>

    <section class="card section">
      <h2>3. Context Retention Under Budget Pressure (session-memory proxy)</h2>
      <p class="small">Low cap: ${report.parts.contextRetentionProxy.lowBudget} tokens. High cap: ${report.parts.contextRetentionProxy.highBudget} tokens.</p>
      <div class="split">
        <div class="table-wrap">
          ${renderRetentionTable(retentionModes)}
        </div>
        <div class="chart-col">
          ${bars({
            title: "Retention Ratio (low/high recall)",
            direction: "higher",
            rows: retentionModes.map((row) => ({
              mode: row.mode,
              value: row.retentionRatio,
            })),
            unit: "x",
            decimals: 3,
          })}
          ${bars({
            title: "Recall Drop (points)",
            direction: "lower",
            rows: retentionModes.map((row) => ({
              mode: row.mode,
              value: row.recallDropPoints,
            })),
            unit: " pts",
            decimals: 2,
          })}
        </div>
      </div>
    </section>

    <section class="card section">
      <h2>4. Doc Drift Detection Workload</h2>
      <div class="chips">
        <span class="chip">Docs scanned: ${report.parts.docDriftDetection.docsScanned}</span>
        <span class="chip">Stale refs found: ${report.parts.docDriftDetection.staleReferencesFound}</span>
        <span class="chip">Drift density: ${toFixed(report.parts.docDriftDetection.staleReferenceRate, 2)} refs/doc</span>
        <span class="chip">Hotspot score: ${pct(report.parts.docDriftDetection.driftHotspotScore, 2)}</span>
        <span class="chip">Generated drift queries: ${report.parts.docDriftDetection.generatedQueries}</span>
        ${
          bestGuardrailVsLlm
            ? `<span class="chip">Doclea Guardrail found: ${pct(bestGuardrailVsLlm.docleaFoundRate, 2)}</span>
        <span class="chip">Best other method found: ${pct(bestGuardrailVsLlm.llmFoundRate, 2)} (${escapeHtml(modeLabel(bestGuardrailVsLlm.llmMode))})</span>
        <span class="chip">Doclea Guardrail edge: ${toFixed(bestGuardrailVsLlm.foundEdgePoints, 2)} pts</span>
        <span class="chip">Doclea Guardrail speedup: ${toFixed(bestGuardrailVsLlm.endToEndSpeedupX, 2)}x</span>
        <span class="chip">Doclea Guardrail wins: ${guardrailWins}/${guardrailComparisons.length}</span>`
            : ""
        }
        ${
          bestFullVsLlm
            ? `<span class="chip">Doclea Full wins: ${fullWins}/${fullComparisons.length}</span>
        <span class="chip">Doclea Full best edge: ${toFixed(bestFullVsLlm.foundEdgePoints, 2)} pts vs ${escapeHtml(modeLabel(bestFullVsLlm.llmMode))}</span>`
            : ""
        }
      </div>
      ${
        driftTriageComparisons.length > 0
          ? `<div class="table-wrap">
        ${renderDocDriftTriageTable(driftTriageComparisons)}
      </div>`
          : ""
      }
      <div class="split">
        <div class="table-wrap">
          <table class="metric-table dense">
            <thead>
              <tr>
                <th>Doc Path</th>
                <th>Stale References</th>
              </tr>
            </thead>
            <tbody>
              ${report.parts.docDriftDetection.topDocsByDrift
                .map(
                  (item) => `
                <tr>
                  <td>${escapeHtml(item.docPath)}</td>
                  <td>${item.staleRefs}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <div class="chart-col">
          ${labelBars({
            title: "Top Docs by Drift",
            direction: "higher",
            rows: report.parts.docDriftDetection.topDocsByDrift.map((row) => ({
              label: row.docPath,
              value: row.staleRefs,
            })),
            unit: " refs",
            decimals: 0,
            badgeLabel: "Higher = more drift risk",
          })}
          ${labelBars({
            title: "Top Scopes by Drift",
            direction: "higher",
            rows: report.parts.docDriftDetection.topScopesByDrift.map(
              (row) => ({
                label: row.scope,
                value: row.staleRefs,
              }),
            ),
            unit: " refs",
            decimals: 0,
            badgeLabel: "Higher = more drift risk",
          })}
        </div>
      </div>
      <div class="table-wrap">
        <table class="metric-table dense">
          <thead>
            <tr>
              <th>Doc Path</th>
              <th>Stale Reference</th>
              <th>Suggested Current Path</th>
            </tr>
          </thead>
          <tbody>
            ${report.parts.docDriftDetection.sampleStaleReferences
              .map(
                (item) => `
              <tr>
                <td>${escapeHtml(item.docPath)}</td>
                <td>${escapeHtml(item.referencedPath)}</td>
                <td>${escapeHtml(item.suggestedCurrentPath)}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>

    <section class="card section">
      <h2>5. Fixed-Quality Cost/Latency Frontier</h2>
      <p class="small">Target quality: recall >= ${pct(report.parts.fixedQualityCostLatency.targetRecall, 1)}, precision >= ${pct(report.parts.fixedQualityCostLatency.targetPrecision, 1)}. Pricing: $${toFixed(report.parts.fixedQualityCostLatency.inputPricePerMTokenUsd, 4)}/M input, $${toFixed(report.parts.fixedQualityCostLatency.outputPricePerMTokenUsd, 4)}/M output.</p>
      <div class="split">
        <div class="table-wrap">
          ${renderFixedQualityTable(fixedModes)}
        </div>
        <div class="chart-col">
          ${bars({
            title: "Cost / Query",
            direction: "lower",
            rows: fixedModes.map((row) => ({
              mode: row.mode,
              value: row.estimatedCostUsdPerQuery * 1_000_000,
            })),
            unit: " micro$",
            decimals: 2,
          })}
          ${bars({
            title: "Estimated End-to-End",
            direction: "lower",
            rows: fixedModes.map((row) => ({
              mode: row.mode,
              value: row.endToEndMs,
            })),
            unit: " ms",
            decimals: 1,
          })}
        </div>
      </div>
    </section>

    <section class="card section">
      <h2>6. Modeled Human Task A/B (time-to-correct-answer)</h2>
      <p class="small">Success threshold: recall >= ${pct(report.parts.modeledHumanTaskAB.successThresholdRecall, 1)}, precision >= ${pct(report.parts.modeledHumanTaskAB.successThresholdPrecision, 1)}. Penalties: retry ${toFixed(report.parts.modeledHumanTaskAB.retryPenaltyMinutes, 1)}m, verification ${toFixed(report.parts.modeledHumanTaskAB.verificationPenaltyMinutes, 1)}m, search ${toFixed(report.parts.modeledHumanTaskAB.searchPenaltyMinutes, 1)}m.</p>
      <div class="split">
        <div class="table-wrap">
          ${renderModeledAbTable(modeledModes)}
        </div>
        <div class="chart-col">
          ${bars({
            title: "Modeled Minutes to Correct Answer",
            direction: "lower",
            rows: modeledModes.map((row) => ({
              mode: row.mode,
              value: row.modeledMinutesToCorrectAnswer,
            })),
            unit: " min",
            decimals: 2,
          })}
          ${bars({
            title: "Productivity Index",
            direction: "higher",
            rows: modeledModes.map((row) => ({
              mode: row.mode,
              value: row.productivityIndex,
            })),
            unit: "x",
            decimals: 2,
          })}
          ${bars({
            title: "Success Rate",
            direction: "higher",
            rows: modeledModes.map((row) => ({
              mode: row.mode,
              value: row.successRate * 100,
            })),
            unit: " %",
            decimals: 2,
          })}
        </div>
      </div>
    </section>

    <section class="card section">
      <h2>Method / Interpretation Notes</h2>
      <div class="note">Token cap means max retrieved input tokens allowed into model context for each query-turn. Lower caps force tighter evidence selection.</div>
      <div class="note">Part 3 is a retention proxy: robustness of quality when forced from high to low cap, which approximates limited carry-over memory conditions.</div>
      <div class="note">Part 4 is documentation drift monitoring: stale path references discovered directly from markdown vs current repo files, with hotspot concentration tracking.</div>
      <div class="note">Part 6 is a deterministic workload model, not a live human study. It converts quality + latency into expected minutes-to-correct-answer.</div>
      <div class="note">Generated ${escapeHtml(report.generatedAt)} from ${report.sourceReports.length} source report files. Anchor budget: ${report.anchorBudget}. Fixture: ${escapeHtml(report.fixturePath)}.</div>
    </section>
  </main>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
  <script>
    (() => {
      const driftScripts = Array.from(document.querySelectorAll('script[id^="drift-data-"]'));
      const metricScripts = Array.from(document.querySelectorAll('script[id^="metric-data-"]'));
      if (!window.Chart || (driftScripts.length === 0 && metricScripts.length === 0)) {
        return;
      }

      const methodColor = {
        mcp_hybrid_guardrail: "rgba(20, 184, 166, 0.9)",
        mcp_full: "rgba(34, 197, 94, 0.9)",
        grep_tools: "rgba(251, 146, 60, 0.9)",
        hybrid_tools: "rgba(250, 204, 21, 0.9)",
        filename_tools: "rgba(96, 165, 250, 0.9)",
        lsp_tools: "rgba(167, 139, 250, 0.9)",
        symbol_index_tools: "rgba(244, 114, 182, 0.9)",
      };

      const fallbackColors = [
        "rgba(96, 165, 250, 0.9)",
        "rgba(248, 113, 113, 0.9)",
        "rgba(251, 191, 36, 0.9)",
        "rgba(192, 132, 252, 0.9)",
        "rgba(45, 212, 191, 0.9)",
      ];

      const buildGroupedBar = (input) => {
        const canvas = document.getElementById(input.canvasId);
        if (!canvas) return;
        const labels = Array.isArray(input.labels) ? input.labels : [];
        const values = Array.isArray(input.values) ? input.values : [];
        const ids = Array.isArray(input.ids) ? input.ids : [];
        if (labels.length === 0 || values.length === 0) return;
        const colors = labels.map((_, index) => {
          const fromMap = methodColor[ids[index]];
          return fromMap || fallbackColors[index % fallbackColors.length];
        });
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const decimals = Number.isFinite(input.decimals) ? input.decimals : 2;
        const unit = String(input.unit || "");
        const datasetLabel = String(input.datasetLabel || "Metric");

        new window.Chart(ctx, {
          type: "bar",
          data: {
            labels,
            datasets: [
              {
                label: datasetLabel,
                data: values,
                backgroundColor: colors,
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: {
                ticks: { color: "#c7d7ef", maxRotation: 0, autoSkip: false, font: { size: 10 } },
                grid: { color: "rgba(59, 85, 122, 0.25)" },
              },
              y: {
                ticks: {
                  color: "#c7d7ef",
                  callback(value) {
                    const numeric = Number(value);
                    if (!Number.isFinite(numeric)) return value;
                    return numeric.toFixed(decimals) + unit;
                  },
                },
                grid: { color: "rgba(59, 85, 122, 0.35)" },
                beginAtZero: true,
              },
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label(context) {
                    const value = context.parsed.y ?? 0;
                    return context.label + ": " + Number(value).toFixed(decimals) + unit;
                  },
                },
              },
            },
          },
        });
      };

      for (const scriptNode of metricScripts) {
        try {
          const payload = JSON.parse(scriptNode.textContent || "{}");
          if (!payload || !payload.chartId || !Array.isArray(payload.labels) || !Array.isArray(payload.values)) {
            continue;
          }
          buildGroupedBar({
            canvasId: payload.chartId,
            labels: payload.labels,
            values: payload.values,
            ids: payload.ids || [],
            unit: payload.unit || "",
            decimals: payload.decimals,
            datasetLabel: payload.metricLabel || "Metric",
          });
        } catch {
          // ignore malformed payload
        }
      }

      for (const scriptNode of driftScripts) {
        try {
          const payload = JSON.parse(scriptNode.textContent || "{}");
          if (!payload || !payload.modeSlug || !Array.isArray(payload.methods)) {
            continue;
          }
          const methods = payload.methods;
          buildGroupedBar({
            canvasId: "drift-" + payload.modeSlug + "-found-group",
            labels: methods.map((method) => method.label),
            ids: methods.map((method) => method.id),
            values: methods.map((method) => Number(method.found ?? 0)),
            unit: "%",
            decimals: 2,
            datasetLabel: "Found Rate",
          });
          buildGroupedBar({
            canvasId: "drift-" + payload.modeSlug + "-tokens-group",
            labels: methods.map((method) => method.label),
            ids: methods.map((method) => method.id),
            values: methods.map((method) => Number(method.tokens ?? 0)),
            unit: " tok",
            decimals: 0,
            datasetLabel: "Input Tokens",
          });
          buildGroupedBar({
            canvasId: "drift-" + payload.modeSlug + "-time-group",
            labels: methods.map((method) => method.label),
            ids: methods.map((method) => method.id),
            values: methods.map((method) => Number(method.e2e ?? 0)),
            unit: " ms",
            decimals: 1,
            datasetLabel: "E2E Time",
          });
        } catch {
          // ignore malformed payload
        }
      }
    })();
  </script>
</body>
</html>`;
}

async function main(): Promise<void> {
  const projectPath = resolve(
    process.env.DOCLEA_BENCH_PROJECT_PATH ?? process.cwd(),
  );
  const inputPath = resolve(
    process.env.DOCLEA_SIX_REPORT_JSON_PATH ??
      `${projectPath}/.doclea/reports/mcp-six-part-benchmark.json`,
  );
  if (!existsSync(inputPath)) {
    throw new Error(`Missing six-part report JSON: ${inputPath}`);
  }
  const report = readJson<SixPartReport>(inputPath);
  const outputPath = resolve(
    process.env.DOCLEA_SIX_REPORT_HTML_PATH ??
      `${projectPath}/.doclea/reports/mcp-six-part-benchmark.dark.html`,
  );
  const html = renderHtml(report);
  writeFileSync(outputPath, html, "utf-8");
  console.log(
    JSON.stringify(
      {
        inputPath,
        outputPath,
        anchorBudget: report.anchorBudget,
        queryCount: report.queryCount,
        driftQueries: report.parts.docDriftDetection.generatedQueries,
      },
      null,
      2,
    ),
  );
}

await main();
