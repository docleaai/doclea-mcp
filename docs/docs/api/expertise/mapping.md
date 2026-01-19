---
sidebar_position: 1
title: doclea_expertise
description: Map code ownership and expertise across your codebase.
keywords: [doclea_expertise, expertise, ownership, bus factor, contributors]
---

# doclea_expertise

Map code ownership and expertise across your codebase using git history analysis. Identifies bus factor risks and generates knowledge transfer recommendations.

**Category:** Expertise Tools
**Status:** Stable

---

## Quick Example

```
"Who owns the auth module?"
```

**Response:**

```json
{
  "entries": [
    {
      "path": "src/auth",
      "primaryExpert": {
        "name": "Alice",
        "email": "alice@example.com",
        "commits": 45,
        "percentage": 82,
        "lastCommit": "2024-03-05"
      },
      "secondaryExperts": [
        {
          "name": "Bob",
          "commits": 8,
          "percentage": 15,
          "lastCommit": "2024-02-20"
        }
      ],
      "busFactor": 1,
      "busFactorRisk": true,
      "lastActivity": "2024-03-05",
      "totalCommits": 55,
      "totalFiles": 12
    }
  ],
  "recommendations": [
    {
      "type": "knowledge_transfer",
      "priority": "high",
      "path": "src/auth",
      "message": "Pair Bob with Alice on src/auth for knowledge transfer (82% owned by one person)",
      "involvedExperts": ["Alice", "Bob"]
    }
  ],
  "summary": {
    "totalFiles": 156,
    "totalContributors": 8,
    "totalDirectories": 24,
    "avgBusFactor": 1.8,
    "riskyPaths": ["src/auth", "src/payments"],
    "stalePaths": ["src/legacy"],
    "healthScore": 65
  }
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | `string` | No | Specific path to analyze. Analyzes entire repo if not provided. |
| `projectPath` | `string` | No | Project path. Defaults to current directory. |
| `depth` | `number` | No | Directory depth to analyze (1-5). Defaults to 2. |
| `includeStale` | `boolean` | No | Include paths with no recent activity (>6 months). Defaults to true. |
| `busFactorThreshold` | `number` | No | Percentage threshold for bus factor risk (50-100). Defaults to 80. |

---

## Usage Examples

### Entire Repository

```json
{}
```

### Specific Path

```json
{
  "path": "src/auth"
}
```

### Shallow Analysis

```json
{
  "depth": 1,
  "includeStale": false
}
```

### Custom Risk Threshold

```json
{
  "busFactorThreshold": 70
}
```

---

## Response Schema

```typescript
interface ExpertiseResult {
  entries: ExpertiseEntry[];
  recommendations: ExpertiseRecommendation[];
  summary: {
    totalFiles: number;
    totalContributors: number;
    totalDirectories: number;
    avgBusFactor: number;
    riskyPaths: string[];
    stalePaths: string[];
    healthScore: number; // 0-100
  };
}

interface ExpertiseEntry {
  path: string;
  primaryExpert: Expert | null;
  secondaryExperts: Expert[];
  experts: Expert[];
  busFactor: number;
  busFactorRisk: boolean;
  lastActivity: string;
  totalCommits: number;
  totalFiles: number;
}

interface Expert {
  name: string;
  email: string;
  commits: number;
  percentage: number;
  lastCommit: string;
}
```

---

## Bus Factor

The **bus factor** indicates how many people have significant knowledge of a codebase area:

| Bus Factor | Risk Level | Meaning |
|------------|------------|---------|
| 1 | High | Single point of failure |
| 2 | Medium | Some redundancy |
| 3+ | Low | Well-distributed knowledge |

**Risk threshold**: Primary expert has >= threshold% ownership (default 80%)

---

## Recommendations

The tool generates actionable recommendations:

| Type | Priority | Trigger |
|------|----------|---------|
| `knowledge_transfer` | High | Bus factor risk + active code |
| `mentorship` | High | Bus factor risk + no secondary |
| `documentation` | Medium | Stale code with many commits |
| `stale_code` | Medium | Inactive + bus factor risk |
| `review_coverage` | Low | Bus factor 2, could use more |

---

## Health Score

The health score (0-100) factors in:

- **Risky paths ratio** - Up to -30 points
- **Stale paths ratio** - Up to -20 points
- **Average bus factor** - Up to -30 points (if <3)
- **High bus factor bonus** - Up to +10 points (if >=3)

---

## Excluded Files

The tool automatically excludes:

- `.git/` directory
- `node_modules/`
- Lock files (`*.lock`, `package-lock.json`)
- Build artifacts (`dist/`, `build/`, `.next/`)
- Coverage reports
- Minified files (`*.min.js`)
- Source maps (`*.map`)

---

## Error Responses

### Not a Git Repository

```
Error: Not a git repository
```

### Path Not Found

```
Error: Path 'src/nonexistent' not found
```

---

## See Also

- [doclea_suggest_reviewers](./reviewers) - Suggest reviewers for files
- [Expertise Tools Overview](../overview#expertise-tools-2)
- [Code Expertise Guide](../../guides/code-expertise)
