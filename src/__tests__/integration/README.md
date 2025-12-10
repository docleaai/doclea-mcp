# Integration Tests

This directory contains both unit tests for server logic and true integration tests that run against real services.

## Test Types

### Unit Tests (`server.test.ts`)
Tests the MCP server's internal logic without external dependencies:
- Tool schema validation
- Response format building
- Default value handling

Run with:
```bash
bun test src/__tests__/integration/server.test.ts
```

### True Integration Tests (`e2e.test.ts`)
Tests the full system with real services:
- Store → Retrieve → Search → Delete workflows
- Vector similarity with real embeddings
- SQLite persistence
- Git tool operations on real repos

## Prerequisites

### Docker Services
Start the test services:
```bash
docker compose -f docker-compose.test.yml up -d
```

Wait for services to be healthy:
```bash
docker compose -f docker-compose.test.yml ps
```

### Environment
Create `.env.test` or set environment variables:
```bash
export DOCLEA_QDRANT_URL=http://localhost:6333
export DOCLEA_EMBEDDING_ENDPOINT=http://localhost:8080
export DOCLEA_EMBEDDING_PROVIDER=local
```

## Running Integration Tests

```bash
# Start services
docker compose -f docker-compose.test.yml up -d

# Wait for health checks
docker compose -f docker-compose.test.yml ps

# Run integration tests
bun test src/__tests__/integration/e2e.test.ts

# Stop services
docker compose -f docker-compose.test.yml down
```

## CI/CD

For CI pipelines, use the provided script:
```bash
./scripts/test-integration.sh
```

This script:
1. Starts Docker services
2. Waits for health checks
3. Runs integration tests
4. Tears down services
5. Reports results

## Test Data

Integration tests use a separate test database and Qdrant collection:
- SQLite: `.doclea/test.db` (in temp directory)
- Qdrant: `doclea_test_memories` collection

Data is cleaned up after each test run.

## Troubleshooting

### Embeddings service slow to start
The embeddings service downloads the model on first run. This can take several minutes.
Check logs with:
```bash
docker compose -f docker-compose.test.yml logs embeddings
```

### Qdrant connection refused
Ensure Qdrant is healthy:
```bash
curl http://localhost:6333/readyz
```

### Port conflicts
If ports 6333 or 8080 are in use, modify `docker-compose.test.yml` and update the corresponding environment variables.
