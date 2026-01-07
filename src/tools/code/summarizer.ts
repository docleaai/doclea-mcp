import type { CodeChunk } from "../../chunking/code";
import type { CodeUnitSummary, SummaryConfig } from "./types";

/**
 * Extracts summaries from existing code documentation
 * (JSDoc, docstrings, comments)
 *
 * For AI-generated summaries, the LLM client (Claude Desktop, etc)
 * can generate them and store back via MCP tools.
 */
export class CodeSummarizer {
	constructor(private config: SummaryConfig) {}

	/**
	 * Extract summary from code documentation
	 */
	async summarize(chunk: CodeChunk): Promise<CodeUnitSummary> {
		if (!this.config.enabled) {
			return {
				summary: "",
				generatedBy: "signature",
				confidence: 0,
			};
		}

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
			};
		}

		// 2. Try first-line comment
		const comment = this.extractFirstLineComment(chunk.content);
		if (comment) {
			return {
				summary: comment,
				generatedBy: "comment",
				confidence: 0.7,
			};
		}

		// 3. Generate simple description from signature
		const fromSignature = this.generateFromSignature(chunk);
		return {
			summary: fromSignature,
			generatedBy: "signature",
			confidence: 0.5,
		};
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