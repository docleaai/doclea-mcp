/**
 * Code reference extraction from memory content
 *
 * Extracts references to code entities (functions, classes, files) from
 * memory content using pattern matching.
 */

/**
 * Type of extracted code reference
 */
export type CodeReferenceType = "function" | "class" | "file" | "generic";

/**
 * Extracted code reference from memory content
 */
export interface ExtractedCodeReference {
	type: CodeReferenceType;
	name: string;
	context: string;
	position: { start: number; end: number };
}

/**
 * Result of matching a reference to a code node
 */
export interface CodeReferenceMatch {
	reference: ExtractedCodeReference;
	nodeId: string;
	nodeName: string;
	nodeType: string;
	confidence: number;
}

// Regex patterns for extracting code references

/**
 * Backtick-quoted identifiers (most reliable)
 * Matches: `functionName`, `ClassName`, `module.method`
 */
const BACKTICK_PATTERN =
	/`([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)`/g;

/**
 * File path patterns
 * Matches: src/api/handler.ts, ./relative/path.ts, /absolute/path.js
 */
const FILE_PATH_PATTERN =
	/(?:^|\s|["'`(])([.\/]?(?:[\w-]+\/)*[\w-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|hpp))\b/gm;

/**
 * CamelCase class names with common suffixes
 * Matches: AuthService, UserController, DataManager, etc.
 */
const CLASS_NAME_PATTERN =
	/\b([A-Z][a-zA-Z0-9]+(?:Service|Handler|Controller|Manager|Factory|Repository|Provider|Store|Client|Helper|Util|Config|Options|Props|State|Context|Hook|Plugin|Middleware|Router|Model|Entity|Schema|Type|Interface|Validator|Parser|Builder|Resolver|Adapter|Wrapper))\b/g;

/**
 * Function call patterns (without backticks)
 * Matches: functionName(), methodCall()
 */
const FUNCTION_CALL_PATTERN = /\b([a-z][a-zA-Z0-9_]*)\s*\(/g;

/**
 * Extract all code references from memory content
 */
export function extractCodeReferences(content: string): ExtractedCodeReference[] {
	const references: ExtractedCodeReference[] = [];
	const seen = new Set<string>();

	// 1. Extract backtick-quoted references (highest priority)
	let match: RegExpExecArray | null;
	const backtickRegex = new RegExp(BACKTICK_PATTERN);
	while ((match = backtickRegex.exec(content)) !== null) {
		const name = match[1];
		const key = `backtick:${name}`;
		if (!seen.has(key)) {
			seen.add(key);
			references.push({
				type: inferReferenceType(name),
				name,
				context: getContext(content, match.index, match[0].length),
				position: { start: match.index, end: match.index + match[0].length },
			});
		}
	}

	// 2. Extract file paths
	const filePathRegex = new RegExp(FILE_PATH_PATTERN);
	while ((match = filePathRegex.exec(content)) !== null) {
		const name = match[1];
		const key = `file:${name}`;
		if (!seen.has(key)) {
			seen.add(key);
			references.push({
				type: "file",
				name,
				context: getContext(content, match.index, match[0].length),
				position: { start: match.index, end: match.index + match[0].length },
			});
		}
	}

	// 3. Extract class names with common suffixes
	const classNameRegex = new RegExp(CLASS_NAME_PATTERN);
	while ((match = classNameRegex.exec(content)) !== null) {
		const name = match[1];
		const key = `class:${name}`;
		if (!seen.has(key) && !isCommonWord(name)) {
			seen.add(key);
			references.push({
				type: "class",
				name,
				context: getContext(content, match.index, match[0].length),
				position: { start: match.index, end: match.index + match[0].length },
			});
		}
	}

	return references;
}

/**
 * Extract only file path references from content
 */
export function extractFilePaths(content: string): string[] {
	const paths: string[] = [];
	const seen = new Set<string>();

	let match: RegExpExecArray | null;
	const filePathRegex = new RegExp(FILE_PATH_PATTERN);
	while ((match = filePathRegex.exec(content)) !== null) {
		const path = match[1];
		if (!seen.has(path)) {
			seen.add(path);
			paths.push(path);
		}
	}

	return paths;
}

/**
 * Extract function names that look like they're being called
 */
export function extractFunctionCalls(content: string): string[] {
	const functions: string[] = [];
	const seen = new Set<string>();

	let match: RegExpExecArray | null;
	const funcRegex = new RegExp(FUNCTION_CALL_PATTERN);
	while ((match = funcRegex.exec(content)) !== null) {
		const name = match[1];
		// Skip common words that look like function calls
		if (!seen.has(name) && !isCommonFunctionWord(name)) {
			seen.add(name);
			functions.push(name);
		}
	}

	return functions;
}

/**
 * Infer the type of code reference from its name
 */
function inferReferenceType(name: string): CodeReferenceType {
	// If it contains a path separator, it's a file
	if (name.includes("/") || name.includes("\\")) {
		return "file";
	}

	// If it has a file extension, it's a file
	if (/\.[a-z]+$/i.test(name)) {
		return "file";
	}

	// If it starts with uppercase and has common class suffix, it's a class
	if (/^[A-Z]/.test(name)) {
		if (
			/(?:Service|Handler|Controller|Manager|Factory|Repository|Provider)$/.test(
				name,
			)
		) {
			return "class";
		}
		// Generic PascalCase could be a class or type
		return "class";
	}

	// If it's camelCase, likely a function
	if (/^[a-z][a-zA-Z0-9]*$/.test(name)) {
		return "function";
	}

	return "generic";
}

/**
 * Get surrounding context for a match
 */
function getContext(
	content: string,
	matchStart: number,
	matchLength: number,
	contextSize = 50,
): string {
	const start = Math.max(0, matchStart - contextSize);
	const end = Math.min(content.length, matchStart + matchLength + contextSize);

	let context = content.slice(start, end);

	// Add ellipsis if truncated
	if (start > 0) context = "..." + context;
	if (end < content.length) context = context + "...";

	return context.replace(/\n/g, " ").trim();
}

/**
 * Check if a word is a common non-code word that might match patterns
 */
function isCommonWord(word: string): boolean {
	const commonWords = new Set([
		"JavaScript",
		"TypeScript",
		"Python",
		"Service",
		"Handler",
		"Controller",
		"Manager",
		"Factory",
		"Repository",
		"Provider",
		"Interface",
		"Component",
		"Function",
		"Class",
		"Method",
		"Object",
		"Array",
		"String",
		"Number",
		"Boolean",
		"Promise",
		"Async",
		"Await",
		"Import",
		"Export",
		"Module",
		"Package",
		"Version",
		"Update",
		"Delete",
		"Create",
		"Read",
	]);
	return commonWords.has(word);
}

/**
 * Check if a function name is a common word
 */
function isCommonFunctionWord(word: string): boolean {
	const commonFunctionWords = new Set([
		"if",
		"for",
		"while",
		"switch",
		"return",
		"function",
		"const",
		"let",
		"var",
		"new",
		"this",
		"that",
		"then",
		"catch",
		"finally",
		"async",
		"await",
		"import",
		"export",
		"default",
		"class",
		"extends",
		"implements",
		"interface",
		"type",
		"enum",
		"use",
		"using",
		"from",
		"to",
		"is",
		"has",
		"get",
		"set",
		"add",
		"remove",
		"delete",
		"update",
		"create",
		"find",
		"search",
		"filter",
		"map",
		"reduce",
		"forEach",
		"some",
		"every",
		"includes",
		"indexOf",
		"push",
		"pop",
		"shift",
		"unshift",
		"slice",
		"splice",
		"concat",
		"join",
		"split",
		"replace",
		"match",
		"test",
		"exec",
		"log",
		"error",
		"warn",
		"info",
		"debug",
		"trace",
		"assert",
		"throw",
		"try",
	]);
	return commonFunctionWords.has(word);
}
