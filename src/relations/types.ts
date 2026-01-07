/**
 * Types for the relation detection system
 */

import type { MemoryRelationType } from "@/database/memory-relations";

/**
 * Detection methods used to identify relationships
 */
export type DetectionMethod = "semantic" | "keyword" | "file_overlap" | "temporal";

/**
 * Status of a relation suggestion
 */
export type SuggestionStatus = "pending" | "approved" | "rejected";

/**
 * Extended relation types including new detection-specific types
 */
export type ExtendedRelationType = MemoryRelationType | "causes" | "solves";

/**
 * A suggested relation between two memories
 */
export interface RelationSuggestion {
	id: string;
	sourceId: string;
	targetId: string;
	suggestedType: ExtendedRelationType;
	confidence: number;
	reason: string;
	detectionMethod: DetectionMethod;
	status: SuggestionStatus;
	createdAt: number;
	reviewedAt?: number;
}

/**
 * Configuration for the relation detector
 */
export interface DetectionConfig {
	/** Minimum semantic similarity score to consider (default: 0.75) */
	semanticThreshold: number;
	/** Confidence threshold for auto-approval (default: 0.85) */
	autoApproveThreshold: number;
	/** Minimum confidence to create a suggestion (default: 0.6) */
	suggestionThreshold: number;
	/** Days to consider for temporal proximity (default: 7) */
	temporalWindowDays: number;
	/** Maximum candidates to return per strategy (default: 50) */
	maxCandidates: number;
}

/**
 * Default detection configuration
 */
export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
	semanticThreshold: 0.75,
	autoApproveThreshold: 0.85,
	suggestionThreshold: 0.6,
	temporalWindowDays: 7,
	maxCandidates: 50,
};

/**
 * A candidate relation found by a detection strategy
 */
export interface RelationCandidate {
	targetId: string;
	confidence: number;
	reason: string;
	detectionMethod: DetectionMethod;
	suggestedType?: ExtendedRelationType;
}

/**
 * Result of running detection for a memory
 */
export interface DetectionResult {
	/** Memory ID that was analyzed */
	sourceId: string;
	/** Relations that were auto-approved and created */
	autoApproved: RelationCandidate[];
	/** Suggestions created for review */
	suggestions: RelationSuggestion[];
	/** Total candidates found before filtering */
	totalCandidates: number;
	/** Candidates filtered out (self-reference, existing, etc.) */
	filteredCount: number;
}

/**
 * Options for getting pending suggestions
 */
export interface GetSuggestionsOptions {
	/** Filter by source memory ID */
	sourceId?: string;
	/** Filter by target memory ID */
	targetId?: string;
	/** Filter by detection method */
	detectionMethod?: DetectionMethod;
	/** Minimum confidence score */
	minConfidence?: number;
	/** Maximum results to return */
	limit?: number;
	/** Offset for pagination */
	offset?: number;
}

/**
 * Options for bulk review operations
 */
export interface BulkReviewOptions {
	/** Suggestion IDs to review */
	ids: string[];
	/** Action to take */
	action: "approve" | "reject";
}

/**
 * Result of a bulk review operation
 */
export interface BulkReviewResult {
	/** Number of suggestions processed */
	processed: number;
	/** Number of relations created (for approvals) */
	relationsCreated: number;
	/** IDs that failed to process */
	failed: string[];
}
