# @doclea/mcp

[![npm version](https://img.shields.io/npm/v/@doclea/mcp.svg)](https://www.npmjs.com/package/@doclea/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![Bun](https://img.shields.io/badge/Bun-%3E%3D1.0-orange.svg)](https://bun.sh/)

> Local MCP server for Doclea — persistent memory for AI coding assistants.

Doclea gives your AI coding assistant (Claude Code, etc.) **persistent memory** across sessions. It remembers architectural decisions, patterns, solutions, and codebase context so you don't have to repeat yourself.

## Features

- **Persistent Memory** — Store decisions, patterns, solutions, and notes that persist across sessions
- **Semantic Search** — Find relevant context using vector similarity search
- **Git Integration** — Generate commit messages, PR descriptions, and changelogs from your history
- **Code Expertise Mapping** — Identify code owners and suggest reviewers based on git blame analysis
- **Zero-Config Mode** — Works immediately with no Docker or external services required
- **Auto-Detection** — Automatically uses optimized Docker backends when available

## Quick Start

Add to your Claude Code config (`~/.claude.json` or project `.claude.json`):

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

Restart Claude Code, navigate to your project, and ask:

```
Initialize doclea for this project
```

That's it! Doclea scans your codebase, git history, and documentation to bootstrap memories.

## Installation Options

| Method | Command | Setup Time | Best For |
|--------|---------|------------|----------|
| **Zero-Config** | `npx @doclea/mcp` | <30 seconds | Quick start, small projects |
| **Optimized** | `curl install.sh` | 3-5 minutes | Production, large codebases |
| **Manual** | Clone & build | 5-10 minutes | Development, customization |

### Zero-Config (Recommended)

Works immediately with no Docker required. Uses embedded sqlite-vec for vectors and Transformers.js for embeddings.

First run downloads the embedding model (~90MB) which is cached for future use.

### Optimized Installation (Docker)

For larger codebases with better performance:

```bash
curl -fsSL https://raw.githubusercontent.com/docleaai/doclea-mcp/main/scripts/install.sh | bash
```

This script:
- Detects your OS and architecture
- Installs prerequisites (Bun, Docker if needed)
- Sets up Qdrant vector database and TEI embeddings service
- Configures Claude Code automatically

### Manual Installation

```bash
git clone https://github.com/docleaai/doclea-mcp.git
cd doclea-mcp
bun install
bun run build
```

Add to Claude Code (`~/.claude.json`):

```json
{
  "mcpServers": {
    "doclea": {
      "command": "node",
      "args": ["/absolute/path/to/doclea-mcp/dist/index.js"]
    }
  }
}
```

For detailed setup instructions, see [docs/INSTALLATION.md](docs/INSTALLATION.md).

## Usage Examples

### Store Memories

```
Store this as a decision: We're using PostgreSQL for ACID compliance
in financial transactions. Tag it with "database" and "infrastructure".
```

### Search Context

```
Search memories for authentication patterns
```

### Git Operations

```
Generate a commit message for my staged changes
```

```
Create a PR description for this branch
```

```
Generate a changelog from v1.0.0 to HEAD
```

### Code Expertise

```
Who should review changes to src/auth/?
```

## MCP Tools

### Memory Tools

| Tool | Description |
|------|-------------|
| `doclea_store` | Store a memory (decision, solution, pattern, architecture, note) |
| `doclea_search` | Semantic search across memories |
| `doclea_get` | Get memory by ID |
| `doclea_update` | Update existing memory |
| `doclea_delete` | Delete memory |

### Git Tools

| Tool | Description |
|------|-------------|
| `doclea_commit_message` | Generate conventional commit from staged changes |
| `doclea_pr_description` | Generate PR description with context |
| `doclea_changelog` | Generate changelog between refs |

### Expertise Tools

| Tool | Description |
|------|-------------|
| `doclea_expertise` | Map codebase expertise and bus factor risks |
| `doclea_suggest_reviewers` | Suggest PR reviewers based on file ownership |

### Bootstrap Tools

| Tool | Description |
|------|-------------|
| `doclea_init` | Initialize project, scan git history, docs, and code |
| `doclea_import` | Import from markdown files or ADRs |

## Memory Types

| Type | Use Case |
|------|----------|
| `decision` | Architectural decisions, technology choices |
| `solution` | Bug fixes, problem resolutions |
| `pattern` | Code patterns, conventions |
| `architecture` | System design notes |
| `note` | General documentation |

## Configuration

Doclea works out of the box with zero configuration. It auto-detects available backends:

1. If Docker services (Qdrant/TEI) are running → uses them for better performance
2. Otherwise → uses embedded sqlite-vec + Transformers.js

### Custom Configuration

Create `.doclea/config.json` in your project root:

```json
{
  "embedding": {
    "provider": "transformers",
    "model": "Xenova/all-MiniLM-L6-v2"
  },
  "vector": {
    "provider": "sqlite-vec",
    "dbPath": ".doclea/vectors.db"
  },
  "storage": {
    "dbPath": ".doclea/local.db"
  }
}
```

### Embedding Providers

| Provider | Config | Notes |
|----------|--------|-------|
| `transformers` | `{ "provider": "transformers" }` | Default, no Docker |
| `local` | `{ "provider": "local", "endpoint": "http://localhost:8080" }` | TEI Docker |
| `openai` | `{ "provider": "openai", "apiKey": "..." }` | API key required |
| `ollama` | `{ "provider": "ollama", "model": "nomic-embed-text" }` | Local Ollama |

### Vector Store Providers

| Provider | Config | Notes |
|----------|--------|-------|
| `sqlite-vec` | `{ "provider": "sqlite-vec" }` | Default, no Docker |
| `qdrant` | `{ "provider": "qdrant", "url": "http://localhost:6333" }` | Docker service |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Claude Code                         │
│                         ↓ MCP                           │
├─────────────────────────────────────────────────────────┤
│                   Doclea MCP Server                     │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌───────────┐   │
│  │ Memory  │ │   Git   │ │Expertise │ │ Bootstrap │   │
│  │  Tools  │ │  Tools  │ │  Tools   │ │   Tools   │   │
│  └────┬────┘ └────┬────┘ └────┬─────┘ └─────┬─────┘   │
│       └───────────┴───────────┴─────────────┘          │
│                         ↓                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │   SQLite     │ │  Vector DB   │ │  Embeddings  │   │
│  │  (metadata)  │ │(sqlite-vec/  │ │(transformers/│   │
│  │              │ │   qdrant)    │ │    TEI)      │   │
│  └──────────────┘ └──────────────┘ └──────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Development

```bash
# Install dependencies
bun install

# Run in development mode (hot reload)
bun run dev

# Run tests
bun test              # All tests
bun run test:unit     # Unit tests only
bun run test:integration  # Integration tests (requires Docker)

# Type check
bun run typecheck

# Lint
bun run lint          # Check
bun run lint:fix      # Auto-fix

# Build
bun run build
```

## Troubleshooting

### First startup is slow

The embedding model (~90MB) downloads on first run. Cached at:
- Linux/macOS: `~/.cache/doclea/transformers`
- Windows: `%LOCALAPPDATA%\doclea\transformers`

### macOS SQLite extension error

macOS ships with Apple's SQLite which doesn't support extensions:

```bash
brew install sqlite
```

The server auto-detects Homebrew SQLite.

### MCP server not appearing in Claude

1. Verify the path in config is absolute (manual installs)
2. Check that `bun run build` completed successfully
3. Restart Claude Code completely

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for more troubleshooting.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/doclea-mcp.git

# Create feature branch
git checkout -b feature/amazing-feature

# Make changes, test, and lint
bun test && bun run lint

# Commit and push
git commit -m 'feat: add amazing feature'
git push origin feature/amazing-feature
```

## Roadmap

- [ ] Cloud sync for team collaboration
- [ ] VS Code extension
- [ ] Additional embedding providers
- [ ] Memory analytics dashboard

## License

[MIT](LICENSE) © [Quantic Studios](https://quanticstudios.com)

---

<p align="center">
  <a href="https://doclea.ai">Website</a> •
  <a href="https://github.com/docleaai/doclea-mcp/issues">Issues</a> •
  <a href="https://github.com/docleaai/doclea-mcp/discussions">Discussions</a>
</p>