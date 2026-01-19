---
sidebar_position: 2
title: Zero Config Setup
description: Quick start with Doclea using zero configuration - ideal for small to medium projects.
keywords: [zero-config, setup, quick start, bun, npx, installation]
---

# Zero Config Setup

Get Doclea running in seconds with automatic configuration. Perfect for small to medium projects that don't need custom settings.

---

## Prerequisites

- **Node.js** 18+ or **Bun** 1.0+
- **Git** (for git-powered features)
- An MCP-compatible client (Claude Desktop, Cursor, VS Code with Continue)

---

## Installation Options

### Option 1: Global Install (Recommended)

```bash
# Using Bun (faster)
bun add -g doclea-mcp

# Using npm
npm install -g doclea-mcp
```

Then run anywhere:

```bash
doclea
```

### Option 2: Project Local Install

```bash
# Using Bun
bun add -D doclea-mcp

# Using npm
npm install --save-dev doclea-mcp
```

Add to your `package.json` scripts:

```json
{
  "scripts": {
    "doclea": "doclea"
  }
}
```

### Option 3: Direct Execution (No Install)

```bash
# Using Bun
bunx doclea-mcp

# Using npx
npx doclea-mcp
```

---

## What Zero Config Does

When you run Doclea without a config file, it automatically:

| Feature | Default Behavior |
|---------|------------------|
| **Storage** | SQLite database in `.doclea/memories.db` |
| **Embeddings** | Local embeddings (no API key needed) |
| **Vector Search** | In-memory HNSW index |
| **Config Location** | `.doclea/config.json` (created on first use) |

---

## Default Configuration

Zero config creates this configuration automatically:

```json
{
  "storage": {
    "type": "sqlite",
    "path": ".doclea/memories.db"
  },
  "embedding": {
    "provider": "local",
    "model": "all-MiniLM-L6-v2"
  },
  "scoring": {
    "weights": {
      "recency": 0.3,
      "importance": 0.4,
      "relevance": 0.3
    }
  }
}
```

---

## MCP Client Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "doclea": {
      "command": "doclea",
      "args": []
    }
  }
}
```

**Config file locations:**

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/claude/claude_desktop_config.json` |

### Cursor

Add to your workspace `.cursor/mcp.json`:

```json
{
  "servers": {
    "doclea": {
      "command": "doclea",
      "args": []
    }
  }
}
```

### VS Code with Continue

Add to your Continue configuration:

```json
{
  "mcpServers": [
    {
      "name": "doclea",
      "command": "doclea"
    }
  ]
}
```

---

## First Run

1. **Start your MCP client** (Claude Desktop, Cursor, etc.)
2. **Ask Claude to initialize:**

```
Initialize doclea for this project
```

This triggers `doclea_init` which:
- Scans your git history
- Detects your tech stack
- Creates initial memories from README, docs, and patterns

---

## Directory Structure Created

After initialization:

```
your-project/
├── .doclea/
│   ├── config.json      # Auto-generated config
│   ├── memories.db      # SQLite database
│   └── memories.db-shm  # SQLite shared memory
└── ... your files
```

---

## When to Use Zero Config

**Good for:**
- Personal projects
- Small team projects
- Quick prototyping
- Learning Doclea

**Consider [Docker setup](./docker) instead if:**
- You need team-wide shared memories
- You want persistent server across sessions
- Your project has >10,000 memories
- You need Postgres storage

---

## Customizing Later

Even with zero config, you can customize by editing `.doclea/config.json`:

```json
{
  "storage": {
    "type": "sqlite",
    "path": ".doclea/memories.db"
  },
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "apiKey": "${OPENAI_API_KEY}"
  },
  "scoring": {
    "weights": {
      "recency": 0.2,
      "importance": 0.5,
      "relevance": 0.3
    }
  }
}
```

---

## Troubleshooting

### "Command not found: doclea"

```bash
# Check if installed globally
which doclea
bun pm ls -g | grep doclea

# Reinstall
bun add -g doclea-mcp
```

### "Database locked" error

Another process is using the database. Close other MCP clients or restart.

### MCP client doesn't see Doclea

1. Verify the config path is correct
2. Restart your MCP client completely
3. Check logs for connection errors

---

## Next Steps

- [Verification](./verification) - Verify your installation
- [Quick Start](../quick-start) - Start using Doclea
- [Memory Management](../guides/memory-management) - Learn memory operations
