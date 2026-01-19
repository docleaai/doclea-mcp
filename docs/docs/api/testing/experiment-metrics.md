---
sidebar_position: 5
title: doclea_experiment_metrics
description: Export metrics for A/B testing experiments.
keywords: [doclea_experiment_metrics, ab-testing, metrics, analysis]
---

# doclea_experiment_metrics

Export metrics for an A/B testing experiment. Returns aggregated statistics or raw samples for analysis.

**Category:** Cache & A/B Testing
**Status:** Stable

---

## Quick Example

```
"Get metrics for recency-boost experiment"
```

**Response (aggregated):**

```json
{
  "experimentId": "recency-boost",
  "format": "aggregated",
  "variants": [
    {
      "variantId": "control",
      "requestCount": 523,
      "avgLatencyMs": 145.3,
      "p50LatencyMs": 132,
      "p95LatencyMs": 287,
      "p99LatencyMs": 412,
      "avgResultCount": 8.2,
      "avgTopScore": 0.847,
      "errorCount": 2
    },
    {
      "variantId": "treatment",
      "requestCount": 519,
      "avgLatencyMs": 148.7,
      "p50LatencyMs": 138,
      "p95LatencyMs": 295,
      "p99LatencyMs": 423,
      "avgResultCount": 7.9,
      "avgTopScore": 0.862,
      "errorCount": 1
    }
  ],
  "periodStart": 1705320000000,
  "periodEnd": 1705432800000
}
```

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `experimentId` | `string` | Yes | - | Experiment ID to get metrics for |
| `format` | `string` | No | `aggregated` | Output format: aggregated or raw |
| `limit` | `number` | No | `1000` | Max raw samples (1-10,000) |
| `since` | `number` | No | - | Only metrics after this timestamp (ms) |

---

## Usage Examples

### Aggregated Stats

```
"Show aggregated metrics for my-experiment"
```

```json
{
  "experimentId": "my-experiment"
}
```

### Raw Samples

```
"Export raw metrics data for analysis"
```

```json
{
  "experimentId": "my-experiment",
  "format": "raw",
  "limit": 5000
}
```

### Recent Metrics Only

```
"Get metrics from the last 24 hours"
```

```json
{
  "experimentId": "my-experiment",
  "since": 1705346400000
}
```

---

## Response Schema

### Aggregated Format

```typescript
interface AggregatedMetricsResult {
  experimentId: string;
  format: "aggregated";
  variants: Array<{
    variantId: string;
    requestCount: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    avgResultCount: number;
    avgTopScore: number;
    errorCount: number;
  }>;
  periodStart: number;
  periodEnd: number;
}
```

### Raw Format

```typescript
interface RawMetricsResult {
  experimentId: string;
  format: "raw";
  samples: Array<{
    variantId: string;
    sessionHash: string;
    latencyMs: number;
    resultCount: number;
    topScore?: number;
    timestamp: number;
  }>;
  totalSamples: number;
  truncated: boolean;
}
```

---

## Metrics Explained

### latencyMs

Time to complete the search/context operation.

| Metric | Meaning |
|--------|---------|
| avgLatencyMs | Average latency |
| p50LatencyMs | Median latency (50th percentile) |
| p95LatencyMs | 95th percentile |
| p99LatencyMs | 99th percentile |

### resultCount

Number of results returned by the search.

### topScore

Relevance score of the top result (0-1).

### errorCount

Number of failed operations.

---

## Interpreting Results

### Compare Variants

```json
{
  "variants": [
    {
      "variantId": "control",
      "avgLatencyMs": 145.3,
      "avgTopScore": 0.847
    },
    {
      "variantId": "treatment",
      "avgLatencyMs": 148.7,
      "avgTopScore": 0.862
    }
  ]
}
```

**Analysis:**
- Treatment has ~2% higher latency (acceptable)
- Treatment has ~1.8% higher top score (better relevance)
- Treatment appears to improve quality with minimal latency cost

### Statistical Significance

For proper A/B testing analysis:
1. Export raw data
2. Use statistical tools (t-test, Mann-Whitney, etc.)
3. Check for significance at your chosen threshold (e.g., p < 0.05)

---

## Error Handling

### Experiment Not Found

```json
{
  "error": "Experiment not found: unknown-id"
}
```

### A/B Testing Not Configured

```json
{
  "error": "A/B testing is not configured"
}
```

---

## Workflow: Complete Analysis

```typescript
// 1. Check experiment is running
const status = await doclea_experiment_status({});

// 2. Wait for sufficient data (days/weeks)

// 3. Export aggregated metrics
const metrics = await doclea_experiment_metrics({
  experimentId: "my-experiment",
  format: "aggregated"
});

// 4. Compare variants
// If treatment is better, update scoring config
// If control is better, keep current config
// If inconclusive, continue experiment

// 5. For deep analysis, export raw data
const raw = await doclea_experiment_metrics({
  experimentId: "my-experiment",
  format: "raw",
  limit: 10000
});
// Process in external tools (Python, R, etc.)
```

---

## See Also

- [doclea_experiment_status](./experiment-status) - View experiment status
- [Cache & A/B Testing Overview](./overview)
