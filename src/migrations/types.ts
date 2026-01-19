/**
 * Database migration types and interfaces
 */

/**
 * A single migration with up and down functions
 */
export interface Migration {
  /** Unique migration version (e.g., "001", "002") */
  version: string;
  /** Human-readable name */
  name: string;
  /** Whether this migration is destructive (requires backup) */
  destructive?: boolean;
  /** Apply the migration */
  up: (db: MigrationDatabase) => void;
  /** Revert the migration */
  down: (db: MigrationDatabase) => void;
}

/**
 * Database interface for migrations
 * Simplified interface that migrations use to execute SQL
 */
export interface MigrationDatabase {
  /** Execute a SQL statement */
  run(sql: string, ...params: unknown[]): void;
  /** Execute multiple SQL statements */
  exec(sql: string): void;
  /** Query for rows */
  query<T = unknown>(sql: string, ...params: unknown[]): T[];
  /** Query for a single row */
  get<T = unknown>(sql: string, ...params: unknown[]): T | undefined;
}

/**
 * Status of a migration
 */
export interface MigrationStatus {
  version: string;
  name: string;
  appliedAt: number | null;
  status: "pending" | "applied" | "failed";
}

/**
 * Result of running migrations
 */
export interface MigrationResult {
  success: boolean;
  applied: string[];
  failed: string | null;
  error?: string;
  backupPath?: string;
}

/**
 * Options for running migrations
 */
export interface MigrationOptions {
  /** Target version to migrate to (default: latest) */
  targetVersion?: string;
  /** Create backup before destructive migrations */
  backup?: boolean;
  /** Dry run - don't actually apply migrations */
  dryRun?: boolean;
}
