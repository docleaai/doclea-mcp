#!/usr/bin/env bash
set -euo pipefail

CODE_TOOLS_FILE="$(mktemp)"
DOC_TOOLS_FILE="$(mktemp)"
trap 'rm -f "$CODE_TOOLS_FILE" "$DOC_TOOLS_FILE"' EXIT

awk '/server\.registerTool\(/ {getline; gsub(/^[[:space:]]+|[",]/,"",$0); print $0}' src/index.ts \
  | sort -u >"$CODE_TOOLS_FILE"

rg -o 'doclea_[a-z_]+' docs/docs/api/overview.md \
  | sort -u >"$DOC_TOOLS_FILE"

ONLY_IN_CODE="$(comm -23 "$CODE_TOOLS_FILE" "$DOC_TOOLS_FILE" || true)"
ONLY_IN_DOCS="$(comm -13 "$CODE_TOOLS_FILE" "$DOC_TOOLS_FILE" || true)"

if [[ -n "$ONLY_IN_CODE" || -n "$ONLY_IN_DOCS" ]]; then
  echo "Tool parity check failed between src/index.ts and docs/docs/api/overview.md"

  if [[ -n "$ONLY_IN_CODE" ]]; then
    echo
    echo "Present in code but missing in docs:"
    echo "$ONLY_IN_CODE"
  fi

  if [[ -n "$ONLY_IN_DOCS" ]]; then
    echo
    echo "Present in docs but missing in code:"
    echo "$ONLY_IN_DOCS"
  fi

  exit 1
fi

echo "Tool parity check passed (overview matches runtime tool registry)."
