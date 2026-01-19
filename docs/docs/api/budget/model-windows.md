---
sidebar_position: 3
title: doclea_model_windows
description: Get known model context window sizes.
keywords: [doclea_model_windows, model, context, window, tokens]
---

# doclea_model_windows

Get the known context window sizes for supported models.

**Category:** Token Budget
**Status:** Stable

---

## Quick Example

```
"What are the model context windows?"
```

**Response:**

```json
{
  "models": {
    "gpt-4-turbo": 128000,
    "gpt-4": 8000,
    "gpt-3.5-turbo": 4000,
    "claude-opus": 200000,
    "claude-sonnet": 200000,
    "claude-haiku": 200000
  },
  "default": 8000
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
interface ModelWindowsResult {
  models: Record<string, number>;
  default: number;
}
```

---

## Supported Models

### Claude Models

| Model | Window |
|-------|--------|
| claude-opus | 200,000 |
| claude-sonnet | 200,000 |
| claude-haiku | 200,000 |

### OpenAI Models

| Model | Window |
|-------|--------|
| gpt-4-turbo | 128,000 |
| gpt-4 | 8,000 |
| gpt-3.5-turbo | 4,000 |

---

## Unknown Models

Models not in the list default to **8,000 tokens**.

---

## Usage

### Check Before Allocation

```typescript
// 1. Get available windows
const windows = await doclea_model_windows({});

// 2. Find your model
const modelWindow = windows.models["claude-sonnet"];
// → 200000

// 3. Allocate budget
const budget = await doclea_allocate_budget({
  totalBudget: modelWindow,
  preset: "balanced"
});
```

---

## See Also

- [doclea_allocate_budget](./allocate-budget) - Allocate tokens
- [doclea_budget_presets](./budget-presets) - Available presets
- [Token Budget Overview](./overview)
