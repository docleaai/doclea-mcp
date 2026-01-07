import type { CodeChunk } from "../../chunking/code";
import type {
	SupportedLanguage,
} from "../../chunking/code";
import type { CodeEdge, CodeNode } from "./types";
import { Parser, Language } from "web-tree-sitter";


/**
 * Extracts code graph nodes and edges from Tree-sitter AST
 */
export class GraphExtractor {
	private parsers: Map<SupportedLanguage, Parser> = new Map();
	private initialized = false;

	async init(): Promise<void> {
		if (this.initialized) return;

		// Initialize Tree-sitter with WASM file
		const wasmPath = require.resolve("web-tree-sitter/tree-sitter.wasm");
		await Parser.init({
			locateFile() {
				return wasmPath;
			},
		});

		this.initialized = true;
	}

	/**
	 * Extract nodes and edges from a code chunk
	 */
	async extractFromChunk(
		chunk: CodeChunk,
		filePath: string,
	): Promise<{ nodes: CodeNode[]; edges: CodeEdge[] }> {
		await this.init();

		const nodes: CodeNode[] = [];
		const edges: CodeEdge[] = [];

		// Create node for the chunk itself
		if (chunk.metadata.isFunction || chunk.metadata.isClass) {
			const nodeId = this.generateNodeId(filePath, chunk);

			const node: CodeNode = {
				id: nodeId,
				type: chunk.metadata.isClass ? "class" : "function",
				name: chunk.metadata.name || "anonymous",
				filePath,
				startLine: chunk.metadata.startLine,
				endLine: chunk.metadata.endLine,
				signature: this.extractSignature(chunk.content),
				metadata: {
					language: chunk.metadata.language,
					nodeType: chunk.metadata.nodeType,
					parentName: chunk.metadata.parentName,
					isExported: this.isExported(chunk.content),
					isAsync: this.isAsync(chunk.content),
				},
			};
			nodes.push(node);

			// Extract relationships from the chunk
			const relationships = await this.extractRelationships(
				chunk,
				filePath,
				nodeId,
			);
			edges.push(...relationships);
		}

		return { nodes, edges };
	}

	/**
	 * Extract relationships (calls, imports, implements, extends) from code chunk
	 */
	private async extractRelationships(
		chunk: CodeChunk,
		filePath: string,
		sourceNodeId: string,
	): Promise<CodeEdge[]> {
		const edges: CodeEdge[] = [];

		try {
			const parser = await this.getParser(chunk.metadata.language);
			const tree = parser.parse(chunk.content);

			if (!tree) {
				console.warn(`Failed to parse chunk in ${filePath}`);
				return edges;
			}

			// Extract function calls
			const calls = this.findFunctionCalls(tree.rootNode, chunk.metadata.language);
			for (const call of calls) {
				const targetId = this.generateNodeId(filePath, {
					name: call.name,
					type: "function",
				});
				edges.push({
					id: `${sourceNodeId}:calls:${targetId}`,
					fromNode: sourceNodeId,
					toNode: targetId,
					edgeType: "calls",
					metadata: { line: call.line },
				});
			}

			// Extract class inheritance (extends/implements)
			if (chunk.metadata.isClass) {
				const inheritance = this.findInheritance(
					tree.rootNode,
					chunk.metadata.language,
				);
				for (const inh of inheritance) {
					const targetId = this.generateNodeId(filePath, {
						name: inh.name,
						type: inh.type === "implements" ? "interface" : "class",
					});
					edges.push({
						id: `${sourceNodeId}:${inh.type}:${targetId}`,
						fromNode: sourceNodeId,
						toNode: targetId,
						edgeType: inh.type,
						metadata: { line: inh.line },
					});
				}
			}
		} catch (error) {
			console.warn(
				`Failed to extract relationships from ${filePath}:`,
				error,
			);
		}

		return edges;
	}

	/**
	 * Find function calls in the AST
	 */
	private findFunctionCalls(
		node: any,
		language: SupportedLanguage,
	): Array<{ name: string; line: number }> {
		const calls: Array<{ name: string; line: number }> = [];

		const callNodeTypes = this.getCallExpressionTypes(language);

		const traverse = (n: any) => {
			if (callNodeTypes.includes(n.type)) {
				const name = this.extractCallName(n, language);
				if (name) {
					calls.push({ name, line: n.startPosition.row + 1 });
				}
			}

			for (const child of n.children) {
				traverse(child);
			}
		};

		traverse(node);
		return calls;
	}

