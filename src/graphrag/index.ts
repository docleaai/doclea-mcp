/**
 * GraphRAG module - Knowledge graph enhancement for memory retrieval
 *
 * This module implements GraphRAG capabilities:
 * - Entity and relationship extraction from memories
 * - Leiden community detection
 * - Community report generation
 * - Local, global, and drift search modes
 */

export type { HierarchyConfig } from "./community/hierarchy-builder";
export { HierarchyBuilder } from "./community/hierarchy-builder";
// Community detection
export { runLeiden, runLeidenWithFallback } from "./community/leiden";
export type { ReportConfig } from "./community/report-generator";
export { ReportGenerator } from "./community/report-generator";
export type { EntityExtractorConfig } from "./extraction/entity-extractor";
// Extraction
export { EntityExtractor } from "./extraction/entity-extractor";
export { extractEntitiesFallback } from "./extraction/fallback";
export * from "./extraction/prompts";
export type { MergeConfig } from "./graph/entity-merger";
export { EntityMerger } from "./graph/entity-merger";
export { GraphBuilder } from "./graph/graph-builder";
// Graph operations
export { GraphRAGStorage } from "./graph/graphrag-storage";
export { DriftSearch } from "./search/drift-search";
export { GlobalSearch } from "./search/global-search";
// Search
export { LocalSearch } from "./search/local-search";
// Types and schemas
export * from "./types";
