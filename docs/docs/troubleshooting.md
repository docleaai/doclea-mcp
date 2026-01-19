---
sidebar_position: 7
title: Troubleshooting
description: Common issues and solutions for Doclea.
keywords: [troubleshooting, errors, problems, debug, help]
---

# Troubleshooting

Common issues and their solutions when using Doclea.

---

## Connection Issues

### MCP Client Can't Find Doclea

**Symptoms:**
- AI says it can't find Doclea tools
- "Tool not available" errors

**Solutions:**

1. **Verify installation:**
```bash
doclea --version
which doclea
```

2. **Check MCP config:**
```bash
# Claude Desktop (macOS)
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Claude Desktop (Linux)
cat ~/.config/claude/claude_desktop_config.json
```

3. **Verify config format:**
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

4. **Restart MCP client completely** (not just reload)

### Connection Refused (Docker)

**Symptoms:**
- `ECONNREFUSED 127.0.0.1:3000`
- Can't connect to Docker container

**Solutions:**

1. **Check container is running:**
```bash
docker ps | grep doclea
```

2. **Check port mapping:**
```bash
docker port doclea
```

3. **Check container logs:**
```bash
docker logs doclea
```

4. **Verify health endpoint:**
```bash
curl http://localhost:3000/health
```

---

## Database Issues

### "Database locked" Error

**Symptoms:**
- `SQLITE_BUSY: database is locked`
- Operations hang or fail

**Causes:**
- Multiple processes accessing the same SQLite database
- Another MCP client session still running

**Solutions:**

1. **Close other MCP sessions**

2. **Find and kill orphan processes:**
```bash
lsof .doclea/memories.db
kill <PID>
```

3. **Increase busy timeout:**
```json
{
  "storage": {
    "busyTimeout": 10000
  }
}
```

### "Database not initialized"

**Symptoms:**
- Memory operations fail
- "Table not found" errors

**Solutions:**

1. **Initialize Doclea:**
```bash
doclea init
# or via AI: "Initialize doclea for this project"
```

2. **Run migrations:**
```bash
doclea migrate
```

3. **Check database exists:**
```bash
ls -la .doclea/memories.db
```

### PostgreSQL Connection Failed

**Symptoms:**
- `Connection refused`
- `FATAL: password authentication failed`

**Solutions:**

1. **Verify connection string:**
```bash
echo $DOCLEA_DATABASE_URL
```

2. **Test connection:**
```bash
psql $DOCLEA_DATABASE_URL -c "SELECT 1"
```

3. **Check Docker network:**
```bash
docker network ls
docker network inspect doclea_default
```

---

## Memory Operations

### Memory Not Found

**Symptoms:**
- "Memory with ID not found"
- Deletion or update fails

**Solutions:**

1. **Verify memory exists:**
```
"List all memories"
```

2. **Check for typos in ID**

3. **Memory may have been deleted** - check recent operations

### Search Returns No Results

**Symptoms:**
- Empty results for queries
- Expected memories not returned

**Solutions:**

1. **Check memories exist:**
```
"List all memories"
```

2. **Verify embeddings are generated:**
```
"Get memory <id> with debug info"
```

3. **Try broader query terms**

4. **Lower minimum relevance:**
```json
{
  "query": "authentication",
  "minRelevance": 0.3
}
```

### Embeddings Not Generated

**Symptoms:**
- Search doesn't find content
- "Vector not found" errors

**Solutions:**

1. **Check embedding configuration:**
```bash
cat .doclea/config.json | grep -A5 embedding
```

2. **Verify API key (if using OpenAI):**
```bash
echo $OPENAI_API_KEY | head -c 10
```

3. **Force re-embedding:**
```
"Update memory <id> to trigger re-embedding"
```

---

## Git Operations

### "Not a git repository"

**Symptoms:**
- Git tools fail
- "Not a git repository" error

**Solutions:**

1. **Verify git repo:**
```bash
git status
```

2. **Initialize if needed:**
```bash
git init
```

