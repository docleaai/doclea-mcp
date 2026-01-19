---
sidebar_position: 1
title: Export/Import Overview
description: Backup and restore Doclea data across environments.
keywords: [export, import, backup, restore, migrate]
---

# Export/Import

Tools for backing up, restoring, and migrating Doclea data between environments.

## Why Export/Import?

- **Backup** - Regular data backups for disaster recovery
- **Migration** - Move data between machines or storage backends
- **Sharing** - Share knowledge bases with team members
- **Version Control** - Snapshot data at specific points

## Available Tools

| Tool | Description |
|------|-------------|
| [doclea_export](./export) | Export all data to JSON file |
| [doclea_import](./import) | Import data from JSON export |

## What Gets Exported

| Data Type | Included | Notes |
|-----------|----------|-------|
| Memories | Yes | All stored memories |
| Documents | Yes | Ingested documents |
| Chunks | Yes | Document chunks |
| Memory Relations | Optional | Links between memories |
| Cross-Layer Relations | Optional | Code ↔ Memory links |
| Pending Memories | Optional | Unapproved suggestions |
| Embeddings | No | Re-generated on import |
| Code Graph | No | Re-scanned on import |

## Export Format

Exports use a versioned JSON format:

```json
{
  "version": "1.0.0",
  "exportedAt": 1705432800,
  "backendType": "sqlite",
  "storageMode": "manual",
  "schemaVersion": "11",
  "data": {
    "memories": [...],
    "documents": [...],
    "chunks": [...],
    "memoryRelations": [...],
    "crossLayerRelations": [...],
    "pendingMemories": [...]
  },
  "metadata": {
    "totalMemories": 150,
    "embeddingProvider": "transformers",
    "embeddingModel": "nomic-embed-text"
  }
}
```

## Quick Start

### Export

```json
// doclea_export
{
  "outputPath": "/path/to/backup.json"
}
```

### Import

```json
// doclea_import
{
  "inputPath": "/path/to/backup.json"
}
```

## Workflow: Full Migration

```typescript
// On source machine:
// 1. Export all data
const exportResult = await doclea_export({
  outputPath: "./doclea-backup.json",
  includeRelations: true,
  includePending: true
});
// → { success: true, stats: { memories: 150, ... } }

// Transfer file to target machine

// On target machine:
// 2. Import with re-embedding
const importResult = await doclea_import({
  inputPath: "./doclea-backup.json",
  conflictStrategy: "skip",
  reembed: true,  // Regenerate embeddings
  importRelations: true,
  importPending: true
});
// → { success: true, stats: { memoriesImported: 150, ... } }
```

## Conflict Handling

When importing, existing data may conflict. Strategies:

| Strategy | Behavior |
|----------|----------|
| `skip` | Keep existing, ignore imported (default) |
| `overwrite` | Replace existing with imported |
| `error` | Fail on any conflict |

## Embedding Considerations

Embeddings are **not exported** because:
- They're large (1536+ floats per vector)
- They depend on the embedding provider/model
- They can be regenerated

When importing:
- **Default**: Skip embedding regeneration (faster)
- **With `reembed: true`**: Regenerate all embeddings (slower but ensures consistency)

If you change embedding providers between export/import, use `reembed: true`.

## See Also

- [Storage Modes](../workflow/set-storage-mode) - Manual vs automatic storage
- [Memory Operations](../memory/overview) - Working with memories
