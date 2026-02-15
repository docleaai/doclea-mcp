---
title: Retrieval Value Report
description: Run MCP vs no-MCP evaluation on your current app and generate a sellable report.
keywords: [mcp, value report, evaluation, retrieval, no mcp]
---

# Retrieval Value Report

Run an evaluation that compares retrieval modes on your **current app data**:

- `no_mcp`: no context retrieval
- `memory_only`: semantic memory retrieval only
- `mcp_full`: full RAG + KAG + GraphRAG retrieval

Command:

```bash
bun run value:retrieval-report
```

Outputs:

- JSON: `.doclea/reports/mcp-value-report.json`
- Markdown: `.doclea/reports/mcp-value-report.md`
- HTML dashboard (charts): run `bun run value:retrieval-report:html`
- Default HTML path: `.doclea/reports/mcp-value-report.current-app.html`
- Deep-dive HTML (warm+cold+budget+ablation): run `bun run value:retrieval-report:deep-dive-html`
- Default deep-dive path: `.doclea/reports/mcp-value-report.deep-dive.dark.html`

These include:

- latency (`p50`, `p95`) per mode
- context structure mix (RAG/KAG/GraphRAG section composition + route distribution)
- recall/precision lift (when expectations are provided)
- per-query mode breakdown for demos and stakeholder readouts

## Query Inputs

By default, the script will try to load:

- `documentation/retrieval/golden-queries.json`

Fallback if not found:

- built-in representative query set

Override queries with JSON file:

```bash
DOCLEA_VALUE_QUERIES_PATH=./path/to/value-queries.json bun run value:retrieval-report
```

Or directly via env JSON:

```bash
DOCLEA_VALUE_QUERIES_JSON='[
  {"id":"q1","query":"What calls validateToken?","expectedMemoryIds":["mem-auth"]},
  {"id":"q2","query":"What breaks if I change PaymentService?"}
]' bun run value:retrieval-report
```

## Environment Variables

| Variable | Default | Description |
|---|---:|---|
| `DOCLEA_VALUE_MODES` | `no_mcp,memory_only,mcp_full` | Modes to run |
| `DOCLEA_VALUE_QUERIES_PATH` | `documentation/retrieval/golden-queries.json` | Query fixture path |
| `DOCLEA_VALUE_QUERIES_JSON` | unset | Inline JSON queries override |
| `DOCLEA_VALUE_WARMUP_RUNS` | `1` | Warmup runs per query+mode before measurement |
| `DOCLEA_VALUE_RUNS_PER_QUERY` | `2` | Measured runs per query+mode |
| `DOCLEA_VALUE_CLEAR_CACHE_BEFORE_QUERY` | `false` | Reset context cache before each query+mode block |
| `DOCLEA_VALUE_CLEAR_CACHE_BEFORE_RUN` | `false` | Reset context cache before each measured run (cold-path testing) |
| `DOCLEA_VALUE_RECALL_K` | `5` | Recall@k/precision@k cutoff |
| `DOCLEA_VALUE_TOKEN_BUDGET` | `4000` | Default token budget per query |
| `DOCLEA_VALUE_TEMPLATE` | `compact` | Context template |
| `DOCLEA_VALUE_REPORT_JSON_PATH` | `.doclea/reports/mcp-value-report.json` | JSON report output |
| `DOCLEA_VALUE_REPORT_MD_PATH` | `.doclea/reports/mcp-value-report.md` | Markdown report output |

## Deep-Dive + Ablation Workflow

Generate additional evidence layers:

1. Warm baseline (cache-on):

```bash
DOCLEA_VALUE_QUERIES_PATH=documentation/retrieval/current-app-value-queries.thorough.json \
DOCLEA_VALUE_WARMUP_RUNS=1 \
DOCLEA_VALUE_RUNS_PER_QUERY=6 \
DOCLEA_VALUE_TOKEN_BUDGET=4000 \
DOCLEA_VALUE_REPORT_JSON_PATH=.doclea/reports/mcp-value-report.thorough-budget-4000.json \
DOCLEA_VALUE_REPORT_MD_PATH=.doclea/reports/mcp-value-report.thorough-budget-4000.md \
bun run value:retrieval-report
```

2. Cold baseline (cache reset before each measured run):

```bash
DOCLEA_VALUE_QUERIES_PATH=documentation/retrieval/current-app-value-queries.thorough.json \
DOCLEA_VALUE_WARMUP_RUNS=0 \
DOCLEA_VALUE_RUNS_PER_QUERY=6 \
DOCLEA_VALUE_CLEAR_CACHE_BEFORE_QUERY=true \
DOCLEA_VALUE_CLEAR_CACHE_BEFORE_RUN=true \
DOCLEA_VALUE_REPORT_JSON_PATH=.doclea/reports/mcp-value-report.thorough-cold-r6.json \
DOCLEA_VALUE_REPORT_MD_PATH=.doclea/reports/mcp-value-report.thorough-cold-r6.md \
bun run value:retrieval-report
```

3. Component ablation matrix (uncached, memory-only/code-only/graph-only/full):

```bash
DOCLEA_BENCH_QUERIES_PATH=documentation/retrieval/current-app-value-queries.thorough.json \
DOCLEA_BENCH_DISABLE_CACHE=true \
DOCLEA_BENCH_RUNS_PER_QUERY=3 \
DOCLEA_BENCH_WARMUP_RUNS=0 \
DOCLEA_BENCH_MATRIX_OUTPUT_PATH=.doclea/reports/retrieval-benchmark.component-matrix.uncached.json \
bun run perf:retrieval-matrix
```

4. Deep-dive dark HTML:

```bash
bun run value:retrieval-report:deep-dive-html
```

Optional deep-dive budget overrides:

| Variable | Example |
|---|---|
| `DOCLEA_DEEP_BUDGET_REPORTS` | `1200=.doclea/reports/mcp-value-report.thorough-budget-1200.json,4000=.doclea/reports/mcp-value-report.thorough-budget-4000.json,8000=.doclea/reports/mcp-value-report.thorough-budget-8000.json` |
| `DOCLEA_DEEP_WARM_JSON` | `.doclea/reports/mcp-value-report.thorough-budget-4000.json` |
| `DOCLEA_DEEP_COLD_JSON` | `.doclea/reports/mcp-value-report.thorough-cold-r6.json` |
| `DOCLEA_DEEP_COMPONENT_MATRIX_JSON` | `.doclea/reports/retrieval-benchmark.component-matrix.uncached.json` |
| `DOCLEA_DEEP_OUTPUT_HTML` | `.doclea/reports/mcp-value-report.deep-dive.dark.html` |

## Recommended “Sell This” Workflow

1. Use 10-20 real product questions from your current app/team.
2. Add expected memory/entity hits for at least your top 10 critical questions.
3. Run `bun run value:retrieval-report` before and after retrieval changes.
4. Share the Markdown report in PRs and stakeholder updates.
5. Highlight lift rows (`no_mcp -> mcp_full`, `memory_only -> mcp_full`) as the value narrative.

For presentation-ready sharing, generate the HTML report and use that as the primary artifact.
The HTML dashboard uses a dark theme by default.
