/**
 * Storage backend factory
 *
 * Creates the appropriate storage backend based on configuration.
 */

import { isAbsolute, join } from "node:path";
import type { IStorageBackend } from "./interface";
import { MemoryStorageBackend } from "./memory-backend";
import { SqliteStorageBackend } from "./sqlite-backend";
import type { ExtendedStorageConfig } from "./types";

/**
 * Create a storage backend based on configuration
 *
 * @param config - Storage configuration with backend type and mode
 * @param projectPath - Base path for relative database paths
 * @returns Configured storage backend (not yet initialized)
 */
export function createStorageBackend(
  config: ExtendedStorageConfig,
  projectPath: string,
): IStorageBackend {
  // Warn about incompatible combinations
  if (config.mode === "suggested" && config.backend === "memory") {
    console.warn(
      "[doclea] Warning: Using 'suggested' mode with 'memory' backend. " +
        "Pending memories will be lost on restart.",
    );
  }

  if (config.mode === "manual" && config.backend === "memory") {
    console.warn(
      "[doclea] Warning: Using 'manual' mode with 'memory' backend. " +
        "Pending memories will be lost on restart.",
    );
  }

  if (config.backend === "memory") {
    return new MemoryStorageBackend(config.mode);
  }

  // SQLite backend - resolve path
  const dbPath = isAbsolute(config.dbPath)
    ? config.dbPath
    : join(projectPath, config.dbPath);

  return new SqliteStorageBackend(dbPath, config.mode);
}

/**
 * Default storage configuration
 */
export const DEFAULT_STORAGE_CONFIG: ExtendedStorageConfig = {
  backend: "sqlite",
  dbPath: ".doclea/local.db",
  mode: "automatic",
};
