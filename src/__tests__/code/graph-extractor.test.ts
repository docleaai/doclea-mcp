import { beforeAll, describe, expect, it } from "bun:test";
import type {
  CodeChunk,
  CodeChunkMetadata,
  SupportedLanguage,
} from "../../chunking/code";
import { GraphExtractor } from "../../tools/code/graph-extractor";

/**
 * Create CodeChunkMetadata with default values for tests
 */
function createTestMetadata(
  overrides: Partial<CodeChunkMetadata> & { language: SupportedLanguage },
): CodeChunkMetadata {
  return {
    startLine: 1,
    endLine: 10,
    startByte: 0,
    endByte: 100,
    nodeType: overrides.isFunction
      ? "function_declaration"
      : overrides.isClass
        ? "class_declaration"
        : overrides.isImport
          ? "import_statement"
          : "unknown",
    name: null,
    parentName: null,
    isFunction: false,
    isClass: false,
    isImport: false,
    ...overrides,
  };
}

describe("GraphExtractor", () => {
  let extractor: GraphExtractor;

  beforeAll(async () => {
    extractor = new GraphExtractor();
    await extractor.init();
  });

  describe("parseImportStatements", () => {
    describe("TypeScript/JavaScript", () => {
      it("should parse named imports", () => {
        const code = `import { foo, bar } from 'module';`;
        const imports = extractor.parseImportStatements(code, "typescript");

        expect(imports.length).toBe(1);
        expect(imports[0].source).toBe("module");
        expect(imports[0].symbols).toEqual(["foo", "bar"]);
        expect(imports[0].isDefault).toBe(false);
        expect(imports[0].isNamespace).toBe(false);
      });

      it("should parse default imports", () => {
        const code = `import DefaultModule from 'module';`;
        const imports = extractor.parseImportStatements(code, "typescript");

        expect(imports.length).toBe(1);
        expect(imports[0].source).toBe("module");
        expect(imports[0].symbols).toEqual(["DefaultModule"]);
        expect(imports[0].isDefault).toBe(true);
      });

      it("should parse namespace imports", () => {
        const code = `import * as ns from 'module';`;
        const imports = extractor.parseImportStatements(code, "typescript");

        expect(imports.length).toBe(1);
        expect(imports[0].source).toBe("module");
        expect(imports[0].symbols).toEqual(["ns"]);
        expect(imports[0].isNamespace).toBe(true);
      });

      it("should parse side-effect imports", () => {
        const code = `import 'polyfill';`;
        const imports = extractor.parseImportStatements(code, "typescript");

        expect(imports.length).toBe(1);
        expect(imports[0].source).toBe("polyfill");
        expect(imports[0].symbols).toEqual([]);
      });

      it("should parse require statements", () => {
        const code = `const { readFile } = require('fs');`;
        const imports = extractor.parseImportStatements(code, "javascript");

        expect(imports.length).toBe(1);
        expect(imports[0].source).toBe("fs");
        expect(imports[0].symbols).toContain("readFile");
      });

      it("should handle imports with 'as' aliases", () => {
        const code = `import { foo as bar, baz as qux } from 'module';`;
        const imports = extractor.parseImportStatements(code, "typescript");

        expect(imports.length).toBe(1);
        expect(imports[0].symbols).toContain("foo");
        expect(imports[0].symbols).toContain("baz");
      });

      it("should parse multiple imports", () => {
        const code = `
import { a } from 'mod1';
import b from 'mod2';
import * as c from 'mod3';
				`.trim();
        const imports = extractor.parseImportStatements(code, "typescript");

        expect(imports.length).toBe(3);
        expect(imports.map((i) => i.source)).toEqual(["mod1", "mod2", "mod3"]);
      });
    });

    describe("Python", () => {
      it("should parse from...import statements", () => {
        const code = `from os.path import join, exists`;
        const imports = extractor.parseImportStatements(code, "python");

        expect(imports.length).toBe(1);
        expect(imports[0].source).toBe("os.path");
        expect(imports[0].symbols).toEqual(["join", "exists"]);
      });

      it("should parse simple import statements", () => {
        const code = `import os`;
        const imports = extractor.parseImportStatements(code, "python");

        expect(imports.length).toBe(1);
        expect(imports[0].source).toBe("os");
        expect(imports[0].isNamespace).toBe(true);
      });
    });

    describe("Go", () => {
      it("should parse single import", () => {
        const code = `import "fmt"`;
        const imports = extractor.parseImportStatements(code, "go");

        expect(imports.length).toBe(1);
        expect(imports[0].source).toBe("fmt");
      });

      it("should parse grouped imports", () => {
        const code = `
import (
	"fmt"
	"os"
)
				`.trim();
        const imports = extractor.parseImportStatements(code, "go");

        expect(imports.length).toBe(2);
        expect(imports.map((i) => i.source)).toContain("fmt");
        expect(imports.map((i) => i.source)).toContain("os");
      });

      it("should parse aliased imports", () => {
        const code = `
import (
	f "fmt"
)
				`.trim();
        const imports = extractor.parseImportStatements(code, "go");

        expect(imports.length).toBe(1);
        expect(imports[0].source).toBe("fmt");
        expect(imports[0].symbols).toContain("f");
      });
    });

    describe("Rust", () => {
      it("should parse use statements", () => {
        const code = `use std::collections::HashMap;`;
        const imports = extractor.parseImportStatements(code, "rust");

        expect(imports.length).toBe(1);
        expect(imports[0].source).toBe("std::collections::HashMap");
      });

      it("should parse grouped use statements", () => {
        const code = `use std::collections::{HashMap, HashSet};`;
        const imports = extractor.parseImportStatements(code, "rust");

        expect(imports.length).toBe(1);
        expect(imports[0].symbols).toContain("HashMap");
        expect(imports[0].symbols).toContain("HashSet");
      });
    });
  });

  describe("isNpmPackage", () => {
    it("should identify npm packages", () => {
      expect(extractor.isNpmPackage("lodash")).toBe(true);
      expect(extractor.isNpmPackage("@types/node")).toBe(true);
      expect(extractor.isNpmPackage("express")).toBe(true);
    });

    it("should not identify relative imports as npm packages", () => {
      expect(extractor.isNpmPackage("./utils")).toBe(false);
      expect(extractor.isNpmPackage("../lib/helper")).toBe(false);
      expect(extractor.isNpmPackage("./index")).toBe(false);
    });

    it("should not identify absolute imports as npm packages", () => {
      expect(extractor.isNpmPackage("/home/user/file")).toBe(false);
    });

    it("should not identify project aliases as npm packages", () => {
      expect(extractor.isNpmPackage("@/components/Button")).toBe(false);
      expect(extractor.isNpmPackage("src/utils")).toBe(false);
    });
  });

  describe("resolveImportPath", () => {
    it("should resolve relative imports", () => {
      const resolved = extractor.resolveImportPath(
        "/home/project/src/app.ts",
        "./utils",
      );

      expect(resolved).toContain("/home/project/src/utils");
      expect(resolved).toContain(":module");
    });

    it("should resolve parent directory imports", () => {
      const resolved = extractor.resolveImportPath(
        "/home/project/src/components/Button.tsx",
        "../utils",
      );

      expect(resolved).toContain("/home/project/src/utils");
    });

    it("should return null for npm packages", () => {
      const resolved = extractor.resolveImportPath(
        "/home/project/src/app.ts",
        "lodash",
      );

      expect(resolved).toBeNull();
    });
  });

  describe("extractFromChunk", () => {
    it("should extract function node from function chunk", async () => {
      const chunk: CodeChunk = {
        content: `export function myFunction(a: number): number {
  return a * 2;
}`,
        tokenCount: 20,
        metadata: createTestMetadata({
          language: "typescript",
          isFunction: true,
          isClass: false,
          isImport: false,
          nodeType: "function_declaration",
          name: "myFunction",
          startLine: 1,
          endLine: 3,
        }),
      };

      const result = await extractor.extractFromChunk(
        chunk,
        "/home/project/src/math.ts",
      );

      expect(result.nodes.length).toBe(1);
      expect(result.nodes[0].type).toBe("function");
      expect(result.nodes[0].name).toBe("myFunction");
      expect(result.nodes[0].metadata.isExported).toBe(true);
    });

    it("should extract class node from class chunk", async () => {
      const chunk: CodeChunk = {
        content: `export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
}`,
        tokenCount: 30,
        metadata: createTestMetadata({
          language: "typescript",
          isFunction: false,
          isClass: true,
          isImport: false,
          nodeType: "class_declaration",
          name: "Calculator",
          startLine: 1,
          endLine: 5,
        }),
      };

      const result = await extractor.extractFromChunk(
        chunk,
        "/home/project/src/calculator.ts",
      );

      expect(result.nodes.length).toBe(1);
      expect(result.nodes[0].type).toBe("class");
      expect(result.nodes[0].name).toBe("Calculator");
    });

    it("should not extract node from import chunk", async () => {
      const chunk: CodeChunk = {
        content: `import { foo } from 'bar';`,
        tokenCount: 5,
        metadata: createTestMetadata({
          language: "typescript",
          isFunction: false,
          isClass: false,
          isImport: true,
          nodeType: "import_statement",
          name: null,
          startLine: 1,
          endLine: 1,
        }),
      };

      const result = await extractor.extractFromChunk(
        chunk,
        "/home/project/src/app.ts",
      );

      expect(result.nodes.length).toBe(0);
    });
  });

  describe("extractFromFile", () => {
    it("should create module node for file", async () => {
      const chunks: CodeChunk[] = [
        {
          content: `export function foo() {}`,
          tokenCount: 5,
          metadata: createTestMetadata({
            language: "typescript",
            isFunction: true,
            isClass: false,
            isImport: false,
            nodeType: "function_declaration",
            name: "foo",
            startLine: 1,
            endLine: 1,
          }),
        },
      ];

      const result = await extractor.extractFromFile(
        "/home/project/src/utils.ts",
        chunks,
      );

      const moduleNode = result.nodes.find((n) => n.type === "module");
      expect(moduleNode).toBeDefined();
      expect(moduleNode?.name).toBe("utils.ts");
      expect(moduleNode?.id).toBe("/home/project/src/utils.ts:module");
    });

    it("should extract all nodes and edges from file", async () => {
      const chunks: CodeChunk[] = [
        {
          content: `import { bar } from './bar';`,
          tokenCount: 5,
          metadata: createTestMetadata({
            language: "typescript",
            isFunction: false,
            isClass: false,
            isImport: true,
            nodeType: "import_statement",
            name: null,
            startLine: 1,
            endLine: 1,
          }),
        },
        {
          content: `export function foo() { bar(); }`,
          tokenCount: 10,
          metadata: createTestMetadata({
            language: "typescript",
            isFunction: true,
            isClass: false,
            isImport: false,
            nodeType: "function_declaration",
            name: "foo",
            startLine: 3,
            endLine: 3,
          }),
        },
      ];

      const result = await extractor.extractFromFile(
        "/home/project/src/foo.ts",
        chunks,
      );

      // Should have module node + function node
      expect(result.nodes.length).toBe(2);

      // Should have import edge
      const importEdges = result.edges.filter((e) => e.edgeType === "imports");
      expect(importEdges.length).toBeGreaterThanOrEqual(1);
    });

    it("should track exported symbols in module metadata", async () => {
      const chunks: CodeChunk[] = [
        {
          content: `export function publicFn() {}`,
          tokenCount: 5,
          metadata: createTestMetadata({
            language: "typescript",
            isFunction: true,
            isClass: false,
            isImport: false,
            nodeType: "function_declaration",
            name: "publicFn",
            startLine: 1,
            endLine: 1,
          }),
        },
        {
          content: `function privateFn() {}`,
          tokenCount: 5,
          metadata: createTestMetadata({
            language: "typescript",
            isFunction: true,
            isClass: false,
            isImport: false,
            nodeType: "function_declaration",
            name: "privateFn",
            startLine: 3,
            endLine: 3,
          }),
        },
      ];

      const result = await extractor.extractFromFile(
        "/home/project/src/mixed.ts",
        chunks,
      );

      const moduleNode = result.nodes.find((n) => n.type === "module");
      expect(moduleNode?.metadata.exportedSymbols).toContain("publicFn");
      expect(moduleNode?.metadata.exportedSymbols).not.toContain("privateFn");
    });
  });

  describe("extractImportEdges", () => {
    it("should create import edges for relative imports", async () => {
      const chunks: CodeChunk[] = [
        {
          content: `import { helper } from './utils';`,
          tokenCount: 5,
          metadata: createTestMetadata({
            language: "typescript",
            isFunction: false,
            isClass: false,
            isImport: true,
            nodeType: "import_statement",
            name: null,
            startLine: 1,
            endLine: 1,
          }),
        },
      ];

      const edges = await extractor.extractImportEdges(
        "/home/project/src/app.ts",
        chunks,
      );

      const importEdge = edges.find((e) => e.edgeType === "imports");
      expect(importEdge).toBeDefined();
      expect(importEdge?.fromNode).toBe("/home/project/src/app.ts:module");
    });

    it("should create depends_on edges for npm packages", async () => {
      const chunks: CodeChunk[] = [
        {
          content: `import express from 'express';`,
          tokenCount: 5,
          metadata: createTestMetadata({
            language: "typescript",
            isFunction: false,
            isClass: false,
            isImport: true,
            nodeType: "import_statement",
            name: null,
            startLine: 1,
            endLine: 1,
          }),
        },
      ];

      const edges = await extractor.extractImportEdges(
        "/home/project/src/server.ts",
        chunks,
      );

      const dependsOnEdge = edges.find((e) => e.edgeType === "depends_on");
      expect(dependsOnEdge).toBeDefined();
      expect(dependsOnEdge?.toNode).toBe("npm:express");
    });

    it("should handle scoped npm packages", async () => {
      const chunks: CodeChunk[] = [
        {
          content: `import { z } from '@anthropic-ai/sdk';`,
          tokenCount: 5,
          metadata: createTestMetadata({
            language: "typescript",
            isFunction: false,
            isClass: false,
            isImport: true,
            nodeType: "import_statement",
            name: null,
            startLine: 1,
            endLine: 1,
          }),
        },
      ];

      const edges = await extractor.extractImportEdges(
        "/home/project/src/client.ts",
        chunks,
      );

      const dependsOnEdge = edges.find((e) => e.edgeType === "depends_on");
      expect(dependsOnEdge).toBeDefined();
      expect(dependsOnEdge?.toNode).toBe("npm:@anthropic-ai/sdk");
    });
  });

  describe("extractPackageNodes", () => {
    // Note: This test requires a mock package.json or temp file
    // In a real test environment, you'd create a temp file

    it("should handle missing package.json gracefully", async () => {
      const result = await extractor.extractPackageNodes(
        "/nonexistent/package.json",
      );

      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });
  });
});
