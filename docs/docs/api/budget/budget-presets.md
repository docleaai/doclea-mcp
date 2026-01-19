---
sidebar_position: 4
title: doclea_budget_presets
description: Get available token budget allocation presets.
keywords: [doclea_budget_presets, presets, allocation, budget]
---

# doclea_budget_presets

Get the available token budget allocation presets with their configurations.

**Category:** Token Budget
**Status:** Stable

---

## Quick Example

```
"What budget presets are available?"
```

**Response:**

```json
{
  "presets": {
    "balanced": {
      "system": 0.15,
      "context": 0.50,
      "user": 0.15,
      "response": 0.20
    },
    "contextHeavy": {
      "system": 0.10,
      "context": 0.60,
      "user": 0.10,
      "response": 0.20
    },
    "conservative": {
      "system": 0.10,
      "context": 0.40,
      "user": 0.15,
      "response": 0.35
    },
    "chat": {
      "system": 0.20,
      "context": 0.30,
      "user": 0.20,
      "response": 0.30
    }
  },
  "default": "balanced"
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
interface PresetsResult {
  presets: Record<string, PresetConfig>;
  default: string;
}

interface PresetConfig {
  system: number;   // 0-1 percentage
  context: number;  // 0-1 percentage
  user: number;     // 0-1 percentage
  response: number; // 0-1 percentage
}
```

---

## Preset Details

### balanced

**Best for:** General-purpose use, most tasks

| Category | Allocation |
|----------|------------|
| System | 15% |
| Context | 50% |
| User | 15% |
| Response | 20% |

Provides good balance between retrieved context and response generation.

---

### contextHeavy

**Best for:** Complex queries, research tasks, large codebases

| Category | Allocation |
|----------|------------|
| System | 10% |
| Context | 60% |
| User | 10% |
| Response | 20% |

Maximizes context retrieval for queries needing extensive background.

---

### conservative

**Best for:** Detailed explanations, documentation generation

| Category | Allocation |
|----------|------------|
| System | 10% |
| Context | 40% |
| User | 15% |
| Response | 35% |

Extra response space for comprehensive, detailed outputs.

---

### chat

**Best for:** Conversational interactions, quick Q&A

| Category | Allocation |
|----------|------------|
| System | 20% |
| Context | 30% |
| User | 20% |
| Response | 30% |

Balanced for back-and-forth conversation with moderate context needs.

---

## Choosing a Preset

| Scenario | Recommended Preset |
|----------|-------------------|
| General coding assistance | `balanced` |
| "Explain the entire auth system" | `contextHeavy` |
| "Write detailed API docs" | `conservative` |
| Quick questions, chat | `chat` |
| Large codebase navigation | `contextHeavy` |
| Code review with explanations | `conservative` |

---

## Usage with Allocation

```typescript
// 1. Get presets
const { presets, default: defaultPreset } = await doclea_budget_presets({});

// 2. Choose based on task
const preset = taskNeedsContext ? "contextHeavy" : defaultPreset;

// 3. Allocate
const budget = await doclea_allocate_budget({
  modelName: "claude-sonnet",
  preset
});
```

---

## See Also

- [doclea_allocate_budget](./allocate-budget) - Use presets
- [doclea_model_windows](./model-windows) - Model limits
- [Token Budget Overview](./overview)
