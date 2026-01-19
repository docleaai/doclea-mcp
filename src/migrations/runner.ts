/**
 * Database migration runner
 *
 * Handles schema versioning, migration execution, and backup/rollback
 */

import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  Migration,
  MigrationDatabase,
  MigrationOptions,
  MigrationResult,
  MigrationStatus,
} from "./types";

/**
 * Metadata table name for tracking schema version
 */
const META_TABLE = "_doclea_meta";

/**
 * Migration runner class
 */
export class MigrationRunner {
  private db: Database;
  private dbPath: string;
  private migrations: Migration[];

  constructor(dbPath: string, migrations: Migration[]) {
    this.dbPath = dbPath;
    this.migrations = this.sortMigrations(migrations);

    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath, { create: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.ensureMetaTable();
  }

  /**
   * Sort migrations by version
   */
  private sortMigrations(migrations: Migration[]): Migration[] {
    return [...migrations].sort((a, b) => a.version.localeCompare(b.version));
  }

  /**
   * Ensure the metadata table exists
   */
  private ensureMetaTable(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS ${META_TABLE} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);
  }

  /**
   * Get the current schema version
   */
  getCurrentVersion(): string | null {
    const row = this.db
      .prepare(`SELECT value FROM ${META_TABLE} WHERE key = 'schema_version'`)
      .get() as { value: string } | undefined;
    return row?.value ?? null;
  }

  /**
   * Set the current schema version
   */
  private setCurrentVersion(version: string): void {
    this.db.run(
      `INSERT OR REPLACE INTO ${META_TABLE} (key, value, updated_at) VALUES ('schema_version', ?, unixepoch())`,
      [version],
    );
  }

  /**
   * Get the latest available version
   */
  getLatestVersion(): string | null {
    if (this.migrations.length === 0) return null;
    return this.migrations[this.migrations.length - 1].version;
  }

  /**
   * Get status of all migrations
   */
  getStatus(): MigrationStatus[] {
    const _currentVersion = this.getCurrentVersion();
    const appliedVersions = this.getAppliedMigrations();

    return this.migrations.map((migration) => {
      const appliedAt = appliedVersions.get(migration.version);
      return {
        version: migration.version,
        name: migration.name,
        appliedAt: appliedAt ?? null,
        status: appliedAt ? "applied" : "pending",
      };
    });
  }

