---
sidebar_position: 2
title: doclea_export
description: Export all Doclea data to a portable JSON file.
keywords: [doclea_export, export, backup, json]
---

# doclea_export

Export all memories, documents, chunks, and relations to a portable JSON file for backup or migration.

**Category:** Export/Import
**Status:** Stable

---

## Quick Example

```
"Export all data to backup.json"
```

**Response:**

```json
{
  "success": true,
  "outputPath": "/path/to/backup.json",
  "stats": {
    "memories": 150,
    "documents": 45,
    "chunks": 320,
    "memoryRelations": 89,
    "crossLayerRelations": 56,
    "pendingMemories": 12
  }
}
```

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `outputPath` | `string` | Yes | - | Path to write the export file |
| `includeRelations` | `boolean` | No | `true` | Include memory and cross-layer relations |
| `includePending` | `boolean` | No | `true` | Include pending memories |

---

## Usage Examples

### Full Export

```
"Export everything to /backups/doclea-full.json"
```

```json
{
  "outputPath": "/backups/doclea-full.json"
}
```

### Memories Only

```
"Export just memories without relations"
```

```json
{
  "outputPath": "/backups/memories-only.json",
  "includeRelations": false,
  "includePending": false
}
```

### Approved Memories Only

```
"Export approved memories with their relations"
```

```json
{
  "outputPath": "/backups/approved.json",
  "includeRelations": true,
  "includePending": false
}
```

---

## Response Schema

```typescript
interface ExportResult {
  success: boolean;
  outputPath: string;
  stats: {
    memories: number;
    documents: number;
    chunks: number;
    memoryRelations: number;
    crossLayerRelations: number;
    pendingMemories: number;
  };
  error?: string;
}
```

### Success

```json
{
  "success": true,
  "outputPath": "/path/to/backup.json",
  "stats": {
    "memories": 150,
    "documents": 45,
    "chunks": 320,
    "memoryRelations": 89,
    "crossLayerRelations": 56,
    "pendingMemories": 12
  }
}
```

### Failure

```json
{
  "success": false,
  "outputPath": "/invalid/path/backup.json",
  "stats": {
    "memories": 0,
    "documents": 0,
    "chunks": 0,
    "memoryRelations": 0,
    "crossLayerRelations": 0,
    "pendingMemories": 0
  },
  "error": "ENOENT: no such file or directory"
}
```

---

## Export File Format

```json
{
  "version": "1.0.0",
  "exportedAt": 1705432800,
  "backendType": "sqlite",
  "storageMode": "manual",
  "schemaVersion": "11",
  "data": {
    "memories": [
      {
        "id": "mem_abc123",
        "title": "JWT Auth Decision",
        "content": "We decided to use JWT...",
        "type": "decision",
        "tags": ["auth", "security"],
        "importance": 0.9,
        "createdAt": 1705432000,
        "updatedAt": 1705432000
      }
    ],
    "documents": [...],
    "chunks": [...],
    "memoryRelations": [
      {
        "id": "rel_xyz",
        "sourceId": "mem_abc123",
        "targetId": "mem_def456",
        "type": "implements",
        "weight": 1.0,
        "createdAt": 1705432500
      }
    ],
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

---

## What's NOT Exported

| Data | Reason |
|------|--------|
| Embeddings | Large, regenerable, provider-dependent |
| Code Graph | Derived from code, should be re-scanned |
| Vector IDs | Storage-specific, regenerated on import |
| Cache | Ephemeral, not persistent data |

---

## Best Practices

### Regular Backups

```bash
# Daily backup script
doclea_export outputPath="/backups/doclea-$(date +%Y%m%d).json"
```

### Before Major Changes

Export before:
- Schema migrations
- Embedding provider changes
- Storage backend changes

### Version Control

```bash
# Commit knowledge base changes
cp doclea-backup.json ./repo/knowledge/
git add ./repo/knowledge/doclea-backup.json
git commit -m "Knowledge base snapshot"
```

---

## See Also

- [doclea_import](./import) - Import from export
- [Export/Import Overview](./overview)
