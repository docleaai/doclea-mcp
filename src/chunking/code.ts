/**
 * AST-based code chunking using Tree-sitter
 *
 * Intelligently splits source code while respecting:
 * - Function/method boundaries
 * - Class/struct definitions
 * - Import/module declarations
 * - Token limits per chunk
 * - Source location tracking
 */

import { join } from "node:path";
import { countTokens } from "../utils";

// Cached parser and language module
let TreeSitterModule: typeof import("web-tree-sitter") | null = null;
let parserInitialized = false;

/**
 * Supported programming languages
 */
export type SupportedLanguage =
  | "typescript"
  | "tsx"
  | "javascript"
  | "jsx"
  | "python"
  | "go"
  | "rust";

/**
 * Language configuration
 */
interface LanguageConfig {
  /** WASM file path relative to node_modules */
  wasmPath: string;
  /** Node types that represent top-level definitions */
  topLevelNodes: string[];
  /** Node types that represent function definitions */
  functionNodes: string[];
  /** Node types that represent class/type definitions */
  classNodes: string[];
  /** Node types for imports/requires */
  importNodes: string[];
  /** File extensions for this language */
  extensions: string[];
}

/**
 * Language configurations
 */
const LANGUAGE_CONFIGS: Record<SupportedLanguage, LanguageConfig> = {
  typescript: {
    wasmPath: "tree-sitter-typescript/tree-sitter-typescript.wasm",
    topLevelNodes: [
      "function_declaration",
      "class_declaration",
      "interface_declaration",
      "type_alias_declaration",
      "enum_declaration",
      "module",
      "export_statement",
      "lexical_declaration",
      "variable_declaration",
    ],
    functionNodes: [
      "function_declaration",
      "method_definition",
      "arrow_function",
      "function_expression",
    ],
    classNodes: [
      "class_declaration",
      "interface_declaration",
      "type_alias_declaration",
      "enum_declaration",
    ],
    importNodes: ["import_statement", "export_statement"],
    extensions: [".ts", ".mts", ".cts"],
  },
  tsx: {
    wasmPath: "tree-sitter-typescript/tree-sitter-tsx.wasm",
    topLevelNodes: [
      "function_declaration",
      "class_declaration",
      "interface_declaration",
      "type_alias_declaration",
      "enum_declaration",
      "module",
      "export_statement",
      "lexical_declaration",
      "variable_declaration",
    ],
    functionNodes: [
      "function_declaration",
      "method_definition",
      "arrow_function",
      "function_expression",
    ],
    classNodes: [
      "class_declaration",
      "interface_declaration",
      "type_alias_declaration",
      "enum_declaration",
    ],
    importNodes: ["import_statement", "export_statement"],
    extensions: [".tsx"],
  },
  javascript: {
    wasmPath: "tree-sitter-javascript/tree-sitter-javascript.wasm",
    topLevelNodes: [
      "function_declaration",
      "class_declaration",
      "export_statement",
      "lexical_declaration",
      "variable_declaration",
    ],
    functionNodes: [
      "function_declaration",
      "method_definition",
      "arrow_function",
      "function_expression",
    ],
    classNodes: ["class_declaration"],
    importNodes: ["import_statement", "export_statement"],
    extensions: [".js", ".mjs", ".cjs"],
  },
  jsx: {
    wasmPath: "tree-sitter-javascript/tree-sitter-javascript.wasm",
    topLevelNodes: [
      "function_declaration",
      "class_declaration",
      "export_statement",
      "lexical_declaration",
      "variable_declaration",
    ],
    functionNodes: [
      "function_declaration",
      "method_definition",
      "arrow_function",
      "function_expression",
    ],
    classNodes: ["class_declaration"],
    importNodes: ["import_statement", "export_statement"],
    extensions: [".jsx"],
  },
  python: {
    wasmPath: "tree-sitter-python/tree-sitter-python.wasm",
    topLevelNodes: [
      "function_definition",
      "class_definition",
      "decorated_definition",
      "import_statement",
      "import_from_statement",
    ],
    functionNodes: ["function_definition"],
    classNodes: ["class_definition"],
    importNodes: ["import_statement", "import_from_statement"],
    extensions: [".py", ".pyi"],
  },
  go: {
    wasmPath: "tree-sitter-go/tree-sitter-go.wasm",
    topLevelNodes: [
      "function_declaration",
      "method_declaration",
      "type_declaration",
      "const_declaration",
      "var_declaration",
      "import_declaration",
    ],
    functionNodes: ["function_declaration", "method_declaration"],
    classNodes: ["type_declaration"],
    importNodes: ["import_declaration"],
    extensions: [".go"],
  },
  rust: {
    wasmPath: "tree-sitter-rust/tree-sitter-rust.wasm",
    topLevelNodes: [
      "function_item",
      "impl_item",
      "struct_item",
      "enum_item",
      "trait_item",
      "mod_item",
      "use_declaration",
      "const_item",
      "static_item",
      "type_item",
    ],
    functionNodes: ["function_item"],
    classNodes: ["struct_item", "enum_item", "trait_item", "impl_item"],
    importNodes: ["use_declaration", "mod_item"],
    extensions: [".rs"],
  },
};