### "No staged changes"

**Symptoms:**
- Commit message generation fails
- "No changes to commit"

**Solutions:**

1. **Stage changes:**
```bash
git add .
# or specific files
git add src/auth/login.ts
```

2. **Check status:**
```bash
git status
```

### "Invalid git ref"

**Symptoms:**
- Changelog generation fails
- "Invalid ref: v1.0.0"

**Solutions:**

1. **Verify ref exists:**
```bash
git tag | grep v1.0.0
git branch -a | grep main
```

2. **Fetch tags:**
```bash
git fetch --tags
```

---

## Performance Issues

### Slow Context Retrieval

**Symptoms:**
- Queries take >2 seconds
- High CPU usage

**Solutions:**

1. **Use filters to narrow search:**
```json
{
  "query": "authentication",
  "types": ["decision"],
  "tags": ["auth"]
}
```

2. **Reduce limit:**
```json
{
  "limit": 5
}
```

3. **Consider Postgres for large datasets** (>10k memories)

### High Memory Usage

**Symptoms:**
- Process using >1GB RAM
- Out of memory errors

**Solutions:**

1. **Check memory count:**
```
"Show statistics"
```

2. **Archive old memories:**
```
"Archive memories not accessed in 1 year"
```

3. **Use Postgres storage** for better memory management

### Slow Embedding Generation

**Symptoms:**
- Store operations are slow
- High latency on updates

**Solutions:**

1. **Use local embeddings** for development:
```json
{
  "embedding": {
    "provider": "local"
  }
}
```

2. **Check API latency:**
```bash
time curl https://api.openai.com/v1/embeddings -H "Authorization: Bearer $OPENAI_API_KEY" -d '{"input":"test","model":"text-embedding-3-small"}'
```

---

## Configuration Issues

### Environment Variables Not Loaded

**Symptoms:**
- API keys not found
- Config values missing

**Solutions:**

1. **Check environment:**
```bash
env | grep DOCLEA
env | grep OPENAI
```

2. **Use dotenv file:**
```bash
# .env
OPENAI_API_KEY=sk-...
```

3. **Check config variable interpolation:**
```json
{
  "apiKey": "${OPENAI_API_KEY}"
}
```

### Invalid Configuration

**Symptoms:**
- "Invalid config" errors
- Startup fails

**Solutions:**

1. **Validate JSON syntax:**
```bash
cat .doclea/config.json | jq .
```

2. **Check required fields**

3. **Reset to defaults:**
```bash
rm .doclea/config.json
doclea init
```

---

## Docker-Specific Issues

### Container Won't Start

**Solutions:**

1. **Check logs:**
```bash
docker logs doclea
```

2. **Check resource limits:**
```bash
docker stats
```

3. **Verify image:**
```bash
docker pull ghcr.io/doclea/doclea-mcp:latest
```

### Volume Permissions

**Symptoms:**
- "Permission denied" writing to volumes
- Database write fails

**Solutions:**

1. **Check permissions:**
```bash
ls -la .doclea/
```

2. **Fix ownership:**
```bash
sudo chown -R $(id -u):$(id -g) .doclea/
```

3. **Use named volumes:**
```yaml
volumes:
  doclea-data:
```

---

## Getting More Help

### Debug Mode

Enable verbose logging:

```bash
DOCLEA_LOG_LEVEL=debug doclea
```

### Log Files

Check logs for errors:

```bash
# Local
cat .doclea/logs/error.log

# Docker
docker logs doclea --tail 100
```

### Report an Issue

If you can't resolve the issue:

1. Gather information:
   - Doclea version: `doclea --version`
   - Operating system
   - Error messages
   - Steps to reproduce

2. Check existing issues:
   - [GitHub Issues](https://github.com/doclea/doclea-mcp/issues)

3. Create a new issue with the template

---

## See Also

- [FAQ](./faq) - Frequently asked questions
- [Verification](./installation/verification) - Verify installation
- [Contributing](./contributing) - Report bugs
