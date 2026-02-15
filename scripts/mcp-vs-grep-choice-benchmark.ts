import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";
import { resetContextCache } from "../src/caching/context-cache";
import { loadConfigWithAutoDetect } from "../src/config";
import {
  CachedEmbeddingClient,
  createEmbeddingClient,
} from "../src/embeddings/provider";
import { createStorageBackend } from "../src/storage/factory";
import type { IStorageBackend } from "../src/storage/interface";
import {
  buildContextWithCache,
  type ContextEvidenceItem,
} from "../src/tools/context";
import { countTokens, truncateToTokens } from "../src/utils/tokens";
import { createVectorStore } from "../src/vectors";

type BenchmarkMode =
  | "mcp_full"
  | "mcp_hybrid_guardrail"
  | "grep_tools"
  | "filename_tools"
  | "symbol_index_tools"
  | "lsp_tools"
  | "hybrid_tools";

const QuerySchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  expectedFilePaths: z.array(z.string().min(1)).min(1),
});

const FixtureSchema = z.object({
  queries: z.array(QuerySchema).min(1),
});

type ChoiceQuery = z.infer<typeof QuerySchema>;

interface ChoiceRun {
  queryId: string;
  query: string;
  mode: BenchmarkMode;
  latencyMs: number;
  inputTokens: number;
  estimatedLlmMs: number;
  estimatedEndToEndMs: number;
  openedFileCount: number;
  matchedFileCount: number;
  fileRecall: number;
  filePrecision: number;
  hallucinatedRatio: number;
  matchedFiles: string[];
  missingFiles: string[];
  retrievedTopK: string[];
}

interface ChoiceModeSummary {
  mode: BenchmarkMode;
  runs: number;
  latencyMs: {
    avg: number;
    p50: number;
    p95: number;
  };
  quality: {
    fileRecallAvg: number;
    filePrecisionAvg: number;
    hallucinatedRatioAvg: number;
  };
  tokenUsage: {
    inputTokensAvg: number;
    inputTokensP50: number;
    inputTokensP95: number;
    openedFileCountAvg: number;
    tokensPerMatchedFileAvg: number;
    budgetUtilizationAvg: number;
  };
  estimatedTimingMs: {
    llmProcessingAvg: number;
    endToEndAvg: number;
    endToEndP95: number;
  };
}

interface ChoiceBenchmarkReport {
  generatedAt: string;
  projectPath: string;
  fixturePath: string;
  recallK: number;
  tokenBudget: number;
  runsPerQuery: number;
  warmupRuns: number;
  comparisonModel: {
    grepOpenFiles: number;
    grepFileCharLimit: number;
    estimatedOutputTokens: number;
    inputTokensPerSecond: number;
    outputTokensPerSecond: number;
    activeModes: BenchmarkMode[];
  };
  modes: ChoiceModeSummary[];
  runs: ChoiceRun[];
}

const QUERY_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "list",
  "map",
  "of",
  "on",
  "or",
  "our",
  "show",
  "that",
  "the",
  "this",
  "to",
  "trace",
  "use",
  "what",
  "where",
  "which",
  "with",
]);

const ALL_BENCHMARK_MODES: BenchmarkMode[] = [
  "mcp_full",
  "mcp_hybrid_guardrail",
  "grep_tools",
  "filename_tools",
  "symbol_index_tools",
  "lsp_tools",
  "hybrid_tools",
];

const FILE_LIST_CACHE = new Map<string, string[]>();

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.toLowerCase() === "true";
}

function parseBenchmarkModesEnv(): BenchmarkMode[] {
  const raw = process.env.DOCLEA_CHOICE_MODES;
  if (!raw) {
    return [...ALL_BENCHMARK_MODES];
  }

  const requested = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const parsed: BenchmarkMode[] = [];
  for (const mode of requested) {
    if ((ALL_BENCHMARK_MODES as string[]).includes(mode)) {
      parsed.push(mode as BenchmarkMode);
    }
  }

  if (parsed.length === 0) {
    return [...ALL_BENCHMARK_MODES];
  }

  // Ensure MCP is always present as anchor comparator.
  if (!parsed.includes("mcp_full")) {
    parsed.unshift("mcp_full");
  }

  return Array.from(new Set(parsed));
}

