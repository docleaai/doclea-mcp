---
sidebar_position: 3
title: Git Integration
description: Leverage git history for context-aware commit messages, PR descriptions, and changelogs.
keywords: [git, commit, PR, pull request, changelog, version control]
---

# Git Integration

Doclea integrates deeply with git to provide context-aware commit messages, PR descriptions, and changelogs based on your stored memories.

---

## Overview

Doclea's git tools analyze your staged changes and cross-reference them with stored memories to generate meaningful, contextual documentation.

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   Git Changes    │──────│  Doclea Memory   │──────│  Generated Docs  │
│  (staged files)  │      │  (decisions,     │      │  (commit msg,    │
│                  │      │   patterns)      │      │   PR desc)       │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

---

## Available Git Tools

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `doclea_commit_message` | Generate commit messages | Before committing changes |
| `doclea_pr_description` | Generate PR descriptions | Before creating PRs |
| `doclea_changelog` | Generate changelogs | Before releases |

---

## Commit Messages

### Basic Usage

```
"Generate a commit message for my changes"
```

Doclea will:
1. Read your staged changes (`git diff --staged`)
2. Search for related memories (decisions, patterns)
3. Generate a conventional commit message

### Example Output

```
feat(auth): add JWT refresh endpoint

- Implement token refresh logic with 7-day expiry
- Add validation for refresh token format
- Update auth middleware to handle refresh flow

Related: Using JWT for stateless authentication (decision)
Closes #123
```

### Commit Type Detection

| Detected Change | Commit Type |
|-----------------|-------------|
| New files added | `feat:` |
| Bug fix keywords | `fix:` |
| Test files changed | `test:` |
| Documentation changes | `docs:` |
| Config file changes | `chore:` |
| Refactoring | `refactor:` |
| Performance improvements | `perf:` |

### Memory Integration

Commit messages include related context:

```markdown
feat(api): add rate limiting to endpoints

- Implement sliding window rate limiter
- Add 429 response handling
- Configure per-route limits

Context:
- REST API design with RFC7807 errors (pattern)
- Rate limiting decision: 100 req/min per user (decision)
```

---

## PR Descriptions

### Basic Usage

```
"Create a PR description for my branch"
```

### Generated Sections

**Summary**
```markdown
## Summary
Adds 3 new feature(s). Fixes 1 bug(s).
```

**Context** (from memories)
```markdown
## Context
This PR relates to the following architectural decisions:
- **JWT-based authentication** (85% relevant)
  Using JWTs for stateless authentication with refresh tokens
```

**Changes**
```markdown
## Changes
- feat(auth): add login endpoint
- feat(auth): add logout endpoint
- fix(auth): handle token expiry edge case
```

**Files Changed**
```markdown
## Files Changed
**5** files changed, **234** insertions(+), **12** deletions(-)

### src/auth
- `login.ts`
- `logout.ts`
- `types.ts`
```

**Suggested Reviewers**
```markdown
## Suggested Reviewers
├── @alice (primary expert 78%, auth module) — required
├── @bob (significant contributor 45%, 3/5 files) — optional

> No clear owner for: src/utils/new-helper.ts
```

### Customizing Base Branch

```json
{
  "base": "develop"
}
```

---

## Changelogs

### Basic Usage

```
"Generate changelog since v1.0.0"
```

### Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `fromRef` | Starting git ref (required) | - |
| `toRef` | Ending git ref | `HEAD` |
| `audience` | `developers` or `users` | `developers` |

### Developer Format

```markdown
# Changelog v1.1.0

**2024-03-10** | 15 commits | +1234 -456 | 23 files

## Breaking Changes

- **auth:** Remove deprecated login endpoint (#89)

### Migration Guide

- Remove deprecated login endpoint usage
- Update to new `/api/v2/auth/login` endpoint

## Features

- **auth:** Add JWT refresh endpoint (#123)
- **api:** Add rate limiting to endpoints

## Bug Fixes

- **api:** Handle null response in user endpoint
- **auth:** Fix token expiry calculation

## Contributors

@Alice, @Bob, @Charlie
```

### User Format

For release notes aimed at end users:

```json
{
  "fromRef": "v1.0.0",
  "audience": "users"
}
```

```markdown
# What's New in v1.1.0

## Important Changes

This update includes changes that may affect your workflow:
- The login process has been updated for better security

## New Features

- **Automatic token refresh** - Stay logged in longer without interruption
- **Rate limiting** - Improved API stability

## Bug Fixes

- Fixed occasional login issues
- Improved error messages

---
*Thank you for using our product!*
```

---

## Workflow Integration

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
# Generate commit message suggestion
echo "Suggested commit message:"
echo "========================="
# Note: This requires your MCP client to expose a CLI
doclea commit-message --staged
echo "========================="
```

### CI/CD Integration

Generate changelogs automatically in CI:

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate Changelog
        run: |
          # Get previous tag
          PREV_TAG=$(git describe --tags --abbrev=0 HEAD^)
          # Generate changelog using Doclea
          doclea changelog --from $PREV_TAG --to ${{ github.ref_name }} > CHANGELOG.md

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          body_path: CHANGELOG.md
```

---

## Best Practices

### 1. Store Architectural Decisions

The more context Doclea has, the better the generated content:

```
"Store decision: We chose JWT tokens for authentication because
they allow stateless verification and work well with our microservices architecture"
```

### 2. Use Conventional Commits

Doclea generates better changelogs when commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(auth): add login endpoint
fix(api): handle null response
docs: update API reference
```

### 3. Reference Issues

Include issue references in commits for automatic linking:

```
feat(auth): add MFA support

Implements multi-factor authentication with TOTP.
Closes #456
```

### 4. Review Generated Content

Always review generated commit messages and PR descriptions. Doclea provides a starting point that you should refine.

---

## Configuration

### Commit Message Format

Configure in `.doclea/config.json`:

```json
{
  "git": {
    "commitFormat": "conventional",
    "includeScope": true,
    "maxSubjectLength": 72,
    "includeBody": true,
    "includeRelatedMemories": true
  }
}
```

### PR Description Template

```json
{
  "git": {
    "prTemplate": {
      "includeSummary": true,
      "includeContext": true,
      "includeChanges": true,
      "includeFiles": true,
      "includeReviewers": true,
      "includeChecklist": true
    }
  }
}
```

---

## Troubleshooting

### "Not a git repository"

Ensure you're running from within a git repository:

```bash
git status
```

### "No staged changes"

Stage your changes before generating commit messages:

```bash
git add .
# or
git add specific-file.ts
```

### "Branch not found"

Ensure the branch exists:

```bash
git branch -a | grep your-branch
```

### Missing Related Memories

Store more context for better results:

```
"Store the decision about why we use TypeScript strict mode"
```

---

## See Also

- [doclea_commit_message](../api/git/commit-message) - API reference
- [doclea_pr_description](../api/git/pr-description) - API reference
- [doclea_changelog](../api/git/changelog) - API reference
- [Memory Management](./memory-management) - Store decisions for context
