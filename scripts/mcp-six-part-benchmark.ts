import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

type BenchmarkMode =
  | "mcp_full"
  | "grep_tools"
  | "filename_tools"
  | "symbol_index_tools"
  | "lsp_tools"
  | "hybrid_tools"
  | string;

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
  latencyMs: {
    avg: number;
  };
  quality: {
    fileRecallAvg: number;
    filePrecisionAvg: number;
    hallucinatedRatioAvg: number;
  };
  tokenUsage?: {
    inputTokensAvg: number;
    budgetUtilizationAvg?: number;
  };
  estimatedTimingMs?: {
    endToEndAvg: number;
  };
}

interface ChoiceBenchmarkReport {
  generatedAt: string;
  projectPath: string;
  fixturePath: string;
  tokenBudget: number;
  recallK: number;
  comparisonModel?: {
    estimatedOutputTokens?: number;
    inputTokensPerSecond?: number;
    outputTokensPerSecond?: number;
  };
  modes: ChoiceModeSummary[];
  runs: ChoiceRun[];
}

interface QueryFixture {
  id: string;
  query: string;
  expectedFilePaths: string[];
}

interface QueryFixtureDoc {
  queries: QueryFixture[];
}

interface BudgetReportPath {
  budget: number;
  path: string;
}

interface BudgetEntry {
  budget: number;
  path: string;
  report: ChoiceBenchmarkReport;
}

interface ModeSnapshot {
  mode: BenchmarkMode;
  recall: number;
  precision: number;
  wrongPath: number;
  inputTokens: number;
  budgetUtilization: number;
  retrievalMs: number;
  endToEndMs: number;
}

interface SixPartReport {
  generatedAt: string;
  projectPath: string;
  sourceReports: Array<{ budget: number; path: string }>;
  anchorBudget: number;
  lowBudget: number;
  highBudget: number;
  fixturePath: string;
  queryCount: number;
  modes: BenchmarkMode[];
  parts: {
    issueLocalization: {
      budget: number;
      modes: ModeSnapshot[];
      mcpRecallEdgeVsBestBaselinePoints: number;
      mcpTokenCutVsBestRecallBaselinePct: number;
      hardestQueries: Array<{
        queryId: string;
        expectedFiles: number;
        expectedScopes: number;
        mcpRecall: number;
        bestBaselineRecall: number;
        edgePoints: number;
      }>;
    };
    citationGroundedQa: {
      budget: number;
      queryComplexity: {
        avgExpectedFiles: number;
        avgExpectedScopes: number;
      };
      modes: Array<{
        mode: BenchmarkMode;
        citationRecall: number;
        citationPrecision: number;
        hallucinatedCitationRate: number;
        crossScopeCoverage: number;
        strictCitationScore: number;
      }>;
    };
    contextRetentionProxy: {
      lowBudget: number;
      highBudget: number;
      modes: Array<{
        mode: BenchmarkMode;
        lowRecall: number;
        highRecall: number;
        retentionRatio: number;
        recallDropPoints: number;
        lowInputTokens: number;
        highInputTokens: number;
      }>;
    };
    docDriftDetection: {
      docsScanned: number;
      staleReferencesFound: number;
      staleReferenceRate: number;
      driftHotspotScore: number;
      generatedQueries: number;
      triageComparison: {
        budget: number;
        docleaMode: BenchmarkMode;
        llmMode: BenchmarkMode;
        docleaFoundRate: number;
        llmFoundRate: number;
        foundEdgePoints: number;
        docleaInputTokens: number;
        llmInputTokens: number;
        tokenCutPct: number;
        docleaEndToEndMs: number;
        llmEndToEndMs: number;
        endToEndSpeedupX: number;
      } | null;
      triageComparisons: Array<{
        budget: number;
        docleaMode: BenchmarkMode;
        llmMode: BenchmarkMode;
        docleaFoundRate: number;
        llmFoundRate: number;
        foundEdgePoints: number;
        docleaInputTokens: number;
        llmInputTokens: number;
        tokenCutPct: number;
        docleaEndToEndMs: number;
        llmEndToEndMs: number;
        endToEndSpeedupX: number;
      }>;
      topDocsByDrift: Array<{
        docPath: string;
        staleRefs: number;
      }>;
      topScopesByDrift: Array<{
        scope: string;
        staleRefs: number;
      }>;
      sampleStaleReferences: Array<{
        docPath: string;
        referencedPath: string;
        suggestedCurrentPath: string;
      }>;
    };
    fixedQualityCostLatency: {
      targetRecall: number;
      targetPrecision: number;
      inputPricePerMTokenUsd: number;
      outputPricePerMTokenUsd: number;
      estimatedOutputTokens: number;
      modes: Array<{
        mode: BenchmarkMode;
        selectedBudget: number;
        metTarget: boolean;
        recall: number;
        precision: number;
        inputTokens: number;
        endToEndMs: number;
        estimatedCostUsdPerQuery: number;
      }>;
    };
    modeledHumanTaskAB: {
      budget: number;
      successThresholdRecall: number;
      successThresholdPrecision: number;
      retryPenaltyMinutes: number;
      verificationPenaltyMinutes: number;
      searchPenaltyMinutes: number;
      modes: Array<{
        mode: BenchmarkMode;
        successRate: number;
        modeledMinutesToCorrectAnswer: number;
        recall: number;
        precision: number;
        endToEndMs: number;
        productivityIndex: number;
      }>;
    };
  };
}

const DEFAULT_BUDGETS = [1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000];

