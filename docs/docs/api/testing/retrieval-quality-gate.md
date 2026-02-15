---
title: Retrieval Quality Gate
description: Golden-query retrieval relevance gate with configurable recall and precision thresholds.
keywords: [quality gate, retrieval, golden queries, recall, precision]
---

# Retrieval Quality Gate

Run a deterministic golden-query relevance gate for retrieval behavior:

```bash
bun run quality:retrieval-gate
```

This gate uses a versioned fixture (`documentation/retrieval/golden-queries.json`) and evaluates:

- memory recall@k
- entity recall@k
- optional precision@k proxy

If relevance regresses, the script exits non-zero and prints per-query diffs:

- expected memory/entity hits
- retrieved top-k hits
- missing hits and threshold failures

## Fixture Structure

The fixture contains:

- `memories`: synthetic memory corpus
- `graph`: entities + relationships + entity-memory links
- `queries`: golden prompts with expected memory/entity hits
- `defaults`: shared thresholds and query settings

Example location:

- `documentation/retrieval/golden-queries.json`

## Environment Variables

| Variable | Default | Description |
|---|---:|---|
| `DOCLEA_QUALITY_FIXTURE_PATH` | `documentation/retrieval/golden-queries.json` | Fixture file path |
| `DOCLEA_QUALITY_GATE_RECALL_K` | fixture default | Top-k cutoff for recall/precision |
| `DOCLEA_QUALITY_GATE_MIN_MEMORY_RECALL` | fixture default | Global minimum memory recall |
| `DOCLEA_QUALITY_GATE_MIN_ENTITY_RECALL` | fixture default | Global minimum entity recall |
| `DOCLEA_QUALITY_GATE_MIN_PRECISION_AT_K` | fixture default | Optional global precision@k threshold |
| `DOCLEA_QUALITY_GATE_UPDATE_FIXTURE` | `false` | Rewrite query expected hits from current top-k retrieval |

## Fixture Update Workflow

Use this when ranking behavior intentionally changes:

1. Run with fixture update enabled:
   ```bash
   DOCLEA_QUALITY_GATE_UPDATE_FIXTURE=true bun run quality:retrieval-gate
   ```
2. Inspect the fixture diff in `documentation/retrieval/golden-queries.json`.
3. Keep only intentional changes; rerun gate with update disabled.

## CI

Repository workflow:

- `.github/workflows/retrieval-quality-gate.yml`

It enforces golden-query recall/precision thresholds on `push` and `pull_request` to `main`.