function toFixedNumber(value: number, decimals = 4): number {
  return Number(value.toFixed(decimals));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return toFixedNumber(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return toFixedNumber(sorted[index] ?? 0);
}

function ensureDirectory(path: string): void {
  const directory = dirname(path);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

function normalizeFilePath(path: string, projectPath: string): string {
  const normalizedProject = projectPath
    .replaceAll("\\", "/")
    .replace(/\/+$/, "");
  let normalized = path.replaceAll("\\", "/").trim();

  if (normalized.startsWith(`${normalizedProject}/`)) {
    normalized = normalized.slice(normalizedProject.length + 1);
  }
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  return normalized;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractQueryTerms(query: string): string[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !QUERY_STOPWORDS.has(term));
  return Array.from(new Set(terms));
}

function extractCodeEntities(query: string): string[] {
  const entities = new Set<string>();
  const regex = /\b[A-Z][A-Za-z0-9_]{2,}\b/g;
  const matches = query.match(regex) ?? [];
  for (const match of matches) {
    entities.add(match);
  }
  return Array.from(entities);
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

function buildSearchHints(query: string): string[] {
  const terms = extractQueryTerms(query);
  const entities = extractCodeEntities(query);
  const hints = new Set<string>();

  for (const term of terms) {
    if (term.length >= 4) {
      hints.add(term);
    }
  }

  for (let i = 0; i < terms.length - 1; i++) {
    const left = terms[i] ?? "";
    const right = terms[i + 1] ?? "";
    if (left.length >= 4 && right.length >= 4) {
      hints.add(`${left}-${right}`);
      hints.add(`${left}_${right}`);
      hints.add(`${left}${right}`);
    }
  }

  if (/\baccess\s+codes?\b/i.test(query)) {
    hints.add("access-codes");
    hints.add("access_code");
    hints.add("accesscodes");
  }

  for (const entity of entities) {
    const kebab = toKebabCase(entity);
    if (kebab.length >= 4) {
      hints.add(kebab);
      hints.add(`${kebab}.ts`);
      hints.add(`${kebab}.tsx`);
      hints.add(`${kebab}.sql`);
    }
  }

  return Array.from(hints).slice(0, 24);
}

function collectTopKFilesFromEvidence(
  evidence: ContextEvidenceItem[],
  recallK: number,
  projectPath: string,
): string[] {
  const ranked = evidence
    .filter((item) => item.rank > 0)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, Math.max(1, recallK));

  const files = new Set<string>();
  for (const item of ranked) {
    if (item.code?.filePath) {
      files.add(normalizeFilePath(item.code.filePath, projectPath));
    }
    if (item.memory?.relatedFiles && item.memory.relatedFiles.length > 0) {
      for (const relatedFile of item.memory.relatedFiles) {
        const normalized = normalizeFilePath(relatedFile, projectPath);
        if (normalized.length > 0) {
          files.add(normalized);
        }
      }
    }
  }

  return Array.from(files);
}

function estimateLlmProcessingMs(input: {
  inputTokens: number;
  outputTokens: number;
  inputTokensPerSecond: number;
  outputTokensPerSecond: number;
}): number {
  const inputMs =
    input.inputTokensPerSecond > 0
      ? (input.inputTokens / input.inputTokensPerSecond) * 1000
      : 0;
  const outputMs =
    input.outputTokensPerSecond > 0
      ? (input.outputTokens / input.outputTokensPerSecond) * 1000
      : 0;
  return toFixedNumber(inputMs + outputMs, 4);
}

function runGrepToolingQuery(
  projectPath: string,
  query: string,
  recallK: number,
): string[] {
  const hints = buildSearchHints(query);
  if (hints.length === 0) {
    return [];
  }

  const codeEntities = extractCodeEntities(query).map((entity) =>
    entity.toLowerCase(),
  );
  const hintRegexes = hints
    .map((hint) => {
      const safe = escapeRegex(hint);
      if (!safe) return null;
      return new RegExp(safe, "i");
    })
    .filter((value): value is RegExp => value instanceof RegExp);

  const pattern = hints.map(escapeRegex).join("|");
  const args = [
    "-n",
    "--no-heading",
    "-S",
    "--glob",
    "!**/node_modules/**",
    "--glob",
    "!**/.git/**",
    "--glob",
    "!**/dist/**",
    "--glob",
    "!**/build/**",
    "--glob",
    "!**/.next/**",
    pattern,
    projectPath,
  ];

  const result = spawnSync("rg", args, {
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  });

  const output = result.stdout?.trim() ?? "";
  if (output.length === 0) {
    return [];
  }

  const fileScores = new Map<string, number>();
  const lines = output.split("\n");
  let processedLines = 0;

  const isAccessCodesQuery = /\baccess\s+codes?\b/i.test(query);

  for (const line of lines) {
    if (processedLines >= 50_000) {
      break;
    }
    processedLines += 1;

    const firstColon = line.indexOf(":");
    if (firstColon <= 0) {
      continue;
    }

    const secondColon = line.indexOf(":", firstColon + 1);
    const filePath = line.slice(0, firstColon);
    const snippet = secondColon > firstColon ? line.slice(secondColon + 1) : "";
    const normalized = normalizeFilePath(filePath, projectPath);
    if (normalized.length > 0) {
      const lowerPath = normalized.toLowerCase();
      const lowerSnippet = snippet.toLowerCase();
      let score = fileScores.get(normalized) ?? 0;
      score += 1;

      for (const hintRegex of hintRegexes) {
        if (hintRegex.test(normalized)) {
          score += 6;
          continue;
        }
        if (hintRegex.test(snippet)) {
          score += 2;
        }
      }

      for (const entity of codeEntities) {
        if (lowerPath.includes(entity)) {
          score += 8;
          continue;
        }
        if (lowerSnippet.includes(entity)) {
          score += 3;
        }
      }

      if (isAccessCodesQuery) {
        if (lowerPath.includes("access-codes")) {
          score += 12;
        } else if (
          lowerPath.includes("access_codes") ||
          lowerPath.includes("accesscodes")
        ) {
          score += 8;
        }
      }

      fileScores.set(normalized, score);
    }
  }

  return Array.from(fileScores.entries())
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, Math.max(1, recallK * 8))
    .map(([filePath]) => filePath);
}

function listProjectFiles(projectPath: string): string[] {
  const normalizedProject = resolve(projectPath);
  const cached = FILE_LIST_CACHE.get(normalizedProject);
  if (cached) {
    return cached;
  }

  const args = [
    "--files",
    "--glob",
    "!**/node_modules/**",
    "--glob",
    "!**/.git/**",
    "--glob",
    "!**/dist/**",
    "--glob",
    "!**/build/**",
    "--glob",
    "!**/.next/**",
    normalizedProject,
  ];
  const result = spawnSync("rg", args, {
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = result.stdout?.trim() ?? "";
  if (!output) {
    FILE_LIST_CACHE.set(normalizedProject, []);
    return [];
  }

  const files = output
    .split("\n")
    .map((path) => normalizeFilePath(path, normalizedProject))
    .filter(Boolean);
  FILE_LIST_CACHE.set(normalizedProject, files);
  return files;
}

function runFilenameToolingQuery(
  projectPath: string,
  query: string,
  recallK: number,
): string[] {
  const terms = extractQueryTerms(query);
  const hints = buildSearchHints(query);
  const entities = extractCodeEntities(query).map((entity) =>
    toKebabCase(entity).toLowerCase(),
  );
  const files = listProjectFiles(projectPath);
  if (files.length === 0) {
    return [];
  }

  const scores = new Map<string, number>();
  for (const filePath of files) {
    const lowerPath = filePath.toLowerCase();
    let score = 0;

    for (const hint of hints) {
      const normalizedHint = hint.toLowerCase();
      if (lowerPath.includes(`/${normalizedHint}/`)) {
        score += 8;
      } else if (lowerPath.includes(normalizedHint)) {
        score += 4;
      }
      if (
        lowerPath.endsWith(`/${normalizedHint}`) ||
        lowerPath.includes(`/${normalizedHint}.`)
      ) {
        score += 4;
      }
    }

    for (const entity of entities) {
      if (entity.length < 4) {
        continue;
      }
      if (lowerPath.includes(entity)) {
        score += 7;
      }
    }

    for (const term of terms) {
      if (term.length < 4) {
        continue;
      }
      if (lowerPath.includes(term)) {
        score += 2;
      }
    }

    if (score > 0) {
      scores.set(filePath, score);
    }
  }

  return Array.from(scores.entries())
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, Math.max(1, recallK * 8))
    .map(([filePath]) => filePath);
}

function runSymbolIndexToolingQuery(
  storage: IStorageBackend,
  projectPath: string,
  query: string,
  recallK: number,
): string[] {
  const terms = extractQueryTerms(query);
  const hints = buildSearchHints(query);
  if (hints.length === 0) {
    return [];
  }

  const whereClauses = hints.map(
    () => "(lower(name) LIKE ? OR lower(file_path) LIKE ?)",
  );
  const params: string[] = [];
  for (const hint of hints) {
    const pattern = `%${hint.toLowerCase()}%`;
    params.push(pattern, pattern);
  }

  const sql = `
    SELECT file_path, COUNT(*) AS match_count
    FROM code_nodes
    WHERE (${whereClauses.join(" OR ")})
      AND lower(file_path) NOT LIKE '%/dist/%'
      AND lower(file_path) NOT LIKE '%/build/%'
      AND lower(file_path) NOT LIKE '%/generated/%'
      AND lower(file_path) NOT LIKE '%/__tests__/%'
      AND lower(file_path) NOT LIKE '%/coverage/%'
      AND lower(file_path) NOT LIKE '%.spec.ts'
      AND lower(file_path) NOT LIKE '%.spec.tsx'
      AND lower(file_path) NOT LIKE '%.test.ts'
      AND lower(file_path) NOT LIKE '%.test.tsx'
      AND lower(file_path) NOT LIKE '%.d.ts'
    GROUP BY file_path
    ORDER BY match_count DESC
    LIMIT ?
  `;
  const rows = storage
    .getDatabase()
    .query(sql)
    .all(...params, Math.max(200, recallK * 16)) as Array<{
    file_path: string;
    match_count: number;
  }>;

  if (rows.length === 0) {
    return [];
  }

  const ranked = rows
    .map((row) => {
      const normalized = normalizeFilePath(row.file_path, projectPath);
      const lowerPath = normalized.toLowerCase();
      let score = Number(row.match_count);
      for (const term of terms) {
        if (term.length < 4) {
          continue;
        }
        if (lowerPath.includes(term)) {
          score += 1.5;
        }
      }
      return { file_path: normalized, score };
    })
    .filter((row) => row.file_path.length > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.file_path.localeCompare(right.file_path),
    );

  return ranked.slice(0, Math.max(1, recallK * 8)).map((row) => row.file_path);
}

function buildSqlPlaceholders(length: number): string {
  return Array.from({ length }, () => "?").join(", ");
}

function runLspToolingQuery(
  storage: IStorageBackend,
  projectPath: string,
  query: string,
  recallK: number,
): string[] {
  const terms = extractQueryTerms(query);
  const hints = buildSearchHints(query);
  const entities = extractCodeEntities(query);
  const anchorHints = Array.from(
    new Set(
      [
        ...hints,
        ...terms,
        ...entities.map((entity) => entity.toLowerCase()),
      ].filter((value) => value.length >= 3),
    ),
  ).slice(0, 24);
  if (anchorHints.length === 0) {
    return [];
  }

  const whereClauses = anchorHints.map(
    () => "(lower(name) LIKE ? OR lower(file_path) LIKE ?)",
  );
  const anchorParams: string[] = [];
  for (const hint of anchorHints) {
    const pattern = `%${hint.toLowerCase()}%`;
    anchorParams.push(pattern, pattern);
  }

  const anchorSql = `
    SELECT id, file_path, name
    FROM code_nodes
    WHERE (${whereClauses.join(" OR ")})
      AND lower(file_path) NOT LIKE '%/dist/%'
      AND lower(file_path) NOT LIKE '%/build/%'
      AND lower(file_path) NOT LIKE '%/generated/%'
      AND lower(file_path) NOT LIKE '%/__tests__/%'
      AND lower(file_path) NOT LIKE '%/coverage/%'
      AND lower(file_path) NOT LIKE '%.spec.ts'
      AND lower(file_path) NOT LIKE '%.spec.tsx'
      AND lower(file_path) NOT LIKE '%.test.ts'
      AND lower(file_path) NOT LIKE '%.test.tsx'
      AND lower(file_path) NOT LIKE '%.d.ts'
    LIMIT 180
  `;

  const anchors = storage
    .getDatabase()
    .query(anchorSql)
    .all(...anchorParams) as Array<{
    id: string;
    file_path: string;
    name: string;
  }>;
  if (anchors.length === 0) {
    return [];
  }

  const anchorIds = Array.from(new Set(anchors.map((row) => row.id))).slice(
    0,
    80,
  );
  const anchorIdPlaceholders = buildSqlPlaceholders(anchorIds.length);
  const anchorScores = new Map<string, number>();
  for (const anchor of anchors) {
    const filePath = normalizeFilePath(anchor.file_path, projectPath);
    if (!filePath) continue;
    const lowerName = (anchor.name ?? "").toLowerCase();
    let score = anchorScores.get(filePath) ?? 0;
    score += 4;
    for (const term of terms) {
      if (term.length < 4) continue;
      if (lowerName.includes(term)) {
        score += 2.5;
      }
    }
    anchorScores.set(filePath, score);
  }

  const neighborSql = `
    SELECT
      n.file_path AS file_path,
      COUNT(*) AS edge_count,
      COUNT(DISTINCT n.id) AS node_count
    FROM code_edges e
    JOIN code_nodes n ON (
      (n.id = e.from_node AND e.to_node IN (${anchorIdPlaceholders}))
      OR
      (n.id = e.to_node AND e.from_node IN (${anchorIdPlaceholders}))
    )
    WHERE n.id NOT IN (${anchorIdPlaceholders})
      AND lower(n.file_path) NOT LIKE '%/dist/%'
      AND lower(n.file_path) NOT LIKE '%/build/%'
      AND lower(n.file_path) NOT LIKE '%/generated/%'
      AND lower(n.file_path) NOT LIKE '%/__tests__/%'
      AND lower(n.file_path) NOT LIKE '%/coverage/%'
      AND lower(n.file_path) NOT LIKE '%.spec.ts'
      AND lower(n.file_path) NOT LIKE '%.spec.tsx'
      AND lower(n.file_path) NOT LIKE '%.test.ts'
      AND lower(n.file_path) NOT LIKE '%.test.tsx'
      AND lower(n.file_path) NOT LIKE '%.d.ts'
    GROUP BY n.file_path
    ORDER BY edge_count DESC
    LIMIT ?
  `;

  const neighborParams = [
    ...anchorIds,
    ...anchorIds,
    ...anchorIds,
    Math.max(220, recallK * 24),
  ];
  const neighbors = storage
    .getDatabase()
    .query(neighborSql)
    .all(...neighborParams) as Array<{
    file_path: string;
    edge_count: number;
    node_count: number;
  }>;

  for (const neighbor of neighbors) {
    const filePath = normalizeFilePath(neighbor.file_path, projectPath);
    if (!filePath) continue;
    const traversalScore =
      Math.max(1, Math.min(20, Number(neighbor.edge_count) * 1.15)) +
      Math.min(3, Number(neighbor.node_count) * 0.1);
    anchorScores.set(
      filePath,
      (anchorScores.get(filePath) ?? 0) + traversalScore,
    );
  }

  return Array.from(anchorScores.entries())
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, Math.max(1, recallK * 8))
    .map(([filePath]) => filePath);
}

function runHybridToolingQuery(
  storage: IStorageBackend,
  projectPath: string,
  query: string,
  recallK: number,
): string[] {
  const candidates = [
    runGrepToolingQuery(projectPath, query, recallK),
    runFilenameToolingQuery(projectPath, query, recallK),
    runSymbolIndexToolingQuery(storage, projectPath, query, recallK),
    runLspToolingQuery(storage, projectPath, query, recallK),
  ];
  const rrf = new Map<string, number>();
  const rankBias = 60;

  for (const list of candidates) {
    for (let index = 0; index < list.length; index++) {
      const filePath = list[index];
      if (!filePath) {
        continue;
      }
      const score = 1 / (rankBias + index + 1);
      rrf.set(filePath, (rrf.get(filePath) ?? 0) + score);
    }
  }

  return Array.from(rrf.entries())
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, Math.max(1, recallK * 8))
    .map(([filePath]) => filePath);
}

