#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${YELLOW}=== Doclea MCP Integration Tests ===${NC}"
echo ""

cd "$PROJECT_DIR"

# Ensure model is downloaded
if [ ! -d ".models/bge-small-en-v1.5" ] || [ ! -f ".models/bge-small-en-v1.5/config.json" ]; then
    echo -e "${YELLOW}Downloading embedding model...${NC}"
    ./scripts/setup-models.sh
fi

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed or not in PATH${NC}"
    exit 1
fi

# Check if docker compose is available
if ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not available${NC}"
    exit 1
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up...${NC}"
    docker compose -f docker-compose.test.yml down --volumes --remove-orphans 2>/dev/null || true
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Start services
echo -e "${YELLOW}Starting Docker services...${NC}"
docker compose -f docker-compose.test.yml up -d

# Wait for Qdrant to be ready
echo -e "${YELLOW}Waiting for Qdrant...${NC}"
RETRIES=30
until curl -sf http://localhost:6333/readyz > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -eq 0 ]; then
        echo -e "${RED}Error: Qdrant failed to start${NC}"
        docker compose -f docker-compose.test.yml logs qdrant
        exit 1
    fi
    echo "  Waiting for Qdrant... ($RETRIES retries left)"
    sleep 2
done
echo -e "${GREEN}  ✓ Qdrant is ready${NC}"

# Wait for Embeddings service to be ready (takes longer due to model download)
echo -e "${YELLOW}Waiting for Embeddings service (this may take a few minutes on first run)...${NC}"
RETRIES=120  # 4 minutes for model download
until curl -sf http://localhost:8080/health > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -eq 0 ]; then
        echo -e "${RED}Error: Embeddings service failed to start${NC}"
        docker compose -f docker-compose.test.yml logs embeddings
        exit 1
    fi
    if [ $((RETRIES % 10)) -eq 0 ]; then
        echo "  Waiting for Embeddings... ($RETRIES retries left)"
    fi
    sleep 2
done
echo -e "${GREEN}  ✓ Embeddings service is ready${NC}"

echo ""
echo -e "${YELLOW}Running integration tests...${NC}"
echo ""

# Run unit tests for server
echo -e "${YELLOW}1. Running MCP Server unit tests...${NC}"
if bun test src/__tests__/integration/server.test.ts; then
    echo -e "${GREEN}  ✓ Server unit tests passed${NC}"
else
    echo -e "${RED}  ✗ Server unit tests failed${NC}"
    exit 1
fi

echo ""

# Run E2E tests
echo -e "${YELLOW}2. Running E2E integration tests...${NC}"
if bun test src/__tests__/integration/e2e.test.ts; then
    echo -e "${GREEN}  ✓ E2E tests passed${NC}"
else
    echo -e "${RED}  ✗ E2E tests failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=== All integration tests passed ===${NC}"
