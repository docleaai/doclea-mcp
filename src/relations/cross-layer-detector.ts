/**
 * Cross-Layer Relation Detector
 *
 * Detects relationships between code entities (KAG) and memory entities (RAG):
 * - documents: memory describes code unit
 * - addresses: code implements decision from memory
 * - exemplifies: code demonstrates pattern from memory
 */

import type { Memory } from "@/types";
import type { IStorageBackend } from "@/storage/interface";
import type { CodeGraphStorage, CodeNode } from "@/database/code-graph";
import type {
	CrossLayerRelationStorage,
	CrossLayerRelationType,
	CrossLayerDirection,
	CrossLayerDetectionMethod,
} from "@/database/cross-layer-relations";
import type {
	CrossLayerSuggestionStorage,
	CrossLayerSuggestion,
} from "@/database/cross-layer-suggestions";
import {
	extractCodeReferences,
	extractFilePaths,
	type ExtractedCodeReference,
} from "./cross-layer-extractor";
import { extractKeywords, calculateOverlapScore } from "./utils";

/**
 * Configuration for cross-layer detection
 */
export interface CrossLayerDetectionConfig {
	autoApproveThreshold: number;
	suggestionThreshold: number;
	maxCandidates: number;
	codeReferenceConfidence: number;
	filePathMatchConfidence: number;
	keywordMatchBaseConfidence: number;
}

/**
 * Default configuration
 */
export const DEFAULT_CROSS_LAYER_CONFIG: CrossLayerDetectionConfig = {
	autoApproveThreshold: 0.85,
	suggestionThreshold: 0.6,
	maxCandidates: 50,
	codeReferenceConfidence: 0.9,
	filePathMatchConfidence: 0.75,
	keywordMatchBaseConfidence: 0.6,
};

/**
 * Candidate for cross-layer relation
 */
export interface CrossLayerCandidate {
	memoryId: string;
	codeNodeId: string;
	direction: CrossLayerDirection;
	relationType: CrossLayerRelationType;
	confidence: number;
	reason: string;
	detectionMethod: CrossLayerDetectionMethod;
	matchedReference?: string;
}

/**
 * Result of cross-layer detection
 */
export interface CrossLayerDetectionResult {
	entityId: string;
	entityType: "memory" | "code";
	autoApproved: CrossLayerCandidate[];
	suggestions: CrossLayerSuggestion[];
	totalCandidates: number;
	filteredCount: number;
}

/**
 * Main cross-layer detector class
 */
export class CrossLayerDetector {
	private config: CrossLayerDetectionConfig;

	constructor(
		private storage: IStorageBackend,
		private codeGraph: CodeGraphStorage,
		private relationStorage: CrossLayerRelationStorage,
		private suggestionStorage: CrossLayerSuggestionStorage,
		config: Partial<CrossLayerDetectionConfig> = {},
	) {
		this.config = { ...DEFAULT_CROSS_LAYER_CONFIG, ...config };
	}

	/**
	 * Detect cross-layer relations for a memory
	 *
	 * Finds code nodes that the memory references (documents relationship)
	 */
	async detectForMemory(memory: Memory): Promise<CrossLayerDetectionResult> {
		// Run detection strategies in parallel
		const [codeRefs, filePathMatches] = await Promise.all([
			this.detectCodeReferences(memory).catch((err) => {
				console.warn("[doclea] Code reference detection failed:", err);
				return [];
			}),
			this.detectFilePathOverlap(memory).catch((err) => {
				console.warn("[doclea] File path detection failed:", err);
				return [];
			}),
		]);

		// Merge all candidates
		const allCandidates = [...codeRefs, ...filePathMatches];
		const totalCandidates = allCandidates.length;

		// Deduplicate by code node ID (keep highest confidence)
		const deduped = this.deduplicateCandidates(allCandidates);

		// Filter out existing relations
		const filtered = await this.filterCandidates(deduped);
		const filteredCount = deduped.length - filtered.length;

		// Process based on confidence thresholds
		return this.processSuggestions(
			memory.id,
			"memory",
			filtered,
			totalCandidates,
			filteredCount,
		);
	}

	/**
	 * Detect cross-layer relations for a code node
	 *
	 * Finds memories that the code implements (addresses/exemplifies relationships)
	 */
	async detectForCodeNode(
		codeNode: CodeNode,
	): Promise<CrossLayerDetectionResult> {
		// Run detection strategies in parallel
		const [addresses, exemplifies] = await Promise.all([
			this.detectAddresses(codeNode).catch((err) => {
				console.warn("[doclea] Addresses detection failed:", err);
				return [];
			}),
			this.detectExemplifies(codeNode).catch((err) => {
				console.warn("[doclea] Exemplifies detection failed:", err);
				return [];
			}),
		]);

		// Merge all candidates
		const allCandidates = [...addresses, ...exemplifies];
		const totalCandidates = allCandidates.length;

		// Deduplicate by memory ID (keep highest confidence)
		const deduped = this.deduplicateCandidatesByMemory(allCandidates);

		// Filter out existing relations
		const filtered = await this.filterCandidates(deduped);
		const filteredCount = deduped.length - filtered.length;

		// Process based on confidence thresholds
		return this.processSuggestions(
			codeNode.id,
			"code",
			filtered,
			totalCandidates,
			filteredCount,
		);
	}