/**
 * Cached language instances
 */
const languageCache = new Map<SupportedLanguage, unknown>();

/**
 * Metadata for a code chunk
 */
export interface CodeChunkMetadata {
  /** Starting line number (1-based) */
  startLine: number;
  /** Ending line number (1-based, inclusive) */
  endLine: number;
  /** Starting byte offset */
  startByte: number;
  /** Ending byte offset */
  endByte: number;
  /** Type of code construct (function, class, import, etc.) */
  nodeType: string;
  /** Name of the construct if available */
  name: string | null;
  /** Parent construct name if nested */
  parentName: string | null;
  /** Language of the code */
  language: SupportedLanguage;
  /** Whether this is an import/module declaration */
  isImport: boolean;
  /** Whether this is a function/method */
  isFunction: boolean;
  /** Whether this is a class/type definition */
  isClass: boolean;
  /** Whether this is exported (optional, may be computed later) */
  isExported?: boolean;
}

/**
 * A chunk of code content with metadata
 */
export interface CodeChunk {
  /** The code content */
  content: string;
  /** Metadata about the chunk's location and type */
  metadata: CodeChunkMetadata;
  /** Approximate token count */
  tokenCount: number;
}

/**
 * Options for code chunking
 */
export interface CodeChunkOptions {
  /** Maximum tokens per chunk (default: 512) */
  maxTokens?: number;
  /** Whether to include imports with each chunk (default: false) */
  includeImports?: boolean;
  /** Whether to split large functions (default: true) */
  splitLargeFunctions?: boolean;
  /** Tokenizer model to use */
  model?: string;
}

/**
 * Initialize the Tree-sitter parser module
 */
async function initTreeSitter(): Promise<typeof import("web-tree-sitter")> {
  if (TreeSitterModule && parserInitialized) {
    return TreeSitterModule;
  }

  const TreeSitter = await import("web-tree-sitter");

  // Find the WASM file path
  const wasmPath = join(
    process.cwd(),
    "node_modules",
    "web-tree-sitter",
    "tree-sitter.wasm",
  );

  // Initialize Parser with WASM location
  await TreeSitter.Parser.init({
    locateFile: () => wasmPath,
  });

  TreeSitterModule = TreeSitter;
  parserInitialized = true;
  return TreeSitter;
}

/**
 * Load a language grammar
 */
async function loadLanguage(language: SupportedLanguage): Promise<unknown> {
  if (languageCache.has(language)) {
    return languageCache.get(language);
  }

  const TreeSitter = await initTreeSitter();
  const config = LANGUAGE_CONFIGS[language];

  const wasmPath = join(process.cwd(), "node_modules", config.wasmPath);

  const lang = await TreeSitter.Language.load(wasmPath);
  languageCache.set(language, lang);
  return lang;
}

/**
 * Detect language from file extension
 */
export function detectLanguage(filename: string): SupportedLanguage | null {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));

  for (const [lang, config] of Object.entries(LANGUAGE_CONFIGS)) {
    if (config.extensions.includes(ext)) {
      return lang as SupportedLanguage;
    }
  }

  return null;
}

/**
 * Get all supported file extensions
 */
export function getSupportedExtensions(): string[] {
  const extensions: string[] = [];
  for (const config of Object.values(LANGUAGE_CONFIGS)) {
    extensions.push(...config.extensions);
  }
  return [...new Set(extensions)];
}

/**
 * Extract the name from a node if available
 */
function extractNodeName(
  node: TreeSitterNode,
  language: SupportedLanguage,
): string | null {
  // Common patterns for finding names
  const namePatterns = ["name", "identifier", "property_identifier"];

  for (const pattern of namePatterns) {
    const nameNode = node.childForFieldName?.(pattern);
    if (nameNode) {
      return nameNode.text;
    }
  }

  // Try first identifier child
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (
      child &&
      (child.type === "identifier" || child.type === "type_identifier")
    ) {
      return child.text;
    }
  }

  return null;
}