	/**
	 * Find class inheritance (extends/implements)
	 */
	private findInheritance(
		node: any,
		language: SupportedLanguage,
	): Array<{ name: string; type: "implements" | "extends"; line: number }> {
		const inheritance: Array<{
			name: string;
			type: "implements" | "extends";
			line: number;
		}> = [];

		const traverse = (n: any) => {
			// TypeScript/JavaScript class heritage
			if (
				language === "typescript" ||
				language === "tsx" ||
				language === "javascript" ||
				language === "jsx"
			) {
				if (n.type === "class_heritage") {
					for (const child of n.children) {
						if (child.type === "extends_clause") {
							const name = child.children[1]?.text;
							if (name) {
								inheritance.push({
									name,
									type: "extends",
									line: child.startPosition.row + 1,
								});
							}
						} else if (child.type === "implements_clause") {
							// Can implement multiple interfaces
							const types = child.children.filter(
								(c: any) => c.type === "type_identifier" || c.type === "identifier",
							);
							for (const typeNode of types) {
								inheritance.push({
									name: typeNode.text,
									type: "implements",
									line: typeNode.startPosition.row + 1,
								});
							}
						}
					}
				}
			}

			// Python class inheritance
			if (language === "python") {
				if (n.type === "argument_list" && n.parent?.type === "class_definition") {
					for (const child of n.children) {
						if (child.type === "identifier") {
							inheritance.push({
								name: child.text,
								type: "extends",
								line: child.startPosition.row + 1,
							});
						}
					}
				}
			}

			// Go interface implementation (implicit)
			// Rust trait implementation
			// Would need more sophisticated detection

			for (const child of n.children) {
				traverse(child);
			}
		};

		traverse(node);
		return inheritance;
	}

	/**
	 * Get call expression node types for each language
	 */
	private getCallExpressionTypes(language: SupportedLanguage): string[] {
		switch (language) {
			case "typescript":
			case "tsx":
			case "javascript":
			case "jsx":
				return ["call_expression"];
			case "python":
				return ["call"];
			case "go":
				return ["call_expression"];
			case "rust":
				return ["call_expression"];
			default:
				return ["call_expression"];
		}
	}

	/**
	 * Extract function name from call expression
	 */
	private extractCallName(
		node: any,
		_language: SupportedLanguage,
	): string | null {
		// Try to find the identifier or member expression
		const findIdentifier = (n: any): string | null => {
			if (n.type === "identifier") {
				return n.text;
			}
			if (n.type === "member_expression" || n.type === "attribute") {
				// Get the property being accessed
				const property = n.children.find((c: any) => c.type === "property_identifier");
				return property?.text || null;
			}
			// Check first child
			if (n.children.length > 0) {
				return findIdentifier(n.children[0]);
			}
			return null;
		};

		return findIdentifier(node);
	}

	/**
	 * Extract signature from code (first line typically)
	 */
	private extractSignature(code: string): string {
		const lines = code.split("\n");
		// Find first non-comment, non-empty line
		for (const line of lines) {
			const trimmed = line.trim();
			if (
				trimmed &&
				!trimmed.startsWith("//") &&
				!trimmed.startsWith("/*") &&
				!trimmed.startsWith("*") &&
				!trimmed.startsWith("#")
			) {
				return trimmed;
			}
		}
		return lines[0] || "";
	}

	/**
	 * Check if function/class is exported
	 */
	private isExported(code: string): boolean {
		const firstLine = code.split("\n")[0];
		return (
			firstLine.includes("export ") ||
			firstLine.includes("public ") ||
			firstLine.includes("pub ")
		);
	}

	/**
	 * Check if function is async
	 */
	private isAsync(code: string): boolean {
		const firstLine = code.split("\n")[0];
		return firstLine.includes("async ");
	}

	/**
	 * Generate unique node ID
	 */
	private generateNodeId(
		filePath: string,
		chunk: CodeChunk | { name?: string; type?: string },
	): string {
		const name = ("metadata" in chunk ? chunk.metadata.name : chunk.name) || "anonymous";
		const type = ("metadata" in chunk ?
			(chunk.metadata.isClass ? "class" : "function") :
			chunk.type
		) || "unknown";
		return `${filePath}:${type}:${name}`;
	}

	/**
	 * Get or create Tree-sitter parser for language
	 */
	private async getParser(language: SupportedLanguage): Promise<Parser> {
		const cached = this.parsers.get(language);
		if (cached) {
			return cached;
		}

		await this.init();

		const parser = new Parser();
		const wasmFile = this.getWasmFile(language);
		const langObj = await Language.load(wasmFile);
		parser.setLanguage(langObj);

		this.parsers.set(language, parser);
		return parser;
	}

	/**
	 * Get WASM file path for language
	 */
	private getWasmFile(language: SupportedLanguage): string {
		// These paths should match the actual wasm files in node_modules
		const wasmMap: Record<SupportedLanguage, string> = {
			typescript: "node_modules/tree-sitter-typescript/typescript.wasm",
			tsx: "node_modules/tree-sitter-typescript/tsx.wasm",
			javascript: "node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm",
			jsx: "node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm",
			python: "node_modules/tree-sitter-python/tree-sitter-python.wasm",
			go: "node_modules/tree-sitter-go/tree-sitter-go.wasm",
			rust: "node_modules/tree-sitter-rust/tree-sitter-rust.wasm",
		};

		return wasmMap[language];
	}
}