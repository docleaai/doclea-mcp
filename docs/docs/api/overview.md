---
sidebar_position: 1
title: API Overview
description: Complete reference for all 62 Doclea MCP tools. Memory, relations, code scanning, workflow, context building, and more.
keywords: [API, MCP tools, reference, doclea, RAG, KAG, relations]
---

# API Overview

Doclea provides **62 MCP tools** across multiple categories. Use natural language with Claude, or invoke tools directly.

---

## All Tools at a Glance

### Memory Tools (5)

Core memory storage and retrieval.

| Tool | Purpose | Example Prompt |
|------|---------|----------------|
| [`doclea_store`](./memory/store) | Store a new memory | "Store this decision: ..." |
| [`doclea_search`](./memory/search) | Semantic search | "Search memories for auth patterns" |
| [`doclea_get`](./memory/get) | Get by ID | (Used internally) |
| [`doclea_update`](./memory/update) | Modify memory | "Update that memory to add..." |
| [`doclea_delete`](./memory/delete) | Remove memory | "Delete the memory about..." |

### Memory Relations (4)

Link memories into a knowledge graph.

| Tool | Purpose | Example Prompt |
|------|---------|----------------|
| [`doclea_link_memories`](./relations/link-memories) | Create relationship | "Link auth decision to JWT pattern" |
| [`doclea_get_related`](./relations/get-related) | Find related memories | "What relates to the caching decision?" |
| [`doclea_find_path`](./relations/find-path) | Find connection path | "How is auth connected to payments?" |
| [`doclea_unlink_memories`](./relations/unlink-memories) | Remove relationship | (Used internally) |

### Relation Detection (4)

Auto-detect relationships between memories.

| Tool | Purpose | Example Prompt |
|------|---------|----------------|
| [`doclea_detect_relations`](./detection/detect-relations) | Trigger detection | "Detect relations for this memory" |
| [`doclea_get_suggestions`](./detection/get-suggestions) | View suggestions | "Show pending relation suggestions" |
| [`doclea_review_suggestion`](./detection/review-suggestion) | Accept/reject | "Accept that relation suggestion" |
| [`doclea_bulk_review`](./detection/bulk-review) | Batch decisions | "Accept all high-confidence suggestions" |

### Cross-Layer Relations (6)

Bridge code and memories (KAG ↔ RAG).

| Tool | Purpose | Example Prompt |
|------|---------|----------------|
| [`doclea_suggest_relations`](./cross-layer/suggest-relations) | Bidirectional detection | "What relates to this code/memory?" |
| [`doclea_get_code_for_memory`](./cross-layer/get-code-for-memory) | Code for a memory | "What code implements this pattern?" |
| [`doclea_get_memories_for_code`](./cross-layer/get-memories-for-code) | Memories for code | "What decisions affect this file?" |
| [`doclea_get_cross_layer_suggestions`](./cross-layer/get-crosslayer-suggestions) | View suggestions | "Show pending cross-layer links" |
| [`doclea_review_cross_layer_suggestion`](./cross-layer/review-crosslayer) | Review suggestion | "Accept that code-memory link" |
| [`doclea_bulk_review_cross_layer`](./cross-layer/bulk-review-crosslayer) | Batch decisions | "Accept all cross-layer suggestions" |

### Code Scanning / KAG (11)

Knowledge-Aware Graph from code structure.