/**
 * Tree-sitter node interface (simplified)
 */
interface TreeSitterNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  startIndex: number;
  endIndex: number;
  childCount: number;
  child(index: number): TreeSitterNode | null;
  childForFieldName?(name: string): TreeSitterNode | null;
  children: TreeSitterNode[];
}

/**
 * Tree-sitter tree interface
 */
interface TreeSitterTree {
  rootNode: TreeSitterNode;
}

/**
 * Chunk code using Tree-sitter AST parsing
 */
export async function chunkCode(
  code: string,
  language: SupportedLanguage,
  options: CodeChunkOptions = {},
): Promise<CodeChunk[]> {
  const {
    maxTokens = 512,
    includeImports = false,
    splitLargeFunctions = true,
    model,
  } = options;

  const config = LANGUAGE_CONFIGS[language];

  // Parse the code
  const TreeSitter = await initTreeSitter();
  const lang = await loadLanguage(language);

  const parser = new TreeSitter.Parser();
  parser.setLanguage(lang as Parameters<typeof parser.setLanguage>[0]);

  const tree = parser.parse(code) as TreeSitterTree;
  const rootNode = tree.rootNode;

  // Collect top-level nodes
  const topLevelNodes: TreeSitterNode[] = [];
  const importNodes: TreeSitterNode[] = [];

  for (let i = 0; i < rootNode.childCount; i++) {
    const child = rootNode.child(i);
    if (!child) continue;

    if (config.importNodes.includes(child.type)) {
      importNodes.push(child);
    }

    if (config.topLevelNodes.includes(child.type)) {
      topLevelNodes.push(child);
    }
  }

  // Build import block if needed
  let importBlock = "";
  if (includeImports && importNodes.length > 0) {
    importBlock = importNodes.map((n) => n.text).join("\n") + "\n\n";
  }

  const chunks: CodeChunk[] = [];

  // Process imports as a single chunk first (if not including with each)
  if (!includeImports && importNodes.length > 0) {
    const importText = importNodes.map((n) => n.text).join("\n");
    const tokenCount = await countTokens(importText, model);

    chunks.push({
      content: importText,
      tokenCount,
      metadata: {
        startLine: importNodes[0].startPosition.row + 1,
        endLine: importNodes[importNodes.length - 1].endPosition.row + 1,
        startByte: importNodes[0].startIndex,
        endByte: importNodes[importNodes.length - 1].endIndex,
        nodeType: "imports",
        name: null,
        parentName: null,
        language,
        isImport: true,
        isFunction: false,
        isClass: false,
      },
    });
  }

  // Process each top-level node
  for (const node of topLevelNodes) {
    // Skip import nodes if we already processed them
    if (config.importNodes.includes(node.type) && !includeImports) {
      continue;
    }

    const nodeText = includeImports ? importBlock + node.text : node.text;
    const tokenCount = await countTokens(nodeText, model);

    const isFunction = config.functionNodes.includes(node.type);
    const isClass = config.classNodes.includes(node.type);
    const isImport = config.importNodes.includes(node.type);

    // If the node is too large and we can split it
    if (tokenCount > maxTokens && splitLargeFunctions) {
      const subChunks = await splitLargeNode(
        node,
        language,
        config,
        maxTokens,
        includeImports ? importBlock : "",
        model,
      );
      chunks.push(...subChunks);
    } else {
      chunks.push({
        content: nodeText,
        tokenCount,
        metadata: {
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          startByte: node.startIndex,
          endByte: node.endIndex,
          nodeType: node.type,
          name: extractNodeName(node, language),
          parentName: null,
          language,
          isImport,
          isFunction,
          isClass,
        },
      });
    }
  }

  return chunks;
}

/**
 * Split a large node into smaller chunks
 */
