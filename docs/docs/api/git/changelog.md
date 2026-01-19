---
sidebar_position: 3
title: doclea_changelog
description: Generate changelogs from git history between refs.
keywords: [doclea_changelog, git, changelog, release, version]
---

# doclea_changelog

Generate changelogs from git history between two refs. Supports both developer and user-facing formats.

**Category:** Git Tools
**Status:** Stable

---

## Quick Example

```
"Generate changelog since v1.0.0"
```

**Response:**

```json
{
  "version": "1.1.0",
  "fromRef": "v1.0.0",
  "toRef": "HEAD",
  "date": "2024-03-10",
  "markdown": "# Changelog v1.1.0\n\n**2024-03-10** | 15 commits | +1234 -456 | 23 files\n\n## Features\n- **auth:** Add JWT refresh endpoint (#123)\n\n## Bug Fixes\n- **api:** Handle null response in user endpoint",
  "features": [...],
  "fixes": [...],
  "breakingChanges": [],
  "contributors": ["Alice", "Bob"],
  "issuesReferenced": ["#123", "#124"],
  "stats": {
    "totalCommits": 15,
    "additions": 1234,
    "deletions": 456,
    "filesChanged": 23
  }
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fromRef` | `string` | Yes | Starting git ref (tag, commit, branch) |
| `toRef` | `string` | No | Ending git ref. Defaults to `HEAD`. |
| `projectPath` | `string` | No | Project path. Defaults to current directory. |
| `format` | `string` | No | Output format: `markdown` (default) or `json` |
| `audience` | `string` | No | Target audience: `developers` (default) or `users` |

---

## Usage Examples

### Since Last Release

```json
{
  "fromRef": "v1.0.0"
}
```

### Between Two Versions

```json
{
  "fromRef": "v1.0.0",
  "toRef": "v1.1.0"
}
```

### User-Friendly Format

```json
{
  "fromRef": "v1.0.0",
  "audience": "users"
}
```

---

## Response Schema

```typescript
interface ChangelogResult {
  version: string;
  fromRef: string;
  toRef: string;
  date: string;
  markdown: string;
  features: ChangelogEntry[];
  fixes: ChangelogEntry[];
  breakingChanges: ChangelogEntry[];
  docs: ChangelogEntry[];
  refactor: ChangelogEntry[];
  performance: ChangelogEntry[];
  other: ChangelogEntry[];
  contributors: string[];
  issuesReferenced: string[];
  migrationNotes: string | null;
  stats: {
    totalCommits: number;
    additions: number;
    deletions: number;
    filesChanged: number;
  };
}

interface ChangelogEntry {
  message: string;
  scope?: string;
  issues: string[];
  hash: string;
  author: string;
}
```

---

## Developer Format

```markdown
# Changelog v1.1.0

**2024-03-10** | 15 commits | +1234 -456 | 23 files

## Breaking Changes

- **auth:** Remove deprecated login endpoint (#89)

### Migration Guide

Review the following breaking changes before upgrading:
- Remove deprecated login endpoint

## Features

- **auth:** Add JWT refresh endpoint (#123)
- **api:** Add rate limiting to endpoints

## Bug Fixes

- **api:** Handle null response in user endpoint
- **auth:** Fix token expiry calculation

## Performance

- **db:** Optimize user query with index

## Documentation

- Update API reference

## Refactoring

- **auth:** Simplify token validation logic

## Related Issues

#123, #124, #125

## Contributors

@Alice, @Bob, @Charlie

---
*Comparing `v1.0.0`...`HEAD`*
```

---

## User Format

```markdown
# What's New in v1.1.0

## Important Changes

This update includes changes that may affect your workflow:

- Remove deprecated login endpoint

## New Features

Add JWT refresh endpoint
Your account is now more secure.

Handle rate limiting to endpoints

## Bug Fixes

- Handle null response in user endpoint
- Fix token expiry calculation
- ...and 3 more bug fixes

## Performance Improvements

We've made the app faster and more responsive!
- Optimize user query with index

---
*Thank you for using our product! We appreciate your feedback.*
```

---

## Commit Categorization

| Type | Detected From |
|------|---------------|
| Breaking | `!:`, `BREAKING CHANGE`, `breaking:` |
| Features | `feat:`, `feature:` |
| Fixes | `fix:`, bug-related keywords |
| Docs | `docs:` |
| Refactor | `refactor:` |
| Performance | `perf:` |
| Other | Everything else |

---

## Version Detection

Version is determined by:

1. **toRef as tag** - If `toRef` matches `v1.2.3` format
2. **git describe** - Finds nearest tag to `toRef`
3. **fromRef increment** - Bumps minor version from `fromRef`
4. **Default** - "Unreleased"

---

## Issue Extraction

Issues are extracted from commit messages:

- `#123` - GitHub issues
- `PROJ-123` - Jira-style
- `closes #123`, `fixes #123`, `resolves #123`

---

## Error Responses

### Invalid Ref

```
Error: Invalid git ref: v0.0.0
```

### No Commits

```
Error: No commits found between v1.0.0 and HEAD
```

---

## See Also

- [doclea_commit_message](./commit-message) - Generate commit messages
- [doclea_pr_description](./pr-description) - Generate PR descriptions
- [Git Tools Overview](../overview#git-tools-3)