function toFixedNumber(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(decimals));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return toFixedNumber(
    values.reduce((sum, value) => sum + value, 0) / values.length,
    6,
  );
}

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
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}

function ensureDirectory(path: string): void {
  const directory = dirname(path);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function normalizeProjectRelative(path: string, projectPath: string): string {
  const normalizedProject = resolve(projectPath).replaceAll("\\", "/");
  let normalized = path.replaceAll("\\", "/").trim();
  if (normalized.startsWith(normalizedProject + "/")) {
    normalized = normalized.slice(normalizedProject.length + 1);
  }
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  return normalized;
}

function parseReports(projectPath: string): BudgetReportPath[] {
  const raw = process.env.DOCLEA_SIX_SOURCE_REPORTS;
  if (raw) {
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [budgetRaw, ...pathParts] = entry.split(":");
        const budget = Number.parseInt(budgetRaw ?? "", 10);
        if (!Number.isFinite(budget)) {
          throw new Error(
            `Invalid budget in DOCLEA_SIX_SOURCE_REPORTS: ${entry}`,
          );
        }
        return { budget, path: resolve(pathParts.join(":")) };
      })
      .sort((left, right) => left.budget - right.budget);
  }

  return DEFAULT_BUDGETS.map((budget) => ({
    budget,
    path: resolve(
      projectPath,
      `.doclea/reports/mcp-vs-grep-choice-benchmark.multi.${budget}.json`,
    ),
  }));
}

function pickClosestBudget(available: number[], requested: number): number {
  if (available.length === 0) return requested;
  return [...available].sort(
    (left, right) => Math.abs(left - requested) - Math.abs(right - requested),
  )[0]!;
}

function modeLabel(mode: BenchmarkMode): string {
  switch (mode) {
    case "mcp_full":
      return "MCP Full";
    case "mcp_hybrid_guardrail":
      return "MCP Guardrail";
    case "grep_tools":
      return "Grep/Open";
    case "filename_tools":
      return "Filename";
    case "symbol_index_tools":
      return "Symbol Index";
    case "lsp_tools":
      return "LSP Graph";
    case "hybrid_tools":
      return "Hybrid";
    default:
      return mode.replaceAll("_", " ");
  }
}

function modeSnapshotFromSummary(mode: ChoiceModeSummary): ModeSnapshot {
  return {
    mode: mode.mode,
    recall: mode.quality.fileRecallAvg,
    precision: mode.quality.filePrecisionAvg,
    wrongPath: 1 - mode.quality.filePrecisionAvg,
    inputTokens: mode.tokenUsage?.inputTokensAvg ?? 0,
    budgetUtilization: mode.tokenUsage?.budgetUtilizationAvg ?? 0,
    retrievalMs: mode.latencyMs.avg,
    endToEndMs: mode.estimatedTimingMs?.endToEndAvg ?? mode.latencyMs.avg,
  };
}

function computeExpectedScopes(filePaths: string[]): Set<string> {
  const scopes = new Set<string>();
  for (const filePath of filePaths) {
    const segments = filePath.split("/").filter(Boolean);
    if (segments.length >= 2) {
      scopes.add(`${segments[0]}/${segments[1]}`);
    } else if (segments.length === 1) {
      scopes.add(segments[0] ?? "");
    }
  }
  return scopes;
}

