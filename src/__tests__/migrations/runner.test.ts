/**
 * Tests for the database migration runner
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { MigrationRunner } from "@/migrations/runner";
import type { Migration, MigrationDatabase } from "@/migrations/types";

const TEST_DIR = join(import.meta.dir, ".test-migrations");
const TEST_DB = join(TEST_DIR, "test.db");

describe("MigrationRunner", () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up after each test
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("initialization", () => {
    it("creates database directory if it doesn't exist", () => {
      const nestedPath = join(TEST_DIR, "nested", "path", "test.db");
      const runner = new MigrationRunner(nestedPath, []);
      expect(existsSync(join(TEST_DIR, "nested", "path"))).toBe(true);
      runner.close();
    });

    it("creates meta table on initialization", () => {
      const runner = new MigrationRunner(TEST_DB, []);
      const db = runner.getDatabase();

      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='_doclea_meta'",
        )
        .all();

      expect(tables.length).toBe(1);
      runner.close();
    });

    it("returns null for current version on new database", () => {
      const runner = new MigrationRunner(TEST_DB, []);
      expect(runner.getCurrentVersion()).toBeNull();
      runner.close();
    });
  });

  describe("getLatestVersion", () => {
    it("returns null when no migrations exist", () => {
      const runner = new MigrationRunner(TEST_DB, []);
      expect(runner.getLatestVersion()).toBeNull();
      runner.close();
    });

    it("returns the highest version", () => {
      const migrations: Migration[] = [
        { version: "001", name: "first", up: () => {}, down: () => {} },
        { version: "003", name: "third", up: () => {}, down: () => {} },
        { version: "002", name: "second", up: () => {}, down: () => {} },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);
      expect(runner.getLatestVersion()).toBe("003");
      runner.close();
    });
  });

  describe("getStatus", () => {
    it("shows all migrations as pending initially", () => {
      const migrations: Migration[] = [
        { version: "001", name: "first", up: () => {}, down: () => {} },
        { version: "002", name: "second", up: () => {}, down: () => {} },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      const status = runner.getStatus();
      expect(status.length).toBe(2);
      expect(status[0].status).toBe("pending");
      expect(status[1].status).toBe("pending");
      runner.close();
    });

    it("shows applied migrations after running", async () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "first",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE test1 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE test1");
          },
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      await runner.migrate();

      const status = runner.getStatus();
      expect(status[0].status).toBe("applied");
      expect(status[0].appliedAt).not.toBeNull();
      runner.close();
    });
  });

  describe("migrate", () => {
    it("returns success with no migrations to apply", async () => {
      const runner = new MigrationRunner(TEST_DB, []);
      const result = await runner.migrate();

      expect(result.success).toBe(true);
      expect(result.applied).toEqual([]);
      expect(result.failed).toBeNull();
      runner.close();
    });

    it("applies all pending migrations", async () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "create_users",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE users");
          },
        },
        {
          version: "002",
          name: "create_posts",
          up: (db: MigrationDatabase) => {
            db.exec(
              "CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT)",
            );
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE posts");
          },
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      const result = await runner.migrate();

      expect(result.success).toBe(true);
      expect(result.applied).toEqual(["001", "002"]);
      expect(runner.getCurrentVersion()).toBe("002");

      // Verify tables exist
      const db = runner.getDatabase();
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'posts')",
        )
        .all();
      expect(tables.length).toBe(2);
      runner.close();
    });

    it("applies migrations up to target version", async () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "first",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t1 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t1");
          },
        },
        {
          version: "002",
          name: "second",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t2 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t2");
          },
        },
        {
          version: "003",
          name: "third",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t3 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t3");
          },
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      const result = await runner.migrate({ targetVersion: "002" });

      expect(result.success).toBe(true);
      expect(result.applied).toEqual(["001", "002"]);
      expect(runner.getCurrentVersion()).toBe("002");

      // Verify t3 doesn't exist
      const db = runner.getDatabase();
      const t3 = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='t3'",
        )
        .get();
      expect(t3).toBeFalsy();
      runner.close();
    });

    it("skips already applied migrations", async () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "first",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t1 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t1");
          },
        },
        {
          version: "002",
          name: "second",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t2 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t2");
          },
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      // First migration run
      await runner.migrate({ targetVersion: "001" });
      expect(runner.getCurrentVersion()).toBe("001");

      // Second migration run - should only apply 002
      const result = await runner.migrate();
      expect(result.success).toBe(true);
      expect(result.applied).toEqual(["002"]);
      expect(runner.getCurrentVersion()).toBe("002");
      runner.close();
    });

    it("rolls back on failure", async () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "first",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t1 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t1");
          },
        },
        {
          version: "002",
          name: "failing",
          up: () => {
            throw new Error("Migration failed");
          },
          down: () => {},
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      const result = await runner.migrate();

      expect(result.success).toBe(false);
      expect(result.applied).toEqual(["001"]);
      expect(result.failed).toBe("002");
      expect(result.error).toBe("Migration failed");
      expect(runner.getCurrentVersion()).toBe("001");
      runner.close();
    });

    it("supports dry run mode", async () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "first",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t1 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t1");
          },
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      const result = await runner.migrate({ dryRun: true });

      expect(result.success).toBe(true);
      expect(result.applied).toEqual(["001"]);

      // Table should NOT exist
      const db = runner.getDatabase();
      const t1 = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='t1'",
        )
        .get();
      expect(t1).toBeFalsy();

      // Version should NOT be updated
      expect(runner.getCurrentVersion()).toBeNull();
      runner.close();
    });
  });

  describe("rollback", () => {
    it("rolls back to target version", async () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "first",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t1 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t1");
          },
        },
        {
          version: "002",
          name: "second",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t2 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t2");
          },
        },
        {
          version: "003",
          name: "third",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t3 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t3");
          },
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      // Apply all migrations
      await runner.migrate();
      expect(runner.getCurrentVersion()).toBe("003");

      // Rollback to 001
      const result = await runner.rollback("001");

      expect(result.success).toBe(true);
      expect(result.applied).toEqual(["003", "002"]);

      // t2 and t3 should be gone
      const db = runner.getDatabase();
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('t1', 't2', 't3')",
        )
        .all() as Array<{ name: string }>;

      expect(tables.length).toBe(1);
      expect(tables[0].name).toBe("t1");
      runner.close();
    });

    it("rollback to 0 removes all tables", async () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "first",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t1 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t1");
          },
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      await runner.migrate();
      const result = await runner.rollback("0");

      expect(result.success).toBe(true);
      expect(result.applied).toEqual(["001"]);

      // t1 should be gone
      const db = runner.getDatabase();
      const t1 = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='t1'",
        )
        .get();
      expect(t1).toBeFalsy();
      runner.close();
    });

    it("returns success when already at target version", async () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "first",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t1 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t1");
          },
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      await runner.migrate();
      const result = await runner.rollback("001");

      expect(result.success).toBe(true);
      expect(result.applied).toEqual([]);
      runner.close();
    });
  });

  describe("backup", () => {
    it("creates backup before destructive migrations", async () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "destructive",
          destructive: true,
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t1 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t1");
          },
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      const result = await runner.migrate();

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(existsSync(result.backupPath!)).toBe(true);
      runner.close();
    });

    it("skips backup for non-destructive migrations", async () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "safe",
          destructive: false,
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t1 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t1");
          },
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      const result = await runner.migrate();

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeUndefined();
      runner.close();
    });

    it("skips backup when backup option is false", async () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "destructive",
          destructive: true,
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t1 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t1");
          },
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      const result = await runner.migrate({ backup: false });

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeUndefined();
      runner.close();
    });

    it("creates backup before rollback", async () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "first",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t1 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t1");
          },
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      await runner.migrate();
      const result = await runner.rollback("0");

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(existsSync(result.backupPath!)).toBe(true);
      runner.close();
    });
  });

  describe("MigrationDatabase interface", () => {
    it("run executes parameterized queries", async () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "test_run",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE test (id INTEGER, name TEXT)");
            db.run("INSERT INTO test (id, name) VALUES (?, ?)", 1, "Alice");
            db.run("INSERT INTO test (id, name) VALUES (?, ?)", 2, "Bob");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE test");
          },
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      await runner.migrate();

      const db = runner.getDatabase();
      const rows = db.prepare("SELECT * FROM test ORDER BY id").all() as Array<{
        id: number;
        name: string;
      }>;

      expect(rows.length).toBe(2);
      expect(rows[0].name).toBe("Alice");
      expect(rows[1].name).toBe("Bob");
      runner.close();
    });

    it("query returns rows", async () => {
      let queryResult: Array<{ count: number }> = [];

      const migrations: Migration[] = [
        {
          version: "001",
          name: "setup",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE test (id INTEGER)");
            db.run("INSERT INTO test (id) VALUES (?)", 1);
            db.run("INSERT INTO test (id) VALUES (?)", 2);
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE test");
          },
        },
        {
          version: "002",
          name: "query_test",
          up: (db: MigrationDatabase) => {
            queryResult = db.query<{ count: number }>(
              "SELECT COUNT(*) as count FROM test",
            );
          },
          down: () => {},
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      await runner.migrate();

      expect(queryResult.length).toBe(1);
      expect(queryResult[0].count).toBe(2);
      runner.close();
    });

    it("get returns single row", async () => {
      let getResult: { name: string } | undefined;

      const migrations: Migration[] = [
        {
          version: "001",
          name: "setup",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE test (id INTEGER, name TEXT)");
            db.run("INSERT INTO test (id, name) VALUES (?, ?)", 1, "Test");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE test");
          },
        },
        {
          version: "002",
          name: "get_test",
          up: (db: MigrationDatabase) => {
            getResult = db.get<{ name: string }>(
              "SELECT name FROM test WHERE id = ?",
              1,
            );
          },
          down: () => {},
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      await runner.migrate();

      expect(getResult).toBeDefined();
      expect(getResult?.name).toBe("Test");
      runner.close();
    });
  });

  describe("hasDestructivePending", () => {
    it("returns true when destructive migration is pending", () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "safe",
          destructive: false,
          up: () => {},
          down: () => {},
        },
        {
          version: "002",
          name: "destructive",
          destructive: true,
          up: () => {},
          down: () => {},
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      expect(runner.hasDestructivePending()).toBe(true);
      runner.close();
    });

    it("returns false when no destructive migrations are pending", () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "safe",
          destructive: false,
          up: () => {},
          down: () => {},
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      expect(runner.hasDestructivePending()).toBe(false);
      runner.close();
    });
  });

  describe("getPendingMigrations", () => {
    it("returns all migrations for new database", () => {
      const migrations: Migration[] = [
        { version: "001", name: "first", up: () => {}, down: () => {} },
        { version: "002", name: "second", up: () => {}, down: () => {} },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      const pending = runner.getPendingMigrations();
      expect(pending.length).toBe(2);
      expect(pending[0].version).toBe("001");
      expect(pending[1].version).toBe("002");
      runner.close();
    });

    it("excludes applied migrations", async () => {
      const migrations: Migration[] = [
        {
          version: "001",
          name: "first",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t1 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t1");
          },
        },
        {
          version: "002",
          name: "second",
          up: (db: MigrationDatabase) => {
            db.exec("CREATE TABLE t2 (id INTEGER)");
          },
          down: (db: MigrationDatabase) => {
            db.exec("DROP TABLE t2");
          },
        },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      await runner.migrate({ targetVersion: "001" });

      const pending = runner.getPendingMigrations();
      expect(pending.length).toBe(1);
      expect(pending[0].version).toBe("002");
      runner.close();
    });

    it("respects target version", () => {
      const migrations: Migration[] = [
        { version: "001", name: "first", up: () => {}, down: () => {} },
        { version: "002", name: "second", up: () => {}, down: () => {} },
        { version: "003", name: "third", up: () => {}, down: () => {} },
      ];
      const runner = new MigrationRunner(TEST_DB, migrations);

      const pending = runner.getPendingMigrations("002");
      expect(pending.length).toBe(2);
      expect(pending[0].version).toBe("001");
      expect(pending[1].version).toBe("002");
      runner.close();
    });
  });
});
