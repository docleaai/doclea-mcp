import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Database } from "bun:sqlite";
import { CodeGraphStorage } from "../../database/code-graph";
import type { EmbeddingClient } from "../../embeddings/provider";
import type { VectorStore } from "../../vectors/interface";
import { ChangeDetector } from "./change-detector";
import { IncrementalScanner } from "./incremental-scanner";
import { CodeSummarizer } from "./summarizer";
import { CodeWatcher } from "./watcher";
import type { IncrementalScanResult } from "./types";

export const ScanCodeInputSchema = z.object({
	patterns: z
		.array(z.string())
		.optional()
		.describe("Glob patterns to scan (default: **/*.{ts,tsx,js,jsx,py,go,rs})"),
	exclude: z
		.array(z.string())
		.optional()
		.describe("Patterns to exclude (default: node_modules, .git, dist, etc.)"),
	incremental: z
		.boolean()
		.default(true)
		.describe("Only scan changed files (true) or full scan (false)"),
	watch: z
		.boolean()
		.default(false)
		.describe("Start file watcher for continuous updates"),
	extractSummaries: z
		.boolean()
		.default(true)
		.describe("Extract summaries from JSDoc/docstrings"),
});

export type ScanCodeInput = z.infer<typeof ScanCodeInputSchema>;

// Global watcher instance
let globalWatcher: CodeWatcher | null = null;

export async function scanCode(
	input: ScanCodeInput,
	db: Database,
	vectorStore?: VectorStore,
	embeddings?: EmbeddingClient,
): Promise<{
	result: IncrementalScanResult | null;
	watcherStarted: boolean;
	message: string;
}> {
	const codeGraph = new CodeGraphStorage(db);
	const changeDetector = new ChangeDetector(db);
	const summarizer = input.extractSummaries
		? new CodeSummarizer({ enabled: true })
		: undefined;
	const scanner = new IncrementalScanner(
		changeDetector,
		codeGraph,
		summarizer,
		vectorStore,
		embeddings,
	);

	// Discover files
	const patterns = input.patterns || ["**/*.{ts,tsx,js,jsx,py,go,rs}"];
	const exclude = input.exclude || [
		"**/node_modules/**",
		"**/.git/**",
		"**/dist/**",
		"**/build/**",
		"**/.next/**",
		"**/coverage/**",
	];

	const files = discoverFiles(process.cwd(), patterns, exclude);

	// Read file contents
	const fileData = files.map((path) => ({
		path,
		content: readFileSync(path, "utf-8"),
	}));

	// Scan
	const result = input.incremental
		? await scanner.scanIncremental(fileData)
		: await fullScan(scanner, fileData);

	// Start watcher if requested
	let watcherStarted = false;
	if (input.watch && !globalWatcher) {
		globalWatcher = new CodeWatcher(scanner);
		await globalWatcher.start({
			patterns,
			exclude,
		});
		watcherStarted = true;
	}

	const stats = result.stats;
	const message = `Scanned ${stats.filesScanned} files. Nodes: +${stats.nodesAdded} ~${stats.nodesUpdated} -${stats.nodesDeleted}. Edges: +${stats.edgesAdded} -${stats.edgesDeleted}.${watcherStarted ? " File watcher started." : ""}`;

	return {
		result,
		watcherStarted,
		message,
	};
}

export async function stopCodeWatch(): Promise<{ message: string }> {
	if (globalWatcher) {
		await globalWatcher.stop();
		globalWatcher = null;
		return { message: "File watcher stopped" };
	}
	return { message: "No file watcher running" };
}

async function fullScan(
	scanner: IncrementalScanner,
	files: Array<{ path: string; content: string }>,
): Promise<IncrementalScanResult> {
	// For full scan, treat all files as "added"
	return scanner.scanIncremental(files);
}

function discoverFiles(
	rootDir: string,
	patterns: string[],
	exclude: string[],
): string[] {
	const files: string[] = [];

	function walk(dir: string, depth: number = 0): void {
		if (depth > 10) return; // Prevent infinite recursion

		try {
			const entries = readdirSync(dir);

			for (const entry of entries) {
				const fullPath = join(dir, entry);
				const relativePath = fullPath.substring(rootDir.length + 1);

				// Check exclusions
				if (shouldExclude(relativePath, exclude)) continue;

				try {
					const stat = statSync(fullPath);

					if (stat.isDirectory()) {
						walk(fullPath, depth + 1);
					} else if (stat.isFile()) {
						if (matchesPattern(relativePath, patterns)) {
							files.push(fullPath);
						}
					}
				} catch {
					// Skip files we can't stat
					continue;
				}
			}
		} catch {
			// Skip directories we can't read
		}
	}

	walk(rootDir);
	return files;
}

function shouldExclude(path: string, exclude: string[]): boolean {
	for (const pattern of exclude) {
		const regex = patternToRegex(pattern);
		if (regex.test(path)) return true;
	}
	return false;
}

function matchesPattern(path: string, patterns: string[]): boolean {
	for (const pattern of patterns) {
		const regex = patternToRegex(pattern);
		if (regex.test(path)) return true;
	}
	return false;
}

function patternToRegex(pattern: string): RegExp {
	// Simple glob to regex conversion
	const escaped = pattern
		.replace(/\./g, "\\.")
		.replace(/\*\*/g, ".*")
		.replace(/\*/g, "[^/]*")
		.replace(/\{([^}]+)\}/g, "($1)")
		.replace(/,/g, "|");
	return new RegExp(`^${escaped}$`);
}