---
sidebar_position: 4
title: doclea_experiment_status
description: Get A/B testing experiment status.
keywords: [doclea_experiment_status, ab-testing, experiment, status]
---

# doclea_experiment_status

Get A/B testing status including active experiments, variants, and metrics buffer status.

**Category:** Cache & A/B Testing
**Status:** Stable

---

## Quick Example

```
"Show experiment status"
```

**Response (A/B testing enabled):**

```json
{
  "enabled": true,
  "metricsEnabled": true,
  "activeExperiment": {
    "id": "recency-boost",
    "name": "Test Recency Weighting",
    "variants": [
      { "id": "control", "name": "Baseline", "weight": 0.5 },
      { "id": "treatment", "name": "Higher Recency", "weight": 0.5 }
    ]
  },
  "totalExperiments": 2,
  "metricsBuffer": {
    "samplesBuffered": 156,
    "lastFlush": 1705432800000
  },
  "experiments": [
    {
      "id": "recency-boost",
      "name": "Test Recency Weighting",
      "enabled": true,
      "assignmentStrategy": "deterministic",
      "variantCount": 2
    },
    {
      "id": "importance-test",
      "name": "Test Importance Factor",
      "enabled": false,
      "assignmentStrategy": "random",
      "variantCount": 3
    }
  ]
}
```

**Response (A/B testing not configured):**

```json
{
  "enabled": false,
  "message": "A/B testing is not configured"
}
```

---

## Parameters

This tool takes no parameters.

```json
{}
```

---

## Response Schema

```typescript
interface ExperimentStatusResult {
  enabled: boolean;
  message?: string;  // If not configured
  metricsEnabled?: boolean;
  activeExperiment?: {
    id: string;
    name: string;
    variants: Array<{
      id: string;
      name: string;
      weight: number;
    }>;
  };
  totalExperiments?: number;
  metricsBuffer?: {
    samplesBuffered: number;
    lastFlush: number;
  };
  experiments?: Array<{
    id: string;
    name: string;
    enabled: boolean;
    assignmentStrategy: "random" | "deterministic";
    variantCount: number;
  }>;
}
```

---

## Understanding the Response

### enabled

Whether A/B testing system is active.

### metricsEnabled

Whether metrics collection is running.

### activeExperiment

The currently active experiment (first enabled experiment):

| Field | Description |
|-------|-------------|
| id | Experiment identifier |
| name | Human-readable name |
| variants | List of variants with weights |

### metricsBuffer

Metrics awaiting flush to storage:

| Field | Description |
|-------|-------------|
| samplesBuffered | Number of metrics samples in buffer |
| lastFlush | Timestamp of last flush to storage |

### experiments

All configured experiments:

| Field | Description |
|-------|-------------|
| enabled | Currently running |
| assignmentStrategy | How users are assigned to variants |
| variantCount | Number of variants in experiment |

---

## Assignment Strategies

### deterministic

Same query always gets same variant (based on hash).

**Good for:**
- Consistent user experience
- Debugging (reproducible results)

### random

Random variant assignment per query.

**Good for:**
- True randomization
- When determinism isn't needed

---

## Variant Weights

Weights determine traffic split:

```json
[
  { "id": "control", "weight": 0.5 },
  { "id": "treatment", "weight": 0.5 }
]
```

- Weights are relative, normalized to sum to 1.0
- `0.5 / 0.5` = 50/50 split
- `0.8 / 0.2` = 80/20 split
- `0.33 / 0.33 / 0.34` = ~1/3 each

---

## Enabling A/B Testing

Configure in your Doclea config:

```typescript
{
  abTesting: {
    enabled: true,
    metricsEnabled: true,
    experiments: [
      {
        id: "my-experiment",
        name: "My Experiment",
        enabled: true,
        assignmentStrategy: "deterministic",
        variants: [
          {
            id: "control",
            name: "Control",
            weight: 0.5,
            scoringConfig: { /* baseline config */ }
          },
          {
            id: "treatment",
            name: "Treatment",
            weight: 0.5,
            scoringConfig: { /* test config */ }
          }
        ]
      }
    ]
  }
}
```

---

## See Also

- [doclea_experiment_metrics](./experiment-metrics) - Get experiment results
- [Cache & A/B Testing Overview](./overview)