function fuseRankedFileLists(
  lists: Array<{ files: string[]; weight: number }>,
  limit: number,
): string[] {
  const rankBias = 60;
  const scores = new Map<string, number>();

  for (const list of lists) {
    const weight = Number.isFinite(list.weight) ? list.weight : 1;
    if (weight <= 0) {
      continue;
    }
    for (let index = 0; index < list.files.length; index++) {
      const filePath = list.files[index];
      if (!filePath) {
        continue;
      }
      const score = weight / (rankBias + index + 1);
      scores.set(filePath, (scores.get(filePath) ?? 0) + score);
    }
  }

  return Array.from(scores.entries())
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, Math.max(1, limit))
    .map(([filePath]) => filePath);
}

function buildMcpGuardrailRetrievedFiles(input: {
  storage: IStorageBackend;
  projectPath: string;
  query: string;
  recallK: number;
  mcpFiles: string[];
}): string[] {
  const extractDocDriftHintPaths = (query: string): string[] => {
    const referenceMatch = query.match(/references\s+"([^"]+)"/i);
    const docMatch = query.match(/from\s+"([^"]+)"/i);
    const hints = [docMatch?.[1], referenceMatch?.[1]]
      .map((value) => value?.trim() ?? "")
      .filter(Boolean)
      .filter((value) => value.includes("/") && value.includes("."));
    return hints.map((value) => normalizeFilePath(value, input.projectPath));
  };

  const hintPaths = extractDocDriftHintPaths(input.query);
  const hintCandidates = new Set<string>();
  for (const hintPath of hintPaths) {
    if (!hintPath) {
      continue;
    }
    hintCandidates.add(hintPath);
    if (!existsSync(join(input.projectPath, hintPath))) {
      const lowerBase = basename(hintPath).toLowerCase();
      if (lowerBase.length >= 4) {
        for (const filePath of listProjectFiles(input.projectPath)) {
          const lower = filePath.toLowerCase();
          if (lower.endsWith(`/${lowerBase}`) || lower === lowerBase) {
            hintCandidates.add(filePath);
          }
          if (hintCandidates.size >= 20) {
            break;
          }
        }
      }
    }
  }

  const grepFiles = runGrepToolingQuery(
    input.projectPath,
    input.query,
    input.recallK,
  );
  const filenameFiles = runFilenameToolingQuery(
    input.projectPath,
    input.query,
    input.recallK,
  );
  const symbolFiles = runSymbolIndexToolingQuery(
    input.storage,
    input.projectPath,
    input.query,
    input.recallK,
  );

  return fuseRankedFileLists(
    [
      { files: Array.from(hintCandidates), weight: 8.5 },
      { files: input.mcpFiles, weight: 3.4 },
      { files: grepFiles, weight: 4.2 },
      { files: filenameFiles, weight: 1.8 },
      { files: symbolFiles, weight: 0.9 },
    ],
    Math.max(1, input.recallK * 8),
  );
}

