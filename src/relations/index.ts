/**
 * Relation Detection System
 *
 * Automatically detects and suggests relationships between memories using:
 * - Semantic similarity (vector search)
 * - Keyword/entity overlap
 * - File path overlap
 * - Temporal proximity
 */

// Types
export type {
	DetectionMethod,
	SuggestionStatus,
	ExtendedRelationType,
	RelationSuggestion,
	DetectionConfig,
	RelationCandidate,
	DetectionResult,
	GetSuggestionsOptions,
	BulkReviewOptions,
	BulkReviewResult,
} from "./types";

export { DEFAULT_DETECTION_CONFIG } from "./types";

// Detector
export { RelationDetector, createRelationDetector } from "./detector";

// Inference
export { inferRelationType, getPossibleRelationTypes, isValidRelationType } from "./inference";

// Utilities
export {
	extractKeywords,
	calculateJaccardSimilarity,
	calculateOverlapScore,
	calculateFileOverlapScore,
	getSharedFiles,
	calculateTemporalScore,
} from "./utils";