async function splitLargeNode(
  node: TreeSitterNode,
  language: SupportedLanguage,
  config: LanguageConfig,
  maxTokens: number,
  importBlock: string,
  model?: string,
): Promise<CodeChunk[]> {
  const chunks: CodeChunk[] = [];
  const parentName = extractNodeName(node, language);

  // For classes, split by methods
  if (config.classNodes.includes(node.type)) {
    const methods: TreeSitterNode[] = [];
    const otherContent: string[] = [];
    const lastEnd = node.startIndex;

    // Find all method definitions within the class
    collectChildNodes(node, config.functionNodes, methods);

    if (methods.length > 0) {
      // Get class signature (everything before first method)
      const classStart = node.text.substring(
        0,
        methods[0].startIndex - node.startIndex,
      );

      for (const method of methods) {
        const methodText = importBlock + classStart + method.text + "\n}";
        const tokenCount = await countTokens(methodText, model);

        chunks.push({
          content: method.text,
          tokenCount: await countTokens(method.text, model),
          metadata: {
            startLine: method.startPosition.row + 1,
            endLine: method.endPosition.row + 1,
            startByte: method.startIndex,
            endByte: method.endIndex,
            nodeType: method.type,
            name: extractNodeName(method, language),
            parentName,
            language,
            isImport: false,
            isFunction: true,
            isClass: false,
          },
        });
      }

      return chunks;
    }
  }

  // For large functions or other nodes, split by lines
  const lines = node.text.split("\n");
  let currentChunk: string[] = [];
  let currentTokens = 0;
  let chunkStartLine = node.startPosition.row + 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = await countTokens(line, model);

    if (currentTokens + lineTokens > maxTokens && currentChunk.length > 0) {
      // Save current chunk
      const content = currentChunk.join("\n");
      chunks.push({
        content,
        tokenCount: currentTokens,
        metadata: {
          startLine: chunkStartLine,
          endLine: chunkStartLine + currentChunk.length - 1,
          startByte: 0, // Approximate
          endByte: 0,
          nodeType: node.type + "_partial",
          name: parentName,
          parentName: null,
          language,
          isImport: false,
          isFunction: config.functionNodes.includes(node.type),
          isClass: config.classNodes.includes(node.type),
        },
      });

      currentChunk = [line];
      currentTokens = lineTokens;
      chunkStartLine = node.startPosition.row + 1 + i;
    } else {
      currentChunk.push(line);
      currentTokens += lineTokens;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push({
      content: currentChunk.join("\n"),
      tokenCount: currentTokens,
      metadata: {
        startLine: chunkStartLine,
        endLine: chunkStartLine + currentChunk.length - 1,
        startByte: 0,
        endByte: 0,
        nodeType: node.type + "_partial",
        name: parentName,
        parentName: null,
        language,
        isImport: false,
        isFunction: config.functionNodes.includes(node.type),
        isClass: config.classNodes.includes(node.type),
      },
    });
  }

  return chunks;
}

/**
 * Recursively collect child nodes of specific types
 */
function collectChildNodes(
  node: TreeSitterNode,
  types: string[],
  result: TreeSitterNode[],
): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    if (types.includes(child.type)) {
      result.push(child);
    } else {
      collectChildNodes(child, types, result);
    }
  }
}

/**
 * Chunk code with automatic language detection
 */
export async function chunkCodeFile(
  code: string,
  filename: string,
  options: CodeChunkOptions = {},
): Promise<CodeChunk[]> {
  const language = detectLanguage(filename);

  if (!language) {
    // Fall back to line-based chunking for unsupported languages
    return chunkCodeFallback(code, filename, options);
  }

  return chunkCode(code, language, options);
}

/**
 * Fallback line-based chunking for unsupported languages
 */
export async function chunkCodeFallback(
  code: string,
  filename: string,
  options: CodeChunkOptions = {},
): Promise<CodeChunk[]> {
  const { maxTokens = 512, model } = options;
  const lines = code.split("\n");
  const chunks: CodeChunk[] = [];

  let currentChunk: string[] = [];
  let currentTokens = 0;
  let chunkStartLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = await countTokens(line, model);

    // Start a new chunk if adding this line would exceed the limit
    if (currentTokens + lineTokens > maxTokens && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.join("\n"),
        tokenCount: currentTokens,
        metadata: {
          startLine: chunkStartLine,
          endLine: chunkStartLine + currentChunk.length - 1,
          startByte: 0,
          endByte: 0,
          nodeType: "lines",
          name: null,
          parentName: null,
          language: "typescript" as SupportedLanguage, // Default, but marked as fallback
          isImport: false,
          isFunction: false,
          isClass: false,
        },
      });

      currentChunk = [line];
      currentTokens = lineTokens;
      chunkStartLine = i + 1;
    } else {
      currentChunk.push(line);
      currentTokens += lineTokens;
    }
  }

  // Remember the last chunk
  if (currentChunk.length > 0) {
    chunks.push({
      content: currentChunk.join("\n"),
      tokenCount: currentTokens,
      metadata: {
        startLine: chunkStartLine,
        endLine: chunkStartLine + currentChunk.length - 1,
        startByte: 0,
        endByte: 0,
        nodeType: "lines",
        name: null,
        parentName: null,
        language: "typescript" as SupportedLanguage,
        isImport: false,
        isFunction: false,
        isClass: false,
      },
    });
  }

  return chunks;
}
