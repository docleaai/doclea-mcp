---
sidebar_position: 2
title: doclea_suggest_reviewers
description: Suggest code reviewers based on file ownership.
keywords: [doclea_suggest_reviewers, reviewers, code review, ownership, PR]
---

# doclea_suggest_reviewers

Suggest code reviewers based on file ownership analysis. Identifies required and optional reviewers with expertise percentages.

**Category:** Expertise Tools
**Status:** Stable

---

## Quick Example

```
"Who should review changes to src/auth/login.ts?"
```

**Response:**

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
      "filesOwned": ["src/auth/login.ts", "src/auth/types.ts", "src/auth/utils.ts"]
    }
  ],
  "optional": [
    {
      "name": "Bob",
      "email": "bob@example.com",
      "reason": "contributor (25%), 2/3 files, recent activity",
      "relevance": 0.65,
      "expertisePct": 25,
      "category": "optional",
      "filesOwned": ["src/auth/login.ts", "src/auth/types.ts"]
    }
  ],
  "noOwner": ["src/auth/new-helper.ts"],
  "summary": "PR touches: 3 files in 1 directory\n\nSuggested reviewers:\n├── @Alice (primary expert 78%, all 3 files) — required\n├── @Bob (contributor 25%, 2/3 files) — optional\n\n⚠️ No clear owner: src/auth/new-helper.ts"
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `files` | `string[]` | Yes | List of files that changed |
| `projectPath` | `string` | No | Project path. Defaults to current directory. |
| `excludeAuthors` | `string[]` | No | Authors to exclude (e.g., PR author). Defaults to []. |
| `limit` | `number` | No | Maximum reviewers to suggest (1-10). Defaults to 3. |

---

## Usage Examples

### Basic Usage

```json
{
  "files": ["src/auth/login.ts", "src/auth/types.ts"]
}
```

### Exclude PR Author

```json
{
  "files": ["src/auth/login.ts"],
  "excludeAuthors": ["alice@example.com"]
}
```

### More Reviewers

```json
{
  "files": ["src/auth/login.ts", "src/api/users.ts"],
  "limit": 5
}
```

---

## Response Schema

```typescript
interface SuggestReviewersResult {
  required: ReviewerSuggestion[];
  optional: ReviewerSuggestion[];
  noOwner: string[];
  summary: string;
}

interface ReviewerSuggestion {
  name: string;
  email: string;
  reason: string;
  relevance: number;        // 0-1 score
  expertisePct: number;     // Ownership percentage
  category: "required" | "optional";
  filesOwned: string[];
}
```

---

## Reviewer Categories

| Category | Criteria |
|----------|----------|
| **Required** | 50%+ ownership AND covers >30% of changed files |
| **Optional** | <50% ownership OR recent activity without high ownership |

---

## Ownership Thresholds

| Threshold | Value | Purpose |
|-----------|-------|---------|
| Required | 50% | Primary expert threshold |
| Minimum | 10% | Minimum to be suggested |

---

## Reason Generation

The `reason` field describes why someone is suggested:

| Ownership | Description |
|-----------|-------------|
| >= 70% | "primary expert (X%)" |
| >= 50% | "major contributor (X%)" |
| >= 30% | "significant contributor (X%)" |
| < 30% | "contributor (X%)" |

Additional context:

- File coverage: "all X files" or "X/Y files"
- Recency: "recent activity" or "very active recently"

---

## No Owner Warning

Files with no clear owner (< 10% ownership from anyone):

```json
{
  "noOwner": ["src/utils/new-helper.ts", "src/config/new-settings.ts"]
}
```

These files may need:
- Documentation
- Initial code review by senior developer
- Ownership assignment

---

## Summary Format

```
PR touches: 3 files in 1 directory

Suggested reviewers:
├── @Alice (primary expert 78%, all 3 files) — required
├── @Bob (contributor 25%, 2/3 files) — optional
└── @Charlie (contributor 15%, 1/3 files) — optional

⚠️ No clear owner: src/utils/new-helper.ts
```

---

## Error Responses

### Not a Git Repository

```
Error: Not a git repository
```

### No Files Provided

```
Error: No files provided
```

---

## Integration with PR Description

This tool is automatically called by `doclea_pr_description` to populate the "Suggested Reviewers" section.

---

## See Also

- [doclea_expertise](./mapping) - Full expertise mapping
- [doclea_pr_description](../git/pr-description) - Uses this for reviewer suggestions
- [Expertise Tools Overview](../overview#expertise-tools-2)