| Tool | Purpose | Example Prompt |
|------|---------|----------------|
| [`doclea_scan_code`](./code/scan-code) | Scan codebase | "Scan src/ for code structure" |
| [`doclea_stop_watch`](./code/stop-watch) | Stop file watcher | "Stop watching for changes" |
| [`doclea_get_code_node`](./code/get-node) | Get node details | "Show details for UserService class" |
| [`doclea_call_graph`](./code/call-graph) | Call relationships | "What does authenticate() call?" |
| [`doclea_impact_analysis`](./code/impact-analysis) | Change impact | "What's affected if I change validateToken?" |
| [`doclea_find_implementations`](./code/find-implementations) | Interface implementations | "What implements IAuthProvider?" |
| [`doclea_dependency_tree`](./code/dependency-tree) | Module dependencies | "Show dependency tree for auth module" |
| [`doclea_summarize_code`](./code/summarize) | Run summarization | "Summarize the payment service" |
| [`doclea_update_code_summary`](./code/update-code-summary) | Update single summary | "Update summary for this function" |
| [`doclea_get_unsummarized`](./code/get-unsummarized) | Get nodes needing AI | "Get code needing summaries" |
| [`doclea_batch_update_summaries`](./code/batch-update-summaries) | Batch update | "Update these summaries" |

### Workflow & Approval (10)

Manage storage modes and pending memories.

| Tool | Purpose | Example Prompt |
|------|---------|----------------|
| [`doclea_set_storage_mode`](./workflow/set-storage-mode) | Set mode | "Switch to manual storage mode" |
| [`doclea_get_storage_mode`](./workflow/get-storage-mode) | Check mode | "What's the current storage mode?" |
| [`doclea_list_pending`](./workflow/list-pending) | View pending | "Show pending memories" |
| [`doclea_approve_pending`](./workflow/approve-pending) | Approve one | "Approve pending memory X" |
| [`doclea_reject_pending`](./workflow/reject-pending) | Reject one | "Reject that pending memory" |
| [`doclea_bulk_approve_pending`](./workflow/bulk-approve-pending) | Approve batch | "Approve all pending memories" |
| [`doclea_bulk_reject_pending`](./workflow/bulk-reject-pending) | Reject batch | "Reject all low-confidence pending" |
| [`doclea_review_queue`](./workflow/review-queue) | Auto-stored queue | "Show memories needing review" |
| [`doclea_confirm`](./workflow/confirm-memory) | Confirm reviewed | "Confirm that memory is good" |
| [`doclea_refresh_confidence`](./workflow/refresh-confidence) | Refresh decay | "Refresh confidence for this memory" |

### Context Building (1)

Assemble RAG + KAG + GraphRAG context.

| Tool | Purpose | Example Prompt |
|------|---------|----------------|
| [`doclea_context`](./context/build-context) | Build context | "Build context about authentication" |

### Token Budget (3)

Manage token allocation.

| Tool | Purpose | Example Prompt |
|------|---------|----------------|
| [`doclea_allocate_budget`](./budget/allocate-budget) | Allocate tokens | "Allocate budget for Claude Sonnet" |
| [`doclea_model_windows`](./budget/model-windows) | Model limits | "What are model context windows?" |
| [`doclea_budget_presets`](./budget/budget-presets) | Preset configs | "Show available budget presets" |

### Bootstrap & Import (2)

Initialize and ingest existing project knowledge.

| Tool | Purpose | Example Prompt |
|------|---------|----------------|
| [`doclea_init`](./bootstrap/init) | Initialize project | "Initialize doclea for this project" |
| `doclea_import` | Import markdown/ADR content | "Import from docs/adr" |

### Backup & Restore (2)

Backup and restore data.

| Tool | Purpose | Example Prompt |
|------|---------|----------------|
| [`doclea_export`](./backup/export) | Export data | "Export all data to backup.json" |
| [`doclea_restore`](./backup/import) | Restore backup | "Restore from backup.json" |

### Cache & A/B Testing (5)

Performance and experimentation.

| Tool | Purpose | Example Prompt |
|------|---------|----------------|
| [`doclea_retrieval_benchmark`](./testing/retrieval-benchmark) | Benchmark retrieval latency | "Benchmark retrieval for auth and payment queries" |
| [`doclea_cache_stats`](./testing/cache-stats) | Cache statistics | "Show cache performance" |
| [`doclea_cache_clear`](./testing/cache-clear) | Clear cache | "Clear the context cache" |
| [`doclea_experiment_status`](./testing/experiment-status) | Experiment status | "Show A/B test status" |
| [`doclea_experiment_metrics`](./testing/experiment-metrics) | Export metrics | "Export experiment results" |

