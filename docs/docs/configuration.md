---
sidebar_position: 6
title: Configuration
description: Complete configuration reference for Doclea. Scoring, decay, staleness, and storage settings.
keywords: [configuration, settings, scoring, staleness, confidence decay]
---

# Configuration

Doclea is designed to work out of the box, but offers extensive configuration for customization.

---

## Configuration File

Create a configuration file in your project root:

```typescript
// doclea.config.ts
import type { DocleaConfig } from "doclea-mcp";

const config: DocleaConfig = {
  // Your configuration here
};

export default config;
```

Or use JSON:

```json
// doclea.config.json
{
  "storage": { ... },
  "scoring": { ... },
  "staleness": { ... }
}
```

---

## Storage Configuration

Configure the storage backend.

```typescript
storage: {
  /** Storage backend: "sqlite" | "memory" */
  backend: "sqlite",

  /** SQLite database file path */
  dbPath: ".doclea/memories.db",

  /** Enable WAL mode for better concurrent performance */
  walMode: true
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `backend` | `"sqlite" \| "memory"` | `"sqlite"` | Storage backend |
| `dbPath` | `string` | `".doclea/memories.db"` | Database file path |
| `walMode` | `boolean` | `true` | Enable SQLite WAL mode |

---

## Scoring Configuration

Multi-factor relevance scoring for search results.

### Basic Setup

```typescript
scoring: {
  /** Enable multi-factor scoring */
  enabled: true,

  /** Factor weights (must sum to ~1.0) */
  weights: {
    semantic: 0.5,    // Vector similarity
    recency: 0.2,     // How recently accessed
    confidence: 0.15, // Importance with decay
    frequency: 0.15   // Access count
  }
}
```

### Recency Decay

Controls how recency factor decays over time:

```typescript
scoring: {
  recencyDecay: {
    type: "exponential",
    halfLifeDays: 30
  }
}
```

**Options:**

| Type | Parameters | Description |
|------|------------|-------------|
| `exponential` | `halfLifeDays` | Score halves every N days |
| `linear` | `fullDecayDays` | Score reaches 0 after N days |
| `step` | `thresholds` | Discrete score levels by age |

### Frequency Normalization

How access counts convert to scores:

```typescript
scoring: {
  frequencyNormalization: {
    method: "log",      // "log" | "linear" | "sigmoid"
    maxCount: 100,      // Count where score = 1.0
    coldStartScore: 0.5 // Score for new memories
  }
}
```

### Boost Rules

Apply multipliers based on conditions:

```typescript
scoring: {
  boostRules: [
    {
      name: "recent-boost",
      condition: { type: "recency", maxDays: 7 },
      factor: 1.2  // +20% for memories < 7 days old
    },
    {
      name: "high-importance-boost",
      condition: { type: "importance", minValue: 0.8 },
      factor: 1.15  // +15% for importance ≥ 0.8
    },
    {
      name: "stale-penalty",
      condition: { type: "staleness", minDays: 180 },
      factor: 0.8  // -20% for memories > 180 days old
    },
    {
      name: "architecture-boost",
      condition: { type: "memoryType", types: ["architecture"] },
      factor: 1.1  // +10% for architecture decisions
    },
    {
      name: "pinned-boost",
      condition: { type: "tags", tags: ["pinned"], match: "any" },
      factor: 1.25  // +25% for pinned memories
    }
  ]
}
```

**Condition Types:**

| Type | Parameters | Description |
|------|------------|-------------|
| `recency` | `maxDays` | Matches if memory < N days old |
| `staleness` | `minDays` | Matches if memory > N days old |
| `importance` | `minValue` | Matches if importance ≥ value |
| `frequency` | `minAccessCount` | Matches if access count ≥ value |
| `memoryType` | `types` | Matches if memory type in list |
| `tags` | `tags`, `match` | Matches if tags match (any/all) |

---

## Confidence Decay

Time-based reduction of memory relevance.

```typescript
scoring: {
  confidenceDecay: {
    /** Enable decay */
    enabled: true,

    /** Decay function */
    decay: {
      type: "exponential",
      halfLifeDays: 90
    },

    /** Minimum effective confidence */
    floor: 0.1,

    /** Use accessedAt as anchor when available */
    refreshOnAccess: true,

    /** Memory types exempt from decay */
    exemptTypes: ["architecture"],

    /** Tags that exempt from decay */
    exemptTags: ["pinned", "evergreen"]
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable confidence decay |
| `decay.type` | `string` | `"exponential"` | Decay function type |
| `decay.halfLifeDays` | `number` | `90` | Days until confidence halves |
| `floor` | `number` | `0.1` | Minimum effective confidence |
| `refreshOnAccess` | `boolean` | `true` | Virtual refresh on access |
| `exemptTypes` | `string[]` | `["architecture"]` | Types exempt from decay |
| `exemptTags` | `string[]` | `["pinned"]` | Tags that exempt from decay |

**Decay Types:**

| Type | Parameters | Description |
|------|------------|-------------|
| `exponential` | `halfLifeDays` | Score halves every N days |
| `linear` | `fullDecayDays` | Score reaches floor after N days |
| `step` | `thresholds` | Discrete score levels by age |
| `none` | - | Disables decay |

See [Confidence Decay Architecture](/docs/architecture/confidence-decay) for details.

---

## Staleness Detection

Detect memories that need review or refresh.

```typescript
staleness: {
  /** Enable staleness detection */
  enabled: true,

  /** Action thresholds */
  thresholds: {
    review: 0.3,   // Score >= 0.3: suggest review
    refresh: 0.6,  // Score >= 0.6: suggest refresh
    archive: 0.9   // Score >= 0.9: suggest archive
  },

  /** Per-strategy configuration */
  strategies: {
    /** Time-based staleness */
    timeDecay: {
      thresholdDays: 180,
      weight: 0.5
    },

    /** Git file change detection */
    gitChanges: {
      weight: 0.7,
      cacheTtlMs: 300000  // 5-minute cache
    },

    /** Related memory updates */
    relatedUpdates: {
      weight: 0.4,
      maxDepth: 2  // Traversal depth
    },

    /** Superseded relation detection */
    superseded: {
      weight: 1.0  // Immediate staleness
    }
  }
}
```

### Threshold Configuration

| Threshold | Default | Recommended Action |
|-----------|---------|-------------------|
| `review` | `0.3` | Read and verify accuracy |
| `refresh` | `0.6` | Update refresh anchor |
| `archive` | `0.9` | Consider deletion |

### Strategy Weights

| Strategy | Weight | Description |
|----------|--------|-------------|
| `timeDecay` | `0.5` | Age-based staleness |
| `gitChanges` | `0.7` | Related file changes |
| `relatedUpdates` | `0.4` | Related memory updates |
| `superseded` | `1.0` | Explicitly superseded |

### Git Changes Settings

```typescript
gitChanges: {
  weight: 0.7,
  cacheTtlMs: 300000,  // 5 minutes
  repoPath: "."        // Optional: custom repo path
}
```

### Related Updates Settings

```typescript
relatedUpdates: {
  weight: 0.4,
  maxDepth: 2  // How deep to traverse relations
}
```

See [Memory Staleness Guide](/docs/guides/memory-staleness) for workflows.

---

## Embedding Configuration

Configure embedding generation.

```typescript
embedding: {
  /** Provider: "local" | "openai" */
  provider: "local",

  /** Model for local embeddings */
  model: "all-MiniLM-L6-v2",

  /** OpenAI model (if provider: "openai") */
  openaiModel: "text-embedding-3-small",

  /** Dimensions for vector storage */
  dimensions: 384
}
```

### Zero-Config (Default)

Uses Transformers.js with local models. No API key needed.

### OpenAI

Requires `OPENAI_API_KEY` environment variable.

```typescript
embedding: {
  provider: "openai",
  openaiModel: "text-embedding-3-small"
}
```

---

## Environment Variables

Override configuration via environment variables:

| Variable | Description |
|----------|-------------|
| `DOCLEA_DB_PATH` | SQLite database path |
| `DOCLEA_SCORING_ENABLED` | Enable scoring (`true`/`false`) |
| `OPENAI_API_KEY` | OpenAI API key (for OpenAI embeddings) |

---

## Preset Configurations

### Fast-Moving Project

For active projects with frequent changes:

```typescript
const config: DocleaConfig = {
  scoring: {
    enabled: true,
    confidenceDecay: {
      enabled: true,
      decay: { type: "exponential", halfLifeDays: 30 },
      floor: 0.1
    }
  },
  staleness: {
    enabled: true,
    thresholds: { review: 0.2, refresh: 0.5, archive: 0.8 },
    strategies: {
      timeDecay: { thresholdDays: 90, weight: 0.5 },
      gitChanges: { weight: 0.8, cacheTtlMs: 60000 }
    }
  }
};
```

### Stable Codebase

For mature projects with infrequent changes:

```typescript
const config: DocleaConfig = {
  scoring: {
    enabled: true,
    confidenceDecay: {
      enabled: true,
      decay: { type: "exponential", halfLifeDays: 180 },
      floor: 0.2
    }
  },
  staleness: {
    enabled: true,
    thresholds: { review: 0.4, refresh: 0.7, archive: 0.95 },
    strategies: {
      timeDecay: { thresholdDays: 365, weight: 0.4 },
      gitChanges: { weight: 0.6, cacheTtlMs: 600000 }
    }
  }
};
```

### Documentation-Heavy Project

For projects with lots of architectural decisions:

```typescript
const config: DocleaConfig = {
  scoring: {
    enabled: true,
    boostRules: [
      {
        name: "architecture-boost",
        condition: { type: "memoryType", types: ["architecture", "decision"] },
        factor: 1.3
      }
    ],
    confidenceDecay: {
      enabled: true,
      exemptTypes: ["architecture", "decision"],
      exemptTags: ["pinned", "evergreen", "fundamental"]
    }
  }
};
```

---

## Validation

Doclea validates configuration on startup. Invalid configurations will produce clear error messages:

```
Error: Invalid configuration:
- staleness.thresholds.review must be between 0 and 1
- scoring.weights.semantic + recency + confidence + frequency should sum to ~1.0
```

---

## Complete Example

```typescript
// doclea.config.ts
import type { DocleaConfig } from "doclea-mcp";

const config: DocleaConfig = {
  storage: {
    backend: "sqlite",
    dbPath: ".doclea/memories.db",
    walMode: true
  },

  scoring: {
    enabled: true,
    weights: {
      semantic: 0.5,
      recency: 0.2,
      confidence: 0.15,
      frequency: 0.15
    },
    recencyDecay: {
      type: "exponential",
      halfLifeDays: 30
    },
    frequencyNormalization: {
      method: "log",
      maxCount: 100,
      coldStartScore: 0.5
    },
    boostRules: [
      {
        name: "recent-boost",
        condition: { type: "recency", maxDays: 7 },
        factor: 1.2
      },
      {
        name: "high-importance-boost",
        condition: { type: "importance", minValue: 0.8 },
        factor: 1.15
      },
      {
        name: "stale-penalty",
        condition: { type: "staleness", minDays: 180 },
        factor: 0.8
      }
    ],
    searchOverfetch: 3,
    confidenceDecay: {
      enabled: true,
      decay: {
        type: "exponential",
        halfLifeDays: 90
      },
      floor: 0.1,
      refreshOnAccess: true,
      exemptTypes: ["architecture"],
      exemptTags: ["pinned", "evergreen"]
    }
  },

  staleness: {
    enabled: true,
    thresholds: {
      review: 0.3,
      refresh: 0.6,
      archive: 0.9
    },
    strategies: {
      timeDecay: {
        thresholdDays: 180,
        weight: 0.5
      },
      gitChanges: {
        weight: 0.7,
        cacheTtlMs: 300000
      },
      relatedUpdates: {
        weight: 0.4,
        maxDepth: 2
      },
      superseded: {
        weight: 1.0
      }
    }
  }
};

export default config;
```

---

## See Also

- [Confidence Decay Architecture](/docs/architecture/confidence-decay)
- [Memory Staleness Guide](/docs/guides/memory-staleness)
- [Retrieval Strategies](/docs/architecture/retrieval-strategies)
