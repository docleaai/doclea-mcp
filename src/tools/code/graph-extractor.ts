import type { CodeChunk } from "../../chunking/code";
import type { SupportedLanguage } from "../../chunking/code";
import type { CodeEdge, CodeNode, ParsedImport } from "./types";
import { Parser, Language } from "web-tree-sitter";
import * as path from "node:path";
import * as fs from "node:fs/promises";


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
	 * Extract nodes and edges from an entire file
	 * Creates a module node for the file itself and processes all chunks
	 */
	async extractFromFile(
		filePath: string,
		chunks: CodeChunk[],
		fileContent?: string,
	): Promise<{ nodes: CodeNode[]; edges: CodeEdge[] }> {
		await this.init();

		const allNodes: CodeNode[] = [];
		const allEdges: CodeEdge[] = [];

		// Create module node for the file itself
		const moduleNode: CodeNode = {
			id: `${filePath}:module`,
			type: "module",
			name: path.basename(filePath),
			filePath,
			metadata: {
				fullPath: filePath,
				extension: path.extname(filePath),
				exportedSymbols: this.extractExportedSymbols(chunks),
			},
		};
		allNodes.push(moduleNode);

		// Process each chunk
		for (const chunk of chunks) {
			const { nodes, edges } = await this.extractFromChunk(chunk, filePath);
			allNodes.push(...nodes);
			allEdges.push(...edges);
		}

		// Extract file-level imports and create edges
		const importChunks = chunks.filter((c) => c.metadata.isImport);
		if (importChunks.length > 0 || fileContent) {
			const importEdges = await this.extractImportEdges(
				filePath,
				importChunks,
				fileContent,
			);
			allEdges.push(...importEdges);
		}

		return { nodes: allNodes, edges: allEdges };
	}

	/**
	 * Extract import edges from import chunks or file content
	 */
	async extractImportEdges(
		filePath: string,
		importChunks: CodeChunk[],
		fileContent?: string,
	): Promise<CodeEdge[]> {
		const edges: CodeEdge[] = [];
		const sourceModuleId = `${filePath}:module`;

		// Get language from file extension
		const ext = path.extname(filePath).slice(1);
		const language = this.extensionToLanguage(ext);
		if (!language) return edges;

		// Parse imports from chunks or file content
		let code = "";
		if (importChunks.length > 0) {
			code = importChunks.map((c) => c.content).join("\n");
		} else if (fileContent) {
			code = fileContent;
		}

		const imports = this.parseImportStatements(code, language);

		for (const imp of imports) {
			// Resolve import path to module ID
			const targetModuleId = this.resolveImportPath(filePath, imp.source);

			if (targetModuleId) {
				edges.push({
					id: `${sourceModuleId}:imports:${targetModuleId}`,
					fromNode: sourceModuleId,
					toNode: targetModuleId,
					edgeType: "imports",
					metadata: {
						importedSymbols: imp.symbols,
						isDefault: imp.isDefault,
						isNamespace: imp.isNamespace,
						line: imp.line,
					},
				});
			}

			// Check if it's an npm package
			if (this.isNpmPackage(imp.source)) {
				const packageName = this.extractPackageName(imp.source);
				const packageId = `npm:${packageName}`;
				edges.push({
					id: `${sourceModuleId}:depends_on:${packageId}`,
					fromNode: sourceModuleId,
					toNode: packageId,
					edgeType: "depends_on",
					metadata: {
						packageName,
						importedSymbols: imp.symbols,
						importPath: imp.source,
					},
				});
			}
		}

		return edges;
	}

	/**
	 * Parse import statements from code
	 */
	parseImportStatements(
		code: string,
		language: SupportedLanguage,
	): ParsedImport[] {
		const imports: ParsedImport[] = [];

		// TypeScript/JavaScript import patterns
		if (["typescript", "tsx", "javascript", "jsx"].includes(language)) {
			// import { a, b } from 'module'
			const namedRegex =
				/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gm;
			let match: RegExpExecArray | null = null;
			while ((match = namedRegex.exec(code)) !== null) {
				const symbols = match[1]
					.split(",")
					.map((s) => s.trim().split(/\s+as\s+/)[0].trim())
					.filter(Boolean);
				imports.push({
					source: match[2],
					symbols,
					isDefault: false,
					isNamespace: false,
					line: this.getLineNumber(code, match.index),
				});
			}

			// import default from 'module'
			const defaultRegex =
				/import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/gm;
			while ((match = defaultRegex.exec(code)) !== null) {
				// Skip if already matched as namespace import
				if (match[0].includes("* as")) continue;
				imports.push({
					source: match[2],
					symbols: [match[1]],
					isDefault: true,
					isNamespace: false,
					line: this.getLineNumber(code, match.index),
				});
			}

			// import * as ns from 'module'
			const namespaceRegex =
				/import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/gm;
			while ((match = namespaceRegex.exec(code)) !== null) {
				imports.push({
					source: match[2],
					symbols: [match[1]],
					isDefault: false,
					isNamespace: true,
					line: this.getLineNumber(code, match.index),
				});
			}

			// import 'module' (side-effect only)
			const sideEffectRegex = /import\s*['"]([^'"]+)['"]/gm;
			while ((match = sideEffectRegex.exec(code)) !== null) {
				// Skip if we already matched this position with another pattern
				const lineNum = this.getLineNumber(code, match.index);
				if (!imports.some((i) => i.line === lineNum)) {
					imports.push({
						source: match[1],
						symbols: [],
						isDefault: false,
						isNamespace: false,
						line: lineNum,
					});
				}
			}

			// require('module')
			const requireRegex =
				/(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
			while ((match = requireRegex.exec(code)) !== null) {
				const symbols = match[1]
					? match[1].split(",").map((s) => s.trim())
					: [match[2]];
				imports.push({
					source: match[3],
					symbols: symbols.filter(Boolean),
					isDefault: !match[1],
					isNamespace: false,
					line: this.getLineNumber(code, match.index),
				});
			}
		}

		// Python import patterns
		if (language === "python") {
			// from module import a, b
			const fromRegex = /from\s+(\S+)\s+import\s+([^\n]+)/gm;
			let match: RegExpExecArray | null = null;
			while ((match = fromRegex.exec(code)) !== null) {
				const symbols = match[2]
					.split(",")
					.map((s) => s.trim().split(/\s+as\s+/)[0].trim())
					.filter(Boolean);
				imports.push({
					source: match[1],
					symbols,
					isDefault: false,
					isNamespace: false,
					line: this.getLineNumber(code, match.index),
				});
			}

			// import module
			const importRegex = /^import\s+(\S+)(?:\s+as\s+\S+)?$/gm;
			while ((match = importRegex.exec(code)) !== null) {
				imports.push({
					source: match[1],
					symbols: [match[1]],
					isDefault: false,
					isNamespace: true,
					line: this.getLineNumber(code, match.index),
				});
			}
		}

		// Go import patterns
		if (language === "go") {
			// import "package"
			const singleRegex = /import\s+"([^"]+)"/gm;
			let match: RegExpExecArray | null = null;
			while ((match = singleRegex.exec(code)) !== null) {
				imports.push({
					source: match[1],
					symbols: [],
					isDefault: false,
					isNamespace: false,
					line: this.getLineNumber(code, match.index),
				});
			}

			// import ( "pkg1" "pkg2" )
			const multiRegex = /import\s*\(\s*([\s\S]*?)\s*\)/gm;
			while ((match = multiRegex.exec(code)) !== null) {
				const block = match[1];
				const pkgRegex = /(?:(\w+)\s+)?"([^"]+)"/gm;
				let pkgMatch: RegExpExecArray | null = null;
				while ((pkgMatch = pkgRegex.exec(block)) !== null) {
					imports.push({
						source: pkgMatch[2],
						symbols: pkgMatch[1] ? [pkgMatch[1]] : [],
						isDefault: false,
						isNamespace: false,
						line: this.getLineNumber(code, match.index),
					});
				}
			}
		}

		// Rust use patterns
		if (language === "rust") {
			// use crate::module;
			// use std::collections::HashMap;
			const useRegex = /use\s+([\w:]+)(?:::\{([^}]+)\})?;/gm;
			let match: RegExpExecArray | null = null;
			while ((match = useRegex.exec(code)) !== null) {
				const symbols = match[2]
					? match[2].split(",").map((s) => s.trim())
					: [match[1].split("::").pop() || match[1]];
				imports.push({
					source: match[1],
					symbols,
					isDefault: false,
					isNamespace: false,
					line: this.getLineNumber(code, match.index),
				});
			}
		}

		return imports;
	}

	/**
	 * Extract package nodes from package.json
	 */
	async extractPackageNodes(
		packageJsonPath: string,
	): Promise<{ nodes: CodeNode[]; edges: CodeEdge[] }> {
		const nodes: CodeNode[] = [];
		const edges: CodeEdge[] = [];

		try {
			const content = await fs.readFile(packageJsonPath, "utf-8");
			const packageJson = JSON.parse(content);

			const dependencies = {
				...packageJson.dependencies,
				...packageJson.devDependencies,
				...packageJson.peerDependencies,
			};

			for (const [name, version] of Object.entries(dependencies)) {
				nodes.push({
					id: `npm:${name}`,
					type: "package",
					name,
					filePath: packageJsonPath,
					metadata: {
						version: version as string,
						isDevDependency: name in (packageJson.devDependencies || {}),
						isPeerDependency: name in (packageJson.peerDependencies || {}),
					},
				});
			}
		} catch (error) {
			// File might not exist or be invalid
		}

		return { nodes, edges };
	}

	/**
	 * Resolve import path to module ID
	 */
	resolveImportPath(fromFile: string, importSource: string): string | null {
		// Skip npm packages - they're handled separately
		if (this.isNpmPackage(importSource)) {
			return null;
		}

		// Handle relative imports
		if (importSource.startsWith(".")) {
			const dir = path.dirname(fromFile);
			let resolved = path.resolve(dir, importSource);

			// Normalize to use forward slashes
			resolved = resolved.replace(/\\/g, "/");

			// If it doesn't have an extension, it could be:
			// - A file without extension (try common extensions)
			// - A directory with index file
			const ext = path.extname(resolved);
			if (!ext) {
				// Try common extensions
				const extensions = [
					".ts",
					".tsx",
					".js",
					".jsx",
					"/index.ts",
					"/index.tsx",
					"/index.js",
					"/index.jsx",
				];
				for (const tryExt of extensions) {
					return `${resolved}${tryExt}:module`;
				}
			}

			return `${resolved}:module`;
		}

		// Handle absolute imports (project paths)
		if (importSource.startsWith("@") || importSource.startsWith("src/")) {
			// These could be project aliases - return as-is for now
			return `${importSource}:module`;
		}

		return null;
	}

	/**
	 * Check if an import source is an npm package (not a relative/absolute path)
	 */
	isNpmPackage(source: string): boolean {
		// Not a relative or absolute path
		return (
			!source.startsWith(".") &&
			!source.startsWith("/") &&
			!source.startsWith("@/") && // Common project alias
			!source.startsWith("src/") // Common project path
		);
	}

	/**
	 * Extract the package name from an import source
	 * Handles scoped packages like @scope/package
	 */
	private extractPackageName(source: string): string {
		// Handle scoped packages: @scope/package/path -> @scope/package
		if (source.startsWith("@")) {
			const parts = source.split("/");
			if (parts.length >= 2) {
				return `${parts[0]}/${parts[1]}`;
			}
		}
		// Regular packages: package/path -> package
		return source.split("/")[0];
	}

	/**
	 * Get line number from string index
	 */
	private getLineNumber(code: string, index: number): number {
		return code.slice(0, index).split("\n").length;
	}

	/**
	 * Map file extension to supported language
	 */
	private extensionToLanguage(ext: string): SupportedLanguage | null {
		const map: Record<string, SupportedLanguage> = {
			ts: "typescript",
			tsx: "tsx",
			js: "javascript",
			jsx: "jsx",
			py: "python",
			go: "go",
			rs: "rust",
		};
		return map[ext] || null;
	}

	/**
	 * Extract exported symbols from chunks
	 */
	private extractExportedSymbols(chunks: CodeChunk[]): string[] {
		const exported: string[] = [];
		for (const chunk of chunks) {
			if (
				(chunk.metadata.isFunction || chunk.metadata.isClass) &&
				chunk.metadata.name &&
				this.isExported(chunk.content)
			) {
				exported.push(chunk.metadata.name);
			}
		}
		return exported;
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