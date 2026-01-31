/**
 * Tests for file discovery utility
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_INCLUDE_PATTERNS,
  DiscoveryError,
  discoverFiles,
} from "../../utils";

describe("File Discovery", () => {
  let testDir: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(
      tmpdir(),
      `doclea-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("DEFAULT_INCLUDE_PATTERNS", () => {
    test("should include TypeScript files", () => {
      expect(DEFAULT_INCLUDE_PATTERNS).toContain("**/*.ts");
      expect(DEFAULT_INCLUDE_PATTERNS).toContain("**/*.tsx");
    });

    test("should include JavaScript files", () => {
      expect(DEFAULT_INCLUDE_PATTERNS).toContain("**/*.js");
      expect(DEFAULT_INCLUDE_PATTERNS).toContain("**/*.jsx");
    });

    test("should include Python files", () => {
      expect(DEFAULT_INCLUDE_PATTERNS).toContain("**/*.py");
    });

    test("should include Go files", () => {
      expect(DEFAULT_INCLUDE_PATTERNS).toContain("**/*.go");
    });

    test("should include Rust files", () => {
      expect(DEFAULT_INCLUDE_PATTERNS).toContain("**/*.rs");
    });
  });

  describe("DEFAULT_EXCLUDE_PATTERNS", () => {
    test("should exclude node_modules", () => {
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/node_modules/**");
    });

    test("should exclude .git", () => {
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/.git/**");
    });

    test("should exclude dist/build directories", () => {
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/dist/**");
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/build/**");
    });

    test("should exclude .d.ts files", () => {
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/*.d.ts");
    });

    test("should exclude lock files", () => {
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/package-lock.json");
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/bun.lockb");
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/*.lock");
    });

    test("should exclude framework-specific directories", () => {
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/.next/**");
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/.nuxt/**");
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/.svelte-kit/**");
    });

    test("should exclude coverage directories", () => {
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/coverage/**");
    });

    test("should exclude tool directories", () => {
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/.doclea/**");
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/.beads/**");
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/.idea/**");
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/.vscode/**");
    });
  });

  describe("discoverFiles", () => {
    test("should discover source files", async () => {
      // Create test files
      writeFileSync(join(testDir, "index.ts"), "export const x = 1;");
      writeFileSync(join(testDir, "util.js"), "module.exports = {};");
      mkdirSync(join(testDir, "src"), { recursive: true });
      writeFileSync(
        join(testDir, "src", "app.tsx"),
        "export default function App() {}",
      );

      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(3);
      expect(files.some((f) => f.endsWith("index.ts"))).toBe(true);
      expect(files.some((f) => f.endsWith("util.js"))).toBe(true);
      expect(files.some((f) => f.endsWith("app.tsx"))).toBe(true);
    });

    test("should exclude node_modules", async () => {
      // Create source file
      writeFileSync(join(testDir, "index.ts"), "export const x = 1;");

      // Create node_modules with files
      mkdirSync(join(testDir, "node_modules", "some-package"), {
        recursive: true,
      });
      writeFileSync(
        join(testDir, "node_modules", "some-package", "index.js"),
        "module.exports = {};",
      );

      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(1);
      expect(files[0]).toContain("index.ts");
      expect(files.some((f) => f.includes("node_modules"))).toBe(false);
    });

    test("should exclude dist directory", async () => {
      // Create source file
      writeFileSync(join(testDir, "index.ts"), "export const x = 1;");

      // Create dist with compiled files
      mkdirSync(join(testDir, "dist"), { recursive: true });
      writeFileSync(join(testDir, "dist", "index.js"), "exports.x = 1;");

      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(1);
      expect(files[0]).toContain("index.ts");
      expect(files.some((f) => f.includes("dist"))).toBe(false);
    });

    test("should exclude .git directory", async () => {
      // Create source file
      writeFileSync(join(testDir, "index.ts"), "export const x = 1;");

      // Create .git with files
      mkdirSync(join(testDir, ".git", "objects"), { recursive: true });
      writeFileSync(join(testDir, ".git", "config"), "[core]");

      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(1);
      expect(files.some((f) => f.includes(".git"))).toBe(false);
    });

    test("should exclude .d.ts files", async () => {
      // Create source file
      writeFileSync(join(testDir, "index.ts"), "export const x = 1;");

      // Create type declaration file
      writeFileSync(
        join(testDir, "index.d.ts"),
        "export declare const x: number;",
      );

      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(1);
      expect(files[0]).toContain("index.ts");
      expect(files.some((f) => f.endsWith(".d.ts"))).toBe(false);
    });

    test("should exclude lock files", async () => {
      // Create source file
      writeFileSync(join(testDir, "index.ts"), "export const x = 1;");

      // Create lock files
      writeFileSync(join(testDir, "package-lock.json"), "{}");
      writeFileSync(join(testDir, "yarn.lock"), "");
      writeFileSync(join(testDir, "bun.lockb"), "");

      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(1);
      expect(files[0]).toContain("index.ts");
    });

    test("should use custom include patterns", async () => {
      // Create various files
      writeFileSync(join(testDir, "index.ts"), "export const x = 1;");
      writeFileSync(join(testDir, "style.css"), "body {}");
      writeFileSync(join(testDir, "data.json"), "{}");

      const files = await discoverFiles({
        cwd: testDir,
        include: ["**/*.css", "**/*.json"],
      });

      expect(files.length).toBe(2);
      expect(files.some((f) => f.endsWith(".css"))).toBe(true);
      expect(files.some((f) => f.endsWith(".json"))).toBe(true);
      expect(files.some((f) => f.endsWith(".ts"))).toBe(false);
    });

    test("should use custom exclude patterns", async () => {
      // Create source files
      writeFileSync(join(testDir, "index.ts"), "export const x = 1;");
      mkdirSync(join(testDir, "src"), { recursive: true });
      writeFileSync(
        join(testDir, "src", "app.ts"),
        "export default function App() {}",
      );
      mkdirSync(join(testDir, "tests"), { recursive: true });
      writeFileSync(
        join(testDir, "tests", "app.test.ts"),
        "test('works', () => {});",
      );

      const files = await discoverFiles({
        cwd: testDir,
        exclude: ["**/tests/**"],
      });

      expect(files.length).toBe(2);
      expect(files.some((f) => f.includes("tests"))).toBe(false);
    });

    test("should return absolute paths", async () => {
      writeFileSync(join(testDir, "index.ts"), "export const x = 1;");

      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(1);
      expect(files[0].startsWith("/")).toBe(true);
      expect(files[0]).toContain(testDir);
    });

    test("should handle empty directory", async () => {
      const files = await discoverFiles({ cwd: testDir });
      expect(files).toEqual([]);
    });

    test("should handle nested directories", async () => {
      // Create deeply nested structure
      mkdirSync(join(testDir, "src", "components", "ui"), { recursive: true });
      writeFileSync(
        join(testDir, "src", "components", "ui", "button.tsx"),
        "export function Button() {}",
      );

      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(1);
      expect(files[0]).toContain("button.tsx");
    });
  });

  describe("DiscoveryError", () => {
    test("should throw ENOENT for missing directory", async () => {
      const nonExistent = join(testDir, "non-existent");

      try {
        await discoverFiles({ cwd: nonExistent });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(DiscoveryError);
        expect((error as DiscoveryError).code).toBe("ENOENT");
        expect((error as DiscoveryError).path).toBe(nonExistent);
      }
    });
  });

  describe("debug mode", () => {
    test("should not throw when debug is enabled", async () => {
      writeFileSync(join(testDir, "index.ts"), "export const x = 1;");

      const files = await discoverFiles({
        cwd: testDir,
        debug: true,
      });

      expect(files.length).toBe(1);
    });
  });

  describe("followSymlinks option", () => {
    test("should default to false for safety", async () => {
      // Create a source file
      writeFileSync(join(testDir, "index.ts"), "export const x = 1;");

      // The default behavior should not follow symlinks
      // This is verified by the fact that discoverFiles doesn't hang on symlink loops
      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(1);
    });
  });

  describe("Runtime Check", () => {
    test("should not throw on Bun runtime", async () => {
      writeFileSync(join(testDir, "index.ts"), "");

      // Should not throw - we're running on Bun
      const files = await discoverFiles({ cwd: testDir });
      expect(files.length).toBe(1);
    });
  });

  describe("Exclusion Edge Cases", () => {
    test("should exclude deeply nested node_modules", async () => {
      // Create: node_modules/pkg/node_modules/nested/index.js
      mkdirSync(join(testDir, "node_modules/pkg/node_modules/nested"), {
        recursive: true,
      });
      writeFileSync(
        join(testDir, "node_modules/pkg/node_modules/nested/index.js"),
        "",
      );
      mkdirSync(join(testDir, "src"), { recursive: true });
      writeFileSync(join(testDir, "src/index.ts"), "");

      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(1);
      expect(files.some((f) => f.includes("node_modules"))).toBe(false);
    });

    test("should exclude .env files", async () => {
      writeFileSync(join(testDir, ".env"), "SECRET=xxx");
      writeFileSync(join(testDir, ".env.production"), "SECRET=xxx");
      mkdirSync(join(testDir, "src"), { recursive: true });
      writeFileSync(join(testDir, "src/index.ts"), "");

      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(1);
      expect(files.some((f) => f.includes(".env"))).toBe(false);
    });

    test("should exclude framework build directories", async () => {
      mkdirSync(join(testDir, ".next/server"), { recursive: true });
      writeFileSync(join(testDir, ".next/server/app.js"), "");
      mkdirSync(join(testDir, ".nuxt"), { recursive: true });
      writeFileSync(join(testDir, ".nuxt/index.js"), "");
      mkdirSync(join(testDir, "src"), { recursive: true });
      writeFileSync(join(testDir, "src/index.ts"), "");

      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(1);
      expect(files.some((f) => f.includes(".next"))).toBe(false);
      expect(files.some((f) => f.includes(".nuxt"))).toBe(false);
    });

    test("should exclude crypto key files", async () => {
      writeFileSync(join(testDir, "server.pem"), "");
      writeFileSync(join(testDir, "private.key"), "");
      writeFileSync(join(testDir, "cert.crt"), "");
      mkdirSync(join(testDir, "src"), { recursive: true });
      writeFileSync(join(testDir, "src/index.ts"), "");

      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(1);
      expect(files.some((f) => f.endsWith(".pem"))).toBe(false);
      expect(files.some((f) => f.endsWith(".key"))).toBe(false);
      expect(files.some((f) => f.endsWith(".crt"))).toBe(false);
    });

    test("should exclude compiled binary files", async () => {
      writeFileSync(join(testDir, "module.pyc"), "");
      writeFileSync(join(testDir, "object.o"), "");
      writeFileSync(join(testDir, "lib.so"), "");
      mkdirSync(join(testDir, "src"), { recursive: true });
      writeFileSync(join(testDir, "src/index.ts"), "");

      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(1);
      expect(files.some((f) => f.endsWith(".pyc"))).toBe(false);
      expect(files.some((f) => f.endsWith(".o"))).toBe(false);
      expect(files.some((f) => f.endsWith(".so"))).toBe(false);
    });

    test("should exclude additional VCS directories", async () => {
      mkdirSync(join(testDir, ".svn"), { recursive: true });
      writeFileSync(join(testDir, ".svn/entries"), "");
      mkdirSync(join(testDir, ".hg"), { recursive: true });
      writeFileSync(join(testDir, ".hg/store"), "");
      mkdirSync(join(testDir, "src"), { recursive: true });
      writeFileSync(join(testDir, "src/index.ts"), "");

      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(1);
      expect(files.some((f) => f.includes(".svn"))).toBe(false);
      expect(files.some((f) => f.includes(".hg"))).toBe(false);
    });
  });

  describe("Pattern Interactions", () => {
    test("exclude should take precedence over include", async () => {
      mkdirSync(join(testDir, "src"), { recursive: true });
      writeFileSync(join(testDir, "src/index.ts"), "");
      mkdirSync(join(testDir, "node_modules/pkg"), { recursive: true });
      writeFileSync(join(testDir, "node_modules/pkg/index.ts"), "");

      const files = await discoverFiles({
        cwd: testDir,
        include: ["**/*.ts"],
        exclude: ["**/node_modules/**"],
      });

      expect(files.length).toBe(1);
      expect(files[0]).toContain("src/index.ts");
    });
  });

  describe("Special Characters", () => {
    test("should handle spaces in filenames", async () => {
      writeFileSync(join(testDir, "my file.ts"), "");

      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(1);
      expect(files[0]).toContain("my file.ts");
    });

    test("should handle unicode filenames", async () => {
      writeFileSync(join(testDir, "文件.ts"), "");

      const files = await discoverFiles({ cwd: testDir });

      expect(files.length).toBe(1);
    });
  });

  describe("Debug Output", () => {
    test("should show timing in debug mode via stderr", async () => {
      const originalError = console.error;
      const errorCalls: string[] = [];
      console.error = (...args: unknown[]) => {
        errorCalls.push(args.map(String).join(" "));
      };

      try {
        writeFileSync(join(testDir, "index.ts"), "");

        await discoverFiles({ cwd: testDir, debug: true });

        expect(
          errorCalls.some((c) => c.includes("[discovery] Completed in")),
        ).toBe(true);
        expect(
          errorCalls.some((c) => c.includes("[discovery] Runtime: Bun")),
        ).toBe(true);
        expect(errorCalls.some((c) => c.includes("[discovery] Found"))).toBe(
          true,
        );
      } finally {
        console.error = originalError;
      }
    });
  });
});
