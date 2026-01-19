---
sidebar_position: 8
title: FAQ
description: Frequently asked questions about Doclea.
keywords: [faq, questions, answers, help, support]
---

# Frequently Asked Questions

Common questions about Doclea and their answers.

---

## General

### What is Doclea?

Doclea is an MCP (Model Context Protocol) server that provides persistent memory and context for AI coding assistants. It helps AI tools remember decisions, patterns, and solutions across sessions.

### How is Doclea different from just chatting with an AI?

Without Doclea:
- AI forgets everything between sessions
- You repeat context each time
- No persistence of decisions or patterns

With Doclea:
- Context persists across sessions
- AI remembers your decisions and patterns
- Learns from your codebase over time

### What AI assistants work with Doclea?

Any MCP-compatible client:
- Claude Desktop
- Cursor
- VS Code with Continue
- Other MCP clients

### Is my data sent to external servers?

**With local embeddings (default):** No. Everything stays on your machine.

**With OpenAI embeddings:** Only the text being embedded is sent to OpenAI. The embedding vectors are stored locally.

---

## Installation

### What are the system requirements?

- Node.js 18+ or Bun 1.0+
- Git (for git-powered features)
- ~100MB disk space (plus your data)
- 512MB RAM minimum

### Do I need Docker?

No. Docker is optional and recommended for:
- Team sharing
- Production deployments
- PostgreSQL storage

For personal use, the zero-config setup works without Docker.

### Can I use Doclea with multiple projects?

Yes. Each project has its own `.doclea/` directory with separate memories.

### How do I update Doclea?

```bash
# Bun
bun update -g doclea-mcp

# npm
npm update -g doclea-mcp

# Docker
docker pull ghcr.io/doclea/doclea-mcp:latest
```

---

## Data & Privacy

### Where is my data stored?

By default in `.doclea/memories.db` (SQLite) in your project directory.

With Docker/Postgres, data is stored in the configured database.

### Can I export my memories?

Yes:
```
"Export all memories to JSON"
```

Or use the backup tools:
```bash
# SQLite
cp .doclea/memories.db backup.db

# Postgres
pg_dump -U doclea doclea > backup.sql
```

### Can I import memories from another project?

Yes:
```
"Import memories from file.json"
```

### How do I delete all my data?

```bash
# Local
rm -rf .doclea/

# Docker
docker volume rm doclea-data
```

---

## Features

### What types of memories can I store?

| Type | Purpose |
|------|---------|
| `decision` | Architectural decisions |
| `solution` | Bug fixes, problem resolutions |
| `pattern` | Reusable code patterns |
| `architecture` | System design |
| `note` | General context |

### How does context retrieval work?

Doclea uses vector embeddings (RAG) to find semantically similar memories. When you ask about "authentication", it finds memories related to auth even if they don't contain that exact word.

### What git features are available?

- Context-aware commit messages
- PR descriptions with related decisions
- Changelog generation
- Code ownership mapping
- Reviewer suggestions

### Can I use tags to organize memories?

Yes:
```
"Store decision with tags auth security backend: We use JWT tokens..."
```

Then filter by tags:
```
"Show all memories tagged with auth"
```

---

## Performance

### How many memories can Doclea handle?

| Storage | Recommended Max |
|---------|-----------------|
| SQLite | 10,000 |
| PostgreSQL | 1,000,000+ |

### How fast is context retrieval?

- Small database (<1000): <100ms
- Medium database (<10,000): <500ms
- Large database (Postgres): <1s

### Does Doclea slow down my AI assistant?

Minimal impact. Context retrieval typically adds 100-500ms to responses, which is offset by the time saved not having to explain context.

---

## Troubleshooting

### Why doesn't my AI see Doclea tools?

1. Verify Doclea is installed: `doclea --version`
2. Check MCP config is correct
3. Restart your AI client completely

See [Troubleshooting](./troubleshooting) for details.

### Why are my searches not finding relevant memories?

1. Make sure memories are stored with descriptive titles
2. Try broader search terms
3. Check if embeddings were generated
4. Lower the minimum relevance threshold

### Why is context retrieval slow?

1. Reduce the number of memories to search
2. Use tag filtering
3. Consider upgrading to PostgreSQL for large datasets

---

## Best Practices

### How often should I store memories?

Store memories as you make decisions:
- When choosing technologies
- When solving bugs
- When establishing patterns
- When making architectural changes

A good rule: if you'd tell a new team member, store it.

### Should I store code in memories?

Store snippets for patterns, but not entire files. Memories are for context, not code storage.

Good:
```
"Store pattern: Error handling - always use try/catch with specific error types"
```

Avoid:
```
"Store the entire UserService class"
```

### How do I keep memories organized?

1. Use consistent tags
2. Set appropriate importance levels
3. Link related memories
4. Archive outdated memories

### How do I handle sensitive information?

Don't store:
- API keys or secrets
- Passwords
- Personal data (PII)
- Proprietary algorithms

Do store:
- Decision rationale
- Patterns (without secrets)
- Problem/solution pairs

---

## Team Usage

### Can multiple people share memories?

Yes, with Docker and PostgreSQL:
1. Run a shared Doclea server
2. Team members connect to the same server
3. Everyone sees and contributes to the same memories

### How do we handle conflicting decisions?

Use the supersedes relationship:
```
"Mark the new decision as superseding the old one"
```

Old decisions remain for context; new ones are preferred.

### How do new team members get started?

```
"Get onboarding context for this project"
"Show all decisions with importance above 0.8"
"What patterns do we use for API development?"
```

---

## Integration

### Can I use Doclea in CI/CD?

Yes. Common uses:
- Generate changelogs on release
- Validate PR descriptions
- Check for related decisions

### Does Doclea integrate with Jira/GitHub/etc?

Not directly, but you can:
- Reference issue IDs in memories
- Include links in content
- Export memories for documentation

### Can I extend Doclea with custom tools?

The MCP protocol allows extensions. See [Contributing](./contributing) for details.

---

## Comparison

### Doclea vs. README files?

| Aspect | Doclea | README |
|--------|--------|--------|
| Structure | Semantic search | Manual navigation |
| Updates | As decisions happen | Often forgotten |
| Access | AI-powered context | Manual reading |
| Linking | Automatic relations | Manual links |

Use both: README for humans, Doclea for AI context.

### Doclea vs. Notion/Confluence?

Doclea is specifically for AI coding context, not general documentation:
- Integrated with coding workflow
- Semantic search optimized for code context
- MCP protocol for AI tools

Use both: Doclea for AI context, Notion/Confluence for team documentation.

---

## See Also

- [Quick Start](./quick-start) - Get started
- [Troubleshooting](./troubleshooting) - Fix issues
- [Contributing](./contributing) - Help improve Doclea
