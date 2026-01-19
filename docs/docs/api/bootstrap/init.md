---
sidebar_position: 1
title: doclea_init
description: Initialize Doclea for a project with automatic bootstrapping.
keywords: [doclea_init, initialize, bootstrap, setup, onboarding]
---

# doclea_init

Initialize Doclea for a project by scanning git history, documentation, and code to automatically bootstrap memories.

**Category:** Bootstrap Tools
**Status:** Stable

---

## Quick Example

```
"Initialize doclea for this project"
```

**Response:**

```json
{
  "configCreated": true,
  "memoriesCreated": 45,
  "decisions": 12,
  "solutions": 18,
  "patterns": 8,
  "notes": 6,
  "architecture": 1,
  "scannedFiles": 34,
  "scannedCommits": 500,
  "detectedStack": {
    "framework": "Next.js (App Router)",
    "database": "Prisma (configured)",
    "auth": "Auth.js (NextAuth)",
    "testing": "Vitest",
    "runtime": "Bun"
  },
  "issuesFound": ["#123", "#145", "AUTH-234"],
  "breakingChanges": 3
}
```

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | `string` | No | Project path. Defaults to current directory. |
| `scanGit` | `boolean` | No | Scan git history for decisions/solutions. Defaults to true. |
| `scanDocs` | `boolean` | No | Scan markdown files for documentation. Defaults to true. |
| `scanCode` | `boolean` | No | Scan code for patterns and structure. Defaults to true. |
| `scanCommits` | `number` | No | Number of commits to scan (10-2000). Defaults to 500. |
| `dryRun` | `boolean` | No | Preview what would be stored without storing. Defaults to false. |

---

## Usage Examples

### Full Initialization

```json
{}
```

### Preview Mode

```json
{
  "dryRun": true
}
```

### Git Only

```json
{
  "scanGit": true,
  "scanDocs": false,
  "scanCode": false
}
```

### Deep Git Scan

```json
{
  "scanCommits": 2000
}
```

---

## Response Schema

```typescript
interface InitResult {
  configCreated: boolean;
  memoriesCreated: number;
  decisions: number;
  solutions: number;
  patterns: number;
  notes: number;
  architecture: number;
  scannedFiles: number;
  scannedCommits: number;
  detectedStack: {
    framework: string | null;
    database: string | null;
    auth: string | null;
    testing: string | null;
    runtime: string | null;
  };
  issuesFound: string[];
  breakingChanges: number;
}
```

---

## What Gets Created

### Config File

Creates `.doclea/config.json` with default settings if not exists.

### Architecture Memory

Detects and stores the project's technology stack:

```json
{
  "type": "architecture",
  "title": "Project Stack: my-app",
  "content": "Detected technology stack:\n- Framework: Next.js (App Router)\n- Database: Prisma (configured)\n- Auth: Auth.js (NextAuth)\n- Testing: Vitest\n- Runtime: Bun",
  "importance": 0.9,
  "tags": ["stack", "architecture", "auto-detected"]
}
```

### Git-Extracted Memories

Scans commits for decisions and solutions:

| Commit Pattern | Memory Type | Example |
|----------------|-------------|---------|
| `feat:` + long description | decision | Major feature implementations |
| `refactor:` | decision | Architectural changes |
| Migration keywords | decision | Database migrations |
| `fix:` | solution | Bug fixes |
| Bug/issue keywords | solution | Problem resolutions |

### Documentation Notes

Scans markdown files and stores as notes:

| File Pattern | Importance |
|--------------|------------|
| README | 0.9 |
| CONTRIBUTING | 0.8 |
| Architecture docs | 0.85 |
| ADR files | 0.8 |
| CHANGELOG | 0.6 |
| Other docs | 0.5 |

### Code Patterns

Analyzes config files and stores as patterns:

- Vite/Webpack configuration
- Next.js configuration
- TypeScript settings
- Prisma/Drizzle schemas
- Test runner configuration
- Tailwind configuration
- ESLint rules
- Docker setup

---

## Stack Detection

### Frameworks

| Detected | From |
|----------|------|
| Next.js (App/Pages Router) | `next` dependency |
| Nuxt | `nuxt` dependency |
| Remix | `@remix-run/*` |
| SvelteKit | `@sveltejs/kit` |
| Angular | `@angular/core` |
| NestJS | `@nestjs/core` |
| Hono/Elysia | Respective packages |

### Databases

| Detected | From |
|----------|------|
| Prisma | `prisma`, `@prisma/client` |
| Drizzle | `drizzle-orm` |
| TypeORM | `typeorm` |
| MongoDB | `mongoose` |
| PostgreSQL | `pg`, `postgres` |
| Supabase | `@supabase/supabase-js` |

### Auth

| Detected | From |
|----------|------|
| Auth.js | `next-auth`, `@auth/core` |
| Clerk | `@clerk/nextjs` |
| Lucia | `lucia` |
| Better Auth | `better-auth` |
| Passport | `passport` |

### Testing

| Detected | From |
|----------|------|
| Vitest | `vitest` |
| Jest | `jest` |
| Playwright | `@playwright/test` |
| Cypress | `cypress` |

### Runtime

| Detected | From |
|----------|------|
| Bun | `bun.lock` or `bun.lockb` |
| Node.js (pnpm) | `pnpm-lock.yaml` |
| Node.js (yarn) | `yarn.lock` |
| Node.js (npm) | `package-lock.json` |
| Deno | `deno.json` |

---

## Commit Categorization

Commits are categorized by keywords:

**Decisions:**
- decision, chose, decided, migrate, refactor
- architect, restructure, redesign, overhaul
- breaking, deprecate, upgrade, switch to

**Solutions:**
- fix, bug, resolve, issue, error
- crash, patch, hotfix, workaround

---

## Error Responses

### Not a Project Directory

```
Error: No package.json found
```

### Git Not Available

```
Error: Not a git repository
```

---

## Best Practices

1. **Run once** at project setup
2. Use **dryRun** first to preview
3. **Review** auto-generated memories
4. **Supplement** with manual memories for context not in git

---

## See Also

- [Quick Start Guide](../../quick-start) - Getting started
- [Memory Management](../../guides/memory-management) - Managing memories
- [Bootstrap Tools Overview](../overview#bootstrap-tools-1)
