import type { Database } from "bun:sqlite";
import type { FileChange } from "./types";

/**
 * Detects file changes using SHA-256 content hashing
 */
export class ChangeDetector {
  constructor(private db: Database) {}

  /**
   * Detect changes across a set of files
   * Returns added, modified, and deleted files
   */
  async detectChanges(
    files: Array<{ path: string; content: string }>,
    options: { detectDeleted?: boolean } = {},
  ): Promise<FileChange[]> {
    const changes: FileChange[] = [];
    const detectDeleted = options.detectDeleted ?? true;

    // Check each current file
    for (const file of files) {
      const newHash = await this.hashContent(file.content);
      const stored = await this.getStoredHash(file.path);

      if (!stored) {
        // New file
        changes.push({
          path: file.path,
          type: "added",
          newHash,
        });
      } else if (stored.hash !== newHash) {
        // Modified file
        changes.push({
          path: file.path,
          type: "modified",
          oldHash: stored.hash,
          newHash,
        });
      }
      // Unchanged files are skipped
    }

    if (detectDeleted) {
      // Find deleted files
      const allStored = await this.getAllStoredPaths();
      const currentPaths = new Set(files.map((f) => f.path));

      for (const storedPath of allStored) {
        if (!currentPaths.has(storedPath)) {
          const stored = await this.getStoredHash(storedPath);
          changes.push({
            path: storedPath,
            type: "deleted",
            oldHash: stored?.hash,
          });
        }
      }
    }

    return changes;
  }

  /**
   * Update file hashes in database
   */
  async updateHashes(changes: FileChange[]): Promise<void> {
    for (const change of changes) {
      if (change.type === "deleted") {
        await this.db
          .query("DELETE FROM file_hashes WHERE path = ?")
          .run(change.path);
      } else {
        await this.db
          .query(
            `INSERT INTO file_hashes (path, hash, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(path) DO UPDATE SET
               hash = excluded.hash,
               updated_at = excluded.updated_at`,
          )
          .run(change.path, change.newHash ?? "", Date.now());
      }
    }
  }

  /**
   * Compute SHA-256 hash of content
   */
  private async hashContent(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Get stored hash for a file path
   */
  private async getStoredHash(path: string): Promise<{ hash: string } | null> {
    const row = this.db
      .query("SELECT hash FROM file_hashes WHERE path = ?")
      .get(path) as any;
    return row || null;
  }

  /**
   * Get all stored file paths
   */
  private async getAllStoredPaths(): Promise<string[]> {
    const rows = this.db.query("SELECT path FROM file_hashes").all() as any[];
    return rows.map((r) => r.path);
  }
}
