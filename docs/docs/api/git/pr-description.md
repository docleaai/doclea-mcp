---
sidebar_position: 2
title: doclea_pr_description
description: Generate comprehensive PR descriptions with context.
keywords: [doclea_pr_description, git, pull request, PR, description]
---

# doclea_pr_description

Generate comprehensive PR descriptions with related decisions, suggested reviewers, and file change summaries.

**Category:** Git Tools
**Status:** Stable

---

## Quick Example

```
"Create a PR description for my current branch"
```

**Response:**

```json
{
  "title": "Add User Authentication Flow",
  "body": "## Summary\nAdds 3 new feature(s). Fixes 1 bug(s).\n\n## Context\nThis PR relates to the following architectural decisions:\n- **JWT-based authentication** (85% relevant)\n\n## Changes\n- feat(auth): add login endpoint\n- feat(auth): add logout endpoint\n- fix(auth): handle token expiry\n\n## Files Changed\n**5** files changed, **234** insertions(+), **12** deletions(-)\n\n## Suggested Reviewers\n├── @alice (primary expert 78%, auth module) — required\n├── @bob (significant contributor 45%, 3/5 files) — optional",
  "commits": ["feat(auth): add login endpoint", "feat(auth): add logout endpoint"],
  "filesChanged": ["src/auth/login.ts", "src/auth/logout.ts", "src/auth/types.ts"],
  "additions": 234,
  "deletions": 12,
  "suggestedReviewers": [
    {
      "name": "alice",
      "email": "alice@example.com",
      "reason": "primary expert (78%), auth module",
      "relevance": 0.92,
      "expertisePct": 78,
      "category": "required"
    }
  ],
  "relatedDecisions": [
    {
      "id": "mem_jwt",
      "title": "JWT-based authentication",
      "type": "decision",
      "relevance": 0.85
    }
  ]
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `branch` | `string` | No | Current branch name. Auto-detected if not provided. |
| `base` | `string` | No | Base branch to compare against. Defaults to `main`. |
| `projectPath` | `string` | No | Project path. Defaults to current directory. |

---

## Usage Examples

### Auto-detect Branch

```json
{}
```

### Compare Against Specific Base

```json
{
  "base": "develop"
}
```

### Specify Branch

```json
{
  "branch": "feature/auth-flow",
  "base": "main"
}
```

---

## Response Schema

```typescript
interface PRDescriptionResult {
  title: string;
  body: string;
  commits: string[];
  filesChanged: string[];
  additions: number;
  deletions: number;
  suggestedReviewers: ReviewerSuggestion[];
  relatedDecisions: Array<{
    id: string;
    title: string;
    type: string;
    relevance: number;
  }>;
}

interface ReviewerSuggestion {
  name: string;
  email: string;
  reason: string;
  relevance: number;
  expertisePct: number;
  category: "required" | "optional";
  filesOwned: string[];
}
```

---

## PR Body Sections

The generated PR body includes:

### Summary

```markdown
## Summary
Adds 3 new feature(s). Fixes 1 bug(s).
```

### Context (from memories)

```markdown
## Context
This PR relates to the following architectural decisions:
- **JWT-based authentication** (85% relevant)
  Using JWTs for stateless authentication
```

### Patterns Applied

```markdown
## Patterns Applied
- REST API error handling with RFC7807
```

### Changes

```markdown
## Changes
- feat(auth): add login endpoint
- feat(auth): add logout endpoint
- fix(auth): handle token expiry
```

### Files Changed

```markdown
## Files Changed
**5** files changed, **234** insertions(+), **12** deletions(-)

### src/auth
- `login.ts`
- `logout.ts`
- `types.ts`
```

### Testing Checklist

```markdown
## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing completed
```

### Suggested Reviewers

```markdown
## Suggested Reviewers
├── @alice (primary expert 78%, auth module) — required
├── @bob (significant contributor 45%, 3/5 files) — optional

> No clear owner for: src/utils/new-helper.ts
```

---

## Title Generation

Title is derived from:

1. **Branch name patterns** - `feature/add-auth` → "Add Auth"
2. **First commit message** - Falls back to oldest commit
3. **Default** - "Changes from {branch}"

---

## Reviewer Suggestion Logic

| Category | Criteria |
|----------|----------|
| **Required** | 50%+ ownership of files AND covers >30% of changed files |
| **Optional** | Significant contribution (<50%) OR recent activity |

---

## Error Responses

### Not a Git Repository

```
Error: Not a git repository
```

### Branch Not Found

```
Error: Branch 'feature/nonexistent' not found
```

---

## See Also

- [doclea_commit_message](./commit-message) - Generate commit messages
- [doclea_changelog](./changelog) - Generate changelogs
- [doclea_suggest_reviewers](../expertise/reviewers) - Reviewer suggestions
