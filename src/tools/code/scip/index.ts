/**
 * SCIP Code Analysis Module
 * Provides compiler-accurate code analysis using SCIP indexers
 */

export {
  type MappedCodeGraph,
  type MapperOptions,
  mapScipToCodeGraph,
} from "./mapper";
export { extractNameFromSymbol, parseScipIndex } from "./parser";
export {
  cleanupScipIndex,
  runScipIndexers,
  runScipTypeScript,
  type ScipRunnerOptions,
  type ScipRunResult,
  type SupportedLanguage,
} from "./runner";
export {
  type ScipDocument,
  type ScipIndex,
  type ScipMetadata,
  type ScipOccurrence,
  type ScipRelationship,
  type ScipSymbolInfo,
  ScipSymbolKind,
  ScipSymbolRole,
} from "./types";
