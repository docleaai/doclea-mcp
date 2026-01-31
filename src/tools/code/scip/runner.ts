/**
 * SCIP Indexer Runner
 * Executes SCIP indexers for different languages and returns the index file path
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface ScipRunnerOptions {
  projectPath: string;
  outputDir?: string;
  languages?: SupportedLanguage[];
  inferTsconfig?: boolean;
}

export type SupportedLanguage = "typescript" | "javascript";

export interface ScipRunResult {
  success: boolean;
  indexPath?: string;
  error?: string;
  language: SupportedLanguage;
  duration: number;
}

/**
 * Run SCIP TypeScript indexer on a project
 */
export async function runScipTypeScript(
  options: ScipRunnerOptions,
): Promise<ScipRunResult> {
  const startTime = Date.now();
  const outputDir = options.outputDir || join(options.projectPath, ".scip");
  const indexPath = join(outputDir, "index.scip");

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Clean up old index if exists
  if (existsSync(indexPath)) {
    rmSync(indexPath);
  }

  try {
    // Check if tsconfig exists
    const tsconfigPath = join(options.projectPath, "tsconfig.json");
    const hasTsconfig = existsSync(tsconfigPath);

    const args = [
      "bunx",
      "scip-typescript",
      "index",
      "--cwd",
      options.projectPath,
      "--output",
      indexPath,
    ];

    // If no tsconfig, let SCIP infer it
    if (!hasTsconfig || options.inferTsconfig) {
      args.push("--infer-tsconfig");
    }

    console.log(`[scip] Running: ${args.join(" ")}`);

    try {
      execSync(args.join(" "), {
        cwd: options.projectPath,
        stdio: "pipe",
        timeout: 120000, // 2 minute timeout
      });
    } catch (execError) {
      const err = execError as { stderr?: Buffer; message?: string };
      return {
        success: false,
        error: err.stderr?.toString() || err.message || "SCIP indexer failed",
        language: "typescript",
        duration: Date.now() - startTime,
      };
    }

    // Verify index was created
    if (!existsSync(indexPath)) {
      return {
        success: false,
        error: "SCIP index file was not created",
        language: "typescript",
        duration: Date.now() - startTime,
      };
    }

    console.log(`[scip] Index created: ${indexPath}`);

    return {
      success: true,
      indexPath,
      language: "typescript",
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      language: "typescript",
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Run SCIP indexers for all supported languages in a project
 */
export async function runScipIndexers(
  options: ScipRunnerOptions,
): Promise<ScipRunResult[]> {
  const results: ScipRunResult[] = [];
  const languages = options.languages || detectLanguages(options.projectPath);

  for (const lang of languages) {
    switch (lang) {
      case "typescript":
      case "javascript": {
        const result = await runScipTypeScript(options);
        results.push(result);
        break;
      }
      default:
        console.warn(`[scip] Unsupported language: ${lang}`);
    }
  }

  return results;
}

/**
 * Detect which languages are present in a project
 */
function detectLanguages(projectPath: string): SupportedLanguage[] {
  const languages: SupportedLanguage[] = [];

  // Check for TypeScript/JavaScript
  const packageJsonPath = join(projectPath, "package.json");
  const tsconfigPath = join(projectPath, "tsconfig.json");

  if (existsSync(packageJsonPath) || existsSync(tsconfigPath)) {
    languages.push("typescript");
  }

  return languages;
}

/**
 * Clean up SCIP index files
 */
export function cleanupScipIndex(projectPath: string): void {
  const scipDir = join(projectPath, ".scip");
  if (existsSync(scipDir)) {
    rmSync(scipDir, { recursive: true });
  }
}
