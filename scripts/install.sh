#!/usr/bin/env bash
#
# Doclea MCP Install Script
# https://doclea.ai
#
# Usage:
#   curl -fsSL https://doclea.ai/install.sh | bash
#
# This script installs the optimized Docker-based setup for doclea-mcp
# including Qdrant (vector store) and TEI (embeddings).
#
# For zero-config usage, simply run: npx @doclea/mcp
#

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

DOCLEA_HOME="${DOCLEA_HOME:-$HOME/.doclea}"
DOCLEA_VERSION="${DOCLEA_VERSION:-latest}"
QDRANT_VERSION="${QDRANT_VERSION:-v1.12.6}"
TEI_VERSION="${TEI_VERSION:-1.6}"
TEI_MODEL="${TEI_MODEL:-sentence-transformers/all-MiniLM-L6-v2}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ============================================================================
# Utility Functions
# ============================================================================

info() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

success() {
  echo -e "${GREEN}[SUCCESS]${NC} $*"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

error() {
  echo -e "${RED}[ERROR]${NC} $*" >&2
}

fatal() {
  error "$*"
  exit 1
}

step() {
  echo -e "\n${CYAN}${BOLD}==> $*${NC}"
}

check_command() {
  command -v "$1" &> /dev/null
}

# ============================================================================
# OS Detection
# ============================================================================

detect_os() {
  local os
  os="$(uname -s)"

  case "$os" in
    Linux*)
      if grep -qi microsoft /proc/version 2>/dev/null; then
        echo "wsl"
      else
        echo "linux"
      fi
      ;;
    Darwin*)
      echo "macos"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      echo "windows"
      ;;
    *)
      fatal "Unsupported operating system: $os"
      ;;
  esac
}

detect_arch() {
  local arch
  arch="$(uname -m)"

  case "$arch" in
    x86_64|amd64)
      echo "amd64"
      ;;
    aarch64|arm64)
      echo "arm64"
      ;;
    *)
      fatal "Unsupported architecture: $arch"
      ;;
  esac
}

# ============================================================================
# Prerequisite Checks
# ============================================================================

check_prerequisites() {
  step "Checking prerequisites"

  local missing=()

  # Check Git
  if check_command git; then
    success "Git: $(git --version | head -n1)"
  else
    missing+=("git")
  fi

  # Check Docker
  if check_command docker; then
    if docker info &>/dev/null; then
      success "Docker: $(docker --version | head -n1)"
    else
      error "Docker is installed but not running"
      warn "Please start Docker and run this script again"
      exit 1
    fi
  else
    missing+=("docker")
  fi

  # Check Docker Compose
  if docker compose version &>/dev/null; then
    success "Docker Compose: $(docker compose version --short)"
  elif check_command docker-compose; then
    success "Docker Compose: $(docker-compose --version | head -n1)"
  else
    missing+=("docker-compose")
  fi

  # Check Bun or npm
  if check_command bun; then
    success "Bun: $(bun --version)"
  elif check_command npm; then
    success "npm: $(npm --version)"
  else
    missing+=("bun or npm")
  fi

  # Report missing dependencies
  if [ ${#missing[@]} -gt 0 ]; then
    echo ""
    warn "Missing dependencies: ${missing[*]}"

    local os
    os=$(detect_os)

    case "$os" in
      linux|wsl)
        info "To install on Linux:"
        for dep in "${missing[@]}"; do
          case "$dep" in
            git)
              echo "  sudo apt install git  # Debian/Ubuntu"
              echo "  sudo dnf install git  # Fedora/RHEL"
              ;;
            docker)
              echo "  curl -fsSL https://get.docker.com | sh"
              echo "  sudo usermod -aG docker \$USER"
              ;;
            docker-compose)
              echo "  # Docker Compose is included with Docker Engine"
              ;;
            "bun or npm")
              echo "  curl -fsSL https://bun.sh/install | bash"
              echo "  # or: sudo apt install nodejs npm"
              ;;
          esac
        done
        ;;
      macos)
        info "To install on macOS:"
        echo "  brew install ${missing[*]}"
        if [[ " ${missing[*]} " =~ " docker " ]]; then
          echo "  # Or install Docker Desktop: https://docker.com/products/docker-desktop"
        fi
        ;;
    esac

    fatal "Please install missing dependencies and run this script again"
  fi

  success "All prerequisites satisfied"
}

# ============================================================================
# Installation Directory Setup
# ============================================================================

setup_directories() {
  step "Setting up directories"

  info "Installation directory: $DOCLEA_HOME"

  mkdir -p "$DOCLEA_HOME"/{data,models,config}
  mkdir -p "$DOCLEA_HOME/data"/{qdrant,tei}

  success "Created directory structure"
}