  /**
   * Get map of applied migrations with their timestamps
   */
  private getAppliedMigrations(): Map<string, number> {
    // Check if migrations table exists
    const tableExists = this.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='_doclea_migrations'`,
      )
      .get();

    if (!tableExists) {
      // Create migrations tracking table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS _doclea_migrations (
          version TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER DEFAULT (unixepoch())
        )
      `);
      return new Map();
    }

    const rows = this.db
      .prepare(`SELECT version, applied_at FROM _doclea_migrations`)
      .all() as Array<{ version: string; applied_at: number }>;

    return new Map(rows.map((r) => [r.version, r.applied_at]));
  }

  /**
   * Record a migration as applied
   */
  private recordMigration(migration: Migration): void {
    this.db.run(
      `INSERT OR REPLACE INTO _doclea_migrations (version, name, applied_at) VALUES (?, ?, unixepoch())`,
      [migration.version, migration.name],
    );
  }

  /**
   * Remove a migration record (for rollback)
   */
  private removeMigrationRecord(version: string): void {
    this.db.run(`DELETE FROM _doclea_migrations WHERE version = ?`, [version]);
  }

  /**
   * Create a backup of the database
   */
  createBackup(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = join(dirname(this.dbPath), "backups");

    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    const backupPath = join(
      backupDir,
      `backup-${timestamp}-${this.getCurrentVersion() ?? "initial"}.db`,
    );

    // Close and reopen to ensure all data is flushed
    this.db.run("PRAGMA wal_checkpoint(TRUNCATE)");
    copyFileSync(this.dbPath, backupPath);

    // Also backup WAL file if it exists
    const walPath = `${this.dbPath}-wal`;
    if (existsSync(walPath)) {
      copyFileSync(walPath, `${backupPath}-wal`);
    }

    return backupPath;
  }

  /**
   * Get pending migrations
   */
  getPendingMigrations(targetVersion?: string): Migration[] {
    const _currentVersion = this.getCurrentVersion();
    const appliedVersions = this.getAppliedMigrations();

    return this.migrations.filter((migration) => {
      // Skip if already applied
      if (appliedVersions.has(migration.version)) return false;

      // Skip if targeting a specific version and this is past it
      if (targetVersion && migration.version > targetVersion) return false;

      return true;
    });
  }

  /**
   * Check if any pending migrations are destructive
   */
  hasDestructivePending(targetVersion?: string): boolean {
    return this.getPendingMigrations(targetVersion).some((m) => m.destructive);
  }

  /**
   * Create a MigrationDatabase wrapper
   */
  private createMigrationDb(): MigrationDatabase {
    return {
      run: (sql: string, ...params: unknown[]) => {
        if (params.length > 0) {
          // @ts-expect-error - Variadic params not compatible with bun:sqlite types
          this.db.run(sql, params);
        } else {
          this.db.run(sql);
        }
      },
      exec: (sql: string) => {
        this.db.exec(sql);
      },
      query: <T = unknown>(sql: string, ...params: unknown[]): T[] => {
        if (params.length > 0) {
          // @ts-expect-error - Variadic params not compatible with bun:sqlite types
          return this.db.prepare(sql).all(params) as T[];
        }
        return this.db.prepare(sql).all() as T[];
      },
      get: <T = unknown>(sql: string, ...params: unknown[]): T | undefined => {
        if (params.length > 0) {
          // @ts-expect-error - Variadic params not compatible with bun:sqlite types
          return this.db.prepare(sql).get(params) as T | undefined;
        }
        return this.db.prepare(sql).get() as T | undefined;
      },
    };
  }

  /**
   * Run all pending migrations
   */
  async migrate(options: MigrationOptions = {}): Promise<MigrationResult> {
    const { targetVersion, backup = true, dryRun = false } = options;

    const pending = this.getPendingMigrations(targetVersion);

    if (pending.length === 0) {
      return {
        success: true,
        applied: [],
        failed: null,
      };
    }

    // Check for destructive migrations and create backup
    let backupPath: string | undefined;
    if (backup && this.hasDestructivePending(targetVersion)) {
      if (!dryRun) {
        backupPath = this.createBackup();
      }
    }

    const applied: string[] = [];
    const migrationDb = this.createMigrationDb();

    for (const migration of pending) {
      if (dryRun) {
        applied.push(migration.version);
        continue;
      }

      try {
        // Run migration in a transaction
        this.db.run("BEGIN TRANSACTION");

        migration.up(migrationDb);

        // Record migration
        this.recordMigration(migration);
        this.setCurrentVersion(migration.version);

        this.db.run("COMMIT");
        applied.push(migration.version);
      } catch (error) {
        this.db.run("ROLLBACK");
        return {
          success: false,
          applied,
          failed: migration.version,
          error: error instanceof Error ? error.message : String(error),
          backupPath,
        };
      }
    }

    return {
      success: true,
      applied,
      failed: null,
      backupPath,
    };
  }

  /**
   * Rollback to a specific version
   */
  async rollback(targetVersion: string): Promise<MigrationResult> {
    const currentVersion = this.getCurrentVersion();

    if (!currentVersion || currentVersion <= targetVersion) {
      return {
        success: true,
        applied: [],
        failed: null,
      };
    }

    // Get migrations to rollback (in reverse order)
    const appliedVersions = this.getAppliedMigrations();
    const toRollback = this.migrations
      .filter(
        (m) => appliedVersions.has(m.version) && m.version > targetVersion,
      )
      .reverse();

    if (toRollback.length === 0) {
      return {
        success: true,
        applied: [],
        failed: null,
      };
    }

    // Create backup before rollback
    const backupPath = this.createBackup();

    const rolledBack: string[] = [];
    const migrationDb = this.createMigrationDb();

    for (const migration of toRollback) {
      try {
        this.db.run("BEGIN TRANSACTION");

        migration.down(migrationDb);

        // Remove migration record
        this.removeMigrationRecord(migration.version);

        this.db.run("COMMIT");
        rolledBack.push(migration.version);
      } catch (error) {
        this.db.run("ROLLBACK");
        return {
          success: false,
          applied: rolledBack,
          failed: migration.version,
          error: error instanceof Error ? error.message : String(error),
          backupPath,
        };
      }
    }

    // Update current version
    const newVersion = targetVersion === "0" ? null : targetVersion;
    if (newVersion) {
      this.setCurrentVersion(newVersion);
    } else {
      this.db.run(`DELETE FROM ${META_TABLE} WHERE key = 'schema_version'`);
    }

    return {
      success: true,
      applied: rolledBack,
      failed: null,
      backupPath,
    };
  }

  /**
   * Get the underlying database instance
   */
  getDatabase(): Database {
    return this.db;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