function runToolingQuery(
  mode: Exclude<BenchmarkMode, "mcp_full" | "mcp_hybrid_guardrail">,
  storage: IStorageBackend,
  projectPath: string,
  query: string,
  recallK: number,
): string[] {
  switch (mode) {
    case "grep_tools":
      return runGrepToolingQuery(projectPath, query, recallK);
    case "filename_tools":
      return runFilenameToolingQuery(projectPath, query, recallK);
    case "symbol_index_tools":
      return runSymbolIndexToolingQuery(storage, projectPath, query, recallK);
    case "lsp_tools":
      return runLspToolingQuery(storage, projectPath, query, recallK);
    case "hybrid_tools":
      return runHybridToolingQuery(storage, projectPath, query, recallK);
    default:
      return [];
  }
}

async function buildToolingModelInputPayload(input: {
  projectPath: string;
  query: string;
  retrievedFiles: string[];
  openFileCount: number;
  fileCharLimit: number;
  tokenBudget: number;
}): Promise<{ payload: string; openedFiles: string[]; tokenCount: number }> {
  const filesToOpen = input.retrievedFiles.slice(
    0,
    Math.max(1, input.openFileCount),
  );
  const openedFiles: string[] = [];
  const parts: string[] = [
    `# Task`,
    input.query,
    "",
    "# Tool Results (grep/open-file chain)",
  ];
  const basePayload = parts.join("\n");
  let payload = await truncateToTokens(
    basePayload,
    Math.max(1, input.tokenBudget),
  );
  let tokenCount = await countTokens(payload);
  const minSnippetTokens = 24;
  const queryTerms = extractQueryTerms(input.query);

  for (const filePath of filesToOpen) {
    const absolute = filePath.startsWith("/")
      ? filePath
      : join(input.projectPath, filePath);
    if (!existsSync(absolute)) {
      continue;
    }

    let content = "";
    try {
      content = readFileSync(absolute, "utf-8");
    } catch {
      continue;
    }

    if (!content) {
      continue;
    }

    if (content.length > input.fileCharLimit) {
      content = `${content.slice(0, input.fileCharLimit)}\n/* ...truncated... */`;
    }

    const remaining = input.tokenBudget - tokenCount;
    if (remaining <= minSnippetTokens) {
      break;
    }

    const prefix = `\n\n## ${filePath}\n\`\`\`\n`;
    const suffix = "\n```";
    const wrapperTokens =
      (await countTokens(prefix)) + (await countTokens(suffix));
    const maxContentTokens = remaining - wrapperTokens;
    if (maxContentTokens < minSnippetTokens) {
      continue;
    }

    // Prefer a focused snippet around query terms, then fallback to leading chunk.
    let snippet = content;
    if (queryTerms.length > 0) {
      const lines = content.split("\n");
      const lowerTerms = queryTerms.map((term) => term.toLowerCase());
      let bestIndex = -1;
      for (let index = 0; index < lines.length; index++) {
        const line = (lines[index] ?? "").toLowerCase();
        if (lowerTerms.some((term) => line.includes(term))) {
          bestIndex = index;
          break;
        }
      }
      if (bestIndex >= 0) {
        const start = Math.max(0, bestIndex - 40);
        const end = Math.min(lines.length, bestIndex + 120);
        snippet = lines.slice(start, end).join("\n");
      }
    }

    let snippetTokens = await countTokens(snippet);
    if (snippetTokens > maxContentTokens) {
      snippet = await truncateToTokens(snippet, maxContentTokens);
      snippetTokens = await countTokens(snippet);
    }
    if (snippetTokens < minSnippetTokens) {
      continue;
    }

    const block = `${prefix}${snippet}${suffix}`;
    const blockTokens = await countTokens(block);
    if (blockTokens <= 0 || tokenCount + blockTokens > input.tokenBudget) {
      continue;
    }

    payload += block;
    tokenCount += blockTokens;
    openedFiles.push(filePath);
  }

  return {
    payload,
    openedFiles,
    tokenCount,
  };
}

