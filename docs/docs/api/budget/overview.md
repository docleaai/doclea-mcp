---
sidebar_position: 1
title: Token Budget Overview
description: Manage token allocation for optimal context utilization.
keywords: [token, budget, allocation, context, limits]
---

# Token Budget

Tools for managing token allocation across different categories to optimize context window utilization.

## Why Token Budgets?

LLMs have limited context windows. Doclea helps you:

- **Allocate wisely** - Distribute tokens across system, context, user, and response
- **Use presets** - Pre-configured allocations for common scenarios
- **Stay within limits** - Automatic model-aware constraints

## Available Tools

| Tool | Description |
|------|-------------|
| [doclea_allocate_budget](./allocate-budget) | Allocate tokens by model or total |
| [doclea_get_model_windows](./get-model-windows) | Get known model context windows |
| [doclea_get_budget_presets](./get-budget-presets) | Get available allocation presets |

## Token Categories

| Category | Purpose | Typical % |
|----------|---------|-----------|
| `system` | System prompt, instructions | 10-20% |
| `context` | Retrieved memories, code | 40-60% |
| `user` | User message, query | 10-20% |
| `response` | Model output space | 20-30% |

## Budget Presets

### balanced (Default)
Standard allocation for most use cases.

```
system: 15%, context: 50%, user: 15%, response: 20%
```

### contextHeavy
Maximum context for complex queries.

```
system: 10%, context: 60%, user: 10%, response: 20%
```

### conservative
Extra response space for detailed answers.

```
system: 10%, context: 40%, user: 15%, response: 35%
```

### chat
Optimized for conversational use.

```
system: 20%, context: 30%, user: 20%, response: 30%
```

## Quick Start

### 1. Get Model Window

```json
// doclea_get_model_windows
{}
```

Returns known model context sizes.

### 2. Choose Preset

```json
// doclea_get_budget_presets
{}
```

### 3. Allocate Budget

```json
// doclea_allocate_budget
{
  "model": "claude-3-5-sonnet-20241022",
  "preset": "balanced"
}
```

## Workflow Integration

Token budgets integrate with context building:

```typescript
// 1. Allocate budget
const budget = await allocateBudget({
  model: "claude-3-5-sonnet-20241022",
  preset: "contextHeavy"
});

// 2. Build context within budget
const context = await buildContext({
  query: "How does auth work?",
  maxTokens: budget.context
});
```

## See Also

- [doclea_build_context](../context/build-context) - Build context within budget
- [Context Building Overview](../context/overview) - Full context pipeline
