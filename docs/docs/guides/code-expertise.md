---
sidebar_position: 4
title: Code Expertise
description: Map code ownership, identify bus factor risks, and suggest optimal reviewers.
keywords: [expertise, ownership, bus factor, code review, reviewers, knowledge transfer]
---

# Code Expertise

Doclea analyzes your git history to map code ownership, identify knowledge silos, and suggest optimal reviewers for code changes.

---

## Overview

Code expertise tracking helps teams:
- Identify who knows what in the codebase
- Spot bus factor risks before they become problems
- Route code reviews to the right people
- Plan knowledge transfer and mentorship

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   Git History    │──────│  Expertise Map   │──────│  Actionable      │
│  (commits,       │      │  (ownership %,   │      │  Insights        │
│   authors)       │      │   bus factor)    │      │  (reviewers,     │
│                  │      │                  │      │   transfers)     │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

---

## Available Tools

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `doclea_expertise` | Map code ownership | Understand codebase knowledge |
| `doclea_suggest_reviewers` | Suggest PR reviewers | Before creating/assigning PRs |

---

## Mapping Code Expertise

### Basic Usage

```
"Who owns the auth module?"
```

### Response Structure

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
      "totalCommits": 55
    }
  ],
  "recommendations": [...],
  "summary": {...}
}
```

### Understanding the Results

**Primary Expert**: Person with the most commits to this area
- `percentage`: Their share of total commits
- `lastCommit`: When they last contributed

**Secondary Experts**: Others with significant contributions
- Important for redundancy and review coverage

**Bus Factor**: Number of people who could maintain this code
- 1 = High risk (single point of failure)
- 2 = Medium risk
- 3+ = Low risk

---

## Bus Factor Analysis

The bus factor indicates how vulnerable a codebase area is to knowledge loss.

### Risk Levels

| Bus Factor | Risk | Description |
|------------|------|-------------|
| 1 | High | Single person owns >80% of commits |
| 2 | Medium | Two people share most knowledge |
| 3+ | Low | Knowledge is well-distributed |

### Analyzing Your Repository

```
"Analyze bus factor risks across the entire codebase"
```

Response includes:

```json
{
  "summary": {
    "totalFiles": 156,
    "totalContributors": 8,
    "avgBusFactor": 1.8,
    "riskyPaths": ["src/auth", "src/payments"],
    "stalePaths": ["src/legacy"],
    "healthScore": 65
  }
}
```

### Health Score

The health score (0-100) factors in:

| Factor | Impact |
|--------|--------|
| Risky paths ratio | Up to -30 points |
| Stale paths ratio | Up to -20 points |
| Low average bus factor | Up to -30 points |
| High bus factor bonus | Up to +10 points |

---

## Recommendations

Doclea generates actionable recommendations based on the analysis:

### Knowledge Transfer

```json
{
  "type": "knowledge_transfer",
  "priority": "high",
  "path": "src/auth",
  "message": "Pair Bob with Alice on src/auth for knowledge transfer (82% owned by one person)",
  "involvedExperts": ["Alice", "Bob"]
}
```

**When generated**: Bus factor risk + active code area

### Mentorship

```json
{
  "type": "mentorship",
  "priority": "high",
  "path": "src/payments",
  "message": "Consider mentorship program for src/payments (single owner, critical area)",
  "involvedExperts": ["Charlie"]
}
```

**When generated**: Bus factor risk + no secondary experts

### Documentation

```json
{
  "type": "documentation",
  "priority": "medium",
  "path": "src/legacy",
  "message": "Document src/legacy (stale code with significant history)",
  "involvedExperts": []
}
```

**When generated**: Stale code + many past commits

---

## Suggesting Reviewers

### Basic Usage

```
"Who should review changes to src/auth/login.ts?"
```

### Response Structure

```json
{
  "required": [
    {
      "name": "Alice",
      "email": "alice@example.com",
      "reason": "primary expert (78%), all 3 files",
      "relevance": 0.92,
      "expertisePct": 78,
      "category": "required",
      "filesOwned": ["src/auth/login.ts", "src/auth/types.ts"]
    }
  ],
  "optional": [
    {
      "name": "Bob",
      "reason": "contributor (25%), 2/3 files, recent activity",
      "relevance": 0.65,
      "expertisePct": 25,
      "category": "optional"
    }
  ],
  "noOwner": ["src/utils/new-helper.ts"],
  "summary": "..."
}
```

### Reviewer Categories

| Category | Criteria |
|----------|----------|
| **Required** | 50%+ ownership AND covers >30% of changed files |
| **Optional** | <50% ownership OR recent activity without high ownership |

### Ownership Thresholds

| Threshold | Value | Purpose |
|-----------|-------|---------|
| Required | 50% | Primary expert threshold |
| Minimum | 10% | Minimum to be suggested |

### Excluding Authors

Don't suggest the PR author as reviewer:

```json
{
  "files": ["src/auth/login.ts"],
  "excludeAuthors": ["alice@example.com"]
}
```

---

## Practical Workflows

### 1. Weekly Bus Factor Review

Schedule a weekly review of high-risk areas:

```
"Show all paths with bus factor of 1"
```

Create action items for knowledge transfer.

### 2. PR Review Assignment

When creating PRs, get optimal reviewers:

```
"Who should review my current branch changes?"
```

### 3. Onboarding New Team Members

Identify areas for new developers to contribute:

```
"What areas have good documentation and multiple experts?"
```

### 4. Sprint Planning

Consider expertise when assigning work:

```
"Show expertise map for the payment module"
```

---

## Customization

### Bus Factor Threshold

Adjust what constitutes "high risk":

```json
{
  "busFactorThreshold": 70
}
```

Default is 80% (primary expert owns >=80% of commits).

### Analysis Depth

Control how deep the directory analysis goes:

```json
{
  "depth": 3
}
```

Range: 1-5, Default: 2

### Including Stale Paths

Include or exclude paths with no recent activity:

```json
{
  "includeStale": false
}
```

Default includes paths with no activity in 6+ months.

---

## Integration with PR Workflow

### Automatic Reviewer Suggestions

`doclea_pr_description` automatically includes reviewer suggestions:

```markdown
## Suggested Reviewers
├── @alice (primary expert 78%, auth module) — required
├── @bob (significant contributor 45%, 3/5 files) — optional