async function buildMcpGuardrailModelInputPayload(input: {
  query: string;
  mcpContext: string;
  retrievedFiles: string[];
  tokenBudget: number;
  contextShare: number;
  maxCandidates: number;
}): Promise<{ payload: string; tokenCount: number; surfacedFiles: string[] }> {
  const boundedShare = Math.min(0.9, Math.max(0.15, input.contextShare));
  const contextBudget = Math.max(
    256,
    Math.floor(input.tokenBudget * boundedShare),
  );
  const boundedContext = await truncateToTokens(
    input.mcpContext,
    contextBudget,
  );
  const surfacedFiles = input.retrievedFiles.slice(
    0,
    Math.max(4, input.maxCandidates),
  );
  const candidateBlock = surfacedFiles
    .map((filePath, index) => `${index + 1}. ${filePath}`)
    .join("\n");

  const payload = await truncateToTokens(
    `# Task\n${input.query}\n\n# MCP Context (compressed)\n${boundedContext}\n\n# Guardrail Candidate Files\n${candidateBlock}`,
    Math.max(1, input.tokenBudget),
  );
  const tokenCount = await countTokens(payload);
  return { payload, tokenCount, surfacedFiles };
}

function scoreRetrievedFiles(input: {
  expectedFilePaths: string[];
  retrievedFilePaths: string[];
  recallK: number;
  projectPath: string;
}) {
  const expected = new Set(
    input.expectedFilePaths.map((path) => path.toLowerCase()),
  );
  const retrievedTopK = input.retrievedFilePaths.slice(
    0,
    Math.max(1, input.recallK),
  );
  const retrieved = new Set(retrievedTopK.map((path) => path.toLowerCase()));

  const matched = new Set<string>();
  const missing = new Set<string>();

  for (const expectedPath of expected) {
    if (retrieved.has(expectedPath)) {
      matched.add(expectedPath);
    } else {
      missing.add(expectedPath);
    }
  }

  const hallucinated = retrievedTopK.filter((path) => {
    const absolute = path.startsWith("/")
      ? path
      : `${input.projectPath.replace(/\/+$/, "")}/${path}`;
    return !existsSync(absolute);
  });

  const fileRecall =
    expected.size === 0 ? 1 : toFixedNumber(matched.size / expected.size, 4);
  const filePrecision =
    retrieved.size === 0
      ? expected.size === 0
        ? 1
        : 0
      : toFixedNumber(matched.size / retrieved.size, 4);
  const hallucinatedRatio =
    retrievedTopK.length === 0
      ? 0
      : toFixedNumber(hallucinated.length / retrievedTopK.length, 4);

  return {
    fileRecall,
    filePrecision,
    hallucinatedRatio,
    matchedFiles: Array.from(matched).sort((left, right) =>
      left.localeCompare(right),
    ),
    missingFiles: Array.from(missing).sort((left, right) =>
      left.localeCompare(right),
    ),
    retrievedTopK: retrievedTopK.sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

function summarizeMode(
  mode: BenchmarkMode,
  runs: ChoiceRun[],
  tokenBudget: number,
): ChoiceModeSummary {
  const modeRuns = runs.filter((run) => run.mode === mode);
  const tokenLoads = modeRuns.map((run) => run.inputTokens);
  const tokensPerMatchedFile = modeRuns.map((run) =>
    run.matchedFileCount > 0
      ? run.inputTokens / run.matchedFileCount
      : run.inputTokens,
  );
  const endToEndLatencies = modeRuns.map((run) => run.estimatedEndToEndMs);
  return {
    mode,
    runs: modeRuns.length,
    latencyMs: {
      avg: average(modeRuns.map((run) => run.latencyMs)),
      p50: percentile(
        modeRuns.map((run) => run.latencyMs),
        50,
      ),
      p95: percentile(
        modeRuns.map((run) => run.latencyMs),
        95,
      ),
    },
    quality: {
      fileRecallAvg: average(modeRuns.map((run) => run.fileRecall)),
      filePrecisionAvg: average(modeRuns.map((run) => run.filePrecision)),
      hallucinatedRatioAvg: average(
        modeRuns.map((run) => run.hallucinatedRatio),
      ),
    },
    tokenUsage: {
      inputTokensAvg: average(tokenLoads),
      inputTokensP50: percentile(tokenLoads, 50),
      inputTokensP95: percentile(tokenLoads, 95),
      openedFileCountAvg: average(modeRuns.map((run) => run.openedFileCount)),
      tokensPerMatchedFileAvg: average(tokensPerMatchedFile),
      budgetUtilizationAvg: average(
        modeRuns.map((run) =>
          tokenBudget > 0 ? Math.min(1, run.inputTokens / tokenBudget) : 0,
        ),
      ),
    },
    estimatedTimingMs: {
      llmProcessingAvg: average(modeRuns.map((run) => run.estimatedLlmMs)),
      endToEndAvg: average(endToEndLatencies),
      endToEndP95: percentile(endToEndLatencies, 95),
    },
  };
}

function loadFixture(projectPath: string): {
  fixturePath: string;
  queries: ChoiceQuery[];
} {
  const fixturePath = process.env.DOCLEA_CHOICE_FIXTURE_PATH
    ? resolve(process.env.DOCLEA_CHOICE_FIXTURE_PATH)
    : resolve(
        projectPath,
        ".doclea/retrieval-agent-choice-queries.monorepo.json",
      );

  if (!existsSync(fixturePath)) {
    throw new Error(
      `Missing fixture at ${fixturePath}. Set DOCLEA_CHOICE_FIXTURE_PATH or create .doclea/retrieval-agent-choice-queries.monorepo.json.`,
    );
  }

  const parsed = JSON.parse(readFileSync(fixturePath, "utf-8"));
  const fixture = FixtureSchema.parse(parsed);
  return { fixturePath, queries: fixture.queries };
}

async function main(): Promise<void> {
  const projectPath = resolve(
    process.env.DOCLEA_BENCH_PROJECT_PATH ?? process.cwd(),
  );
  const { fixturePath, queries } = loadFixture(projectPath);
  const config = await loadConfigWithAutoDetect(projectPath);

  const storage = createStorageBackend(config.storage, projectPath);
  await storage.initialize();

  const vectors = createVectorStore(config.vector, projectPath);
  await vectors.initialize();

  const baseEmbeddings = createEmbeddingClient(config.embedding);
  const modelName =
    config.embedding.provider === "local"
      ? "local-tei"
      : config.embedding.model;
  const embeddings = new CachedEmbeddingClient(
    baseEmbeddings,
    storage,
    modelName,
  );

  const runsPerQuery = parseIntEnv("DOCLEA_CHOICE_RUNS_PER_QUERY", 4);
  const warmupRuns = parseIntEnv("DOCLEA_CHOICE_WARMUP_RUNS", 0);
  const tokenBudget = parseIntEnv("DOCLEA_CHOICE_TOKEN_BUDGET", 32000);
  const recallK = parseIntEnv("DOCLEA_CHOICE_RECALL_K", 20);
  const grepOpenFiles = parseIntEnv("DOCLEA_CHOICE_GREP_OPEN_FILES", 10);
  const grepFileCharLimit = parseIntEnv(
    "DOCLEA_CHOICE_GREP_FILE_CHAR_LIMIT",
    6000,
  );
  const estimatedOutputTokens = parseIntEnv(
    "DOCLEA_CHOICE_ESTIMATED_OUTPUT_TOKENS",
    400,
  );
  const mcpGuardrailContextShare = parseFloatEnv(
    "DOCLEA_CHOICE_MCP_GUARDRAIL_CONTEXT_SHARE",
    0.45,
  );
  const mcpGuardrailMaxCandidates = parseIntEnv(
    "DOCLEA_CHOICE_MCP_GUARDRAIL_MAX_CANDIDATES",
    80,
  );
  const inputTokensPerSecond = parseFloatEnv(
    "DOCLEA_CHOICE_MODEL_INPUT_TOKENS_PER_SEC",
    1200,
  );
  const outputTokensPerSecond = parseFloatEnv(
    "DOCLEA_CHOICE_MODEL_OUTPUT_TOKENS_PER_SEC",
    400,
  );
  const clearCacheBeforeRun = parseBoolEnv(
    "DOCLEA_CHOICE_CLEAR_CACHE_BEFORE_RUN",
    true,
  );
  const template =
    (process.env.DOCLEA_CHOICE_TEMPLATE as
      | "default"
      | "compact"
      | "detailed") || "compact";
  const modes = parseBenchmarkModesEnv();
  const runs: ChoiceRun[] = [];

  try {
    for (const query of queries) {
      const expectedFilePaths = query.expectedFilePaths.map((path) =>
        normalizeFilePath(path, projectPath),
      );

      for (const mode of modes) {
        if (mode === "mcp_full" || mode === "mcp_hybrid_guardrail") {
          const input = {
            query: query.query,
            tokenBudget,
            includeCodeGraph: true,
            includeGraphRAG: true,
            includeEvidence: true,
            template,
          } as const;

          for (let warmup = 0; warmup < warmupRuns; warmup++) {
            if (clearCacheBeforeRun) {
              resetContextCache();
            }
            await buildContextWithCache(
              input,
              storage,
              vectors,
              embeddings,
              config.cache,
              config.scoring,
            );
          }

          for (let runIndex = 0; runIndex < runsPerQuery; runIndex++) {
            if (clearCacheBeforeRun) {
              resetContextCache();
            }

            const startedAt = performance.now();
            const result = await buildContextWithCache(
              input,
              storage,
              vectors,
              embeddings,
              config.cache,
              config.scoring,
            );
            const mcpRetrievedFiles = collectTopKFilesFromEvidence(
              result.evidence ?? [],
              Math.max(recallK, recallK * 2),
              projectPath,
            );
            let retrievedFiles: string[] = mcpRetrievedFiles;
            let openedFileCount = mcpRetrievedFiles.length;
            let inputTokens = 0;

            if (mode === "mcp_hybrid_guardrail") {
              retrievedFiles = buildMcpGuardrailRetrievedFiles({
                storage,
                projectPath,
                query: query.query,
                recallK,
                mcpFiles: mcpRetrievedFiles,
              });
              const payload = await buildMcpGuardrailModelInputPayload({
                query: query.query,
                mcpContext: result.context,
                retrievedFiles,
                tokenBudget,
                contextShare: mcpGuardrailContextShare,
                maxCandidates: mcpGuardrailMaxCandidates,
              });
              inputTokens = payload.tokenCount;
              openedFileCount = payload.surfacedFiles.length;
            } else {
              const mcpPayload = `# Task\n${query.query}\n\n# MCP Context\n${result.context}`;
              const boundedPayload = await truncateToTokens(
                mcpPayload,
                Math.max(1, tokenBudget),
              );
              inputTokens = await countTokens(boundedPayload);
            }

            const latencyMs = toFixedNumber(performance.now() - startedAt, 4);
            const score = scoreRetrievedFiles({
              expectedFilePaths,
              retrievedFilePaths: retrievedFiles,
              recallK,
              projectPath,
            });
            const estimatedLlmMs = estimateLlmProcessingMs({
              inputTokens,
              outputTokens: estimatedOutputTokens,
              inputTokensPerSecond,
              outputTokensPerSecond,
            });
            const estimatedEndToEndMs = toFixedNumber(
              latencyMs + estimatedLlmMs,
            );

            runs.push({
              queryId: query.id,
              query: query.query,
              mode,
              latencyMs,
              inputTokens,
              estimatedLlmMs,
              estimatedEndToEndMs,
              openedFileCount,
              matchedFileCount: score.matchedFiles.length,
              fileRecall: score.fileRecall,
              filePrecision: score.filePrecision,
              hallucinatedRatio: score.hallucinatedRatio,
              matchedFiles: score.matchedFiles,
              missingFiles: score.missingFiles,
              retrievedTopK: score.retrievedTopK,
            });
          }
        } else {
          for (let warmup = 0; warmup < warmupRuns; warmup++) {
            runToolingQuery(mode, storage, projectPath, query.query, recallK);
          }

          for (let runIndex = 0; runIndex < runsPerQuery; runIndex++) {
            const startedAt = performance.now();
            const retrievedFiles = runToolingQuery(
              mode,
              storage,
              projectPath,
              query.query,
              recallK,
            );
            const latencyMs = toFixedNumber(performance.now() - startedAt, 4);
            const payload = await buildToolingModelInputPayload({
              projectPath,
              query: query.query,
              retrievedFiles,
              openFileCount: grepOpenFiles,
              fileCharLimit: grepFileCharLimit,
              tokenBudget,
            });
            const inputTokens = payload.tokenCount;
            const estimatedLlmMs = estimateLlmProcessingMs({
              inputTokens,
              outputTokens: estimatedOutputTokens,
              inputTokensPerSecond,
              outputTokensPerSecond,
            });
            const estimatedEndToEndMs = toFixedNumber(
              latencyMs + estimatedLlmMs,
            );
            const score = scoreRetrievedFiles({
              expectedFilePaths,
              retrievedFilePaths: payload.openedFiles,
              recallK,
              projectPath,
            });

            runs.push({
              queryId: query.id,
              query: query.query,
              mode,
              latencyMs,
              inputTokens,
              estimatedLlmMs,
              estimatedEndToEndMs,
              openedFileCount: payload.openedFiles.length,
              matchedFileCount: score.matchedFiles.length,
              fileRecall: score.fileRecall,
              filePrecision: score.filePrecision,
              hallucinatedRatio: score.hallucinatedRatio,
              matchedFiles: score.matchedFiles,
              missingFiles: score.missingFiles,
              retrievedTopK: score.retrievedTopK,
            });
          }
        }
      }
    }

    const report: ChoiceBenchmarkReport = {
      generatedAt: new Date().toISOString(),
      projectPath,
      fixturePath,
      recallK,
      tokenBudget,
      runsPerQuery,
      warmupRuns,
      comparisonModel: {
        grepOpenFiles,
        grepFileCharLimit,
        estimatedOutputTokens,
        inputTokensPerSecond: toFixedNumber(inputTokensPerSecond, 2),
        outputTokensPerSecond: toFixedNumber(outputTokensPerSecond, 2),
        activeModes: modes,
      },
      modes: modes.map((mode) => summarizeMode(mode, runs, tokenBudget)),
      runs,
    };

    const outputPath = resolve(
      process.env.DOCLEA_CHOICE_REPORT_JSON_PATH ??
        `${projectPath}/.doclea/reports/mcp-vs-grep-choice-benchmark.json`,
    );
    ensureDirectory(outputPath);
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

    console.log(
      JSON.stringify(
        {
          reportPath: outputPath,
          queryCount: queries.length,
          runsPerQuery,
          recallK,
          tokenBudget,
          comparisonModel: report.comparisonModel,
          modes: report.modes,
        },
        null,
        2,
      ),
    );
  } finally {
    if (typeof vectors.close === "function") {
      vectors.close();
    }
    storage.close();
  }
}

await main();