	/**
	 * Detect code references in memory content
	 *
	 * Extracts backtick-quoted code references and matches against code graph
	 */
	private async detectCodeReferences(
		memory: Memory,
	): Promise<CrossLayerCandidate[]> {
		const candidates: CrossLayerCandidate[] = [];

		// Extract code references from memory content
		const refs = extractCodeReferences(memory.content);

		for (const ref of refs) {
			// Try to find matching code node
			const node = await this.codeGraph.findNodeByName(ref.name);

			if (node) {
				candidates.push({
					memoryId: memory.id,
					codeNodeId: node.id,
					direction: "memory_to_code",
					relationType: "documents",
					confidence: this.config.codeReferenceConfidence,
					reason: `Memory references \`${ref.name}\` which matches code node "${node.name}"`,
					detectionMethod: "code_reference",
					matchedReference: ref.name,
				});
			}
		}

		return candidates;
	}

	/**
	 * Detect code nodes in memory's related files
	 *
	 * Finds code nodes in files that the memory references
	 */
	private async detectFilePathOverlap(
		memory: Memory,
	): Promise<CrossLayerCandidate[]> {
		const candidates: CrossLayerCandidate[] = [];

		// Check memory's relatedFiles
		const filePaths = memory.relatedFiles || [];

		// Also extract file paths mentioned in content
		const contentPaths = extractFilePaths(memory.content);
		const allPaths = [...new Set([...filePaths, ...contentPaths])];

		for (const filePath of allPaths) {
			// Get all code nodes in this file
			const nodes = await this.codeGraph.getNodesByPath(filePath);

			for (const node of nodes) {
				// Skip module nodes, focus on functions/classes
				if (node.type === "module") continue;

				candidates.push({
					memoryId: memory.id,
					codeNodeId: node.id,
					direction: "memory_to_code",
					relationType: "documents",
					confidence: this.config.filePathMatchConfidence,
					reason: `Memory references file "${filePath}" containing "${node.name}"`,
					detectionMethod: "file_path_match",
				});
			}
		}

		return candidates;
	}

	/**
	 * Detect decision/architecture memories that code addresses
	 *
	 * For code nodes, find related decision memories
	 */
	private async detectAddresses(
		codeNode: CodeNode,
	): Promise<CrossLayerCandidate[]> {
		const candidates: CrossLayerCandidate[] = [];

		// Find memories that reference this code's file
		const relatedMemories = this.storage.findByRelatedFiles(
			[codeNode.filePath],
			undefined, // No excludeId needed for code nodes
		);

		// Extract keywords from code node for matching
		const codeKeywords = extractKeywords(
			`${codeNode.name} ${codeNode.signature || ""} ${codeNode.summary || ""}`,
		);

		for (const memory of relatedMemories) {
			// Only consider decision and architecture memories
			if (memory.type !== "decision" && memory.type !== "architecture") {
				continue;
			}

			// Calculate keyword overlap
			const memoryKeywords = extractKeywords(
				`${memory.title} ${memory.content}`,
			);
			const overlap = calculateOverlapScore(codeKeywords, memoryKeywords);

			// Require minimum overlap
			if (overlap < 0.2) continue;

			// Scale confidence based on overlap (0.6 - 0.75)
			const confidence =
				this.config.keywordMatchBaseConfidence + overlap * 0.15;

			candidates.push({
				memoryId: memory.id,
				codeNodeId: codeNode.id,
				direction: "code_to_memory",
				relationType: "addresses",
				confidence: Math.min(confidence, 0.75),
				reason: `Code "${codeNode.name}" may implement decision "${memory.title}" (${(overlap * 100).toFixed(0)}% keyword overlap)`,
				detectionMethod: "keyword_match",
			});
		}

		return candidates;
	}

	/**
	 * Detect pattern memories that code exemplifies
	 *
	 * For code nodes, find pattern memories that mention them
	 */
	private async detectExemplifies(
		codeNode: CodeNode,
	): Promise<CrossLayerCandidate[]> {
		const candidates: CrossLayerCandidate[] = [];

		// Get pattern memories
		const patterns = this.storage.listMemories({
			type: "pattern",
			limit: 100,
		});

		for (const pattern of patterns) {
			// Check if pattern content mentions this code
			const refs = extractCodeReferences(pattern.content);
			const nameMatch = refs.some(
				(r) => r.name.toLowerCase() === codeNode.name.toLowerCase(),
			);

			if (nameMatch) {
				candidates.push({
					memoryId: pattern.id,
					codeNodeId: codeNode.id,
					direction: "code_to_memory",
					relationType: "exemplifies",
					confidence: 0.85,
					reason: `Code "${codeNode.name}" is referenced in pattern "${pattern.title}"`,
					detectionMethod: "code_reference",
					matchedReference: codeNode.name,
				});
				continue;
			}

			// Also check keyword overlap
			const patternKeywords = extractKeywords(
				`${pattern.title} ${pattern.content}`,
			);
			const codeKeywords = extractKeywords(
				`${codeNode.name} ${codeNode.signature || ""} ${codeNode.summary || ""}`,
			);
			const overlap = calculateOverlapScore(codeKeywords, patternKeywords);

			if (overlap > 0.4) {
				const confidence = 0.65 + overlap * 0.15;
				candidates.push({
					memoryId: pattern.id,
					codeNodeId: codeNode.id,
					direction: "code_to_memory",
					relationType: "exemplifies",
					confidence: Math.min(confidence, 0.8),
					reason: `Code "${codeNode.name}" may demonstrate pattern "${pattern.title}" (${(overlap * 100).toFixed(0)}% keyword match)`,
					detectionMethod: "keyword_match",
				});
			}
		}

		return candidates;
	}

