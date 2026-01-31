/**
 * SCIP to CodeNode/CodeEdge Mapper
 * Converts SCIP index data into the internal CodeNode and CodeEdge format
 */

import { join } from "node:path";
import type { CodeEdge, CodeEdgeType, CodeNode, CodeNodeType } from "../types";
import { extractNameFromSymbol, parseScipIndex } from "./parser";
import type {
  ScipDocument,
  ScipIndex,
  ScipOccurrence,
  ScipSymbolInfo,
} from "./types";
import { ScipSymbolKind, ScipSymbolRole } from "./types";

export interface MapperOptions {
  projectRoot: string;
  indexPath: string;
}

export interface MappedCodeGraph {
  nodes: CodeNode[];
  edges: CodeEdge[];
  stats: {
    totalDocuments: number;
    totalSymbols: number;
    totalOccurrences: number;
    nodesByType: Record<CodeNodeType, number>;
    edgesByType: Record<CodeEdgeType, number>;
  };
}

/**
 * Map a SCIP index to CodeNode and CodeEdge arrays
 */
export function mapScipToCodeGraph(options: MapperOptions): MappedCodeGraph {
  const index = parseScipIndex(options.indexPath);
  const nodes: CodeNode[] = [];
  const edges: CodeEdge[] = [];
  const symbolToNodeId = new Map<string, string>();

  const stats = {
    totalDocuments: index.documents.length,
    totalSymbols: 0,
    totalOccurrences: 0,
    nodesByType: {
      function: 0,
      class: 0,
      interface: 0,
      type: 0,
      module: 0,
      package: 0,
    } as Record<CodeNodeType, number>,
    edgesByType: {
      calls: 0,
      imports: 0,
      implements: 0,
      extends: 0,
      references: 0,
      depends_on: 0,
    } as Record<CodeEdgeType, number>,
  };

  // Process each document
  for (const doc of index.documents) {
    const filePath = join(options.projectRoot, doc.relativePath);

    // Build symbol -> occurrence map for this document
    const definitionOccurrences = new Map<string, ScipOccurrence>();
    for (const occ of doc.occurrences) {
      stats.totalOccurrences++;
      if (occ.isDefinition) {
        definitionOccurrences.set(occ.symbol, occ);
      }
    }

    // Process symbols in this document
    for (const symbol of doc.symbols) {
      stats.totalSymbols++;
      const nodeType = mapKindToNodeType(
        symbol.kind,
        symbol.symbol,
        symbol.documentation,
      );

      // Skip non-relevant symbol kinds
      if (!nodeType) continue;

      const occurrence = definitionOccurrences.get(symbol.symbol);
      const name = symbol.displayName || extractNameFromSymbol(symbol.symbol);

      // Generate node ID
      const nodeId = `${filePath}:${nodeType}:${name}`;
      symbolToNodeId.set(symbol.symbol, nodeId);

      const node: CodeNode = {
        id: nodeId,
        type: nodeType,
        name,
        filePath,
        startLine: occurrence ? occurrence.range[0] + 1 : undefined, // SCIP is 0-indexed
        endLine: occurrence?.enclosingRange
          ? occurrence.enclosingRange[2] + 1
          : occurrence
            ? occurrence.range[2] + 1
            : undefined,
        signature: extractSignature(symbol, doc),
        summary: symbol.documentation.join("\n") || undefined,
        metadata: {
          scipSymbol: symbol.symbol,
          scipKind: symbol.kind,
          enclosingSymbol: symbol.enclosingSymbol,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      nodes.push(node);
      stats.nodesByType[nodeType]++;
    }
  }

  // Second pass: create edges from relationships and references
  for (const doc of index.documents) {
    const filePath = join(options.projectRoot, doc.relativePath);

    for (const symbol of doc.symbols) {
      const fromNodeId = symbolToNodeId.get(symbol.symbol);
      if (!fromNodeId) continue;

      // Process relationships
      for (const rel of symbol.relationships) {
        const toNodeId = symbolToNodeId.get(rel.symbol);
        if (!toNodeId) continue;

        const edgeType = mapRelationshipToEdgeType(rel);
        if (!edgeType) continue;

        const edge: CodeEdge = {
          id: `${fromNodeId}->${toNodeId}:${edgeType}`,
          fromNode: fromNodeId,
          toNode: toNodeId,
          edgeType,
          metadata: {
            isImplementation: rel.isImplementation,
            isTypeDefinition: rel.isTypeDefinition,
          },
          createdAt: Date.now(),
        };

        edges.push(edge);
        stats.edgesByType[edgeType]++;
      }
    }

    // Process occurrences for call/reference edges
    for (const occ of doc.occurrences) {
      // Skip definitions
      if (occ.isDefinition) continue;

      const toNodeId = symbolToNodeId.get(occ.symbol);
      if (!toNodeId) continue;

      // Find the enclosing symbol for this occurrence
      const enclosingSymbol = findEnclosingSymbol(occ, doc);
      if (!enclosingSymbol) continue;

      const fromNodeId = symbolToNodeId.get(enclosingSymbol);
      if (!fromNodeId || fromNodeId === toNodeId) continue;

      // Determine edge type based on symbol roles
      const isImport = (occ.symbolRoles & ScipSymbolRole.Import) !== 0;
      const edgeType: CodeEdgeType = isImport ? "imports" : "calls";

      const edgeId = `${fromNodeId}->${toNodeId}:${edgeType}`;

      // Avoid duplicate edges
      if (edges.some((e) => e.id === edgeId)) continue;

      const edge: CodeEdge = {
        id: edgeId,
        fromNode: fromNodeId,
        toNode: toNodeId,
        edgeType,
        metadata: {
          line: occ.range[0] + 1,
        },
        createdAt: Date.now(),
      };

      edges.push(edge);
      stats.edgesByType[edgeType]++;
    }
  }

  return { nodes, edges, stats };
}

/**
 * Map SCIP SymbolKind to CodeNodeType
 * Falls back to inferring from symbol descriptor if kind is unspecified
 */
function mapKindToNodeType(
  kind: ScipSymbolKind,
  symbol: string,
  docs: string[],
): CodeNodeType | null {
  // If kind is specified, use it
  if (kind !== ScipSymbolKind.UnspecifiedKind) {
    switch (kind) {
      case ScipSymbolKind.Function:
      case ScipSymbolKind.Method:
      case ScipSymbolKind.Constructor:
      case ScipSymbolKind.Getter:
      case ScipSymbolKind.Setter:
      case ScipSymbolKind.StaticMethod:
      case ScipSymbolKind.AbstractMethod:
      case ScipSymbolKind.TraitMethod:
      case ScipSymbolKind.ProtocolMethod:
        return "function";

      case ScipSymbolKind.Class:
      case ScipSymbolKind.Struct:
      case ScipSymbolKind.SingletonClass:
      case ScipSymbolKind.Enum:
        return "class";

      case ScipSymbolKind.Interface:
      case ScipSymbolKind.Protocol:
      case ScipSymbolKind.Trait:
        return "interface";

      case ScipSymbolKind.Type:
      case ScipSymbolKind.TypeAlias:
      case ScipSymbolKind.TypeParameter:
      case ScipSymbolKind.TypeClass:
      case ScipSymbolKind.TypeFamily:
      case ScipSymbolKind.Union:
        return "type";

      case ScipSymbolKind.Module:
      case ScipSymbolKind.Namespace:
      case ScipSymbolKind.File:
        return "module";

      case ScipSymbolKind.Package:
      case ScipSymbolKind.PackageObject:
      case ScipSymbolKind.Library:
        return "package";

      default:
        // Skip constants, fields, parameters, etc.
        return null;
    }
  }

  // SCIP TypeScript doesn't set kind, so infer from symbol descriptor and docs
  return inferKindFromSymbol(symbol, docs);
}

/**
 * Infer CodeNodeType from SCIP symbol descriptor and documentation
 *
 * SCIP symbol format uses descriptors:
 * - `name().` = function/method
 * - `name#` = type/class/interface
 * - `name.` = variable/const (but could be module too)
 * - `name/` = module/namespace
 * - `name:` = property/field
 *
 * Documentation often contains TypeScript signatures like:
 * - "function name()" or "const name = () =>"
 * - "class Name"
 * - "interface Name"
 * - "type Name"
 */
function inferKindFromSymbol(
  symbol: string,
  docs: string[],
): CodeNodeType | null {
  const lastPart = symbol.split(" ").pop() || "";
  const docText = docs.join(" ").toLowerCase();

  // Check documentation for explicit type declarations
  if (docText.includes("interface ")) {
    return "interface";
  }
  if (docText.includes("class ")) {
    return "class";
  }
  if (/\btype\s+\w+/.test(docText)) {
    return "type";
  }
  if (docText.includes("enum ")) {
    return "class"; // Treat enums as classes
  }
  if (docText.includes("function ") || docText.includes("method ")) {
    return "function";
  }
  if (docText.includes("module ") || docText.includes("namespace ")) {
    return "module";
  }

  // Infer from symbol descriptor suffix
  if (lastPart.endsWith("().")) {
    return "function";
  }
  if (lastPart.endsWith("#")) {
    // # suffix used for types, interfaces, classes in SCIP TypeScript
    // Check docs to distinguish
    if (docText.includes("interface")) return "interface";
    if (docText.includes("class")) return "class";
    return "type"; // Default to type
  }
  if (lastPart.endsWith("/")) {
    return "module";
  }

  // Check for arrow functions in documentation
  if (docText.includes("=>") && !docText.includes("(property)")) {
    // Could be a const arrow function
    return "function";
  }

  // Skip properties, variables without function signatures, etc.
  if (lastPart.endsWith(":") || lastPart.endsWith(".")) {
    // Properties and simple variables - skip unless they're function types
    if (docText.includes("=>") || /\([^)]*\)\s*=>/.test(docText)) {
      return "function";
    }
    return null;
  }

  return null;
}

/**
 * Map SCIP relationship to CodeEdgeType
 */
function mapRelationshipToEdgeType(rel: {
  isImplementation: boolean;
  isTypeDefinition: boolean;
  isReference: boolean;
}): CodeEdgeType | null {
  if (rel.isImplementation) return "implements";
  if (rel.isTypeDefinition) return "extends";
  if (rel.isReference) return "references";
  return null;
}

/**
 * Extract signature from symbol info
 */
function extractSignature(
  symbol: ScipSymbolInfo,
  _doc: ScipDocument,
): string | undefined {
  // Use signature documentation if available
  if (symbol.signatureDocumentation) {
    return symbol.signatureDocumentation;
  }

  // Fall back to display name
  if (symbol.displayName) {
    return symbol.displayName;
  }

  return undefined;
}

/**
 * Find the enclosing symbol for an occurrence
 */
function findEnclosingSymbol(
  occ: ScipOccurrence,
  doc: ScipDocument,
): string | null {
  // Look for a symbol whose definition contains this occurrence
  for (const sym of doc.symbols) {
    if (sym.enclosingSymbol) {
      // If this symbol has an enclosing symbol, check if it matches
      const defOcc = doc.occurrences.find(
        (o) => o.symbol === sym.symbol && o.isDefinition,
      );
      if (
        defOcc &&
        rangeContains(defOcc.enclosingRange || defOcc.range, occ.range)
      ) {
        return sym.symbol;
      }
    }
  }

  // Find a symbol definition that contains this occurrence's line
  const occLine = occ.range[0];
  let bestMatch: {
    symbol: string;
    range: [number, number, number, number];
  } | null = null;

  for (const symOcc of doc.occurrences) {
    if (!symOcc.isDefinition) continue;
    const range = symOcc.enclosingRange || symOcc.range;
    if (occLine >= range[0] && occLine <= range[2]) {
      // This definition contains our occurrence
      if (
        !bestMatch ||
        range[2] - range[0] < bestMatch.range[2] - bestMatch.range[0]
      ) {
        // Prefer smaller (more specific) enclosing ranges
        bestMatch = { symbol: symOcc.symbol, range };
      }
    }
  }

  return bestMatch?.symbol || null;
}

/**
 * Check if range A contains range B
 */
function rangeContains(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return a[0] <= b[0] && a[2] >= b[2];
}
