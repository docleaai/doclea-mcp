---
title: Retrieval Benchmark History
description: Persist and compare retrieval benchmark runs with commit metadata.
keywords: [benchmark history, retrieval, p95, regression, commit metadata]
---

# Retrieval Benchmark History

Retrieval perf runs now persist history records with commit and branch metadata.

History file default:

- `.doclea/benchmarks/retrieval-history.jsonl`

Each row includes:

- run metadata (`runId`, `timestamp`, `commitSha`, `branch`, source)
- benchmark config snapshot
- benchmark result payload

## Record During Perf Gate

`bun run perf:retrieval-gate` automatically records history when enabled.

Relevant environment variables:

| Variable | Default | Description |
|---|---:|---|
| `DOCLEA_PERF_HISTORY_ENABLED` | `true` | Enable history persistence |
| `DOCLEA_PERF_HISTORY_PATH` | `.doclea/benchmarks/retrieval-history.jsonl` | JSONL history path |
| `DOCLEA_PERF_HISTORY_RETENTION` | `250` | Max records retained |
| `DOCLEA_PERF_HISTORY_COMPARE_LOOKBACK` | `50` | Baseline search window |
| `DOCLEA_PERF_HISTORY_COMPARE_SAME_BRANCH` | `true` | Require same-branch baseline |
| `DOCLEA_PERF_HISTORY_COMPARE_SAME_CONFIG` | `true` | Require same benchmark config |
| `DOCLEA_PERF_HISTORY_REQUIRE_BASELINE` | `false` | Fail when no baseline exists |
| `DOCLEA_PERF_HISTORY_MAX_P95_RATIO` | unset | Optional fail threshold for p95 ratio vs baseline |
| `DOCLEA_PERF_HISTORY_MAX_P95_DELTA_MS` | unset | Optional fail threshold for p95 delta vs baseline |
| `DOCLEA_PERF_COMMIT_SHA` | auto | Override commit SHA metadata |
| `DOCLEA_PERF_BRANCH` | auto | Override branch metadata |

## Query And Compare History

List recent runs:

```bash
bun run perf:retrieval-history
```

Compare latest run against nearest baseline:

```bash
bun run perf:retrieval-history:compare
```

Useful filters:

```bash
bun run scripts/retrieval-benchmark-history.ts list --branch main --since 2026-02-01T00:00:00Z --limit 30
bun run scripts/retrieval-benchmark-history.ts compare --run-id <currentRunId> --baseline-run-id <baselineRunId>
bun run scripts/retrieval-benchmark-history.ts compare --json
```

## Retention Guidance

- Local/dev: `DOCLEA_PERF_HISTORY_RETENTION=200`
- CI branch-level trend checks: `120-300`
- Increase retention if benchmark cadence is low and longer trend windows are needed.
