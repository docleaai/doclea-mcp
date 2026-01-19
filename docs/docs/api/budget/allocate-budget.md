---
sidebar_position: 2
title: doclea_allocate_budget
description: Allocate token budget by model or total tokens.
keywords: [doclea_allocate_budget, token, budget, allocate, model]
---

# doclea_allocate_budget

Allocate token budget across categories using model detection or explicit total. Supports presets and custom overrides.

**Category:** Token Budget
**Status:** Stable

---

## Quick Example

```
"Allocate budget for Claude Sonnet"
```

**Response:**

```json
{
  "total": 200000,
  "system": 30000,
  "context": 100000,
  "user": 30000,
  "response": 40000,
  "preset": "balanced",
  "model": "claude-3-5-sonnet-20241022"
}
```

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `model` | `string` | No | - | Model name for auto-detection |
| `totalTokens` | `number` | No | - | Explicit total (overrides model) |
| `preset` | `string` | No | `balanced` | Allocation preset |
| `overrides` | `object` | No | - | Custom category allocations |

**Note:** Provide either `model` OR `totalTokens`, not both.

---

## Usage Examples

### By Model Name

```
"Allocate budget for GPT-4"
```

```json
{
  "model": "gpt-4-turbo"
}
```

### By Total Tokens

```
"Allocate 50k tokens"
```

```json
{
  "totalTokens": 50000
}
```

### With Preset

```
"Allocate context-heavy budget for Sonnet"
```

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "preset": "contextHeavy"
}
```

### With Overrides

```
"Allocate budget with more response space"
```

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "preset": "balanced",
  "overrides": {
    "response": 50000
  }
}
```

---

## Response Schema

```typescript
interface AllocationResult {
  total: number;
  system: number;
  context: number;
  user: number;
  response: number;
  preset: string;
  model?: string;
}
```

---

## Supported Models

| Model Pattern | Context Window |
|---------------|----------------|
| `claude-3-5-*` | 200,000 |
| `claude-3-*` | 200,000 |
| `gpt-4-turbo*` | 128,000 |
| `gpt-4-32k*` | 32,000 |
| `gpt-4*` | 8,000 |
| `gpt-3.5-turbo-16k*` | 16,000 |
| `gpt-3.5*` | 4,000 |

Unknown models default to 8,000 tokens.

---

## Presets

| Preset | System | Context | User | Response |
|--------|--------|---------|------|----------|
| `balanced` | 15% | 50% | 15% | 20% |
| `contextHeavy` | 10% | 60% | 10% | 20% |
| `conservative` | 10% | 40% | 15% | 35% |
| `chat` | 20% | 30% | 20% | 30% |

---

## Override Behavior

Overrides replace preset values for specific categories:

```json
{
  "preset": "balanced",
  "overrides": {
    "context": 80000,
    "response": 60000
  }
}
```

The remaining categories use preset percentages of remaining tokens.

---

## See Also

- [doclea_get_model_windows](./get-model-windows) - Available models
- [doclea_get_budget_presets](./get-budget-presets) - Available presets
- [Token Budget Overview](./overview)
