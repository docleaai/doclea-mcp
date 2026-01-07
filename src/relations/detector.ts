/**
 * Relation Detector
 *
 * Automatically detects relationships between memories using multiple strategies:
 * - Semantic similarity (vector search)
 * - Keyword overlap (tag matching)
 * - File path overlap
 * - Temporal proximity
 *
 * High-confidence relations (≥0.85) are auto-approved.
 * Medium-confidence relations (0.6-0.85) are stored as suggestions for review.
 */

import type { Memory } from "@/types";
import type { SQLiteDatabase } from "@/database/sqlite";
import type { MemoryRelationStorage } from "@/database/memory-relations";
import type { RelationSuggestionStorage } from "@/database/relation-suggestions";
import type { VectorStore, VectorSearchResult } from "@/vectors/interface";
import type { EmbeddingClient } from "@/embeddings/provider";
import type {
	DetectionConfig,
	DetectionResult,
	RelationCandidate,
	RelationSuggestion,
	DEFAULT_DETECTION_CONFIG,
} from "./types";
import { DEFAULT_DETECTION_CONFIG as DEFAULT_CONFIG } from "./types";
import {
	extractKeywords,
	calculateOverlapScore,
	calculateFileOverlapScore,
	calculateTemporalScore,
	getSharedFiles,
} from "./utils";
import { inferRelationType } from "./inference";

/**
 * Main relation detector class
 */
export class RelationDetector {
	private config: DetectionConfig;