function listProjectFiles(projectPath: string): string[] {
  const result = spawnSync(
    "rg",
    [
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
      projectPath,
    ],
    {
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const output = result.stdout?.trim() ?? "";
  if (!output) return [];
  return output
    .split("\n")
    .map((path) => normalizeProjectRelative(path, projectPath))
    .filter(Boolean);
}

function listMarkdownFiles(projectPath: string): string[] {
  const result = spawnSync(
    "rg",
    [
      "--files",
      "--glob",
      "**/*.md",
      "--glob",
      "!**/node_modules/**",
      "--glob",
      "!**/.git/**",
      "--glob",
      "!**/dist/**",
      "--glob",
      "!**/build/**",
      projectPath,
    ],
    {
      encoding: "utf-8",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  const output = result.stdout?.trim() ?? "";
  if (!output) return [];
  return output
    .split("\n")
    .map((path) => normalizeProjectRelative(path, projectPath))
    .filter(Boolean);
}

function extractPathLikeRefs(markdown: string): string[] {
  const matches = markdown.match(
    /(?:\.{1,2}\/)?(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+\.[A-Za-z0-9_-]+/g,
  );
  if (!matches) return [];
  return Array.from(
    new Set(
      matches
        .map((value) => value.trim().replace(/[),.;:`'"!?]+$/, ""))
        .filter((value) => value.length > 3 && !value.includes("://")),
    ),
  );
}

function isLikelyRepoPathRef(ref: string): boolean {
  const value = ref.trim();
  if (!value.includes("/")) return false;
  if (!value.includes(".")) return false;
  if (value.includes("://")) return false;
  const lower = value.toLowerCase();
  if (lower.includes("github.com/")) return false;
  if (lower.includes("gitlab.com/")) return false;
  if (lower.includes("bitbucket.org/")) return false;
  if (value.includes(" ")) return false;
  return true;
}

function pathScope(path: string): string {
  const segments = path.split("/").filter(Boolean);
  if (segments.length >= 2) {
    return `${segments[0]}/${segments[1]}`;
  }
  return segments[0] ?? "unknown";
}

function resolveDocReference(input: {
  projectPath: string;
  docPath: string;
  ref: string;
}): string | null {
  const ref = input.ref.trim();
  if (!ref) return null;
  const abs =
    ref.startsWith("./") || ref.startsWith("../")
      ? resolve(input.projectPath, dirname(input.docPath), ref)
      : resolve(input.projectPath, ref);
  const relativePath = normalizeProjectRelative(abs, input.projectPath);
  const backToAbs = resolve(input.projectPath, relativePath);
  if (!backToAbs.startsWith(resolve(input.projectPath))) {
    return null;
  }
  return relativePath;
}

function stemName(path: string): string {
  const base = basename(path).toLowerCase();
  const stem = base.slice(0, Math.max(0, base.length - extname(base).length));
  return stem;
}

function countCommonSuffixSegments(left: string[], right: string[]): number {
  let count = 0;
  while (count < left.length && count < right.length) {
    const leftSegment = left[left.length - 1 - count];
    const rightSegment = right[right.length - 1 - count];
    if (leftSegment !== rightSegment) break;
    count += 1;
  }
  return count;
}

function chooseSuggestedCurrentPath(input: {
  missingPath: string;
  docPath: string;
  projectFiles: string[];
}): string | null {
  const missingStem = stemName(input.missingPath);
  if (!missingStem) return null;
  const missingSegments = input.missingPath
    .toLowerCase()
    .split("/")
    .filter(Boolean);
  const docSegments = input.docPath.toLowerCase().split("/").filter(Boolean);
  const candidates = input.projectFiles.filter((filePath) => {
    const lower = filePath.toLowerCase();
    return lower.includes(missingStem);
  });
  if (candidates.length === 0) return null;

  const ranked = candidates
    .map((candidate) => {
      const candidateSegments = candidate
        .toLowerCase()
        .split("/")
        .filter(Boolean);
      let score = 0;
      if (candidateSegments[0] && candidateSegments[0] === missingSegments[0])
        score += 6;
      if (candidateSegments[0] && candidateSegments[0] === docSegments[0])
        score += 3;
      const suffixOverlap = countCommonSuffixSegments(
        missingSegments,
        candidateSegments,
      );
      score += suffixOverlap * 4;
      const baseOverlap = stemName(candidate) === missingStem ? 8 : 0;
      score += baseOverlap;
      score += Math.max(
        0,
        2 - Math.abs(candidateSegments.length - missingSegments.length),
      );
      return { candidate, score };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.localeCompare(right.candidate),
    );

  return ranked[0]?.candidate ?? null;
}

function generateDocDriftFixture(input: {
  projectPath: string;
  maxQueries: number;
}): {
  docsScanned: number;
  staleReferencesFound: number;
  staleReferenceRate: number;
  driftHotspotScore: number;
  queries: QueryFixture[];
  topDocsByDrift: Array<{
    docPath: string;
    staleRefs: number;
  }>;
  topScopesByDrift: Array<{
    scope: string;
    staleRefs: number;
  }>;
  sampleStaleReferences: Array<{
    docPath: string;
    referencedPath: string;
    suggestedCurrentPath: string;
  }>;
} {
  const markdownFiles = listMarkdownFiles(input.projectPath);
  const projectFiles = listProjectFiles(input.projectPath);
  const stalePairs: Array<{
    docPath: string;
    referencedPath: string;
    suggestedCurrentPath: string;
  }> = [];

  for (const docPath of markdownFiles) {
    const absoluteDocPath = join(input.projectPath, docPath);
    let content = "";
    try {
      content = readFileSync(absoluteDocPath, "utf-8");
    } catch {
      continue;
    }
    const refs = extractPathLikeRefs(content);
    for (const ref of refs) {
      if (!isLikelyRepoPathRef(ref)) continue;
      const resolved = resolveDocReference({
        projectPath: input.projectPath,
        docPath,
        ref,
      });
      if (!resolved) continue;
      const absolute = join(input.projectPath, resolved);
      if (existsSync(absolute)) continue;
      const suggested = chooseSuggestedCurrentPath({
        missingPath: resolved,
        docPath,
        projectFiles,
      });
      if (!suggested) continue;
      stalePairs.push({
        docPath,
        referencedPath: resolved,
        suggestedCurrentPath: suggested,
      });
    }
  }

  const deduped = Array.from(
    new Map(
      stalePairs.map((pair) => [
        `${pair.docPath}::${pair.referencedPath}::${pair.suggestedCurrentPath}`,
        pair,
      ]),
    ).values(),
  );

  const docsByDrift = new Map<string, number>();
  const scopesByDrift = new Map<string, number>();
  for (const pair of deduped) {
    docsByDrift.set(pair.docPath, (docsByDrift.get(pair.docPath) ?? 0) + 1);
    const scope = pathScope(pair.suggestedCurrentPath);
    scopesByDrift.set(scope, (scopesByDrift.get(scope) ?? 0) + 1);
  }

  const top = deduped.slice(0, Math.max(0, input.maxQueries));
  const queries: QueryFixture[] = top.map((item, index) => ({
    id: `doc-drift-${index + 1}`,
    query: `A document may be stale. It references "${item.referencedPath}" from "${item.docPath}". Identify the current implementation files that replaced or superseded this path, and include the stale document for patching.`,
    expectedFilePaths: [item.docPath, item.suggestedCurrentPath],
  }));

  const topDocsByDrift = Array.from(docsByDrift.entries())
    .map(([docPath, staleRefs]) => ({ docPath, staleRefs }))
    .sort(
      (left, right) =>
        right.staleRefs - left.staleRefs ||
        left.docPath.localeCompare(right.docPath),
    )
    .slice(0, 10);
  const topScopesByDrift = Array.from(scopesByDrift.entries())
    .map(([scope, staleRefs]) => ({ scope, staleRefs }))
    .sort(
      (left, right) =>
        right.staleRefs - left.staleRefs ||
        left.scope.localeCompare(right.scope),
    )
    .slice(0, 10);
  const staleReferenceRate =
    markdownFiles.length > 0 ? deduped.length / markdownFiles.length : 0;
  const driftHotspotScore =
    deduped.length > 0
      ? topDocsByDrift
          .slice(0, 3)
          .reduce((sum, row) => sum + row.staleRefs, 0) / deduped.length
      : 0;

  return {
    docsScanned: markdownFiles.length,
    staleReferencesFound: deduped.length,
    staleReferenceRate: toFixedNumber(staleReferenceRate, 6),
    driftHotspotScore: toFixedNumber(driftHotspotScore, 6),
    queries,
    topDocsByDrift,
    topScopesByDrift,
    sampleStaleReferences: top,
  };
}

function runDocDriftBenchmark(input: {
  projectPath: string;
  fixture: QueryFixtureDoc;
  budget: number;
}): { fixturePath: string; reportPath: string; report: ChoiceBenchmarkReport } {
  const fixturePath = resolve(
    input.projectPath,
    ".doclea/reports/mcp-doc-drift.fixture.generated.json",
  );
  const reportPath = resolve(
    input.projectPath,
    ".doclea/reports/mcp-doc-drift-benchmark.generated.json",
  );
  ensureDirectory(fixturePath);
  writeFileSync(
    fixturePath,
    `${JSON.stringify(input.fixture, null, 2)}\n`,
    "utf-8",
  );

  const env = {
    ...process.env,
    DOCLEA_BENCH_PROJECT_PATH: input.projectPath,
    DOCLEA_CHOICE_FIXTURE_PATH: fixturePath,
    DOCLEA_CHOICE_REPORT_JSON_PATH: reportPath,
    DOCLEA_CHOICE_TOKEN_BUDGET: String(input.budget),
    DOCLEA_CHOICE_RECALL_K: "10",
    DOCLEA_CHOICE_RUNS_PER_QUERY: "1",
    DOCLEA_CHOICE_WARMUP_RUNS: "0",
    DOCLEA_CHOICE_CLEAR_CACHE_BEFORE_RUN: "true",
    DOCLEA_CHOICE_MODES:
      "mcp_full,mcp_hybrid_guardrail,grep_tools,filename_tools,symbol_index_tools,lsp_tools,hybrid_tools",
  };
  const runResult = spawnSync(
    "bun",
    ["run", "scripts/mcp-vs-grep-choice-benchmark.ts"],
    {
      cwd: process.cwd(),
      env,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (runResult.status !== 0) {
    throw new Error(
      `Doc-drift benchmark run failed.\nstdout:\n${runResult.stdout ?? ""}\nstderr:\n${runResult.stderr ?? ""}`,
    );
  }
  const report = readJson<ChoiceBenchmarkReport>(reportPath);
  return { fixturePath, reportPath, report };
}

function buildIssueLocalization(input: {
  anchor: BudgetEntry;
  fixture: QueryFixtureDoc;
}): SixPartReport["parts"]["issueLocalization"] {
  const modes = input.anchor.report.modes
    .map(modeSnapshotFromSummary)
    .sort((left, right) => {
      if (left.mode === "mcp_full") return -1;
      if (right.mode === "mcp_full") return 1;
      return right.recall - left.recall;
    });
  const mcp = modes.find((row) => row.mode === "mcp_full");
  const bestBaseline = modes
    .filter((row) => row.mode !== "mcp_full")
    .sort((left, right) => right.recall - left.recall)[0];
  const mcpRecallEdgeVsBestBaselinePoints =
    mcp && bestBaseline ? (mcp.recall - bestBaseline.recall) * 100 : 0;
  const mcpTokenCutVsBestRecallBaselinePct =
    mcp && bestBaseline && bestBaseline.inputTokens > 0
      ? ((bestBaseline.inputTokens - mcp.inputTokens) /
          bestBaseline.inputTokens) *
        100
      : 0;

  const expectedById = new Map<string, QueryFixture>(
    input.fixture.queries.map((query) => [query.id, query]),
  );
  const modeGroups = new Map<string, ChoiceRun[]>();
  for (const run of input.anchor.report.runs) {
    const key = `${run.mode}::${run.queryId}`;
    const group = modeGroups.get(key) ?? [];
    group.push(run);
    modeGroups.set(key, group);
  }
  const queryIds = Array.from(
    new Set(input.anchor.report.runs.map((run) => run.queryId)),
  );
  const hardestQueries = queryIds
    .map((queryId) => {
      const fixture = expectedById.get(queryId);
      const mcpRuns = modeGroups.get(`mcp_full::${queryId}`) ?? [];
      const baselineRecalls = modes
        .filter((mode) => mode.mode !== "mcp_full")
        .map((mode) =>
          average(
            (modeGroups.get(`${mode.mode}::${queryId}`) ?? []).map(
              (run) => run.fileRecall,
            ),
          ),
        );
      const mcpRecall = average(mcpRuns.map((run) => run.fileRecall));
      const bestBaselineRecall =
        baselineRecalls.length > 0 ? Math.max(...baselineRecalls) : 0;
      return {
        queryId,
        expectedFiles: fixture?.expectedFilePaths.length ?? 0,
        expectedScopes: computeExpectedScopes(fixture?.expectedFilePaths ?? [])
          .size,
        mcpRecall,
        bestBaselineRecall,
        edgePoints: (mcpRecall - bestBaselineRecall) * 100,
      };
    })
    .sort((left, right) => right.edgePoints - left.edgePoints)
    .slice(0, 8);

  return {
    budget: input.anchor.budget,
    modes,
    mcpRecallEdgeVsBestBaselinePoints: toFixedNumber(
      mcpRecallEdgeVsBestBaselinePoints,
      4,
    ),
    mcpTokenCutVsBestRecallBaselinePct: toFixedNumber(
      mcpTokenCutVsBestRecallBaselinePct,
      4,
    ),
    hardestQueries: hardestQueries.map((row) => ({
      ...row,
      mcpRecall: toFixedNumber(row.mcpRecall, 6),
      bestBaselineRecall: toFixedNumber(row.bestBaselineRecall, 6),
      edgePoints: toFixedNumber(row.edgePoints, 4),
    })),
  };
}

function buildCitationGroundedQa(input: {
  anchor: BudgetEntry;
  fixture: QueryFixtureDoc;
}): SixPartReport["parts"]["citationGroundedQa"] {
  const expectedById = new Map<string, QueryFixture>(
    input.fixture.queries.map((query) => [query.id, query]),
  );
  const avgExpectedFiles = average(
    input.fixture.queries.map((query) => query.expectedFilePaths.length),
  );
  const avgExpectedScopes = average(
    input.fixture.queries.map(
      (query) => computeExpectedScopes(query.expectedFilePaths).size,
    ),
  );

  const modes = input.anchor.report.modes.map((mode) => {
    const runs = input.anchor.report.runs.filter(
      (run) => run.mode === mode.mode,
    );
    const crossScopeCoverage = average(
      runs.map((run) => {
        const query = expectedById.get(run.queryId);
        if (!query) return 0;
        const expectedScopes = computeExpectedScopes(query.expectedFilePaths);
        if (expectedScopes.size === 0) return 1;
        const matchedScopes = computeExpectedScopes(run.matchedFiles);
        let hits = 0;
        for (const scope of matchedScopes) {
          if (expectedScopes.has(scope)) hits += 1;
        }
        return hits / expectedScopes.size;
      }),
    );
    const citationRecall = mode.quality.fileRecallAvg;
    const citationPrecision = mode.quality.filePrecisionAvg;
    const hallucinatedCitationRate = mode.quality.hallucinatedRatioAvg;
    const strictCitationScore =
      citationRecall * 0.45 +
      citationPrecision * 0.45 +
      (1 - hallucinatedCitationRate) * 0.1;
    return {
      mode: mode.mode,
      citationRecall: toFixedNumber(citationRecall, 6),
      citationPrecision: toFixedNumber(citationPrecision, 6),
      hallucinatedCitationRate: toFixedNumber(hallucinatedCitationRate, 6),
      crossScopeCoverage: toFixedNumber(crossScopeCoverage, 6),
      strictCitationScore: toFixedNumber(strictCitationScore, 6),
    };
  });

  return {
    budget: input.anchor.budget,
    queryComplexity: {
      avgExpectedFiles: toFixedNumber(avgExpectedFiles, 4),
      avgExpectedScopes: toFixedNumber(avgExpectedScopes, 4),
    },
    modes: modes.sort((left, right) => {
      if (left.mode === "mcp_full") return -1;
      if (right.mode === "mcp_full") return 1;
      return right.strictCitationScore - left.strictCitationScore;
    }),
  };
}

function buildContextRetentionProxy(input: {
  low: BudgetEntry;
  high: BudgetEntry;
}): SixPartReport["parts"]["contextRetentionProxy"] {
  const lowByMode = new Map(
    input.low.report.modes.map((mode) => [
      mode.mode,
      modeSnapshotFromSummary(mode),
    ]),
  );
  const highByMode = new Map(
    input.high.report.modes.map((mode) => [
      mode.mode,
      modeSnapshotFromSummary(mode),
    ]),
  );
  const modes = Array.from(new Set([...lowByMode.keys(), ...highByMode.keys()]))
    .map((mode) => {
      const low = lowByMode.get(mode);
      const high = highByMode.get(mode);
      const lowRecall = low?.recall ?? 0;
      const highRecall = high?.recall ?? 0;
      const retentionRatio = highRecall > 0 ? lowRecall / highRecall : 0;
      return {
        mode,
        lowRecall: toFixedNumber(lowRecall, 6),
        highRecall: toFixedNumber(highRecall, 6),
        retentionRatio: toFixedNumber(retentionRatio, 6),
        recallDropPoints: toFixedNumber((highRecall - lowRecall) * 100, 4),
        lowInputTokens: toFixedNumber(low?.inputTokens ?? 0, 2),
        highInputTokens: toFixedNumber(high?.inputTokens ?? 0, 2),
      };
    })
    .sort((left, right) => {
      if (left.mode === "mcp_full") return -1;
      if (right.mode === "mcp_full") return 1;
      return right.retentionRatio - left.retentionRatio;
    });

  return {
    lowBudget: input.low.budget,
    highBudget: input.high.budget,
    modes,
  };
}

function buildFixedQualityCostLatency(input: {
  entries: BudgetEntry[];
  targetRecall: number;
  targetPrecision: number;
  inputPricePerMTokenUsd: number;
  outputPricePerMTokenUsd: number;
}): SixPartReport["parts"]["fixedQualityCostLatency"] {
  const modeBudgetRows = new Map<
    BenchmarkMode,
    Array<{ budget: number; snapshot: ModeSnapshot }>
  >();
  for (const entry of input.entries) {
    for (const mode of entry.report.modes) {
      const list = modeBudgetRows.get(mode.mode) ?? [];
      list.push({
        budget: entry.budget,
        snapshot: modeSnapshotFromSummary(mode),
      });
      modeBudgetRows.set(mode.mode, list);
    }
  }
  const estimatedOutputTokens =
    input.entries[input.entries.length - 1]?.report.comparisonModel
      ?.estimatedOutputTokens ?? 400;

  const modes = Array.from(modeBudgetRows.entries())
    .map(([mode, rows]) => {
      const sorted = [...rows].sort(
        (left, right) => left.budget - right.budget,
      );
      const hit = sorted.find(
        (row) =>
          row.snapshot.recall >= input.targetRecall &&
          row.snapshot.precision >= input.targetPrecision,
      );
      const selected = hit ?? sorted[sorted.length - 1];
      const estimatedCostUsdPerQuery =
        (selected.snapshot.inputTokens / 1_000_000) *
          input.inputPricePerMTokenUsd +
        (estimatedOutputTokens / 1_000_000) * input.outputPricePerMTokenUsd;
      return {
        mode,
        selectedBudget: selected.budget,
        metTarget: Boolean(hit),
        recall: toFixedNumber(selected.snapshot.recall, 6),
        precision: toFixedNumber(selected.snapshot.precision, 6),
        inputTokens: toFixedNumber(selected.snapshot.inputTokens, 2),
        endToEndMs: toFixedNumber(selected.snapshot.endToEndMs, 4),
        estimatedCostUsdPerQuery: toFixedNumber(estimatedCostUsdPerQuery, 8),
      };
    })
    .sort((left, right) => {
      if (left.mode === "mcp_full") return -1;
      if (right.mode === "mcp_full") return 1;
      return left.endToEndMs - right.endToEndMs;
    });

  return {
    targetRecall: toFixedNumber(input.targetRecall, 6),
    targetPrecision: toFixedNumber(input.targetPrecision, 6),
    inputPricePerMTokenUsd: toFixedNumber(input.inputPricePerMTokenUsd, 8),
    outputPricePerMTokenUsd: toFixedNumber(input.outputPricePerMTokenUsd, 8),
    estimatedOutputTokens,
    modes,
  };
}

function buildModeledHumanTaskAB(input: {
  anchor: BudgetEntry;
  successThresholdRecall: number;
  successThresholdPrecision: number;
  retryPenaltyMinutes: number;
  verificationPenaltyMinutes: number;
  searchPenaltyMinutes: number;
}): SixPartReport["parts"]["modeledHumanTaskAB"] {
  const rows = input.anchor.report.modes.map((mode) => {
    const snapshot = modeSnapshotFromSummary(mode);
    const runs = input.anchor.report.runs.filter(
      (run) => run.mode === mode.mode,
    );
    const successRate = average(
      runs.map((run) =>
        run.fileRecall >= input.successThresholdRecall &&
        run.filePrecision >= input.successThresholdPrecision
          ? 1
          : 0,
      ),
    );
    const modeledMinutesToCorrectAnswer =
      snapshot.endToEndMs / 1000 / 60 +
      (1 - successRate) * input.retryPenaltyMinutes +
      (1 - snapshot.precision) * input.verificationPenaltyMinutes +
      (1 - snapshot.recall) * input.searchPenaltyMinutes;
    return {
      mode: mode.mode,
      successRate: toFixedNumber(successRate, 6),
      modeledMinutesToCorrectAnswer: toFixedNumber(
        modeledMinutesToCorrectAnswer,
        6,
      ),
      recall: toFixedNumber(snapshot.recall, 6),
      precision: toFixedNumber(snapshot.precision, 6),
      endToEndMs: toFixedNumber(snapshot.endToEndMs, 4),
      productivityIndex: 0,
    };
  });
  const bestMinutes = Math.min(
    ...rows.map((row) => row.modeledMinutesToCorrectAnswer),
    1,
  );
  for (const row of rows) {
    row.productivityIndex = toFixedNumber(
      bestMinutes / Math.max(row.modeledMinutesToCorrectAnswer, 0.0001),
      6,
    );
  }
  rows.sort((left, right) => {
    if (left.mode === "mcp_full") return -1;
    if (right.mode === "mcp_full") return 1;
    return (
      left.modeledMinutesToCorrectAnswer - right.modeledMinutesToCorrectAnswer
    );
  });

  return {
    budget: input.anchor.budget,
    successThresholdRecall: toFixedNumber(input.successThresholdRecall, 6),
    successThresholdPrecision: toFixedNumber(
      input.successThresholdPrecision,
      6,
    ),
    retryPenaltyMinutes: toFixedNumber(input.retryPenaltyMinutes, 4),
    verificationPenaltyMinutes: toFixedNumber(
      input.verificationPenaltyMinutes,
      4,
    ),
    searchPenaltyMinutes: toFixedNumber(input.searchPenaltyMinutes, 4),
    modes: rows,
  };
}

async function main(): Promise<void> {
  const projectPath = resolve(
    process.env.DOCLEA_BENCH_PROJECT_PATH ?? process.cwd(),
  );
  const reportPaths = parseReports(projectPath).filter((entry) =>
    existsSync(entry.path),
  );
  if (reportPaths.length === 0) {
    throw new Error("No source benchmark reports found.");
  }

  const entries: BudgetEntry[] = reportPaths
    .map((entry) => ({
      budget: entry.budget,
      path: entry.path,
      report: readJson<ChoiceBenchmarkReport>(entry.path),
    }))
    .sort((left, right) => left.budget - right.budget);
  const budgets = entries.map((entry) => entry.budget);
  const requestedAnchorBudget = parseIntEnv("DOCLEA_SIX_ANCHOR_BUDGET", 32000);
  const anchorBudget = pickClosestBudget(budgets, requestedAnchorBudget);
  const lowBudget = budgets[0]!;
  const highBudget = budgets[budgets.length - 1]!;
  const anchor =
    entries.find((entry) => entry.budget === anchorBudget) ??
    entries[entries.length - 1]!;
  const low =
    entries.find((entry) => entry.budget === lowBudget) ?? entries[0]!;
  const high =
    entries.find((entry) => entry.budget === highBudget) ??
    entries[entries.length - 1]!;

  const fixturePath = resolve(anchor.report.fixturePath);
  if (!existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${fixturePath}`);
  }
  const fixture = readJson<QueryFixtureDoc>(fixturePath);

  const issueLocalization = buildIssueLocalization({
    anchor,
    fixture,
  });
  const citationGroundedQa = buildCitationGroundedQa({
    anchor,
    fixture,
  });
  const contextRetentionProxy = buildContextRetentionProxy({
    low,
    high,
  });

  const docDriftMaxQueries = parseIntEnv("DOCLEA_SIX_DOC_DRIFT_MAX_QUERIES", 8);
  const runDocDriftTriageComparison = parseBoolEnv(
    "DOCLEA_SIX_RUN_DOC_DRIFT_TRIAGE_COMPARISON",
    true,
  );
  const driftBudget = pickClosestBudget(
    budgets,
    parseIntEnv("DOCLEA_SIX_DOC_DRIFT_BUDGET", anchorBudget),
  );
  const driftLlmMode = (
    process.env.DOCLEA_SIX_DOC_DRIFT_LLM_MODE ?? "grep_tools"
  ).trim() as BenchmarkMode;
  const driftLlmModes = (
    process.env.DOCLEA_SIX_DOC_DRIFT_LLM_MODES ??
    "grep_tools,hybrid_tools,filename_tools,lsp_tools,symbol_index_tools"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(
      (value) => Boolean(value) && !value.startsWith("mcp_"),
    ) as BenchmarkMode[];
  const driftFixtureInfo = generateDocDriftFixture({
    projectPath,
    maxQueries: docDriftMaxQueries,
  });
  let driftTriageComparison: SixPartReport["parts"]["docDriftDetection"]["triageComparison"] =
    null;
  let driftTriageComparisons: SixPartReport["parts"]["docDriftDetection"]["triageComparisons"] =
    [];
  if (runDocDriftTriageComparison && driftFixtureInfo.queries.length > 0) {
    const driftBenchmark = runDocDriftBenchmark({
      projectPath,
      fixture: { queries: driftFixtureInfo.queries },
      budget: driftBudget,
    });
    const docleaModes = driftBenchmark.report.modes.filter(
      (mode) =>
        mode.mode === "mcp_full" || mode.mode === "mcp_hybrid_guardrail",
    );
    const candidateModes = driftBenchmark.report.modes.filter(
      (mode) =>
        mode.mode !== "mcp_full" && mode.mode !== "mcp_hybrid_guardrail",
    );
    const orderedLlmModes = Array.from(
      new Set([...driftLlmModes, ...candidateModes.map((mode) => mode.mode)]),
    );
    const llms = orderedLlmModes
      .map((mode) =>
        candidateModes.find((candidate) => candidate.mode === mode),
      )
      .filter((mode): mode is ChoiceModeSummary => Boolean(mode));

    driftTriageComparisons = docleaModes.flatMap((doclea) => {
      const docleaFoundRate = doclea.quality.fileRecallAvg;
      const docleaInputTokens = doclea.tokenUsage?.inputTokensAvg ?? 0;
      const docleaEndToEndMs =
        doclea.estimatedTimingMs?.endToEndAvg ?? doclea.latencyMs.avg;
      return llms.map((llm) => {
        const llmFoundRate = llm.quality.fileRecallAvg;
        const llmInputTokens = llm.tokenUsage?.inputTokensAvg ?? 0;
        const llmEndToEndMs =
          llm.estimatedTimingMs?.endToEndAvg ?? llm.latencyMs.avg;
        return {
          budget: driftBudget,
          docleaMode: doclea.mode,
          llmMode: llm.mode,
          docleaFoundRate: toFixedNumber(docleaFoundRate, 6),
          llmFoundRate: toFixedNumber(llmFoundRate, 6),
          foundEdgePoints: toFixedNumber(
            (docleaFoundRate - llmFoundRate) * 100,
            4,
          ),
          docleaInputTokens: toFixedNumber(docleaInputTokens, 2),
          llmInputTokens: toFixedNumber(llmInputTokens, 2),
          tokenCutPct: toFixedNumber(
            llmInputTokens > 0
              ? ((llmInputTokens - docleaInputTokens) / llmInputTokens) * 100
              : 0,
            4,
          ),
          docleaEndToEndMs: toFixedNumber(docleaEndToEndMs, 4),
          llmEndToEndMs: toFixedNumber(llmEndToEndMs, 4),
          endToEndSpeedupX: toFixedNumber(
            docleaEndToEndMs > 0 ? llmEndToEndMs / docleaEndToEndMs : 0,
            4,
          ),
        };
      });
    });
    driftTriageComparisons.sort((left, right) => {
      const leftDocleaRank = left.docleaMode === "mcp_hybrid_guardrail" ? 0 : 1;
      const rightDocleaRank =
        right.docleaMode === "mcp_hybrid_guardrail" ? 0 : 1;
      if (leftDocleaRank !== rightDocleaRank) {
        return leftDocleaRank - rightDocleaRank;
      }
      return right.foundEdgePoints - left.foundEdgePoints;
    });
    driftTriageComparison =
      driftTriageComparisons.find(
        (row) =>
          row.docleaMode === "mcp_hybrid_guardrail" &&
          row.llmMode === driftLlmMode,
      ) ??
      driftTriageComparisons.find(
        (row) => row.docleaMode === "mcp_hybrid_guardrail",
      ) ??
      driftTriageComparisons[0] ??
      null;
  }

  const fixedQualityCostLatency = buildFixedQualityCostLatency({
    entries,
    targetRecall: parseFloatEnv("DOCLEA_SIX_TARGET_RECALL", 0.3),
    targetPrecision: parseFloatEnv("DOCLEA_SIX_TARGET_PRECISION", 0.2),
    inputPricePerMTokenUsd: parseFloatEnv("DOCLEA_SIX_INPUT_PRICE_PER_M", 0.15),
    outputPricePerMTokenUsd: parseFloatEnv(
      "DOCLEA_SIX_OUTPUT_PRICE_PER_M",
      0.6,
    ),
  });

  const modeledHumanTaskAB = buildModeledHumanTaskAB({
    anchor,
    successThresholdRecall: parseFloatEnv(
      "DOCLEA_SIX_TASK_SUCCESS_RECALL",
      0.3,
    ),
    successThresholdPrecision: parseFloatEnv(
      "DOCLEA_SIX_TASK_SUCCESS_PRECISION",
      0.2,
    ),
    retryPenaltyMinutes: parseFloatEnv("DOCLEA_SIX_TASK_RETRY_PENALTY_MIN", 8),
    verificationPenaltyMinutes: parseFloatEnv(
      "DOCLEA_SIX_TASK_VERIFY_PENALTY_MIN",
      3,
    ),
    searchPenaltyMinutes: parseFloatEnv(
      "DOCLEA_SIX_TASK_SEARCH_PENALTY_MIN",
      5,
    ),
  });

  const report: SixPartReport = {
    generatedAt: new Date().toISOString(),
    projectPath,
    sourceReports: entries.map((entry) => ({
      budget: entry.budget,
      path: entry.path,
    })),
    anchorBudget,
    lowBudget,
    highBudget,
    fixturePath,
    queryCount: fixture.queries.length,
    modes: Array.from(
      new Set(
        entries.flatMap((entry) => entry.report.modes.map((mode) => mode.mode)),
      ),
    ),
    parts: {
      issueLocalization,
      citationGroundedQa,
      contextRetentionProxy,
      docDriftDetection: {
        docsScanned: driftFixtureInfo.docsScanned,
        staleReferencesFound: driftFixtureInfo.staleReferencesFound,
        staleReferenceRate: driftFixtureInfo.staleReferenceRate,
        driftHotspotScore: driftFixtureInfo.driftHotspotScore,
        generatedQueries: driftFixtureInfo.queries.length,
        triageComparison: driftTriageComparison,
        triageComparisons: driftTriageComparisons,
        topDocsByDrift: driftFixtureInfo.topDocsByDrift,
        topScopesByDrift: driftFixtureInfo.topScopesByDrift,
        sampleStaleReferences: driftFixtureInfo.sampleStaleReferences,
      },
      fixedQualityCostLatency,
      modeledHumanTaskAB,
    },
  };

  const outputPath = resolve(
    process.env.DOCLEA_SIX_REPORT_JSON_PATH ??
      `${projectPath}/.doclea/reports/mcp-six-part-benchmark.json`,
  );
  ensureDirectory(outputPath);
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

  const mcpIssue = report.parts.issueLocalization.modes.find(
    (mode) => mode.mode === "mcp_full",
  );
  const baselineIssue = report.parts.issueLocalization.modes
    .filter((mode) => mode.mode !== "mcp_full")
    .sort((left, right) => right.recall - left.recall)[0];
  const mcpAB = report.parts.modeledHumanTaskAB.modes.find(
    (mode) => mode.mode === "mcp_full",
  );
  const baselineAB = report.parts.modeledHumanTaskAB.modes
    .filter((mode) => mode.mode !== "mcp_full")
    .sort(
      (left, right) =>
        left.modeledMinutesToCorrectAnswer -
        right.modeledMinutesToCorrectAnswer,
    )[0];

  console.log(
    JSON.stringify(
      {
        reportPath: outputPath,
        anchorBudget: report.anchorBudget,
        queryCount: report.queryCount,
        driftQueries: report.parts.docDriftDetection.generatedQueries,
        keyWins: {
          issueRecallEdgePoints:
            mcpIssue && baselineIssue
              ? (mcpIssue.recall - baselineIssue.recall) * 100
              : 0,
          issueTokenCutPct:
            mcpIssue && baselineIssue && baselineIssue.inputTokens > 0
              ? ((baselineIssue.inputTokens - mcpIssue.inputTokens) /
                  baselineIssue.inputTokens) *
                100
              : 0,
          modeledTaskMinutesEdge:
            mcpAB && baselineAB
              ? baselineAB.modeledMinutesToCorrectAnswer -
                mcpAB.modeledMinutesToCorrectAnswer
              : 0,
        },
      },
      null,
      2,
    ),
  );
}

await main();