# ============================================================================
# Docker Compose Configuration
# ============================================================================

create_docker_compose() {
  step "Creating Docker Compose configuration"

  local arch
  arch=$(detect_arch)

  # Select TEI image based on architecture
  local tei_image
  case "$arch" in
    amd64)
      tei_image="ghcr.io/huggingface/text-embeddings-inference:cpu-$TEI_VERSION"
      ;;
    arm64)
      tei_image="ghcr.io/huggingface/text-embeddings-inference:cpu-$TEI_VERSION"
      # Note: ARM64 support varies, using CPU version
      ;;
  esac

  cat > "$DOCLEA_HOME/docker-compose.yml" << EOF
# Doclea MCP - Docker Compose Configuration
# Generated by install.sh on $(date -Iseconds)

services:
  qdrant:
    image: qdrant/qdrant:$QDRANT_VERSION
    container_name: doclea-qdrant
    restart: unless-stopped
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - $DOCLEA_HOME/data/qdrant:/qdrant/storage
    environment:
      - QDRANT__LOG_LEVEL=INFO
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  tei:
    image: $tei_image
    container_name: doclea-tei
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - $DOCLEA_HOME/data/tei:/data
    environment:
      - MODEL_ID=$TEI_MODEL
      - MAX_BATCH_TOKENS=16384
      - MAX_CONCURRENT_REQUESTS=512
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80/health"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 120s
    deploy:
      resources:
        limits:
          memory: 2G

networks:
  default:
    name: doclea-network
EOF

  success "Created docker-compose.yml"
}

# ============================================================================
# Start Services
# ============================================================================

start_services() {
  step "Starting Docker services"

  cd "$DOCLEA_HOME"

  info "Pulling Docker images (this may take a few minutes)..."
  docker compose pull

  info "Starting services..."
  docker compose up -d

  success "Services started"
}

wait_for_services() {
  step "Waiting for services to be ready"

  local max_attempts=60
  local attempt=0

  # Wait for Qdrant
  info "Waiting for Qdrant..."
  while [ $attempt -lt $max_attempts ]; do
    if curl -sf http://localhost:6333/health &>/dev/null; then
      success "Qdrant is ready"
      break
    fi
    attempt=$((attempt + 1))
    sleep 2
  done

  if [ $attempt -eq $max_attempts ]; then
    warn "Qdrant did not become healthy in time"
    warn "Check logs with: docker logs doclea-qdrant"
  fi

  # Wait for TEI (takes longer to load model)
  attempt=0
  info "Waiting for TEI (loading embedding model, this takes 1-2 minutes on first run)..."
  while [ $attempt -lt $max_attempts ]; do
    if curl -sf http://localhost:8080/health &>/dev/null; then
      success "TEI is ready"
      break
    fi
    attempt=$((attempt + 1))
    sleep 3
  done

  if [ $attempt -eq $max_attempts ]; then
    warn "TEI did not become healthy in time"
    warn "Check logs with: docker logs doclea-tei"
  fi
}

# ============================================================================
# Claude Code Configuration
# ============================================================================

configure_claude_code() {
  step "Configuring Claude Code"

  local claude_config_dir
  local os
  os=$(detect_os)

  case "$os" in
    linux|wsl)
      claude_config_dir="$HOME/.config/claude"
      ;;
    macos)
      claude_config_dir="$HOME/Library/Application Support/Claude"
      ;;
    windows)
      claude_config_dir="$APPDATA/Claude"
      ;;
  esac

  mkdir -p "$claude_config_dir"

  local mcp_config="$claude_config_dir/mcp_settings.json"

  # Check if config exists and has doclea
  if [ -f "$mcp_config" ]; then
    if grep -q "doclea" "$mcp_config"; then
      info "Claude Code already configured for Doclea"
      return
    fi

    warn "Existing Claude Code MCP config found"
    info "Adding doclea-mcp to existing configuration..."

    # Use jq if available, otherwise provide manual instructions
    if check_command jq; then
      local temp_config
      temp_config=$(mktemp)

      jq '.servers["doclea-mcp"] = {
        "command": "npx",
        "args": ["@doclea/mcp"],
        "env": {
          "DOCLEA_EMBEDDING_PROVIDER": "local",
          "DOCLEA_EMBEDDING_ENDPOINT": "http://localhost:8080",
          "DOCLEA_VECTOR_PROVIDER": "qdrant",
          "DOCLEA_VECTOR_URL": "http://localhost:6333"
        }
      }' "$mcp_config" > "$temp_config"

      mv "$temp_config" "$mcp_config"
      success "Updated Claude Code configuration"
    else
      warn "jq not found. Please manually add doclea-mcp to $mcp_config"
    fi
  else
    # Create new config
    cat > "$mcp_config" << EOF
{
  "servers": {
    "doclea-mcp": {
      "command": "npx",
      "args": ["@doclea/mcp"],
      "env": {
        "DOCLEA_EMBEDDING_PROVIDER": "local",
        "DOCLEA_EMBEDDING_ENDPOINT": "http://localhost:8080",
        "DOCLEA_VECTOR_PROVIDER": "qdrant",
        "DOCLEA_VECTOR_URL": "http://localhost:6333"
      }
    }
  }
}
EOF
    success "Created Claude Code MCP configuration"
  fi
}

