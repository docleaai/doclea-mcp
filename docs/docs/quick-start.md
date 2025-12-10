---
sidebar_position: 2
title: Quick Start
description: Get Doclea working in under 3 minutes. Zero configuration required.
keywords: [quick start, getting started, installation, setup]
---

# Quick Start

Get Doclea working in **under 3 minutes**. No Docker, no configuration.

## Prerequisites

- Node.js 18+
- Claude Code (or any MCP-compatible client)

---

## Step 1: Configure MCP Server

Add Doclea to your Claude Code configuration.

**macOS/Linux:** Edit `~/.claude.json`

**Windows:** Edit `%APPDATA%\claude\config.json`

```json
{
  "mcpServers": {
    "doclea": {
      "command": "npx",
      "args": ["@doclea/mcp"]
    }
  }
}
```

---

## Step 2: Restart Claude Code

Close and reopen Claude Code to load the new MCP server.

---

## Step 3: Initialize Your Project

Navigate to your project directory, then ask Claude:

> "Initialize doclea for this project"

**Expected output:**

```
✓ Scanned 127 files
✓ Analyzed 45 commits
✓ Imported 3 existing docs
✓ Stored 12 initial memories
✓ Ready for search
```

---

## Step 4: Try It Out

### Store a Decision

> "Store this decision: We use PostgreSQL for ACID compliance in payment processing. Tag it 'database' and 'payments'."

### Search Your Memory

> "Search memories for database decisions"

### Generate a Commit Message

Stage some changes, then:

> "Generate a commit message for these staged changes"

---

## What Just Happened?

Doclea created a `.doclea/` folder in your project:

```
.doclea/
├── local.db        # SQLite database with memories + vectors
└── config.json     # Project configuration (optional)
```

:::tip Add to .gitignore
Add `.doclea/` to your `.gitignore` to keep memories local.
:::

---

## Verify It's Working

Ask Claude:

> "How many memories does doclea have for this project?"

You should see a count of stored memories.

---

## Next Steps

- [Memory Management](./guides/memory-management) - Store and organize effectively
- [Git Integration](./guides/git-integration) - Commit messages, PRs, changelogs
- [Configuration](./configuration) - Customize embedding providers and storage
- [Troubleshooting](./troubleshooting) - Common issues and fixes

---

## Didn't Work?

### "MCP server not found"

1. Check your config file path is correct
2. Ensure the JSON is valid (no trailing commas)
3. Restart Claude Code completely

### "Permission denied" on macOS

```bash
# Install sqlite3 via Homebrew for extension support
brew install sqlite3
```

### First run is slow (2-5 seconds)

Normal. Doclea downloads a 90MB embedding model on first use. Subsequent calls are fast (~100ms).

[Full Troubleshooting Guide →](./troubleshooting)
