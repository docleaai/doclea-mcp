import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Config, ConfigSchema, DEFAULT_CONFIG } from "./types";

const CONFIG_FILE = ".doclea/config.json";

// Service endpoints for auto-detection
const QDRANT_DEFAULT_URL = "http://localhost:6333";
const TEI_DEFAULT_ENDPOINT = "http://localhost:8080";
const DETECTION_TIMEOUT_MS = 500;

/**
 * Check if a service is running at the given URL
 * Uses a quick health check with short timeout
 */
async function isServiceRunning(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      DETECTION_TIMEOUT_MS,
    );

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok || response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Auto-detect available backends and return optimized configuration
 * Priority: Docker services (if running) > Embedded backends (default)
 */
export async function detectConfig(): Promise<Config> {
  const [qdrantRunning, teiRunning] = await Promise.all([
    isServiceRunning(`${QDRANT_DEFAULT_URL}/health`),
    isServiceRunning(`${TEI_DEFAULT_ENDPOINT}/health`),
  ]);

  const config: Config = { ...DEFAULT_CONFIG };

  // Use Qdrant if running, otherwise sqlite-vec
  if (qdrantRunning) {
    config.vector = {
      provider: "qdrant",
      url: QDRANT_DEFAULT_URL,
      collectionName: "doclea-memories",
    };
  }

  // Use TEI if running, otherwise transformers.js
  if (teiRunning) {
    config.embedding = {
      provider: "local",
      endpoint: TEI_DEFAULT_ENDPOINT,
    };
  }

  return config;
}

/**
 * Load configuration from file or auto-detect
 * File config takes precedence over auto-detection
 */
export function loadConfig(projectPath: string = process.cwd()): Config {
  const configPath = join(projectPath, CONFIG_FILE);

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const rawConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    return ConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to load config from ${configPath}: ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Load configuration with auto-detection
 * 1. If config file exists, use it
 * 2. Otherwise, auto-detect available backends
 */
export async function loadConfigWithAutoDetect(
  projectPath: string = process.cwd(),
): Promise<Config> {
  const configPath = join(projectPath, CONFIG_FILE);

  // If config file exists, use it
  if (existsSync(configPath)) {
    try {
      const rawConfig = JSON.parse(readFileSync(configPath, "utf-8"));
      return ConfigSchema.parse(rawConfig);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to load config from ${configPath}: ${error.message}`,
        );
      }
      throw error;
    }
  }

  // Otherwise, auto-detect
  return detectConfig();
}

export function getConfigPath(projectPath: string = process.cwd()): string {
  return join(projectPath, CONFIG_FILE);
}

export function getDbPath(
  config: Config,
  projectPath: string = process.cwd(),
): string {
  return join(projectPath, config.storage.dbPath);
}

export function getProjectPath(): string {
  return process.cwd();
}
