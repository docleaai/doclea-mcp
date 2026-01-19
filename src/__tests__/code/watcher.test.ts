import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { CodeGraphStorage } from "../../database/code-graph";
import { ChangeDetector } from "../../tools/code/change-detector";
import { IncrementalScanner } from "../../tools/code/incremental-scanner";
import { CodeWatcher } from "../../tools/code/watcher";

describe("CodeWatcher", () => {
  let db: Database;
  let codeGraph: CodeGraphStorage;
  let changeDetector: ChangeDetector;
  let scanner: IncrementalScanner;
  let watcher: CodeWatcher;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(":memory:");

    // Create schema
    db.run(`
			CREATE TABLE IF NOT EXISTS code_nodes (
				id TEXT PRIMARY KEY,
				type TEXT NOT NULL,
				name TEXT NOT NULL,
				file_path TEXT NOT NULL,
				start_line INTEGER,
				end_line INTEGER,
				signature TEXT,
				summary TEXT,
				metadata TEXT DEFAULT '{}',
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			)
		`);

    db.run(`
			CREATE TABLE IF NOT EXISTS code_edges (
				id TEXT PRIMARY KEY,
				from_node TEXT NOT NULL,
				to_node TEXT NOT NULL,
				edge_type TEXT NOT NULL,
				metadata TEXT,
				created_at INTEGER NOT NULL,
				UNIQUE(from_node, to_node, edge_type)
			)
		`);

    db.run(`
			CREATE TABLE IF NOT EXISTS file_hashes (
				path TEXT PRIMARY KEY,
				hash TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			)
		`);

    codeGraph = new CodeGraphStorage(db);
    changeDetector = new ChangeDetector(db);
    scanner = new IncrementalScanner(changeDetector, codeGraph);
    watcher = new CodeWatcher(scanner);
  });

  afterEach(async () => {
    // Clean up watcher
    if (watcher.isRunning()) {
      await watcher.stop();
    }
    db.close();
  });

  describe("isRunning", () => {
    it("should return false initially", () => {
      expect(watcher.isRunning()).toBe(false);
    });

    it("should return true after start", async () => {
      await watcher.start();
      expect(watcher.isRunning()).toBe(true);
    });

    it("should return false after stop", async () => {
      await watcher.start();
      await watcher.stop();
      expect(watcher.isRunning()).toBe(false);
    });
  });

  describe("start", () => {
    it("should start the watcher with default patterns", async () => {
      await watcher.start();
      expect(watcher.isRunning()).toBe(true);
    });

    it("should start the watcher with custom patterns", async () => {
      await watcher.start({
        patterns: ["**/*.ts"],
        exclude: ["**/node_modules/**"],
      });
      expect(watcher.isRunning()).toBe(true);
    });

    it("should not start twice", async () => {
      await watcher.start();
      const firstState = watcher.isRunning();

      await watcher.start(); // Try starting again
      const secondState = watcher.isRunning();

      expect(firstState).toBe(true);
      expect(secondState).toBe(true);
    });
  });

  describe("stop", () => {
    it("should stop the watcher", async () => {
      await watcher.start();
      await watcher.stop();
      expect(watcher.isRunning()).toBe(false);
    });

    it("should be safe to call stop when not running", async () => {
      await watcher.stop(); // Should not throw
      expect(watcher.isRunning()).toBe(false);
    });

    it("should be safe to stop multiple times", async () => {
      await watcher.start();
      await watcher.stop();
      await watcher.stop(); // Should not throw
      expect(watcher.isRunning()).toBe(false);
    });
  });

  describe("restart behavior", () => {
    it("should allow restart after stop", async () => {
      await watcher.start();
      expect(watcher.isRunning()).toBe(true);

      await watcher.stop();
      expect(watcher.isRunning()).toBe(false);

      await watcher.start();
      expect(watcher.isRunning()).toBe(true);
    });
  });

  describe("scanner integration", () => {
    it("should be constructed with a scanner", () => {
      // Just verify construction works
      const newWatcher = new CodeWatcher(scanner);
      expect(newWatcher).toBeDefined();
      expect(newWatcher.isRunning()).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should clean up resources when stopped", async () => {
      await watcher.start();

      // Simulate some internal state
      // (the watcher tracks changed files internally)

      await watcher.stop();

      // After stop, watcher should be in clean state
      expect(watcher.isRunning()).toBe(false);
    });
  });
});

// Note: Testing actual file watching behavior with debouncing would require
// either mocking chokidar or creating actual files on disk with timing.
// The above tests verify the basic API contract of the CodeWatcher.