	/**
	 * Deduplicate candidates by code node ID, keeping highest confidence
	 */
	private deduplicateCandidates(
		candidates: CrossLayerCandidate[],
	): CrossLayerCandidate[] {
		const byCodeNode = new Map<string, CrossLayerCandidate>();

		for (const candidate of candidates) {
			const existing = byCodeNode.get(candidate.codeNodeId);
			if (!existing || candidate.confidence > existing.confidence) {
				// Merge reasons if same target
				if (existing && candidate.codeNodeId === existing.codeNodeId) {
					candidate.reason = `${existing.reason}; ${candidate.reason}`;
				}
				byCodeNode.set(candidate.codeNodeId, candidate);
			}
		}

		return Array.from(byCodeNode.values());
	}

	/**
	 * Deduplicate candidates by memory ID, keeping highest confidence
	 */
	private deduplicateCandidatesByMemory(
		candidates: CrossLayerCandidate[],
	): CrossLayerCandidate[] {
		const byMemory = new Map<string, CrossLayerCandidate>();

		for (const candidate of candidates) {
			const existing = byMemory.get(candidate.memoryId);
			if (!existing || candidate.confidence > existing.confidence) {
				if (existing && candidate.memoryId === existing.memoryId) {
					candidate.reason = `${existing.reason}; ${candidate.reason}`;
				}
				byMemory.set(candidate.memoryId, candidate);
			}
		}

		return Array.from(byMemory.values());
	}

	/**
	 * Filter out candidates where relation already exists
	 */
	private async filterCandidates(
		candidates: CrossLayerCandidate[],
	): Promise<CrossLayerCandidate[]> {
		const filtered: CrossLayerCandidate[] = [];

		for (const candidate of candidates) {
			const exists = await this.relationStorage.relationExists(
				candidate.memoryId,
				candidate.codeNodeId,
				candidate.relationType,
			);

			if (!exists) {
				filtered.push(candidate);
			}
		}

		return filtered;
	}

	/**
	 * Process candidates based on confidence thresholds
	 */
	private async processSuggestions(
		entityId: string,
		entityType: "memory" | "code",
		candidates: CrossLayerCandidate[],
		totalCandidates: number,
		filteredCount: number,
	): Promise<CrossLayerDetectionResult> {
		const autoApproved: CrossLayerCandidate[] = [];
		const suggestions: CrossLayerSuggestion[] = [];

		for (const candidate of candidates) {
			if (candidate.confidence >= this.config.autoApproveThreshold) {
				// Auto-approve high confidence
				await this.relationStorage.createRelation({
					memoryId: candidate.memoryId,
					codeNodeId: candidate.codeNodeId,
					relationType: candidate.relationType,
					direction: candidate.direction,
					confidence: candidate.confidence,
					metadata: {
						detectionMethod: candidate.detectionMethod,
						reason: candidate.reason,
						matchedReference: candidate.matchedReference,
					},
				});
				autoApproved.push(candidate);
			} else if (candidate.confidence >= this.config.suggestionThreshold) {
				// Create suggestion for review
				const suggestion = await this.suggestionStorage.createSuggestion(
					candidate.memoryId,
					candidate.codeNodeId,
					candidate.direction,
					candidate.relationType,
					candidate.confidence,
					candidate.reason,
					candidate.detectionMethod,
				);
				suggestions.push(suggestion);
			}
			// Below suggestionThreshold: discard
		}

		return {
			entityId,
			entityType,
			autoApproved,
			suggestions,
			totalCandidates,
			filteredCount,
		};
	}
}

/**
 * Helper function to create a cross-layer detector
 */
export function createCrossLayerDetector(
	storage: IStorageBackend,
	codeGraph: CodeGraphStorage,
	relationStorage: CrossLayerRelationStorage,
	suggestionStorage: CrossLayerSuggestionStorage,
	config?: Partial<CrossLayerDetectionConfig>,
): CrossLayerDetector {
	return new CrossLayerDetector(
		storage,
		codeGraph,
		relationStorage,
		suggestionStorage,
		config,
	);
}
