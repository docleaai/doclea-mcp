---
sidebar_position: 1
title: doclea_commit_message
description: Generate context-aware commit messages from staged changes.
keywords: [doclea_commit_message, git, commit, message, conventional]
---

# doclea_commit_message

Generate context-aware commit messages from staged changes. Uses stored memories to provide relevant context and follows conventional commit format.

**Category:** Git Tools
**Status:** Stable

---

## Quick Example

```
"Generate a commit message for my staged changes"
```

**Response:**

```json
{
  "suggestedMessage": "feat(auth): add JWT token refresh endpoint\n\nRelated decisions:\n- JWT-based authentication architecture\n\nFollows patterns:\n- REST API error handling with RFC7807",
  "type": "feat",
  "scope": "auth",
  "summary": "add JWT token refresh endpoint",
  "body": "Related decisions:\n- JWT-based authentication architecture",
  "filesChanged": ["src/auth/refresh.ts", "src/auth/types.ts"],
  "relatedMemories": [
    {
      "id": "mem_jwt",
      "title": "JWT-based authentication architecture",
      "type": "decision",
      "relevance": 0.85
    }
  ],
  "relatedIssues": ["#123", "AUTH-456"]
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `diff` | `string` | No | Git diff to analyze. Uses staged changes if not provided. |
| `projectPath` | `string` | No | Project path. Defaults to current directory. |

---

## Usage Examples

### Auto-detect Staged Changes

```json
{}
```

### Provide Custom Diff

```json
{
  "diff": "diff --git a/src/auth/refresh.ts b/src/auth/refresh.ts\n..."
}
```

### Specify Project Path

```json
{
  "projectPath": "/path/to/project"
}
```

---

## Response Schema

```typescript
interface CommitMessageResult {
  suggestedMessage: string;
  type: string;
  scope: string | null;
  summary: string;
  body: string | null;
  filesChanged: string[];
  relatedMemories: Array<{
    id: string;
    title: string;
    type: string;
    relevance: number;
  }>;
  relatedIssues: string[];
}
```

---

## Commit Type Detection

The tool analyzes changes to determine the commit type:

| Type | Detected When |
|------|---------------|
| `feat` | New files, adding functionality |
| `fix` | Related to bug memories, "fix" in diff |
| `refactor` | More deletions than additions |
| `test` | Test file changes |
| `docs` | Markdown/documentation changes |
| `style` | CSS/styling changes |
| `chore` | Config file changes |

---

## Scope Detection

Scope is derived from:

1. **Common directory** - If all files share a parent directory
2. **Domain patterns** - `auth`, `api`, `db`, `ui` detected from paths

---

## Memory Integration

The tool searches for related memories:

1. **File-based search** - Memories linked to changed files
2. **Content-based search** - Semantic similarity to diff content
3. **Decision search** - Architectural decisions related to changes

---

## Issue Extraction

Issues are extracted from:

- Related memory `sourcePr` fields
- Memory content matching `#123` or `PROJ-123` patterns
- Memory titles with issue references

---

## Error Responses

### No Staged Changes

```
Error: No staged changes found. Stage changes with 'git add' first.
```

### Not a Git Repository

```
Error: Not a git repository
```

---

## Example Output Formats

### Simple Change

```
fix(api): handle null response in user endpoint
```

### With Context

```
feat(auth): implement password reset flow

Related decisions:
- Email-based authentication recovery

Follows patterns:
- Rate limiting for security endpoints

Relates to: #234, AUTH-789
```

---

## See Also

- [doclea_pr_description](./pr-description) - Generate PR descriptions
- [doclea_changelog](./changelog) - Generate changelogs
- [Git Tools Overview](../overview#git-tools-3)
