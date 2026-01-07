/**
 * Type definitions for the Code Knowledge Graph (KAG)
 */

export type CodeNodeType =
	| "function"
	| "class"
	| "interface"
	| "type"
	| "module"
	| "package";

export type CodeEdgeType =
	| "calls"
	| "imports"
	| "implements"
	| "extends"
	| "references"
	| "depends_on";

export type CallGraphDirection = "outgoing" | "incoming" | "both";
export type DependencyTreeDirection = "imports" | "importedBy" | "both";

export interface CodeNode {
	id: string;
	type: CodeNodeType;
	name: string;
	filePath: string;
	startLine?: number;
	endLine?: number;
	signature?: string;
	summary?: string;
	metadata: Record<string, any>;
	createdAt?: number;
	updatedAt?: number;
}

export interface CodeEdge {
	id: string;
	fromNode: string;
	toNode: string;
	edgeType: CodeEdgeType;
	metadata?: Record<string, any>;
	createdAt?: number;
}

export interface FileHash {
	path: string;
	hash: string;
	updatedAt: number;
}

export interface CallGraphResult {
	nodes: CodeNode[];
	edges: CodeEdge[];
}

export interface BreakingChange {
	node: CodeNode;
	reason: string;
	severity: "high" | "medium" | "low";
}

export interface ImpactAnalysisResult {
	affectedNodes: CodeNode[];
	affectedEdges: CodeEdge[];
	depth: number;
	breakingChanges: BreakingChange[];
}

export interface ParsedImport {
	source: string;
	symbols: string[];
	isDefault: boolean;
	isNamespace: boolean;
	line: number;
}

export interface FileChange {
	path: string;
	type: "added" | "modified" | "deleted";
	oldHash?: string;
	newHash?: string;
}

export interface ScanStats {
	filesScanned: number;
	nodesAdded: number;
	nodesUpdated: number;
	nodesDeleted: number;
	edgesAdded: number;
	edgesDeleted: number;
	documentsUpdated: number;
	embeddingsRegenerated: number;
}

export type SummaryStrategy = "heuristic" | "hybrid";

export interface SummaryConfig {
	enabled: boolean;
	strategy?: SummaryStrategy;
	preferAiForExported?: boolean;
	minConfidenceThreshold?: number;
}

export interface CodeUnitSummary {
	summary: string;
	generatedBy: "docstring" | "comment" | "signature" | "ai" | "client";
	confidence: number;
	needsAiSummary?: boolean;
}

export interface SummaryStats {
	totalNodes: number;
	summarized: number;
	needsAiSummary: number;
	bySource: Record<string, number>;
}

export interface UnsummarizedNode {
	nodeId: string;
	name: string;
	type: CodeNodeType;
	filePath: string;
	code: string;
	currentSummary?: string;
	confidence: number;
}

export interface ScanOptions {
	patterns?: string[];
	exclude?: string[];
	incremental?: boolean;
	watch?: boolean;
	detectRelations?: boolean;
	extractSummaries?: boolean;
}

export interface IncrementalScanResult {
	changes: FileChange[];
	stats: ScanStats;
}