> No clear owner for: src/utils/new-helper.ts
```

### No Owner Warnings

Files without clear ownership need attention:

```json
{
  "noOwner": ["src/utils/new-helper.ts", "src/config/new-settings.ts"]
}
```

Consider:
- Adding documentation
- Assigning ownership
- Getting senior review

---

## Excluded Files

The analysis automatically excludes:

| Pattern | Reason |
|---------|--------|
| `.git/` | Git internals |
| `node_modules/` | Dependencies |
| `*.lock` | Lock files |
| `dist/`, `build/` | Build artifacts |
| `coverage/` | Test coverage |
| `*.min.js` | Minified files |
| `*.map` | Source maps |

---

## Best Practices

### 1. Regular Expertise Reviews

Review bus factor quarterly:

```
"Generate expertise report for the entire codebase"
```

### 2. Document Knowledge Gaps

When high bus factor is identified, store a memory:

```
"Store note: Auth module needs knowledge transfer - Alice owns 82%,
Bob should pair with her on upcoming auth features"
```

### 3. Balance Review Load

Don't always assign to primary experts:

```
"Suggest reviewers excluding the top expert for learning purposes"
```

### 4. Track Progress

Re-run analysis after knowledge transfer initiatives:

```
"Compare current bus factor with last quarter"
```

---

## Troubleshooting

### "Not a git repository"

Ensure you're in a git repository with history:

```bash
git log --oneline -10
```

### "Path not found"

Verify the path exists:

```bash
ls -la src/auth
```

### Low Commit Count

For new projects, expertise mapping may be limited. Focus on establishing good practices:

```
"Store pattern: All new code should have at least two reviewers familiar with the area"
```

### Multiple Email Addresses

Contributors using different emails appear as different people. Consider using `.mailmap`:

```
# .mailmap
Alice <alice@example.com> <alice.old@example.com>
```

---

## See Also

- [doclea_expertise](../api/expertise/mapping) - API reference
- [doclea_suggest_reviewers](../api/expertise/reviewers) - API reference
- [Git Integration](./git-integration) - PR description includes reviewers
