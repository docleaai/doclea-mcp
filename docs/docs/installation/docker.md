---
sidebar_position: 3
title: Docker Setup
description: Run Doclea in Docker for team sharing, persistence, and production deployments.
keywords: [docker, container, deployment, team, postgres, production]
---

# Docker Setup

Run Doclea as a containerized service for team sharing, persistence, and production environments.

---

## When to Use Docker

| Use Case | Recommendation |
|----------|----------------|
| Personal project | [Zero Config](./zero-config) |
| Small team, shared memories | Docker |
| Large project (>10k memories) | Docker with Postgres |
| CI/CD integration | Docker |
| Production deployment | Docker with Postgres |

---

## Quick Start

### Using Docker Compose (Recommended)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  doclea:
    image: ghcr.io/doclea/doclea-mcp:latest
    ports:
      - "3000:3000"
    volumes:
      - doclea-data:/app/data
      - ./project:/app/project:ro
    environment:
      - DOCLEA_PROJECT_PATH=/app/project
      - DOCLEA_STORAGE_TYPE=sqlite
      - DOCLEA_STORAGE_PATH=/app/data/memories.db

volumes:
  doclea-data:
```

Start the server:

```bash
docker compose up -d
```

### Using Docker Run

```bash
docker run -d \
  --name doclea \
  -p 3000:3000 \
  -v doclea-data:/app/data \
  -v $(pwd):/app/project:ro \
  -e DOCLEA_PROJECT_PATH=/app/project \
  ghcr.io/doclea/doclea-mcp:latest
```

---

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DOCLEA_PROJECT_PATH` | Path to your project | `/app/project` |
| `DOCLEA_STORAGE_TYPE` | `sqlite` or `postgres` | `sqlite` |
| `DOCLEA_STORAGE_PATH` | SQLite database path | `/app/data/memories.db` |
| `DOCLEA_DATABASE_URL` | Postgres connection string | - |
| `DOCLEA_EMBEDDING_PROVIDER` | `local`, `openai`, `anthropic` | `local` |
| `OPENAI_API_KEY` | OpenAI API key for embeddings | - |
| `DOCLEA_LOG_LEVEL` | `debug`, `info`, `warn`, `error` | `info` |

---

## Production Setup with Postgres

For larger teams and production use:

```yaml
version: '3.8'

services:
  doclea:
    image: ghcr.io/doclea/doclea-mcp:latest
    ports:
      - "3000:3000"
    volumes:
      - ./project:/app/project:ro
    environment:
      - DOCLEA_PROJECT_PATH=/app/project
      - DOCLEA_STORAGE_TYPE=postgres
      - DOCLEA_DATABASE_URL=postgres://doclea:secret@postgres:5432/doclea
      - DOCLEA_EMBEDDING_PROVIDER=openai
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: doclea
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: doclea
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U doclea"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
```

---

## MCP Client Configuration

### Claude Desktop (HTTP Transport)

For Docker deployments, configure Claude Desktop to use HTTP:

```json
{
  "mcpServers": {
    "doclea": {
      "transport": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Cursor

```json
{
  "servers": {
    "doclea": {
      "transport": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

---

## Team Sharing

### Shared Database

Multiple team members can connect to the same Doclea instance:

```yaml
# docker-compose.yml for team server
services:
  doclea:
    image: ghcr.io/doclea/doclea-mcp:latest
    ports:
      - "3000:3000"
    environment:
      - DOCLEA_STORAGE_TYPE=postgres
      - DOCLEA_DATABASE_URL=postgres://user:pass@your-db-host:5432/doclea
```

Team members configure their clients:

```json
{
  "mcpServers": {
    "doclea": {
      "transport": "http",
      "url": "http://your-team-server:3000/mcp"
    }
  }
}
```

### Git-Based Sharing

Export memories to version control:

```bash
# Export memories
docker exec doclea doclea export --format json > .doclea/memories.json

# Commit to repository
git add .doclea/memories.json
git commit -m "chore: update shared memories"
```

Import on other machines:

```bash
docker exec doclea doclea import < .doclea/memories.json
```

---

## Health Checks

The container exposes a health endpoint:

```bash
curl http://localhost:3000/health
```

Response:

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "storage": "connected",
  "memories": 1234
}
```

---

## Backup and Restore

### SQLite Backup

```bash
# Backup
docker exec doclea cp /app/data/memories.db /app/data/backup.db
docker cp doclea:/app/data/backup.db ./backup.db

# Restore
docker cp ./backup.db doclea:/app/data/memories.db
docker restart doclea
```

### Postgres Backup

```bash
# Backup
docker exec postgres pg_dump -U doclea doclea > backup.sql

# Restore
cat backup.sql | docker exec -i postgres psql -U doclea doclea
```

---

## Resource Limits

For production deployments:

```yaml
services:
  doclea:
    image: ghcr.io/doclea/doclea-mcp:latest
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '0.5'
          memory: 1G
```

---

## Networking

### Behind a Reverse Proxy

```yaml
# With Traefik
services:
  doclea:
    image: ghcr.io/doclea/doclea-mcp:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.doclea.rule=Host(`doclea.example.com`)"
      - "traefik.http.services.doclea.loadbalancer.server.port=3000"
```

### With TLS

```yaml
# With nginx
services:
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - doclea
```

---

## Logs and Debugging

```bash
# View logs
docker logs doclea

# Follow logs
docker logs -f doclea

# Debug mode
docker run -e DOCLEA_LOG_LEVEL=debug ...
```

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker logs doclea

# Verify image
docker inspect ghcr.io/doclea/doclea-mcp:latest
```

### Connection refused

1. Verify container is running: `docker ps`
2. Check port mapping: `docker port doclea`
3. Test health endpoint: `curl http://localhost:3000/health`

### Database migration errors

```bash
# Run migrations manually
docker exec doclea doclea migrate
```

---

## See Also

- [Zero Config](./zero-config) - Simpler local setup
- [Verification](./verification) - Verify your installation
- [Troubleshooting](../troubleshooting) - Common issues
