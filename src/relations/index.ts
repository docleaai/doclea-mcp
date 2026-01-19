/**
 * Relation Detection System
 *
 * Automatically detects and suggests relationships between memories using:
 * - Semantic similarity (vector search)
 * - Keyword/entity overlap
 * - File path overlap
 * - Temporal proximity
 */

// Detector
export { createRelationDetector, RelationDetector } from "./detector";
// Inference
export {
  getPossibleRelationTypes,
  inferRelationType,
  isValidRelationType,
} from "./inference";
// Types
export type {
  BulkReviewOptions,
  BulkReviewResult,
  DetectionConfig,
  DetectionMethod,
  DetectionResult,
  ExtendedRelationType,
  GetSuggestionsOptions,
  RelationCandidate,
  RelationSuggestion,
  SuggestionStatus,
} from "./types";
export { DEFAULT_DETECTION_CONFIG } from "./types";

// Utilities
export {
  calculateFileOverlapScore,
  calculateJaccardSimilarity,
  calculateOverlapScore,
  calculateTemporalScore,
  extractKeywords,
  getSharedFiles,
} from "./utils";
