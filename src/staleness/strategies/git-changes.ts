/**
 * Git Changes Strategy
 *
 * Detects staleness based on whether files related to a memory have changed
 * in git since the memory was last refreshed.
 */

import simpleGit, { type SimpleGit } from "simple-git";
import type { Memory } from "@/types";
import type { GitChangesStrategyConfig, StalenessSignal } from "../types";
import {
  BaseStalenessStrategy,
  type IStalenessStrategy,
  type StrategyContext,
} from "./base";

/**
 * Cache entry for git file changes
 */
interface GitCacheEntry {
  /** Map of file path to last commit timestamp (Unix seconds) */
  fileChanges: Map<string, number>;
  /** When this cache entry expires */
  expiresAt: number;
}

/**
 * Extended context for git changes strategy
 */
export interface GitChangesStrategyContext extends StrategyContext {
  repoPath?: string;
}

/**
 * Git-based staleness detection.
 *
 * Weight: 0.7 (high) - code changes are strong indicators of potential staleness.
 * Checks if any related files have been modified since the memory was last refreshed.
 */
export class GitChangesStrategy
  extends BaseStalenessStrategy
  implements IStalenessStrategy
{
  readonly type = "git_changes" as const;
  readonly weight: number;
  private readonly cacheTtlMs: number;
  private readonly defaultRepoPath?: string;
  private cache: GitCacheEntry | null = null;
  private git: SimpleGit | null = null;

  constructor(config: GitChangesStrategyConfig) {
    super();
    this.weight = config.weight;
    this.cacheTtlMs = config.cacheTtlMs;
    this.defaultRepoPath = config.repoPath;
  }

  async initialize(): Promise<void> {
    // Git client will be initialized lazily on first use
  }

  async dispose(): Promise<void> {
    this.cache = null;
    this.git = null;
  }

  async check(
    memory: Memory,
    context: StrategyContext,
  ): Promise<StalenessSignal | null> {
    // Skip if memory has no related files
    if (!memory.relatedFiles || memory.relatedFiles.length === 0) {
      return null;
    }

    const ctx = context as GitChangesStrategyContext;
    const repoPath = ctx.repoPath ?? this.defaultRepoPath ?? process.cwd();

    // Initialize git client if needed
    if (!this.git) {
      this.git = simpleGit(repoPath);
    }

    // Get cached or fresh file changes
    const fileChanges = await this.getFileChanges(repoPath);
    if (fileChanges.size === 0) {
      return null;
    }

    // Determine the reference timestamp for the memory
    const memoryAnchor = this.getMemoryAnchor(memory);

    // Check for files that changed after the memory's anchor
    const changedFiles: Array<{ file: string; changedAt: number }> = [];
    let maxChangeTime = 0;

    for (const file of memory.relatedFiles) {
      const changeTime = fileChanges.get(this.normalizePath(file));
      if (changeTime && changeTime > memoryAnchor) {
        changedFiles.push({ file, changedAt: changeTime });
        maxChangeTime = Math.max(maxChangeTime, changeTime);
      }
    }

    // No files changed after memory anchor
    if (changedFiles.length === 0) {
      return null;
    }

    // Calculate score based on how many related files changed
    // 1 file = 0.5, 2+ files = proportionally higher up to 1.0
    const changeRatio = changedFiles.length / memory.relatedFiles.length;
    const score = Math.min(1.0, 0.5 + changeRatio * 0.5);

    const reason = this.formatReason(changedFiles, memory.relatedFiles.length);

    return this.createSignal(score, reason, {
      changedFiles: changedFiles.map((f) => f.file),
      totalRelatedFiles: memory.relatedFiles.length,
      mostRecentChangeAt: maxChangeTime,
      memoryAnchor,
    });
  }

  /**
   * Get the anchor timestamp for the memory.
   */
  private getMemoryAnchor(memory: Memory): number {
    if (memory.lastRefreshedAt != null) {
      return memory.lastRefreshedAt;
    }
    return Math.max(memory.accessedAt, memory.createdAt);
  }

  /**
   * Get file change timestamps from cache or git.
   */
  private async getFileChanges(repoPath: string): Promise<Map<string, number>> {
    const now = Date.now();

    // Return cached data if still valid
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.fileChanges;
    }

    try {
      const fileChanges = await this.fetchFileChanges(repoPath);
      this.cache = {
        fileChanges,
        expiresAt: now + this.cacheTtlMs,
      };
      return fileChanges;
    } catch (_error) {
      // Git errors (not a repo, etc.) - return empty
      return new Map();
    }
  }

  /**
   * Fetch file change timestamps from git.
   * Uses a single git log command for efficiency.
   */
  private async fetchFileChanges(
    repoPath: string,
  ): Promise<Map<string, number>> {
    if (!this.git) {
      this.git = simpleGit(repoPath);
    }

    const fileChanges = new Map<string, number>();

    try {
      // Get file changes from the last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      // Use git log to get all file changes with timestamps
      // Format: timestamp|filename (one per line)
      const logOutput = await this.git.raw([
        "log",
        "--format=%ct",
        "--name-only",
        `--since=${sixMonthsAgo.toISOString()}`,
      ]);

      let currentTimestamp = 0;
      for (const line of logOutput.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Check if this is a timestamp line (all digits)
        if (/^\d+$/.test(trimmed)) {
          currentTimestamp = parseInt(trimmed, 10);
        } else if (currentTimestamp > 0) {
          // It's a file path
          const normalizedPath = this.normalizePath(trimmed);
          // Only keep the most recent change time for each file
          const existing = fileChanges.get(normalizedPath);
          if (!existing || currentTimestamp > existing) {
            fileChanges.set(normalizedPath, currentTimestamp);
          }
        }
      }
    } catch {
      // Ignore git errors
    }

    return fileChanges;
  }

  /**
   * Normalize a file path for consistent comparison.
   */
  private normalizePath(path: string): string {
    // Remove leading ./ or /
    return path.replace(/^\.?\//, "").toLowerCase();
  }

  /**
   * Format a human-readable reason for the staleness.
   */
  private formatReason(
    changedFiles: Array<{ file: string }>,
    totalFiles: number,
  ): string {
    const count = changedFiles.length;
    if (count === 1) {
      return `Related file changed: ${changedFiles[0].file}`;
    }
    if (count === totalFiles) {
      return `All ${count} related files have changed since last refresh`;
    }
    const fileList = changedFiles.slice(0, 3).map((f) => f.file);
    const suffix = count > 3 ? `... and ${count - 3} more` : "";
    return `${count} of ${totalFiles} related files changed: ${fileList.join(", ")}${suffix}`;
  }
}
