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

interface RetrievalValueLift {
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

interface RetrievalValueReport {
  generatedAt: string;
  projectPath: string;
  queryCount: number;
  recallK: number;
  modes: RetrievalValueModeSummary[];
  lifts: RetrievalValueLift[];
  runs: RetrievalValueRun[];
}

const MODE_LABEL: Record<RetrievalValueMode, string> = {
  no_mcp: "No MCP",
  memory_only: "Memory Only",
  mcp_full: "MCP Full",
};

const PALETTE = {
  p50: "#1f77b4",
  p95: "#ff7f0e",
  memoryRecall: "#2ca02c",
  entityRecall: "#17becf",
  precision: "#d62728",
  rag: "#6baed6",
  kag: "#fd8d3c",
  graphrag: "#31a354",
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
  const width = input.width ?? 760;
  const height = input.height ?? 320;
  const margin = { top: 20, right: 20, bottom: 56, left: 56 };
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
      `<text x="${labelX}" y="${height - 20}" text-anchor="middle" font-size="11" fill="${CHART_COLORS.text}">${escapeHtml(label)}</text>`,
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

function stackedSectionSvg(input: {
  width?: number;
  height?: number;
  labels: string[];
  rag: number[];
  kag: number[];
  graphrag: number[];
}): string {
  const width = input.width ?? 760;
  const height = input.height ?? 320;
  const margin = { top: 20, right: 20, bottom: 56, left: 56 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const totals = input.labels.map(
    (_, index) =>
      (input.rag[index] ?? 0) +
      (input.kag[index] ?? 0) +
      (input.graphrag[index] ?? 0),
  );
  const maxValue = Math.max(1, ...totals);

  const ticks = 5;
  const groupWidth = plotWidth / Math.max(1, input.labels.length);
  const barWidth = groupWidth * 0.6;

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

  input.labels.forEach((label, index) => {
    const xGroup = margin.left + index * groupWidth;
    const x = xGroup + (groupWidth - barWidth) / 2;
    const labelX = xGroup + groupWidth / 2;
    let currentY = margin.top + plotHeight;

    const segments = [
      { value: input.rag[index] ?? 0, color: PALETTE.rag, name: "RAG" },
      { value: input.kag[index] ?? 0, color: PALETTE.kag, name: "KAG" },
      {
        value: input.graphrag[index] ?? 0,
        color: PALETTE.graphrag,
        name: "GraphRAG",
      },
    ];

    for (const segment of segments) {
      const heightPx = (segment.value / maxValue) * plotHeight;
      currentY -= heightPx;
      bars.push(
        `<rect x="${x}" y="${currentY}" width="${barWidth}" height="${Math.max(0, heightPx)}" fill="${segment.color}" rx="2"><title>${segment.name}: ${toFixed(segment.value)}</title></rect>`,
      );
    }

    xTicks.push(
      `<text x="${labelX}" y="${height - 20}" text-anchor="middle" font-size="11" fill="${CHART_COLORS.text}">${escapeHtml(label)}</text>`,
    );
  });

  const yLabel = `<text x="16" y="${margin.top + plotHeight / 2}" transform="rotate(-90 16 ${margin.top + plotHeight / 2})" text-anchor="middle" font-size="11" fill="${CHART_COLORS.text}">Sections (avg)</text>`;

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Section composition chart">${gridLines.join("")}${bars.join("")}<line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" stroke="${CHART_COLORS.axis}" />${yTicks.join("")}${xTicks.join("")}${yLabel}</svg>`;
}

function aggregateQueryModeRows(runs: RetrievalValueRun[]): Array<{
  queryId: string;
  query: string;
  mode: RetrievalValueMode;
  latencyMs: number;
  tokens: number;
  sectionsIncluded: number;
  ragSections: number;
  kagSections: number;
  graphragSections: number;
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
    tokens: number;
    sectionsIncluded: number;
    ragSections: number;
    kagSections: number;
    graphragSections: number;
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
      tokens: avg(groupRuns.map((run) => run.tokens)),
      sectionsIncluded: avg(groupRuns.map((run) => run.sectionsIncluded)),
      ragSections: avg(groupRuns.map((run) => run.ragSections)),
      kagSections: avg(groupRuns.map((run) => run.kagSections)),
      graphragSections: avg(groupRuns.map((run) => run.graphragSections)),
      memoryRecall: avg(groupRuns.map((run) => run.quality?.memoryRecall ?? 0)),
      entityRecall: avg(groupRuns.map((run) => run.quality?.entityRecall ?? 0)),
      precisionAtK: avg(groupRuns.map((run) => run.quality?.precisionAtK ?? 0)),
    });
  }

  rows.sort((left, right) => {
    if (left.queryId !== right.queryId) {
      return left.queryId.localeCompare(right.queryId);
    }
    return left.mode.localeCompare(right.mode);
  });

  return rows;
}

function renderHtml(report: RetrievalValueReport): string {
  const modeOrder: RetrievalValueMode[] = ["no_mcp", "memory_only", "mcp_full"];
  const modes = modeOrder
    .map((mode) => report.modes.find((entry) => entry.mode === mode))
    .filter((entry): entry is RetrievalValueModeSummary => Boolean(entry));

  const labels = modes.map((mode) => MODE_LABEL[mode.mode]);

  const latencySvg = groupedBarSvg({
    labels,
    series: [
      {
        name: "p50 latency",
        color: PALETTE.p50,
        values: modes.map((mode) => mode.latencyMs.p50),
      },
      {
        name: "p95 latency",
        color: PALETTE.p95,
        values: modes.map((mode) => mode.latencyMs.p95),
      },
    ],
    yLabel: "Latency (ms)",
  });

  const qualitySvg = groupedBarSvg({
    labels,
    series: [
      {
        name: `Memory recall@${report.recallK}`,
        color: PALETTE.memoryRecall,
        values: modes.map((mode) => mode.quality?.memoryRecallAvg ?? 0),
      },
      {
        name: `Entity recall@${report.recallK}`,
        color: PALETTE.entityRecall,
        values: modes.map((mode) => mode.quality?.entityRecallAvg ?? 0),
      },
      {
        name: `Precision@${report.recallK}`,
        color: PALETTE.precision,
        values: modes.map((mode) => mode.quality?.precisionAtKAvg ?? 0),
      },
    ],
    yLabel: "Quality score",
  });

  const sectionSvg = stackedSectionSvg({
    labels,
    rag: modes.map((mode) => mode.sections.rag),
    kag: modes.map((mode) => mode.sections.kag),
    graphrag: modes.map((mode) => mode.sections.graphrag),
  });

  const queryRows = aggregateQueryModeRows(report.runs);

  const liftCards = report.lifts
    .map(
      (lift) => `
        <div class="card">
          <h4>${escapeHtml(MODE_LABEL[lift.from])} -> ${escapeHtml(MODE_LABEL[lift.to])}</h4>
          <p><strong>p95 delta:</strong> ${toFixed(lift.latencyP95DeltaMs)} ms</p>
          <p><strong>p95 ratio:</strong> ${toFixed(lift.latencyP95Ratio)}x</p>
          <p><strong>Sections delta:</strong> ${toFixed(lift.sectionsAvgDelta)}</p>
          <p><strong>Memory recall delta:</strong> ${toFixed(lift.memoryRecallDelta ?? 0)}</p>
          <p><strong>Precision delta:</strong> ${toFixed(lift.precisionAtKDelta ?? 0)}</p>
        </div>
      `,
    )
    .join("\n");

  const modeRows = modes
    .map(
      (mode) => `
        <tr>
          <td>${escapeHtml(MODE_LABEL[mode.mode])}</td>
          <td>${mode.runs}</td>
          <td>${toFixed(mode.latencyMs.p50)}</td>
          <td>${toFixed(mode.latencyMs.p95)}</td>
          <td>${toFixed(mode.tokens.avg)}</td>
          <td>${toFixed(mode.sections.avgIncluded)}</td>
          <td>${toFixed(mode.quality?.memoryRecallAvg ?? 0)}</td>
          <td>${toFixed(mode.quality?.entityRecallAvg ?? 0)}</td>
          <td>${toFixed(mode.quality?.precisionAtKAvg ?? 0)}</td>
          <td>memory=${mode.routeDistribution.memory ?? 0}, code=${mode.routeDistribution.code ?? 0}, hybrid=${mode.routeDistribution.hybrid ?? 0}</td>
        </tr>
      `,
    )
    .join("\n");

  const queryDetailRows = queryRows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.queryId)}</td>
          <td>${escapeHtml(row.query)}</td>
          <td>${escapeHtml(MODE_LABEL[row.mode])}</td>
          <td>${toFixed(row.latencyMs)}</td>
          <td>${toFixed(row.tokens)}</td>
          <td>${toFixed(row.sectionsIncluded)}</td>
          <td>${toFixed(row.ragSections)}</td>
          <td>${toFixed(row.kagSections)}</td>
          <td>${toFixed(row.graphragSections)}</td>
          <td>${toFixed(row.memoryRecall)}</td>
          <td>${toFixed(row.entityRecall)}</td>
          <td>${toFixed(row.precisionAtK)}</td>
        </tr>
      `,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MCP Value Report</title>
  <style>
    :root {
      --bg: #090f1d;
      --card: #111a2c;
      --ink: #e5edf9;
      --muted: #9fb2cc;
      --border: #22314a;
      --accent: #38bdf8;
    }
    body {
      margin: 0;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      background: radial-gradient(1200px 700px at 20% -10%, #133155 0%, #0b1325 45%, #090f1d 100%), var(--bg);
      color: var(--ink);
    }
    .wrap {
      max-width: 1180px;
      margin: 0 auto;
      padding: 28px 20px 60px;
    }
    h1, h2, h3 { margin: 0 0 10px; }
    h1 { font-size: 30px; }
    h2 { font-size: 21px; margin-top: 26px; }
    h3 { font-size: 16px; }
    .subtitle { color: var(--muted); margin-bottom: 18px; }
    .grid {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      margin-bottom: 18px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
      box-shadow: 0 8px 28px rgba(17, 24, 39, 0.06);
    }
    .chart {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
      margin-top: 12px;
      box-shadow: 0 8px 28px rgba(17, 24, 39, 0.06);
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    .legend-item { display: inline-flex; align-items: center; gap: 6px; }
    .swatch { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 28px rgba(17, 24, 39, 0.06);
    }
    th, td {
      border-bottom: 1px solid #1b2a40;
      padding: 9px 10px;
      text-align: left;
      font-size: 13px;
      vertical-align: top;
    }
    th {
      background: #0f1b30;
      color: #d5e3f7;
      font-weight: 600;
      position: sticky;
      top: 0;
    }
    tr:last-child td { border-bottom: none; }
    .small { color: var(--muted); font-size: 12px; }
    .warning {
      border-left: 4px solid #f59e0b;
      background: #2b2010;
      padding: 10px 12px;
      border-radius: 8px;
      margin: 10px 0;
      color: #f6d28b;
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
    <h1>MCP Value Report</h1>
    <p class="subtitle">MCP vs no-MCP evaluation for <strong>${escapeHtml(report.projectPath)}</strong> | Generated ${escapeHtml(report.generatedAt)}</p>

    <div class="grid">
      <div class="card"><h3>Queries Evaluated</h3><p>${report.queryCount}</p></div>
      <div class="card"><h3>Recall@k</h3><p>${report.recallK}</p></div>
      <div class="card"><h3>Total Runs</h3><p>${report.runs.length}</p></div>
      <div class="card"><h3>Modes</h3><p>${modes.map((mode) => MODE_LABEL[mode.mode]).join(" / ")}</p></div>
    </div>

    <h2>Lift Summary</h2>
    <div class="grid">${liftCards || '<div class="card">No lift rows available.</div>'}</div>

    <h2>Latency Comparison</h2>
    <div class="chart">
      ${colorLegend([
        { label: "p50 latency", color: PALETTE.p50 },
        { label: "p95 latency", color: PALETTE.p95 },
      ])}
      ${latencySvg}
    </div>

    <h2>Quality Comparison</h2>
    <div class="chart">
      ${colorLegend([
        {
          label: `Memory recall@${report.recallK}`,
          color: PALETTE.memoryRecall,
        },
        {
          label: `Entity recall@${report.recallK}`,
          color: PALETTE.entityRecall,
        },
        { label: `Precision@${report.recallK}`, color: PALETTE.precision },
      ])}
      ${qualitySvg}
    </div>

    <h2>Context Structure Mix</h2>
    <div class="chart">
      ${colorLegend([
        { label: "RAG", color: PALETTE.rag },
        { label: "KAG", color: PALETTE.kag },
        { label: "GraphRAG", color: PALETTE.graphrag },
      ])}
      ${sectionSvg}
    </div>

    <h2>Mode Detail Table</h2>
    <table>
      <thead>
        <tr>
          <th>Mode</th>
          <th>Runs</th>
          <th>p50 ms</th>
          <th>p95 ms</th>
          <th>Avg Tokens</th>
          <th>Avg Sections</th>
          <th>Mem Recall</th>
          <th>Entity Recall</th>
          <th>Precision@k</th>
          <th>Route Distribution</th>
        </tr>
      </thead>
      <tbody>
        ${modeRows}
      </tbody>
    </table>

    <h2>Per-Query Breakdown (Averaged by Mode)</h2>
    <table>
      <thead>
        <tr>
          <th>Query ID</th>
          <th>Query</th>
          <th>Mode</th>
          <th>Latency ms</th>
          <th>Tokens</th>
          <th>Sections</th>
          <th>RAG</th>
          <th>KAG</th>
          <th>GraphRAG</th>
          <th>Mem Recall</th>
          <th>Entity Recall</th>
          <th>Precision@k</th>
        </tr>
      </thead>
      <tbody>
        ${queryDetailRows}
      </tbody>
    </table>

    <p class="footer">Method: no_mcp = no retrieval context, memory_only = semantic memory retrieval, mcp_full = RAG + KAG + GraphRAG.</p>
  </div>
</body>
</html>`;
}

async function main(): Promise<void> {
  const inputPath = resolve(
    process.env.DOCLEA_VALUE_REPORT_INPUT_JSON ??
      ".doclea/reports/mcp-value-report.current-app.json",
  );
  const outputPath = resolve(
    process.env.DOCLEA_VALUE_REPORT_OUTPUT_HTML ??
      ".doclea/reports/mcp-value-report.current-app.html",
  );

  if (!existsSync(inputPath)) {
    throw new Error(
      `Input value report JSON not found: ${inputPath}. Run value:retrieval-report first.`,
    );
  }

  const report = JSON.parse(
    readFileSync(inputPath, "utf-8"),
  ) as RetrievalValueReport;
  const html = renderHtml(report);
  writeFileSync(outputPath, html, "utf-8");

  console.log(
    JSON.stringify(
      {
        inputPath,
        outputPath,
        queryCount: report.queryCount,
        modes: report.modes.map((mode) => mode.mode),
      },
      null,
      2,
    ),
  );
}

await main();