	constructor(
		private memoryStorage: SQLiteDatabase,
		private relationStorage: MemoryRelationStorage,
		private suggestionStorage: RelationSuggestionStorage,
		private vectors?: VectorStore,
		private embeddings?: EmbeddingClient,
		config: Partial<DetectionConfig> = {},
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Detect relations for a memory
	 *
	 * Runs all detection strategies in parallel, merges results,
	 * and processes suggestions based on confidence thresholds.
	 */
	async detectRelationsForMemory(memory: Memory): Promise<DetectionResult> {
		// Run all detection strategies in parallel (each handles its own errors)
		const [semantic, keyword, fileOverlap, temporal] = await Promise.all([
			this.detectSemantic(memory).catch((err) => {
				console.warn("[doclea] Semantic detection failed:", err);
				return [];
			}),
			this.detectKeywordOverlap(memory).catch((err) => {
				console.warn("[doclea] Keyword detection failed:", err);
				return [];
			}),
			this.detectFileOverlap(memory).catch((err) => {
				console.warn("[doclea] File overlap detection failed:", err);
				return [];
			}),
			this.detectTemporalProximity(memory).catch((err) => {
				console.warn("[doclea] Temporal detection failed:", err);
				return [];
			}),
		]);

		// Merge all candidates
		const allCandidates = [...semantic, ...keyword, ...fileOverlap, ...temporal];
		const totalCandidates = allCandidates.length;

		// Deduplicate by target ID (keep highest confidence)
		const deduped = this.deduplicateCandidates(allCandidates);

		// Filter out self-references and existing relations
		const filtered = await this.filterCandidates(deduped, memory.id);
		const filteredCount = deduped.length - filtered.length;

		// Enrich candidates with inferred relation types
		const enriched = await this.enrichCandidates(memory, filtered);

		// Process based on confidence thresholds
		return this.processSuggestions(memory.id, enriched, totalCandidates, filteredCount);
	}

	/**
	 * Detect semantically similar memories using vector search
	 */
	private async detectSemantic(memory: Memory): Promise<RelationCandidate[]> {
		// Skip if no vector store or embeddings configured
		if (!this.vectors || !this.embeddings) {
			return [];
		}

		// Generate embedding for the memory
		const embeddingText = `${memory.title}\n${memory.content}`;
		const vector = await this.embeddings.embed(embeddingText);

		// Search for similar memories
		const results = await this.vectors.search(
			vector,
			{}, // No filters - search all
			this.config.maxCandidates,
		);

		// Convert to candidates
		const candidates: RelationCandidate[] = [];
		for (const result of results) {
			// Skip if below threshold
			if (result.score < this.config.semanticThreshold) continue;

			// Skip self
			if (result.payload?.memoryId === memory.id) continue;

			candidates.push({
				targetId: result.payload?.memoryId as string,
				confidence: result.score,
				reason: `Semantic similarity: ${(result.score * 100).toFixed(1)}%`,
				detectionMethod: "semantic",
			});
		}

		return candidates;
	}

	/**
	 * Detect memories with overlapping keywords/tags
	 */
	private async detectKeywordOverlap(memory: Memory): Promise<RelationCandidate[]> {
		// Extract keywords from content
		const keywords = extractKeywords(`${memory.title} ${memory.content}`);

		if (keywords.length === 0) {
			return [];
		}

		// Also include existing tags
		const allKeywords = [...new Set([...keywords, ...(memory.tags || [])])];

		// Search for memories with matching tags
		const matches = this.memoryStorage.searchByTags(allKeywords, memory.id);

		// Calculate overlap scores
		const candidates: RelationCandidate[] = [];
		for (const match of matches) {
			const score = calculateOverlapScore(allKeywords, match.tags || []);

			// Skip if below threshold
			if (score < this.config.suggestionThreshold) continue;

			candidates.push({
				targetId: match.id,
				confidence: Math.min(score * 1.2, 1), // Slight boost, capped at 1
				reason: `Keyword overlap: ${(score * 100).toFixed(1)}% match on tags`,
				detectionMethod: "keyword",
			});
		}

		return candidates.slice(0, this.config.maxCandidates);
	}

	/**
	 * Detect memories that reference the same files
	 */
	private async detectFileOverlap(memory: Memory): Promise<RelationCandidate[]> {
		const sourceFiles = memory.relatedFiles || [];
		if (sourceFiles.length === 0) {
			return [];
		}

		// Find memories with overlapping files
		const matches = this.memoryStorage.findByRelatedFiles(sourceFiles, memory.id);

		// Calculate overlap scores
		const candidates: RelationCandidate[] = [];
		for (const match of matches) {
			const targetFiles = match.relatedFiles || [];
			const score = calculateFileOverlapScore(sourceFiles, targetFiles);

			// Skip if below threshold
			if (score < this.config.suggestionThreshold) continue;

			const sharedFiles = getSharedFiles(sourceFiles, targetFiles);

			candidates.push({
				targetId: match.id,
				confidence: Math.min(score * 1.1, 1), // Slight boost, capped at 1
				reason: `File overlap: ${sharedFiles.length} shared file(s) - ${sharedFiles.slice(0, 3).join(", ")}${sharedFiles.length > 3 ? "..." : ""}`,
				detectionMethod: "file_overlap",
			});
		}

		return candidates.slice(0, this.config.maxCandidates);
	}

	/**
	 * Detect memories created within a similar time window
	 */
	private async detectTemporalProximity(memory: Memory): Promise<RelationCandidate[]> {
		const windowMs = this.config.temporalWindowDays * 24 * 60 * 60;
		const startTime = memory.createdAt - windowMs;
		const endTime = memory.createdAt + windowMs;

		// Find memories within the time window
		const matches = this.memoryStorage.findByTimeRange(startTime, endTime, memory.id);

		// Calculate temporal scores
		const candidates: RelationCandidate[] = [];
		for (const match of matches) {
			const score = calculateTemporalScore(
				memory.createdAt,
				match.createdAt,
				this.config.temporalWindowDays,
			);

			// Skip if below threshold (temporal alone is weak signal)
			// Use a higher threshold since temporal proximity is less meaningful
			if (score < this.config.suggestionThreshold + 0.1) continue;

			const daysDiff = Math.abs(memory.createdAt - match.createdAt) / (24 * 60 * 60);

			candidates.push({
				targetId: match.id,
				confidence: score * 0.8, // Reduce confidence since temporal is weak signal
				reason: `Temporal proximity: created ${daysDiff.toFixed(1)} days apart`,
				detectionMethod: "temporal",
			});
		}

		return candidates.slice(0, this.config.maxCandidates);
	}

	/**
	 * Deduplicate candidates by target ID, keeping highest confidence
	 */
	private deduplicateCandidates(candidates: RelationCandidate[]): RelationCandidate[] {
		const byTarget = new Map<string, RelationCandidate>();

		for (const candidate of candidates) {
			const existing = byTarget.get(candidate.targetId);
			if (!existing || candidate.confidence > existing.confidence) {
				// If merging, combine reasons
				if (existing) {
					candidate.reason = `${candidate.reason}; ${existing.reason}`;
				}
				byTarget.set(candidate.targetId, candidate);
			}
		}

		return Array.from(byTarget.values());
	}

	/**
	 * Filter out self-references and existing relations
	 */
	private async filterCandidates(
		candidates: RelationCandidate[],
		sourceId: string,
	): Promise<RelationCandidate[]> {
		const filtered: RelationCandidate[] = [];

		for (const candidate of candidates) {
			// Skip self-reference
			if (candidate.targetId === sourceId) continue;

			// Skip if relation already exists
			const exists = await this.relationStorage.relationExists(
				sourceId,
				candidate.targetId,
			);
			if (exists) continue;

			filtered.push(candidate);
		}

		return filtered;
	}

	/**
	 * Enrich candidates with inferred relation types
	 */
	private async enrichCandidates(
		sourceMemory: Memory,
		candidates: RelationCandidate[],
	): Promise<RelationCandidate[]> {
		const targetIds = candidates.map((c) => c.targetId);
		const targetMemories = this.memoryStorage.getMemoriesByIds(targetIds);
		const targetMap = new Map(targetMemories.map((m) => [m.id, m]));

		return candidates.map((candidate) => {
			const targetMemory = targetMap.get(candidate.targetId);
			if (targetMemory) {
				candidate.suggestedType = inferRelationType(sourceMemory, targetMemory);
			} else {
				candidate.suggestedType = "related_to";
			}
			return candidate;
		});
	}

	/**
	 * Process candidates into auto-approved relations or suggestions
	 */
	private async processSuggestions(
		sourceId: string,
		candidates: RelationCandidate[],
		totalCandidates: number,
		filteredCount: number,
	): Promise<DetectionResult> {
		const autoApproved: RelationCandidate[] = [];
		const suggestions: RelationSuggestion[] = [];

		for (const candidate of candidates) {
			if (candidate.confidence >= this.config.autoApproveThreshold) {
				// Auto-approve: create relation directly
				try {
					await this.relationStorage.createRelation(
						sourceId,
						candidate.targetId,
						candidate.suggestedType === "causes" || candidate.suggestedType === "solves"
							? "references" // Map extended types to base
							: (candidate.suggestedType as any),
						candidate.confidence,
						{
							detectionMethod: candidate.detectionMethod,
							reason: candidate.reason,
							autoApproved: true,
						},
					);
					autoApproved.push(candidate);
				} catch (error) {
					console.warn("[doclea] Failed to auto-approve relation:", error);
				}
			} else if (candidate.confidence >= this.config.suggestionThreshold) {
				// Store as suggestion for review
				try {
					const suggestion = await this.suggestionStorage.createSuggestion(
						sourceId,
						candidate.targetId,
						candidate.suggestedType || "related_to",
						candidate.confidence,
						candidate.reason,
						candidate.detectionMethod,
					);
					suggestions.push(suggestion);
				} catch (error) {
					console.warn("[doclea] Failed to create suggestion:", error);
				}
			}
			// Below suggestionThreshold: discard
		}

		return {
			sourceId,
			autoApproved,
			suggestions,
			totalCandidates,
			filteredCount,
		};
	}
}

/**
 * Create a relation detector with optional configuration
 */
export function createRelationDetector(
	memoryStorage: SQLiteDatabase,
	relationStorage: MemoryRelationStorage,
	suggestionStorage: RelationSuggestionStorage,
	vectors?: VectorStore,
	embeddings?: EmbeddingClient,
	config?: Partial<DetectionConfig>,
): RelationDetector {
	return new RelationDetector(
		memoryStorage,
		relationStorage,
		suggestionStorage,
		vectors,
		embeddings,
		config,
	);
}
