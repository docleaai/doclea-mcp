import type { CodeChunk } from "../../chunking/code";
import type { CodeUnitSummary, SummaryConfig } from "./types";

/**
 * Extracts summaries from existing code documentation
 * (JSDoc, docstrings, comments)
 *
 * For AI-generated summaries, the LLM client (Claude Desktop, etc)
 * can generate them and store back via MCP tools.
 *
 * Supports two strategies:
 * - 'heuristic': Only extracts from existing docs (fast, free)
 * - 'hybrid': Extracts + flags low-confidence for AI generation
 */
export class CodeSummarizer {
	constructor(private config: SummaryConfig) {}

	/**
	 * Extract summary from code documentation
	 * In hybrid mode, flags low-confidence results for AI generation
	 */
	async summarize(chunk: CodeChunk): Promise<CodeUnitSummary> {
		if (!this.config.enabled) {
			return {
				summary: "",
				generatedBy: "signature",
				confidence: 0,
				needsAiSummary: false,
			};
		}

		// Get heuristic summary first
		const result = await this.heuristicSummary(chunk);

		// In hybrid mode, determine if AI summary is needed
		if (this.config.strategy === "hybrid") {
			const threshold = this.config.minConfidenceThreshold ?? 0.6;

			// Flag low-confidence results for AI
			if (result.confidence < threshold) {
				result.needsAiSummary = true;
			}

			// Also flag exported APIs if configured
			if (this.config.preferAiForExported && this.isExported(chunk)) {
				result.needsAiSummary = true;
			}
		}

		return result;
	}

	/**
	 * Extract summary using heuristics only (JSDoc, docstrings, comments)
	 */
	async heuristicSummary(chunk: CodeChunk): Promise<CodeUnitSummary> {
		// 1. Try to extract JSDoc/docstring
		const docstring = this.extractDocstring(
			chunk.content,
			chunk.metadata.language,
		);
		if (docstring) {
			return {
				summary: docstring,
				generatedBy: "docstring",
				confidence: 0.9,
				needsAiSummary: false,
			};
		}

		// 2. Try first-line comment
		const comment = this.extractFirstLineComment(chunk.content);
		if (comment) {
			return {
				summary: comment,
				generatedBy: "comment",
				confidence: 0.7,
				needsAiSummary: false,
			};
		}

		// 3. Generate simple description from signature
		const fromSignature = this.generateFromSignature(chunk);
		return {
			summary: fromSignature,
			generatedBy: "signature",
			confidence: 0.5,
			needsAiSummary: false,
		};
	}

	/**
	 * Check if code is exported (public API)
	 */
	private isExported(chunk: CodeChunk): boolean {
		// Check metadata first
		if (chunk.metadata.isExported === true) {
			return true;
		}

		const content = chunk.content;
		const lines = content.split("\n");

		// Check all lines for export keywords (not just first line, as there may be docs/comments)
		for (const line of lines) {
			const trimmed = line.trim();

			// Skip empty lines and comments
			if (
				!trimmed ||
				trimmed.startsWith("//") ||
				trimmed.startsWith("/*") ||
				trimmed.startsWith("*") ||
				trimmed.startsWith("///") ||
				trimmed.startsWith("#")
			) {
				continue;
			}

			// Check for export keywords on actual code lines
			if (
				trimmed.startsWith("export ") ||
				trimmed.startsWith("public ") ||
				trimmed.startsWith("pub ") ||
				trimmed.includes(" export ") ||
				trimmed.includes(" public ") ||
				trimmed.includes(" pub ")
			) {
				return true;
			}

			// Stop at the first actual code line that doesn't have export
			break;
		}

		return false;
	}

	/**
	 * Extract docstring/JSDoc from code
	 */
	private extractDocstring(code: string, language: string): string | null {
		// JSDoc for JavaScript/TypeScript: /** ... */
		if (
			language === "typescript" ||
			language === "tsx" ||
			language === "javascript" ||
			language === "jsx"
		) {
			const jsdocMatch = code.match(/\/\*\*\s*\n([^*]|\*(?!\/))*\*\//);
			if (jsdocMatch) {
				return this.cleanDocstring(jsdocMatch[0]);
			}
		}

		// Python docstring: """...""" or '''...'''
		if (language === "python") {
			const pydocMatch = code.match(/"{3}(.*?)"{3}|'{3}(.*?)'{3}/s);
			if (pydocMatch) {
				return (pydocMatch[1] || pydocMatch[2]).trim();
			}
		}

		// Go doc comments: // ... before function
		if (language === "go") {
			const lines = code.split("\n");
			const comments: string[] = [];
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed.startsWith("//")) {
					comments.push(trimmed.substring(2).trim());
				} else if (trimmed) {
					break; // Stop at first non-comment line
				}
			}
			if (comments.length > 0) {
				return comments.join(" ");
			}
		}

		// Rust doc comments: /// ... or //! ...
		if (language === "rust") {
			const lines = code.split("\n");
			const comments: string[] = [];
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed.startsWith("///")) {
					comments.push(trimmed.substring(3).trim());
				} else if (trimmed.startsWith("//!")) {
					comments.push(trimmed.substring(3).trim());
				} else if (trimmed) {
					break;
				}
			}
			if (comments.length > 0) {
				return comments.join(" ");
			}
		}

		return null;
	}

	/**
	 * Extract first-line comment
	 */
	private extractFirstLineComment(code: string): string | null {
		const lines = code.split("\n");
		for (const line of lines.slice(0, 3)) {
			// Check first 3 lines
			const commentMatch = line.match(/\/\/\s*(.+)|#\s*(.+)/);
			if (commentMatch) {
				return (commentMatch[1] || commentMatch[2]).trim();
			}
		}
		return null;
	}

	/**
	 * Generate simple summary from function signature
	 */
	private generateFromSignature(chunk: CodeChunk): string {
		const meta = chunk.metadata;
		const name = meta.name || "anonymous";

		if (meta.isFunction) {
			return `Function ${name}`;
		}

		if (meta.isClass) {
			return `Class ${name}`;
		}

		return `Code unit ${name}`;
	}

	/**
	 * Clean JSDoc/docstring by removing comment markers
	 */
	private cleanDocstring(docstring: string): string {
		return docstring
			.replace(/\/\*\*|\*\/|\*/g, "")
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
			.join(" ")
			.trim();
	}
}