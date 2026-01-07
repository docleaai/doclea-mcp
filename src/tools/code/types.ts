/**
 * Type definitions for the Code Knowledge Graph (KAG)
 */

export type CodeNodeType =
	| "function"
	| "class"
	| "interface"
	| "type"
	| "module";

export type CodeEdgeType =
	| "calls"
	| "imports"
	| "implements"
	| "extends"
	| "references";

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

export interface SummaryConfig {
	enabled: boolean;
}

export interface CodeUnitSummary {
	summary: string;
	generatedBy: "docstring" | "comment" | "signature" | "client";
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