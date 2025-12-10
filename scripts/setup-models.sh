#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MODELS_DIR="$PROJECT_DIR/.models"

MODEL_REPO="https://huggingface.co/BAAI/bge-small-en-v1.5"
MODEL_NAME="bge-small-en-v1.5"

echo "=== Doclea Model Setup ==="

# Create models directory
mkdir -p "$MODELS_DIR"

# Check if model already exists
if [ -d "$MODELS_DIR/$MODEL_NAME" ] && [ -f "$MODELS_DIR/$MODEL_NAME/config.json" ]; then
    echo "✓ Model already downloaded: $MODEL_NAME"
    exit 0
fi

echo "Downloading embedding model: $MODEL_NAME"
echo "This may take a few minutes..."

# Check if git-lfs is installed
if ! command -v git-lfs &> /dev/null; then
    echo "Installing git-lfs..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get install -y git-lfs
    elif command -v brew &> /dev/null; then
        brew install git-lfs
    elif command -v pacman &> /dev/null; then
        sudo pacman -S git-lfs
    else
        echo "Error: Please install git-lfs manually"
        exit 1
    fi
    git lfs install
fi

# Clone the model
cd "$MODELS_DIR"
if [ -d "$MODEL_NAME" ]; then
    rm -rf "$MODEL_NAME"
fi

GIT_LFS_SKIP_SMUDGE=0 git clone --depth 1 "$MODEL_REPO" "$MODEL_NAME"

echo ""
echo "✓ Model downloaded successfully to: $MODELS_DIR/$MODEL_NAME"