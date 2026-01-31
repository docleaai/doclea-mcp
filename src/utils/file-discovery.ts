/**
 * Native file discovery using Bun's glob API.
 * Replaces buggy hand-rolled regex implementations.
 *
 * IMPORTANT: This module requires Bun runtime. The fs.glob exclude option
 * is Bun-specific and silently fails on Node.js.
 */

import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_INCLUDE_PATTERNS,
} from "./scan-patterns";

export interface DiscoveryOptions {
  /** Glob patterns to include (default: source code files) */
  include?: readonly string[] | string[];
  /** Glob patterns to exclude (default: node_modules, dist, .git, etc.) */
  exclude?: readonly string[] | string[];
  /** Working directory for relative paths (default: process.cwd()) */
  cwd?: string;
  /** Enable debug logging (uses stderr to avoid corrupting MCP JSON-RPC on stdout) */
  debug?: boolean;
  /** Follow symlinks - MUST be false to prevent infinite loops (default: false) */
  followSymlinks?: boolean;
}

export class DiscoveryError extends Error {
  constructor(
    message: string,
    public readonly code: "ENOENT" | "EACCES" | "UNKNOWN",
    public readonly path?: string,
  ) {
    super(message);
    this.name = "DiscoveryError";
  }
}

/**
 * Asserts that the code is running on Bun runtime.
 * The fs.glob exclude option is Bun-specific and silently fails on Node.js,
 * which would cause node_modules, .git, dist, etc. to be scanned.
 *
 * @throws {DiscoveryError} if not running on Bun
 */
function assertBunRuntime(): void {
  if (typeof Bun === "undefined") {
    // MUST use stderr - MCP uses stdout for JSON-RPC
    console.error("CRITICAL: File discovery requires Bun runtime.");
    console.error("The fs.glob exclude option is Bun-specific.");
    console.error("Run with: bun run <script>");
    throw new DiscoveryError(
      "File discovery requires Bun runtime. Run with: bun run <script>",
      "UNKNOWN",
    );
  }
}

/**
 * Discover files using Bun's native glob with proper exclusion support.
 *
 * @example
 * ```ts
 * // Default: discover source files, exclude node_modules/dist/.git
 * const files = await discoverFiles({ cwd: "/path/to/project" });
 *
 * // Custom patterns
 * const files = await discoverFiles({
 *   include: ["**\/*.ts"],
 *   exclude: ["**\/test/**"],
 *   cwd: "/path/to/project",
 *   debug: true,
 * });
 * ```
 */
export async function discoverFiles(
  options: DiscoveryOptions = {},
): Promise<string[]> {
  // Fail fast if not on Bun - exclude option silently fails on Node.js
  assertBunRuntime();

  const include = options.include ?? [...DEFAULT_INCLUDE_PATTERNS];
  const exclude = options.exclude ?? [...DEFAULT_EXCLUDE_PATTERNS];
  const cwd = options.cwd ?? process.cwd();
  const followSymlinks = options.followSymlinks ?? false; // Safe default

  const startTime = Date.now();

  // CRITICAL: Use console.error for all debug output (MCP uses stdout for JSON-RPC)
  if (options.debug) {
    console.error(`[discovery] Runtime: Bun ${Bun.version}`);
    console.error(`[discovery] Scanning: ${cwd}`);
    console.error(`[discovery] Include: ${(include as string[]).join(", ")}`);
    console.error(`[discovery] Exclude: ${exclude.length} patterns`);
    for (const p of (exclude as string[]).slice(0, 5)) {
      console.error(`  - ${p}`);
    }
    if (exclude.length > 5) {
      console.error(`  ... and ${exclude.length - 5} more`);
    }
  }

  const files: string[] = [];

  try {
    // Use Bun's native glob with exclude support
    // Requires Bun >= 1.1.26
    for await (const file of fs.glob(include as string[], {
      cwd,
      exclude: exclude as string[],
      // @ts-expect-error - Bun-specific option not in Node types
      follow: followSymlinks, // MUST: Prevent symlink loops
    })) {
      files.push(resolve(cwd, file));
    }
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new DiscoveryError(`Directory not found: ${cwd}`, "ENOENT", cwd);
    }
    if (err.code === "EACCES") {
      throw new DiscoveryError(`Permission denied: ${cwd}`, "EACCES", cwd);
    }
    // Log but don't throw for other errors - continue scanning
    console.error(`[discovery] Error during scan:`, error);
  }

  if (options.debug) {
    const elapsed = Date.now() - startTime;
    console.error(`[discovery] Completed in ${elapsed}ms`);
    console.error(`[discovery] Found ${files.length} files`);
    if (files.length > 0) {
      console.error(`[discovery] Sample files:`);
      for (const f of files.slice(0, 5)) {
        console.error(`  - ${f}`);
      }
      if (files.length > 5) {
        console.error(`  ... and ${files.length - 5} more`);
      }
    }
    // Warn if file count is suspiciously high
    if (files.length > 5000) {
      console.error(
        `[discovery] WARNING: High file count. Verify exclude patterns are working.`,
      );
    }
  }

  return files;
}
