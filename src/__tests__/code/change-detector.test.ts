import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ChangeDetector } from "../../tools/code/change-detector";

describe("ChangeDetector", () => {
  let db: Database;
  let detector: ChangeDetector;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(":memory:");

    // Create file_hashes table
    db.run(`
			CREATE TABLE IF NOT EXISTS file_hashes (
				path TEXT PRIMARY KEY,
				hash TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			)
		`);

    detector = new ChangeDetector(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("Hash Generation", () => {
    it("should generate deterministic hashes for same content", async () => {
      const files = [{ path: "test.ts", content: "const x = 1;" }];
      const changes1 = await detector.detectChanges(files);

      // Both should have same hash
      expect(changes1[0].newHash).toBeDefined();

      const files2 = [{ path: "test2.ts", content: "const x = 1;" }];
      const changes2 = await detector.detectChanges(files2);

      expect(changes1[0].newHash).toBe(changes2[0].newHash);
    });

    it("should generate different hashes for different content", async () => {
      const files1 = [{ path: "test1.ts", content: "const x = 1;" }];
      const files2 = [{ path: "test2.ts", content: "const x = 2;" }];

      const changes1 = await detector.detectChanges(files1);
      const changes2 = await detector.detectChanges(files2);

      expect(changes1[0].newHash).not.toBe(changes2[0].newHash);
    });
  });

  describe("detectChanges", () => {
    it("should detect added files (no stored hash)", async () => {
      const files = [{ path: "new-file.ts", content: "export const foo = 1;" }];

      const changes = await detector.detectChanges(files);

      expect(changes.length).toBe(1);
      expect(changes[0].type).toBe("added");
      expect(changes[0].path).toBe("new-file.ts");
      expect(changes[0].newHash).toBeDefined();
      expect(changes[0].oldHash).toBeUndefined();
    });

    it("should detect modified files (hash mismatch)", async () => {
      // First, store a hash
      const oldContent = "const x = 1;";
      const files = [{ path: "modified.ts", content: oldContent }];
      const initialChanges = await detector.detectChanges(files);
      await detector.updateHashes(initialChanges);

      // Now modify the content
      const newContent = "const x = 2;";
      const modifiedFiles = [{ path: "modified.ts", content: newContent }];
      const changes = await detector.detectChanges(modifiedFiles);

      expect(changes.length).toBe(1);
      expect(changes[0].type).toBe("modified");
      expect(changes[0].path).toBe("modified.ts");
      expect(changes[0].oldHash).toBe(initialChanges[0].newHash);
      expect(changes[0].newHash).not.toBe(changes[0].oldHash);
    });

    it("should detect deleted files (stored but not in input)", async () => {
      // First, store a hash
      const files = [{ path: "to-delete.ts", content: "const x = 1;" }];
      const initialChanges = await detector.detectChanges(files);
      await detector.updateHashes(initialChanges);

      // Now scan with empty file list
      const changes = await detector.detectChanges([]);

      expect(changes.length).toBe(1);
      expect(changes[0].type).toBe("deleted");
      expect(changes[0].path).toBe("to-delete.ts");
      expect(changes[0].oldHash).toBeDefined();
    });

    it("should ignore unchanged files", async () => {
      const content = "const x = 1;";
      const files = [{ path: "unchanged.ts", content }];

      // Initial scan
      const initialChanges = await detector.detectChanges(files);
      await detector.updateHashes(initialChanges);

      // Second scan with same content
      const changes = await detector.detectChanges(files);

      expect(changes.length).toBe(0);
    });

    it("should handle mixed changes (added, modified, deleted)", async () => {
      // Setup: Create initial state with file1 and file2
      const initialFiles = [
        { path: "file1.ts", content: "content1" },
        { path: "file2.ts", content: "content2" },
      ];
      const initialChanges = await detector.detectChanges(initialFiles);
      await detector.updateHashes(initialChanges);

      // Now: modify file1, add file3, delete file2
      const newFiles = [
        { path: "file1.ts", content: "modified content1" },
        { path: "file3.ts", content: "new content3" },
      ];
      const changes = await detector.detectChanges(newFiles);

      expect(changes.length).toBe(3);

      const modified = changes.find((c) => c.type === "modified");
      const added = changes.find((c) => c.type === "added");
      const deleted = changes.find((c) => c.type === "deleted");

      expect(modified?.path).toBe("file1.ts");
      expect(added?.path).toBe("file3.ts");
      expect(deleted?.path).toBe("file2.ts");
    });
  });

  describe("updateHashes", () => {
    it("should persist hashes for added files", async () => {
      const files = [{ path: "new.ts", content: "const x = 1;" }];
      const changes = await detector.detectChanges(files);
      await detector.updateHashes(changes);

      // Verify hash is stored
      const row = db
        .query("SELECT hash FROM file_hashes WHERE path = ?")
        .get("new.ts") as any;
      expect(row).not.toBeNull();
      expect(row.hash).toBe(changes[0].newHash);
    });

    it("should update hashes for modified files", async () => {
      // Initial
      const files = [{ path: "test.ts", content: "v1" }];
      let changes = await detector.detectChanges(files);
      await detector.updateHashes(changes);
      const oldHash = changes[0].newHash;

      // Modify
      files[0].content = "v2";
      changes = await detector.detectChanges(files);
      await detector.updateHashes(changes);

      // Verify hash is updated
      const row = db
        .query("SELECT hash FROM file_hashes WHERE path = ?")
        .get("test.ts") as any;
      expect(row.hash).not.toBe(oldHash);
      expect(row.hash).toBe(changes[0].newHash);
    });

    it("should remove hashes for deleted files", async () => {
      // Create initial
      const files = [{ path: "delete-me.ts", content: "x" }];
      let changes = await detector.detectChanges(files);
      await detector.updateHashes(changes);

      // Delete
      changes = await detector.detectChanges([]);
      await detector.updateHashes(changes);

      // Verify hash is removed
      const row = db
        .query("SELECT hash FROM file_hashes WHERE path = ?")
        .get("delete-me.ts");
      expect(row).toBeNull();
    });

    it("should handle empty changes array", async () => {
      await detector.updateHashes([]);
      // Should not throw
      const count = db
        .query("SELECT COUNT(*) as count FROM file_hashes")
        .get() as any;
      expect(count.count).toBe(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty file content", async () => {
      const files = [{ path: "empty.ts", content: "" }];
      const changes = await detector.detectChanges(files);

      expect(changes.length).toBe(1);
      expect(changes[0].type).toBe("added");
      expect(changes[0].newHash).toBeDefined();
    });

    it("should handle unicode content", async () => {
      const files = [{ path: "unicode.ts", content: "const emoji = '🚀';" }];
      const changes = await detector.detectChanges(files);

      expect(changes.length).toBe(1);
      expect(changes[0].newHash).toBeDefined();
    });

    it("should handle large content", async () => {
      const largeContent = "x".repeat(100000);
      const files = [{ path: "large.ts", content: largeContent }];
      const changes = await detector.detectChanges(files);

      expect(changes.length).toBe(1);
      expect(changes[0].newHash).toBeDefined();
    });

    it("should handle files with special characters in path", async () => {
      const files = [{ path: "path/with spaces/and-dashes.ts", content: "x" }];
      const changes = await detector.detectChanges(files);
      await detector.updateHashes(changes);

      // Verify path is stored correctly
      const row = db
        .query("SELECT path FROM file_hashes WHERE path = ?")
        .get(files[0].path) as any;
      expect(row.path).toBe(files[0].path);
    });
  });
});
