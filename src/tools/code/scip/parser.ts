/**
 * SCIP Index Parser
 * Parses SCIP protobuf files into structured TypeScript objects
 */

import { readFileSync } from "node:fs";
import type {
  ScipDocument,
  ScipIndex,
  ScipMetadata,
  ScipOccurrence,
  ScipRelationship,
  ScipSymbolInfo,
} from "./types";
import { ScipSymbolKind, ScipSymbolRole } from "./types";

// Import the SCIP protobuf classes from scip-typescript
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scip } = require("@sourcegraph/scip-typescript/dist/src/scip.js");

/**
 * Parse a SCIP index file into a structured ScipIndex object
 */
export function parseScipIndex(indexPath: string): ScipIndex {
  const buffer = readFileSync(indexPath);
  const index = scip.Index.deserialize(buffer);
  const obj = index.toObject();

  return {
    metadata: parseMetadata(obj.metadata),
    documents: (obj.documents || []).map(parseDocument),
    externalSymbols: (obj.external_symbols || []).map(parseSymbolInfo),
  };
}

function parseMetadata(raw: unknown): ScipMetadata {
  const obj = raw as Record<string, unknown>;
  const toolInfo = obj?.tool_info as Record<string, unknown> | undefined;

  return {
    projectRoot: (obj?.project_root as string) || "",
    toolName: (toolInfo?.name as string) || "unknown",
    toolVersion: (toolInfo?.version as string) || "unknown",
  };
}

function parseDocument(raw: unknown): ScipDocument {
  const obj = raw as Record<string, unknown>;

  return {
    relativePath: (obj.relative_path as string) || "",
    language: (obj.language as string) || "",
    symbols: ((obj.symbols as unknown[]) || []).map(parseSymbolInfo),
    occurrences: ((obj.occurrences as unknown[]) || []).map(parseOccurrence),
  };
}

function parseSymbolInfo(raw: unknown): ScipSymbolInfo {
  const obj = raw as Record<string, unknown>;

  return {
    symbol: (obj.symbol as string) || "",
    documentation: (obj.documentation as string[]) || [],
    kind: (obj.kind as ScipSymbolKind) || ScipSymbolKind.UnspecifiedKind,
    displayName: (obj.display_name as string) || "",
    signatureDocumentation: extractSignatureDoc(obj.signature_documentation),
    enclosingSymbol: obj.enclosing_symbol as string | undefined,
    relationships: ((obj.relationships as unknown[]) || []).map(
      parseRelationship,
    ),
  };
}

function extractSignatureDoc(raw: unknown): string | undefined {
  if (!raw) return undefined;
  const obj = raw as Record<string, unknown>;
  // signature_documentation is a Document with text field
  return (obj.text as string) || undefined;
}

function parseOccurrence(raw: unknown): ScipOccurrence {
  const obj = raw as Record<string, unknown>;
  const range = parseRange(obj.range as number[] | undefined);
  const enclosingRange = obj.enclosing_range
    ? parseRange(obj.enclosing_range as number[])
    : undefined;
  const symbolRoles = (obj.symbol_roles as number) || 0;

  return {
    symbol: (obj.symbol as string) || "",
    range,
    enclosingRange,
    symbolRoles,
    isDefinition: (symbolRoles & ScipSymbolRole.Definition) !== 0,
  };
}

/**
 * Parse SCIP range format
 * SCIP uses a compact format: [startLine, startCol, endCol] for single line
 * or [startLine, startCol, endLine, endCol] for multi-line
 */
function parseRange(
  raw: number[] | undefined,
): [number, number, number, number] {
  if (!raw || raw.length === 0) {
    return [0, 0, 0, 0];
  }

  if (raw.length === 3) {
    // Single line: [startLine, startCol, endCol]
    return [raw[0], raw[1], raw[0], raw[2]];
  }

  if (raw.length >= 4) {
    // Multi-line: [startLine, startCol, endLine, endCol]
    return [raw[0], raw[1], raw[2], raw[3]];
  }

  return [0, 0, 0, 0];
}

function parseRelationship(raw: unknown): ScipRelationship {
  const obj = raw as Record<string, unknown>;

  return {
    symbol: (obj.symbol as string) || "",
    isReference: (obj.is_reference as boolean) || false,
    isImplementation: (obj.is_implementation as boolean) || false,
    isTypeDefinition: (obj.is_type_definition as boolean) || false,
    isDefinition: (obj.is_definition as boolean) || false,
  };
}

/**
 * Extract the name from a SCIP symbol string
 * Symbol format: scip-typescript npm package-name version path/to/file.ts descriptor
 *
 * Example symbols:
 * - `scip-typescript npm @doclea/mcp 0.0.1 src/scoring/`types.ts`/ScoringWeights#`
 * - `scip-typescript npm @doclea/mcp 0.0.1 src/config.ts loadConfig().`
 */
export function extractNameFromSymbol(symbol: string): string {
  // Get the last part after the file path
  // The file path is enclosed in backticks like `types.ts`
  const parts = symbol.split("/");
  let lastPart = parts[parts.length - 1] || "";

  // Handle backtick-wrapped file names
  if (lastPart.startsWith("`") && lastPart.includes("`/")) {
    // This is a file path like `types.ts`/ScoringWeights#
    const afterFile = lastPart.split("`/")[1];
    if (afterFile) {
      lastPart = afterFile;
    }
  }

  // Also check if it's in the space-separated part (older format)
  if (!lastPart || lastPart.includes("`")) {
    const spaceParts = symbol.split(" ");
    lastPart = spaceParts[spaceParts.length - 1] || "";
    // Extract after the file path
    if (lastPart.includes("/")) {
      const subParts = lastPart.split("/");
      lastPart = subParts[subParts.length - 1] || "";
    }
  }

  if (!lastPart) return symbol;

  // Remove descriptor suffix
  let name = lastPart
    .replace(/\(\)\.?$/, "") // function: name().
    .replace(/#$/, "") // type: name#
    .replace(/\.$/, "") // variable: name.
    .replace(/:$/, ""); // property: name:

  // Handle indexed names like `semantic0:` -> `semantic`
  name = name.replace(/\d+$/, "");

  // Handle nested descriptors like ClassName#methodName()
  if (name.includes("#")) {
    const nested = name.split("#");
    name = nested[nested.length - 1] || name;
  }

  return name;
}

/**
 * Extract file path from SCIP symbol
 */
export function extractFilePathFromSymbol(symbol: string): string | undefined {
  // Format: scip-typescript npm @doclea/mcp 1.0.0 src/path/to/file.ts descriptor
  const match = symbol.match(/\s([^\s]+\.[tj]sx?)\s/);
  return match ? match[1] : undefined;
}
