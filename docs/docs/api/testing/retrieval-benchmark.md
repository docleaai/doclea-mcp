---
title: doclea_retrieval_benchmark
description: Benchmark context retrieval latency, route distribution, and cache efficiency.
keywords: [doclea_retrieval_benchmark, benchmark, latency, performance, route]
---

# doclea_retrieval_benchmark

Benchmark end-to-end context retrieval performance and routing behavior for representative queries.

## Quick Example

```json
{
  "queries": [
    "What are our authentication decisions?",
    "What calls validateToken?",
    "What breaks if I change PaymentService?"
  ],
  "runsPerQuery": 3,
  "warmupRuns": 1,
  "includeCodeGraph": true,
  "includeGraphRAG": true,
  "compareAgainstMemoryOnly": true,
  "clearCacheFirst": true
}
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `queries` | `string[]` | No | Built-in set | Queries to benchmark |
| `runsPerQuery` | `number` | No | `3` | Measured runs per query |
| `warmupRuns` | `number` | No | `1` | Warm-up runs per query |
| `tokenBudget` | `number` | No | `4000` | Context token budget per run |
| `includeCodeGraph` | `boolean` | No | `true` | Include KAG/code retrieval |
| `includeGraphRAG` | `boolean` | No | `true` | Include GraphRAG retrieval |
| `template` | `"default" \| "compact" \| "detailed"` | No | `"compact"` | Context formatting template |
| `clearCacheFirst` | `boolean` | No | `true` | Clear/reset cache before benchmark |
| `compareAgainstMemoryOnly` | `boolean` | No | `false` | Run an additional memory-only baseline and include slowdown ratios |

## Response Schema

```json
{
  "totalRuns": 15,
  "queryCount": 5,
  "runsPerQuery": 3,
  "warmupRuns": 1,
  "overall": {
    "min": 4.2,
    "max": 112.9,
    "avg": 25.7,
    "p50": 9.8,
    "p95": 84.1,
    "p99": 112.9
  },
  "cache": {
    "hits": 10,
    "misses": 5,
    "hitRate": 66.67
  },
  "routes": [
    {
      "route": "memory",
      "runs": 6,
      "min": 4.2,
      "max": 25.3,
      "avg": 10.1,
      "p50": 8.9,
      "p95": 25.3,
      "p99": 25.3
    },
    {
      "route": "code",
      "runs": 6,
      "min": 6.1,
      "max": 112.9,
      "avg": 39.0,
      "p50": 12.2,
      "p95": 112.9,
      "p99": 112.9
    }
  ],
  "stages": [
    {
      "stage": "rag",
      "runs": 15,
      "min": 1.8,
      "max": 16.4,
      "avg": 4.3,
      "p50": 3.7,
      "p95": 9.9,
      "p99": 16.4
    },
    {
      "stage": "rerank",
      "runs": 15,
      "min": 0.1,
      "max": 1.2,
      "avg": 0.4,
      "p50": 0.3,
      "p95": 0.9,
      "p99": 1.2
    }
  ],
  "querySamples": [
    {
      "query": "What calls validateToken?",
      "route": "code",
      "latencyMs": 87.6,
      "tokens": 1024,
      "sectionsIncluded": 7
    }
  ],
  "comparison": {
    "requested": {
      "includeCodeGraph": true,
      "includeGraphRAG": true,
      "overall": { "min": 4.2, "max": 112.9, "avg": 25.7, "p50": 9.8, "p95": 84.1, "p99": 112.9 },
      "cache": { "hits": 10, "misses": 5, "hitRate": 66.67 },
      "routes": [],
      "stages": []
    },
    "baseline": {
      "includeCodeGraph": false,
      "includeGraphRAG": false,
      "overall": { "min": 3.1, "max": 15.2, "avg": 7.8, "p50": 6.9, "p95": 14.3, "p99": 15.2 },
      "cache": { "hits": 10, "misses": 5, "hitRate": 66.67 },
      "routes": [],
      "stages": []
    },
    "overhead": {
      "ratios": { "avg": 3.29, "p50": 1.42, "p95": 5.88, "p99": 7.43 },
      "percent": { "avg": 229, "p50": 42, "p95": 488, "p99": 643 }
    }
  }
}
```

## Interpretation Guide

| Signal | What It Means |
|--------|---------------|
| High `p95` with low `p50` | Tail-latency spikes; investigate cache misses or heavy code traversal |
| Low cache hit rate | Query variance too high or cache TTL too short |
| Most runs in `memory` route | Queries are semantic/history-oriented |
| Most runs in `code` route | Queries are structural/impact-analysis oriented |
| High `comparison.overhead.ratios.p95` | Full retrieval is much slower than memory-only baseline |
| Stage `graphrag` dominates | Graph traversals/reports are likely the primary latency bottleneck |

## Recommended Workflow

1. Run once with `clearCacheFirst: true` to get cold-ish behavior.
2. Run again with `clearCacheFirst: false` to inspect warm-cache behavior.
3. Use `compareAgainstMemoryOnly: true` to quantify full-retrieval overhead versus memory-only.
4. Compare `p95`, `hitRate`, and `comparison.overhead.ratios.p95` before and after retrieval changes.

## CI Gate Script

Use the built-in gate script to fail CI on latency regressions:

```bash
bun run perf:retrieval-gate
```

Repository default CI now runs this gate in `.github/workflows/retrieval-perf-gate.yml` with memory-baseline comparison enabled.

Optional environment variables:

```bash
DOCLEA_PERF_GATE_MAX_P95_MS=400
DOCLEA_PERF_GATE_MAX_P95_RATIO=8
DOCLEA_PERF_GATE_STAGE_P95_MS_JSON='{"rag":300,"kag":300,"graphrag":300,"tokenize":180}'
DOCLEA_PERF_RUNS_PER_QUERY=3
DOCLEA_PERF_WARMUP_RUNS=1
DOCLEA_PERF_INCLUDE_CODE_GRAPH=true
DOCLEA_PERF_INCLUDE_GRAPHRAG=true
DOCLEA_PERF_COMPARE_MEMORY_ONLY=true
DOCLEA_PERF_QUERIES_JSON='["What calls validateToken?", "Why did we choose PostgreSQL?"]'
```

Stage thresholds can also be set per-stage (these override JSON values):

```bash
DOCLEA_PERF_GATE_MAX_RAG_P95_MS=300
DOCLEA_PERF_GATE_MAX_KAG_P95_MS=300
DOCLEA_PERF_GATE_MAX_GRAPHRAG_P95_MS=300
DOCLEA_PERF_GATE_MAX_TOKENIZE_P95_MS=180
```

History persistence and baseline comparison are enabled by default in the perf gate script:

```bash
DOCLEA_PERF_HISTORY_ENABLED=true
DOCLEA_PERF_HISTORY_PATH=.doclea/benchmarks/retrieval-history.jsonl
DOCLEA_PERF_HISTORY_RETENTION=250
DOCLEA_PERF_HISTORY_COMPARE_LOOKBACK=50
```

Optional regression-fail thresholds versus history baseline:

```bash
DOCLEA_PERF_HISTORY_MAX_P95_RATIO=1.5
DOCLEA_PERF_HISTORY_MAX_P95_DELTA_MS=40
```

Inspect history from the CLI:

```bash
bun run perf:retrieval-history
bun run perf:retrieval-history:compare
```

## Retrieval Quality Gate

Latency gating does not catch ranking regressions. Run the golden-query relevance gate in CI:

```bash
bun run quality:retrieval-gate
```

See [Retrieval Quality Gate](./retrieval-quality-gate) for fixture format and update workflow.

## See Also

- [doclea_context](../context/build-context) - Main retrieval endpoint
- [doclea_cache_stats](./cache-stats) - Cache internals and hit rate
- [Retrieval Benchmark History](./retrieval-history) - History retention and baseline comparisons
- [Cache & A/B Testing Overview](./overview)
