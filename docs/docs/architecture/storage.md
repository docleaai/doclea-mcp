---
sidebar_position: 0
title: Storage
description: How Doclea stores memories, documents, and embeddings. SQLite database schema, migration system, and backup strategies.
keywords: [storage, sqlite, database, schema, migrations, backup]
---

# Storage

Doclea uses SQLite for persistent storage of memories, documents, chunks, and embedding caches. This page explains the database architecture and migration system.

---

## Database Location

By default, the database is stored at:

```
.doclea/local.db
```

This location is relative to your project root. The database uses SQLite with WAL (Write-Ahead Logging) for better concurrent access.

---

## Schema Overview

### Core Tables

| Table | Purpose |
|-------|---------|
| `memories` | Stored memories with metadata |
| `documents` | Full documents for chunking |
| `chunks` | Document segments for embedding |
| `embedding_cache` | Cached embeddings by content hash |

### Metadata Tables

| Table | Purpose |
|-------|---------|
| `_doclea_meta` | Schema version and settings |
| `_doclea_migrations` | Migration history tracking |

---

## Table Schemas

### memories

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- 'decision', 'bug_fix', 'pattern', etc.
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  importance REAL DEFAULT 0.5,  -- 0.0 to 1.0
  tags TEXT DEFAULT '[]',       -- JSON array
  related_files TEXT DEFAULT '[]',
  git_commit TEXT,
  source_pr TEXT,
  experts TEXT DEFAULT '[]',    -- JSON array of {name, email}
  qdrant_id TEXT,               -- Vector DB reference (legacy)
  created_at INTEGER DEFAULT (unixepoch()),
  accessed_at INTEGER DEFAULT (unixepoch())
);
```

### documents

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT,           -- SHA-256 for deduplication
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
```

### chunks

```sql
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  qdrant_id TEXT,
  start_offset INTEGER,        -- Character offset in document
  end_offset INTEGER
);
```

### embedding_cache

```sql
CREATE TABLE embedding_cache (
  content_hash TEXT PRIMARY KEY,
  embedding TEXT NOT NULL,     -- JSON array of floats
  model TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
```

---

## Migration System

Doclea uses a versioned migration system for schema changes.

### How It Works

1. Migrations are numbered sequentially (`001`, `002`, etc.)
2. Each migration has `up()` and `down()` functions
3. Migrations run automatically on startup
4. Schema version is tracked in `_doclea_meta`

### Migration Structure

```typescript
import type { Migration, MigrationDatabase } from "@doclea/mcp/migrations";

export const migration002AddRelationships: Migration = {
  version: "002",
  name: "add_relationships",
  destructive: false,  // Set true for DROP/DELETE operations

  up(db: MigrationDatabase): void {
    db.exec(`
      CREATE TABLE memory_relationships (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES memories(id),
        target_id TEXT NOT NULL REFERENCES memories(id),
        relationship_type TEXT NOT NULL
      )
    `);
  },

  down(db: MigrationDatabase): void {
    db.exec("DROP TABLE IF EXISTS memory_relationships");
  },
};
```

### MigrationDatabase Interface

Migrations receive a simplified database interface:

```typescript
interface MigrationDatabase {
  run(sql: string, ...params: unknown[]): void;   // Execute with params
  exec(sql: string): void;                        // Execute raw SQL
  query<T>(sql: string, ...params: unknown[]): T[];  // Query rows
  get<T>(sql: string, ...params: unknown[]): T | undefined;  // Single row
}
```

### Checking Migration Status

```typescript
const db = new SQLiteDatabase(".doclea/local.db");

// Get current schema version
const version = db.getSchemaVersion();
// => "001"

// Get all migration statuses
const status = db.getMigrationStatus();
// => [
//   { version: "001", name: "initial_schema", status: "applied", appliedAt: 1699123456 }
// ]
```

---

## Backup System

### Automatic Backups

Doclea automatically creates backups before:
- Running destructive migrations (marked with `destructive: true`)
- Rolling back migrations

Backups are stored in:
```
.doclea/backups/backup-{timestamp}-{version}.db
```

### Manual Backup

```typescript
import { MigrationRunner, migrations } from "@doclea/mcp/migrations";

const runner = new MigrationRunner(".doclea/local.db", migrations);
const backupPath = runner.createBackup();
// => ".doclea/backups/backup-2024-01-15T10-30-00-001.db"
```

### Rollback

```typescript
// Rollback to a specific version
const result = await runner.rollback("001");
if (result.success) {
  console.log(`Rolled back: ${result.applied.join(", ")}`);
  console.log(`Backup at: ${result.backupPath}`);
}

// Rollback all migrations
const result = await runner.rollback("0");
```

---

## Performance Considerations

### WAL Mode

SQLite runs in WAL (Write-Ahead Logging) mode for:
- Better concurrent read performance
- Faster writes
- Automatic recovery from crashes

### Indexes

The following indexes are created automatically:

```sql
CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_memories_qdrant ON memories(qdrant_id);
CREATE INDEX idx_chunks_document ON chunks(document_id);
CREATE INDEX idx_embedding_cache_model ON embedding_cache(model);
```

### Embedding Cache

The embedding cache prevents redundant embedding computations:
- Content is hashed with SHA-256
- Cache is keyed by `(content_hash, model)`
- Same content with different models = separate entries

---

## Database Size

Typical storage requirements:

| Component | Size Per Item |
|-----------|---------------|
| Memory (average) | ~2-5 KB |
| Document | Content size + overhead |
| Chunk | ~500 bytes |
| Cached embedding | ~1.5-3 KB (depending on dimensions) |

For a typical project with 1,000 memories:
- Database: ~5-10 MB
- With embedding cache: ~15-25 MB

---

## Troubleshooting

### Database Locked

If you see "database is locked" errors:

```bash
# Check for WAL files
ls -la .doclea/*.db*

# Force checkpoint (in emergencies)
sqlite3 .doclea/local.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

### Migration Failed

If a migration fails:
1. Check the error message in stderr
2. Backup is automatically created before destructive migrations
3. Fix the issue and restart - pending migrations will retry

### Corrupted Database

If the database is corrupted:

```bash
# Check integrity
sqlite3 .doclea/local.db "PRAGMA integrity_check;"

# Restore from backup
cp .doclea/backups/backup-*.db .doclea/local.db
```

---

## Next Steps

- [Embeddings](./embeddings) - How embeddings are generated
- [Vector Search](./vector-search) - How vectors are searched
- [Configuration](../configuration) - Database path configuration