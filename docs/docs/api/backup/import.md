---
sidebar_position: 3
title: doclea_import
description: Import Doclea data from a JSON export file.
keywords: [doclea_import, import, restore, migrate]
---

# doclea_import

Import memories, documents, and relations from a JSON export file. Supports conflict handling and optional re-embedding.

**Category:** Export/Import
**Status:** Stable

---

## Quick Example

```
"Import data from backup.json"
```

**Response:**

```json
{
  "success": true,
  "stats": {
    "memoriesImported": 145,
    "memoriesSkipped": 5,
    "documentsImported": 45,
    "chunksImported": 320,
    "memoryRelationsImported": 89,
    "crossLayerRelationsImported": 56,
    "pendingImported": 12
  }
}
```

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `inputPath` | `string` | Yes | - | Path to the export file |
| `conflictStrategy` | `string` | No | `skip` | How to handle conflicts |
| `reembed` | `boolean` | No | `false` | Regenerate embeddings |
| `importRelations` | `boolean` | No | `true` | Import relations |
| `importPending` | `boolean` | No | `true` | Import pending memories |

### Conflict Strategies

| Strategy | Behavior |
|----------|----------|
| `skip` | Keep existing data, ignore imported duplicates |
| `overwrite` | Replace existing data with imported |
| `error` | Fail import on any conflict |

---

## Usage Examples

### Basic Import

```
"Import from /backups/doclea.json"
```

```json
{
  "inputPath": "/backups/doclea.json"
}
```

### Overwrite Existing

```
"Import and overwrite any conflicts"
```

```json
{
  "inputPath": "/backups/doclea.json",
  "conflictStrategy": "overwrite"
}
```

### With Re-embedding

```
"Import and regenerate all embeddings"
```

```json
{
  "inputPath": "/backups/doclea.json",
  "reembed": true
}
```

### Memories Only

```
"Import just memories without relations"
```

```json
{
  "inputPath": "/backups/doclea.json",
  "importRelations": false,
  "importPending": false
}
```

### Strict Mode

```
"Import and fail if any conflicts"
```

```json
{
  "inputPath": "/backups/doclea.json",
  "conflictStrategy": "error"
}
```

---

## Response Schema

```typescript
interface ImportResult {
  success: boolean;
  stats: {
    memoriesImported: number;
    memoriesSkipped: number;
    documentsImported: number;
    chunksImported: number;
    memoryRelationsImported: number;
    crossLayerRelationsImported: number;
    pendingImported: number;
  };
  errors?: string[];
}
```

### Success

```json
{
  "success": true,
  "stats": {
    "memoriesImported": 145,
    "memoriesSkipped": 5,
    "documentsImported": 45,
    "chunksImported": 320,
    "memoryRelationsImported": 89,
    "crossLayerRelationsImported": 56,
    "pendingImported": 12
  }
}
```

### Partial Success

```json
{
  "success": true,
  "stats": {
    "memoriesImported": 140,
    "memoriesSkipped": 10,
    ...
  },
  "errors": [
    "Memory mem_xyz: duplicate ID",
    "Relation rel_abc: source memory not found"
  ]
}
```

### Failure (error strategy)

```json
{
  "success": false,
  "stats": {...},
  "errors": [
    "Conflict detected: memory mem_abc123 already exists"
  ]
}
```

---

## Re-embedding

When `reembed: true`:

1. Each imported memory is passed through the embedding client
2. New vectors are generated and stored
3. Significantly slower but ensures embedding consistency

**When to use:**
- Changing embedding providers
- Upgrading embedding models
- Importing from different Doclea instance

**When to skip:**
- Same embedding config as export
- Fast restore priority
- Will run `doclea_scan_code` anyway

---

## Import Order

Data is imported in dependency order:

1. **Documents** - Base content
2. **Chunks** - Document segments
3. **Memories** - Main knowledge units
4. **Pending Memories** - Unapproved suggestions
5. **Memory Relations** - Links between memories
6. **Cross-Layer Relations** - Code ↔ Memory links

Relations are skipped if referenced entities don't exist.

---

## Conflict Detection

Conflicts are detected by ID matching:

| Existing | Importing | Result (skip) | Result (overwrite) |
|----------|-----------|---------------|-------------------|
| mem_abc | mem_abc | Keep existing | Replace with import |
| mem_abc | mem_xyz | Import new | Import new |

---

## Best Practices

### Test First

```json
{
  "inputPath": "/backups/doclea.json",
  "conflictStrategy": "error"
}
```

Run with `error` strategy first to see what conflicts exist.

### Incremental Import

For regular sync, use `skip` to only add new items.

### Full Restore

For disaster recovery, use `overwrite` with `reembed: true`:

```json
{
  "inputPath": "/backups/doclea.json",
  "conflictStrategy": "overwrite",
  "reembed": true
}
```

---

## See Also

- [doclea_export](./export) - Create exports
- [Export/Import Overview](./overview)
