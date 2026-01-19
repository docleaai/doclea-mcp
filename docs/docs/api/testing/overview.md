---
sidebar_position: 1
title: Cache & A/B Testing Overview
description: Manage context caching and run scoring experiments.
keywords: [cache, ab-testing, experiments, metrics, performance]
---

# Cache & A/B Testing

Tools for managing context caching and running A/B experiments on scoring configurations.

## Caching

Context building can be expensive (embeddings, searches, formatting). Caching helps:

- **Reduce latency** - Instant response for repeated queries
- **Save costs** - Fewer embedding API calls
- **Consistent results** - Same context for same query

### Cache Features

| Feature | Description |
|---------|-------------|
| LRU Eviction | Least-recently-used entries removed first |
| TTL Expiration | Entries expire after configurable time |
| Targeted Invalidation | Clear cache when specific memories change |
| Statistics | Hit rate, miss count, evictions tracked |

### Cache Tools

| Tool | Description |
|------|-------------|
| [doclea_cache_stats](./cache-stats) | Get cache statistics |
| [doclea_cache_clear](./cache-clear) | Clear cache entries |

## A/B Testing

Compare different scoring configurations to find what works best:

```
┌─────────────────────────────────────────────────┐
│                 Experiment                       │
│  "Compare recency vs importance weighting"      │
└─────────────────────┬───────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌───────────────┐           ┌───────────────┐
│  Variant A    │           │  Variant B    │
│  (Control)    │           │  (Treatment)  │
│  weight: 0.5  │           │  weight: 0.5  │
└───────────────┘           └───────────────┘
        │                           │
        └─────────────┬─────────────┘
                      ▼
        ┌─────────────────────────┐
        │   Metrics Collection    │
        │   - Latency             │
        │   - Result count        │
        │   - Top scores          │
        └─────────────────────────┘
```

### A/B Testing Features

| Feature | Description |
|---------|-------------|
| Multiple Variants | Compare 2+ configurations |
| Traffic Splitting | Random or deterministic assignment |
| Metrics Collection | Latency, result count, scores |
| Statistical Analysis | Aggregated metrics per variant |

### A/B Testing Tools

| Tool | Description |
|------|-------------|
| [doclea_experiment_status](./experiment-status) | View active experiments |
| [doclea_experiment_metrics](./experiment-metrics) | Export experiment metrics |

## Cache Configuration

Configure caching in your Doclea config:

```typescript
{
  cache: {
    enabled: true,
    maxEntries: 100,      // LRU cache size
    ttlMs: 300_000        // 5 minute TTL
  }
}
```

## A/B Testing Configuration

Configure experiments in your Doclea config:

```typescript
{
  abTesting: {
    enabled: true,
    metricsEnabled: true,
    metricsFlushIntervalMs: 60_000,
    experiments: [
      {
        id: "recency-boost",
        name: "Test Recency Boost",
        enabled: true,
        assignmentStrategy: "deterministic",
        variants: [
          {
            id: "control",
            name: "Baseline",
            weight: 0.5,
            scoringConfig: {
              recencyWeight: 0.2
            }
          },
          {
            id: "treatment",
            name: "Higher Recency",
            weight: 0.5,
            scoringConfig: {
              recencyWeight: 0.4
            }
          }
        ]
      }
    ]
  }
}
```

## Quick Start

### Check Cache Performance

```json
// doclea_cache_stats
{}
```

Returns hit rate, entry count, and eviction stats.

### Clear Cache

```json
// doclea_cache_clear
{ "resetStats": true }
```

### View Experiment Status

```json
// doclea_experiment_status
{}
```

### Export Experiment Results

```json
// doclea_experiment_metrics
{
  "experimentId": "recency-boost",
  "format": "aggregated"
}
```

## See Also

- [Scoring Configuration](../scoring/overview) - Configure scoring weights
- [Context Building](../context/overview) - What gets cached