# ============================================================================
# Uninstall Script
# ============================================================================

create_uninstall_script() {
  step "Creating uninstall script"

  cat > "$DOCLEA_HOME/uninstall.sh" << 'EOF'
#!/usr/bin/env bash
#
# Doclea MCP Uninstall Script
#

set -euo pipefail

DOCLEA_HOME="${DOCLEA_HOME:-$HOME/.doclea}"

echo "This will remove Doclea and all its data."
read -p "Are you sure? (y/N) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Uninstall cancelled"
  exit 0
fi

echo "Stopping Docker services..."
cd "$DOCLEA_HOME"
docker compose down -v 2>/dev/null || true

echo "Removing Docker images..."
docker rmi qdrant/qdrant 2>/dev/null || true
docker rmi ghcr.io/huggingface/text-embeddings-inference:cpu-1.6 2>/dev/null || true

echo "Removing installation directory..."
rm -rf "$DOCLEA_HOME"

echo "Removing Claude Code configuration..."
# Note: We only remove the doclea-mcp entry, not the entire config
if command -v jq &>/dev/null; then
  for config in "$HOME/.config/claude/mcp_settings.json" "$HOME/Library/Application Support/Claude/mcp_settings.json"; do
    if [ -f "$config" ]; then
      jq 'del(.servers["doclea-mcp"])' "$config" > "$config.tmp" && mv "$config.tmp" "$config"
    fi
  done
fi

echo ""
echo "Doclea has been uninstalled."
echo "Note: The npx package cache may still contain @doclea/mcp"
echo "Run 'npm cache clean --force' to clear it if needed."
EOF

  chmod +x "$DOCLEA_HOME/uninstall.sh"

  success "Created uninstall.sh"
}

# ============================================================================
# Summary
# ============================================================================

print_summary() {
  echo ""
  echo -e "${GREEN}${BOLD}============================================${NC}"
  echo -e "${GREEN}${BOLD}  Doclea MCP Installation Complete!${NC}"
  echo -e "${GREEN}${BOLD}============================================${NC}"
  echo ""
  echo -e "${BOLD}Services Running:${NC}"
  echo "  - Qdrant (vector store): http://localhost:6333"
  echo "  - TEI (embeddings):      http://localhost:8080"
  echo ""
  echo -e "${BOLD}Installation Location:${NC}"
  echo "  $DOCLEA_HOME"
  echo ""
  echo -e "${BOLD}Next Steps:${NC}"
  echo "  1. Restart Claude Code (or run 'claude --mcp-restart')"
  echo "  2. Open any project directory"
  echo "  3. Claude will now have access to Doclea memory tools"
  echo ""
  echo -e "${BOLD}Management Commands:${NC}"
  echo "  View logs:      docker logs doclea-qdrant"
  echo "                  docker logs doclea-tei"
  echo "  Stop services:  cd $DOCLEA_HOME && docker compose down"
  echo "  Start services: cd $DOCLEA_HOME && docker compose up -d"
  echo "  Uninstall:      $DOCLEA_HOME/uninstall.sh"
  echo ""
  echo -e "${BOLD}Documentation:${NC}"
  echo "  https://github.com/doclea/doclea-mcp"
  echo ""
}

# ============================================================================
# Main
# ============================================================================

main() {
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo "  ____             _             "
  echo " |  _ \\  ___   ___| | ___  __ _ "
  echo " | | | |/ _ \\ / __| |/ _ \\/ _\` |"
  echo " | |_| | (_) | (__| |  __/ (_| |"
  echo " |____/ \\___/ \\___|_|\\___|\\__,_|"
  echo ""
  echo -e "${NC}${BOLD}  Optimized Installation Script${NC}"
  echo ""

  local os arch
  os=$(detect_os)
  arch=$(detect_arch)

  info "Detected: $os ($arch)"
  info "Installation directory: $DOCLEA_HOME"
  echo ""

  check_prerequisites
  setup_directories
  create_docker_compose
  start_services
  wait_for_services
  configure_claude_code
  create_uninstall_script

  print_summary
}

main "$@"