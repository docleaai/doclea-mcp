import { describe, expect, it } from "bun:test";
import {
  chunkCode,
  chunkCodeFallback,
  chunkCodeFile,
  detectLanguage,
  getSupportedExtensions,
} from "../../chunking/code";

describe("Code Chunking", () => {
  describe("detectLanguage", () => {
    it("should detect TypeScript files", () => {
      expect(detectLanguage("file.ts")).toBe("typescript");
      expect(detectLanguage("file.mts")).toBe("typescript");
      expect(detectLanguage("file.cts")).toBe("typescript");
    });

    it("should detect TSX files", () => {
      expect(detectLanguage("file.tsx")).toBe("tsx");
    });

    it("should detect JavaScript files", () => {
      expect(detectLanguage("file.js")).toBe("javascript");
      expect(detectLanguage("file.mjs")).toBe("javascript");
      expect(detectLanguage("file.cjs")).toBe("javascript");
    });

    it("should detect JSX files", () => {
      expect(detectLanguage("file.jsx")).toBe("jsx");
    });

    it("should detect Python files", () => {
      expect(detectLanguage("file.py")).toBe("python");
      expect(detectLanguage("file.pyi")).toBe("python");
    });

    it("should detect Go files", () => {
      expect(detectLanguage("file.go")).toBe("go");
    });

    it("should detect Rust files", () => {
      expect(detectLanguage("file.rs")).toBe("rust");
    });

    it("should return null for unsupported extensions", () => {
      expect(detectLanguage("file.rb")).toBeNull();
      expect(detectLanguage("file.php")).toBeNull();
      expect(detectLanguage("file.java")).toBeNull();
      expect(detectLanguage("file.txt")).toBeNull();
    });

    it("should handle paths with directories", () => {
      expect(detectLanguage("src/components/Button.tsx")).toBe("tsx");
      expect(detectLanguage("/home/user/project/main.py")).toBe("python");
    });
  });

  describe("getSupportedExtensions", () => {
    it("should return all supported extensions", () => {
      const extensions = getSupportedExtensions();

      expect(extensions).toContain(".ts");
      expect(extensions).toContain(".tsx");
      expect(extensions).toContain(".js");
      expect(extensions).toContain(".jsx");
      expect(extensions).toContain(".py");
      expect(extensions).toContain(".go");
      expect(extensions).toContain(".rs");
    });

    it("should not contain duplicates", () => {
      const extensions = getSupportedExtensions();
      const unique = [...new Set(extensions)];
      expect(extensions.length).toBe(unique.length);
    });
  });

  describe("chunkCode - TypeScript", () => {
    it("should chunk a simple TypeScript function", async () => {
      const code = `
function add(a: number, b: number): number {
  return a + b;
}
`.trim();

      const chunks = await chunkCode(code, "typescript");

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].metadata.language).toBe("typescript");
      expect(chunks[0].metadata.isFunction).toBe(true);
      expect(chunks[0].metadata.nodeType).toBe("function_declaration");
    });

    it("should chunk multiple TypeScript functions", async () => {
      const code = `
function add(a: number, b: number): number {
  return a + b;
}

function subtract(a: number, b: number): number {
  return a - b;
}

function multiply(a: number, b: number): number {
  return a * b;
}
`.trim();

      const chunks = await chunkCode(code, "typescript");

      // Should have chunks for each function
      const functionChunks = chunks.filter((c) => c.metadata.isFunction);
      expect(functionChunks.length).toBe(3);
    });

    it("should chunk a TypeScript class", async () => {
      const code = `
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }
}
`.trim();

      const chunks = await chunkCode(code, "typescript");

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      const classChunk = chunks.find((c) => c.metadata.isClass);
      expect(classChunk).toBeDefined();
    });

    it("should chunk TypeScript interface", async () => {
      const code = `
interface User {
  id: number;
  name: string;
  email: string;
}
`.trim();

      const chunks = await chunkCode(code, "typescript");

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].metadata.nodeType).toBe("interface_declaration");
      expect(chunks[0].metadata.isClass).toBe(true);
    });

    it("should chunk TypeScript type alias", async () => {
      const code = `
type Status = "pending" | "active" | "completed";
`.trim();

      const chunks = await chunkCode(code, "typescript");

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].metadata.nodeType).toBe("type_alias_declaration");
    });

    it("should extract imports separately", async () => {
      const code = `
import { readFile } from "fs";
import path from "path";

function process(file: string): void {
  console.log(file);
}
`.trim();

      const chunks = await chunkCode(code, "typescript");

      const importChunk = chunks.find((c) => c.metadata.isImport);
      expect(importChunk).toBeDefined();
      expect(importChunk?.content).toContain("import");
    });

    it("should include imports with each chunk when option is set", async () => {
      const code = `
import { readFile } from "fs";

function process(file: string): void {
  console.log(file);
}
`.trim();

      const chunks = await chunkCode(code, "typescript", {
        includeImports: true,
      });

      // With includeImports, the function chunk should contain the import
      const functionChunk = chunks.find((c) => c.metadata.isFunction);
      expect(functionChunk?.content).toContain("import");
    });

    it("should track line numbers correctly", async () => {
      const code = `function first() {
  return 1;
}

function second() {
  return 2;
}`;

      const chunks = await chunkCode(code, "typescript");

      const firstFunc = chunks.find((c) => c.content.includes("first"));
      const secondFunc = chunks.find((c) => c.content.includes("second"));

      expect(firstFunc?.metadata.startLine).toBe(1);
      expect(secondFunc?.metadata.startLine).toBe(5);
    });
  });

  describe("chunkCode - JavaScript", () => {
    it("should chunk JavaScript functions", async () => {
      const code = `
function greet(name) {
  return "Hello, " + name;
}

const farewell = (name) => {
  return "Goodbye, " + name;
};
`.trim();

      const chunks = await chunkCode(code, "javascript");

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].metadata.language).toBe("javascript");
    });

    it("should chunk JavaScript classes", async () => {
      const code = `
class Animal {
  constructor(name) {
    this.name = name;
  }

  speak() {
    console.log(this.name + " makes a sound.");
  }
}
`.trim();

      const chunks = await chunkCode(code, "javascript");

      const classChunk = chunks.find((c) => c.metadata.isClass);
      expect(classChunk).toBeDefined();
    });
  });

  describe("chunkCode - Python", () => {
    it("should chunk Python functions", async () => {
      const code = `
def add(a, b):
    return a + b

def subtract(a, b):
    return a - b
`.trim();

      const chunks = await chunkCode(code, "python");

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].metadata.language).toBe("python");
      const functionChunks = chunks.filter((c) => c.metadata.isFunction);
      expect(functionChunks.length).toBe(2);
    });

    it("should chunk Python classes", async () => {
      const code = `
class Calculator:
    def __init__(self):
        self.result = 0

    def add(self, x):
        self.result += x
        return self
`.trim();

      const chunks = await chunkCode(code, "python");

      const classChunk = chunks.find((c) => c.metadata.isClass);
      expect(classChunk).toBeDefined();
      expect(classChunk?.metadata.nodeType).toBe("class_definition");
    });

    it("should handle Python imports", async () => {
      const code = `
import os
from pathlib import Path

def process():
    pass
`.trim();

      const chunks = await chunkCode(code, "python");

      const importChunk = chunks.find((c) => c.metadata.isImport);
      expect(importChunk).toBeDefined();
    });

    it("should handle decorated functions", async () => {
      const code = `
@decorator
def decorated_function():
    pass

@property
def getter(self):
    return self._value
`.trim();

      const chunks = await chunkCode(code, "python");

      // Decorated definitions should be captured
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("chunkCode - Go", () => {
    it("should chunk Go functions", async () => {
      const code = `
package main

func add(a, b int) int {
    return a + b
}

func subtract(a, b int) int {
    return a - b
}
`.trim();

      const chunks = await chunkCode(code, "go");

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].metadata.language).toBe("go");
    });

    it("should chunk Go structs", async () => {
      const code = `
package main

type User struct {
    ID   int
    Name string
}
`.trim();

      const chunks = await chunkCode(code, "go");

      const typeChunk = chunks.find(
        (c) => c.metadata.nodeType === "type_declaration",
      );
      expect(typeChunk).toBeDefined();
      expect(typeChunk?.metadata.isClass).toBe(true);
    });

    it("should chunk Go methods", async () => {
      const code = `
package main

type Calculator struct {
    result int
}

func (c *Calculator) Add(x int) {
    c.result += x
}

func (c *Calculator) GetResult() int {
    return c.result
}
`.trim();

      const chunks = await chunkCode(code, "go");

      const methodChunks = chunks.filter(
        (c) => c.metadata.nodeType === "method_declaration",
      );
      expect(methodChunks.length).toBe(2);
    });

    it("should handle Go imports", async () => {
      const code = `
package main

import (
    "fmt"
    "os"
)

func main() {
    fmt.Println("Hello")
}
`.trim();

      const chunks = await chunkCode(code, "go");

      const importChunk = chunks.find((c) => c.metadata.isImport);
      expect(importChunk).toBeDefined();
    });
  });

  describe("chunkCode - Rust", () => {
    it("should chunk Rust functions", async () => {
      const code = `
fn add(a: i32, b: i32) -> i32 {
    a + b
}

fn subtract(a: i32, b: i32) -> i32 {
    a - b
}
`.trim();

      const chunks = await chunkCode(code, "rust");

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].metadata.language).toBe("rust");
      const functionChunks = chunks.filter((c) => c.metadata.isFunction);
      expect(functionChunks.length).toBe(2);
    });

    it("should chunk Rust structs", async () => {
      const code = `
struct User {
    id: u32,
    name: String,
}
`.trim();

      const chunks = await chunkCode(code, "rust");

      const structChunk = chunks.find(
        (c) => c.metadata.nodeType === "struct_item",
      );
      expect(structChunk).toBeDefined();
      expect(structChunk?.metadata.isClass).toBe(true);
    });

    it("should chunk Rust impl blocks", async () => {
      const code = `
struct Calculator {
    result: i32,
}

impl Calculator {
    fn new() -> Self {
        Calculator { result: 0 }
    }

    fn add(&mut self, x: i32) {
        self.result += x;
    }
}
`.trim();

      const chunks = await chunkCode(code, "rust");

      const implChunk = chunks.find((c) => c.metadata.nodeType === "impl_item");
      expect(implChunk).toBeDefined();
    });

    it("should chunk Rust enums", async () => {
      const code = `
enum Status {
    Pending,
    Active,
    Completed,
}
`.trim();

      const chunks = await chunkCode(code, "rust");

      const enumChunk = chunks.find((c) => c.metadata.nodeType === "enum_item");
      expect(enumChunk).toBeDefined();
      expect(enumChunk?.metadata.isClass).toBe(true);
    });

    it("should handle Rust use declarations", async () => {
      const code = `
use std::io;
use std::collections::HashMap;

fn main() {
    println!("Hello");
}
`.trim();

      const chunks = await chunkCode(code, "rust");

      const useChunk = chunks.find((c) => c.metadata.isImport);
      expect(useChunk).toBeDefined();
    });
  });

  describe("chunkCodeFile", () => {
    it("should auto-detect language from filename", async () => {
      const tsCode = `function test(): void {}`;
      const pyCode = `def test(): pass`;
      const goCode = `func test() {}`;
      const rsCode = `fn test() {}`;

      const tsChunks = await chunkCodeFile(tsCode, "test.ts");
      const pyChunks = await chunkCodeFile(pyCode, "test.py");
      const goChunks = await chunkCodeFile(goCode, "test.go");
      const rsChunks = await chunkCodeFile(rsCode, "test.rs");

      expect(tsChunks[0].metadata.language).toBe("typescript");
      expect(pyChunks[0].metadata.language).toBe("python");
      expect(goChunks[0].metadata.language).toBe("go");
      expect(rsChunks[0].metadata.language).toBe("rust");
    });

    it("should fall back for unsupported languages", async () => {
      const code = `class Test { }`;
      const chunks = await chunkCodeFile(code, "test.rb");

      // Should use fallback chunking
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].metadata.nodeType).toBe("lines");
    });
  });

  describe("chunkCodeFallback", () => {
    it("should chunk by lines", async () => {
      const code = Array(100).fill("const x = 1;").join("\n");

      const chunks = await chunkCodeFallback(code, "test.txt", {
        maxTokens: 50,
      });

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(60); // Allow some tolerance
      }
    });

    it("should track line numbers", async () => {
      const code = `line1
line2
line3
line4
line5`;

      const chunks = await chunkCodeFallback(code, "test.txt", {
        maxTokens: 10,
      });

      expect(chunks[0].metadata.startLine).toBe(1);
    });
  });

  describe("Token limits", () => {
    it("should respect maxTokens option", async () => {
      const code = `
function veryLongFunction() {
  const a = 1;
  const b = 2;
  const c = 3;
  const d = 4;
  const e = 5;
  const f = 6;
  const g = 7;
  const h = 8;
  const i = 9;
  const j = 10;
  return a + b + c + d + e + f + g + h + i + j;
}
`.trim();

      const chunks = await chunkCode(code, "typescript", {
        maxTokens: 20,
        splitLargeFunctions: true,
      });

      // Large function should be split
      expect(chunks.length).toBeGreaterThan(1);
    });

    it("should keep small functions intact", async () => {
      const code = `
function small() {
  return 1;
}
`.trim();

      const chunks = await chunkCode(code, "typescript", {
        maxTokens: 100,
      });

      expect(chunks.length).toBe(1);
      expect(chunks[0].content).toContain("function small()");
    });
  });

  describe("Edge cases", () => {
    it("should handle empty code", async () => {
      const chunks = await chunkCode("", "typescript");
      expect(chunks).toEqual([]);
    });

    it("should handle code with only comments", async () => {
      const code = `
// This is a comment
/* Multi-line
   comment */
`.trim();

      const chunks = await chunkCode(code, "typescript");
      // Comments without code should result in no chunks (or minimal)
      expect(chunks.length).toBeLessThanOrEqual(1);
    });

    it("should handle code with syntax errors gracefully", async () => {
      const code = `
function incomplete( {
  // Missing closing paren and brace
`.trim();

      // Should not throw
      const chunks = await chunkCode(code, "typescript");
      // Tree-sitter is error-tolerant
      expect(Array.isArray(chunks)).toBe(true);
    });

    it("should handle unicode in code", async () => {
      const code = `
function greet(name: string): string {
  return "Hello, " + name + "! 🎉";
}

const emoji = "🚀";
`.trim();

      const chunks = await chunkCode(code, "typescript");
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks.some((c) => c.content.includes("🎉"))).toBe(true);
    });

    it("should handle very long lines", async () => {
      const longLine = `const x = ${JSON.stringify("a".repeat(1000))};`;

      const chunks = await chunkCode(longLine, "typescript");
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Metadata extraction", () => {
    it("should extract function names", async () => {
      const code = `
function namedFunction() {
  return true;
}
`.trim();

      const chunks = await chunkCode(code, "typescript");
      expect(chunks[0].metadata.name).toBe("namedFunction");
    });

    it("should extract class names", async () => {
      const code = `
class MyClass {
  constructor() {}
}
`.trim();

      const chunks = await chunkCode(code, "typescript");
      const classChunk = chunks.find((c) => c.metadata.isClass);
      expect(classChunk?.metadata.name).toBe("MyClass");
    });

    it("should extract interface names", async () => {
      const code = `
interface IUser {
  id: number;
}
`.trim();

      const chunks = await chunkCode(code, "typescript");
      expect(chunks[0].metadata.name).toBe("IUser");
    });
  });
});
