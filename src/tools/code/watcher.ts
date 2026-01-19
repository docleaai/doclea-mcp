import { readFileSync } from "node:fs";
import chokidar, { type FSWatcher } from "chokidar";
import type { IncrementalScanner } from "./incremental-scanner";
import type { ScanOptions } from "./types";

/**
 * File system watcher for continuous code scanning
 */
export class CodeWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private changedFiles = new Set<string>();

  constructor(private scanner: IncrementalScanner) {}

  /**
   * Start watching for file changes
   */
  async start(options: ScanOptions = {}): Promise<void> {
    if (this.watcher) {
      console.warn("Watcher already running");
      return;
    }

    const patterns = options.patterns || ["**/*.{ts,tsx,js,jsx,py,go,rs}"];
    const ignored = options.exclude || [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/coverage/**",
    ];

    this.watcher = chokidar.watch(patterns, {
      ignored,
      persistent: true,
      ignoreInitial: true, // Don't trigger on startup
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100,
      },
    });

    // Handle file events
    this.watcher.on("change", (path) => {
      this.queueChange(path);
    });

    this.watcher.on("add", (path) => {
      this.queueChange(path);
    });

    this.watcher.on("unlink", (path) => {
      this.queueChange(path);
    });

    this.watcher.on("error", (error) => {
      console.error("Watcher error:", error);
    });

    console.log("Code watcher started", {
      patterns,
      ignored: ignored.length,
    });
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;

      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }

      this.changedFiles.clear();
      console.log("Code watcher stopped");
    }
  }

  /**
   * Check if watcher is running
   */
  isRunning(): boolean {
    return this.watcher !== null;
  }

  /**
   * Queue a file change for batch processing
   */
  private queueChange(path: string): void {
    this.changedFiles.add(path);

    // Debounce: wait 1 second after last change before processing
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processBatch();
    }, 1000);
  }

  /**
   * Process batch of changed files
   */
  private async processBatch(): Promise<void> {
    if (this.changedFiles.size === 0) return;

    const files = Array.from(this.changedFiles);
    this.changedFiles.clear();

    console.log(`Processing ${files.length} changed files...`);

    try {
      // Read file contents
      const fileData = files
        .map((path) => {
          try {
            const content = readFileSync(path, "utf-8");
            return { path, content };
          } catch (_error) {
            // File might have been deleted
            return { path, content: "" };
          }
        })
        .filter((f) => f !== null);

      // Run incremental scan
      const result = await this.scanner.scanIncremental(fileData);

      console.log("Incremental scan complete:", {
        changes: result.changes.length,
        nodesAdded: result.stats.nodesAdded,
        nodesUpdated: result.stats.nodesUpdated,
        nodesDeleted: result.stats.nodesDeleted,
      });
    } catch (error) {
      console.error("Failed to process batch:", error);
    }
  }
}