### Git Tools (3)

Generate commit messages and changelogs.

| Tool | Purpose | Example Prompt |
|------|---------|----------------|
| [`doclea_commit_message`](./git/commit-message) | Generate commit | "Generate a commit message" |
| [`doclea_pr_description`](./git/pr-description) | Generate PR | "Create a PR description" |
| [`doclea_changelog`](./git/changelog) | Generate changelog | "Generate changelog since v1.0" |

### Expertise Tools (2)

Code ownership and reviewers.

| Tool | Purpose | Example Prompt |
|------|---------|----------------|
| [`doclea_expertise`](./expertise/mapping) | Map ownership | "Who owns the payment module?" |
| [`doclea_suggest_reviewers`](./expertise/reviewers) | Suggest reviewers | "Suggest reviewers for this PR" |

### GraphRAG Tools (3)

Graph-based retrieval and community analysis.

| Tool | Purpose | Example Prompt |
|------|---------|----------------|
| `doclea_graphrag_build` | Build/update GraphRAG index | "Build GraphRAG from memories" |
| `doclea_graphrag_search` | Search graph (local/global/drift) | "Search GraphRAG for auth architecture" |
| `doclea_graphrag_status` | Graph health and statistics | "Show GraphRAG status" |

### Maintenance Tools (1)

Detect and refresh stale memories.

| Tool | Purpose | Example Prompt |
|------|---------|----------------|
| [`doclea_staleness`](./staleness/overview) | Detect stale | "Scan memories for staleness" |

---

## Memory Types

When storing memories, specify a type:

| Type | Use For | Example |
|------|---------|---------|
| `decision` | Architectural choices | "Using PostgreSQL for ACID" |
| `solution` | Bug fixes, resolutions | "Fixed race condition with mutex" |
| `pattern` | Code conventions | "All API errors use RFC7807" |
| `architecture` | System design | "Service mesh topology" |
| `note` | General documentation | "Team standup is at 10am" |

---

## Common Parameters

### `importance` (0-1)

Priority score affecting search ranking.

| Range | Use For |
|-------|---------|
| 0.9-1.0 | Critical architectural decisions |
| 0.7-0.8 | Important patterns/solutions |
| 0.5-0.6 | Standard documentation |
| 0.3-0.4 | Minor notes |

### `tags` (string[])

Categories for filtering. Use 2-5 focused tags.

**Good tags:** `auth`, `payments`, `performance`, `security`

**Avoid:** `code`, `feature`, `fix` (too generic)

### `relatedFiles` (string[])

File paths for context. Helps with search relevance and cross-layer detection.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        MCP Tools                             │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│   Memory    │  Relations  │   Context   │   Code (KAG)     │
│   (RAG)     │   (Graph)   │  Building   │   Scanning       │
├─────────────┴─────────────┴─────────────┴──────────────────┤
│                     Storage Layer                           │
│              SQLite + Vector Store                          │
├─────────────────────────────────────────────────────────────┤
│                    Embeddings                               │
│      Transformers / OpenAI / Voyage / Nomic / Ollama       │
└─────────────────────────────────────────────────────────────┘
```

---

## Response Format

All tools return MCP-standard responses:

### Success

```json
{
  "content": [{
    "type": "text",
    "text": "{\"id\": \"mem_abc123\", ...}"
  }]
}
```

### Error

```json
{
  "content": [{
    "type": "text",
    "text": "Error: Memory not found"
  }],
  "isError": true
}
```

---

## Next Steps

- [doclea_store](./memory/store) - Store your first memory
- [doclea_search](./memory/search) - Find relevant context
- [doclea_context](./context/build-context) - Build RAG+KAG context
- [doclea_scan_code](./code/scan-code) - Index your codebase
