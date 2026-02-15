---
sidebar_position: 4
title: Verification
description: Verify your Doclea installation is working correctly.
keywords: [verification, testing, health check, installation, troubleshooting]
---

# Verification

Verify your Doclea installation is working correctly with these checks.

---

## Quick Health Check

### Check Server Status

```bash
# If using zero-config
doclea --version

# If using Docker
docker exec doclea doclea --version
curl http://localhost:3000/health
```

Expected output:

```
doclea-mcp v1.0.0
```

---

## MCP Connection Test

### 1. Verify MCP Client Configuration

**Claude Desktop:**

```bash
# macOS
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Linux
cat ~/.config/claude/claude_desktop_config.json

# Windows (PowerShell)
cat $env:APPDATA\Claude\claude_desktop_config.json
```

Should contain:

```json
{
  "mcpServers": {
    "doclea": {
      "command": "doclea"
    }
  }
}
```

### 2. Restart MCP Client

Close and reopen your MCP client completely (not just reload).

### 3. Test with a Simple Command

Ask your AI assistant:

```
List all doclea tools available
```

Expected: A list of 62 tools across categories (memory, context, search, git, expertise, etc.)

---

## Feature Verification Checklist

### Memory Operations

| Test | Command | Expected Result |
|------|---------|-----------------|
| Store memory | "Remember that we use TypeScript strict mode" | Memory created with ID |
| Retrieve memory | "What do you remember about TypeScript?" | Returns the memory |
| List memories | "Show all memories" | List of stored memories |

### Context Operations

| Test | Command | Expected Result |
|------|---------|-----------------|
| Get context | "Get context for authentication" | Relevant memories returned |
| Store context | "Store context about our API design" | Context stored successfully |

### Git Operations (requires git repo)

| Test | Command | Expected Result |
|------|---------|-----------------|
| Commit message | "Generate a commit message for my changes" | Conventional commit format |
| PR description | "Create a PR description" | Formatted PR with context |

### Expertise Operations (requires git history)

| Test | Command | Expected Result |
|------|---------|-----------------|
| Code ownership | "Who owns the auth module?" | Expert mapping with percentages |
| Reviewer suggestion | "Who should review src/api/users.ts?" | Required/optional reviewers |

---

## Database Verification

### SQLite

```bash
# Check database exists
ls -la .doclea/memories.db

# Verify tables
sqlite3 .doclea/memories.db ".tables"
```

Expected tables:

```
memories          memory_relations  vectors
memory_tags       migrations        kv_store
```

### Postgres (Docker)

```bash
docker exec postgres psql -U doclea -d doclea -c "\dt"
```

---

## Storage Verification Script

Create `verify-doclea.js`:

```javascript
// Run with: node verify-doclea.js
const { spawn } = require('child_process');

const tests = [
  { name: 'Version check', cmd: 'doclea --version' },
  { name: 'Help output', cmd: 'doclea --help' },
];

async function runTests() {
  console.log('Doclea Verification\n==================\n');

  for (const test of tests) {
    process.stdout.write(`${test.name}... `);
    try {
      const result = await exec(test.cmd);
      console.log('PASS');
    } catch (error) {
      console.log('FAIL');
      console.error(`  Error: ${error.message}`);
    }
  }
}

function exec(cmd) {
  return new Promise((resolve, reject) => {
    const [command, ...args] = cmd.split(' ');
    const proc = spawn(command, args);
    let output = '';
    proc.stdout.on('data', (data) => output += data);
    proc.stderr.on('data', (data) => output += data);
    proc.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(output));
    });
  });
}

runTests();
```

---

## Common Verification Issues

### Issue: "Tool not found" in MCP client

**Symptoms:** AI says it can't find doclea tools

**Solutions:**
1. Restart the MCP client completely
2. Verify configuration path is correct
3. Check if `doclea` command works in terminal

### Issue: "Database not initialized"

**Symptoms:** Memory operations fail

**Solutions:**
```bash
# Initialize Doclea
doclea init

# Or via AI
"Initialize doclea for this project"
```

### Issue: "Permission denied"

**Symptoms:** Can't write to `.doclea/` directory

**Solutions:**
```bash
# Fix permissions
chmod -R 755 .doclea/

# Check ownership
ls -la .doclea/
```

### Issue: "ECONNREFUSED" (Docker)

**Symptoms:** Can't connect to Docker container

**Solutions:**
```bash
# Check container is running
docker ps | grep doclea

# Check port mapping
docker port doclea

# Check container logs
docker logs doclea
```

---

## Performance Verification

### Response Time Check

Time a context retrieval:

```bash
time curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "doclea_context", "arguments": {"query": "test"}}}'
```

Expected: < 500ms for small databases, < 2s for large (>10k memories)

### Memory Usage

```bash
# Zero-config
ps aux | grep doclea

# Docker
docker stats doclea
```

Expected: < 500MB for typical usage

---

## Full Integration Test

Run this comprehensive test via your AI assistant:

```
1. Store a memory: "We decided to use PostgreSQL for better scalability"
2. Store another: "Authentication uses JWT tokens with 1-hour expiry"
3. Search for "database" - should find the PostgreSQL memory
4. Get context for "user authentication" - should find JWT memory
5. Delete the test memories when done
```

All operations should complete successfully.

---

## Verification Checklist

- [ ] `doclea --version` returns version
- [ ] MCP client configuration is correct
- [ ] AI assistant sees doclea tools
- [ ] Can store a memory
- [ ] Can retrieve a memory
- [ ] Can search memories
- [ ] Database file exists (SQLite) or tables exist (Postgres)
- [ ] Git operations work (if in git repo)

---

## Getting Help

If verification fails:

1. Check [Troubleshooting](../troubleshooting) guide
2. Review [FAQ](../faq)
3. Open an issue on [GitHub](https://github.com/doclea/doclea-mcp/issues)

---

## See Also

- [Zero Config Setup](./zero-config) - Installation guide
- [Docker Setup](./docker) - Docker installation
- [Quick Start](../quick-start) - Start using Doclea
