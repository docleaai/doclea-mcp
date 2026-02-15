import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ContextStageName,
  RetrievalBenchmarkInput,
  RetrievalBenchmarkResult,
} from "./context";

export interface RetrievalBenchmarkRunMetadata {
  runId: string;
  timestamp: string;
  unixMs: number;
  commitSha: string;
  branch: string;
  source: string;
  projectPath: string;
}

export interface RetrievalBenchmarkConfigSnapshot {
  queries?: string[];
  runsPerQuery: number;
  warmupRuns: number;
  tokenBudget: number;
  includeCodeGraph: boolean;
  includeGraphRAG: boolean;
  template: "default" | "compact" | "detailed";
  clearCacheFirst: boolean;
  compareAgainstMemoryOnly: boolean;
}

export interface RetrievalBenchmarkHistoryRecord {
  metadata: RetrievalBenchmarkRunMetadata;
  config: RetrievalBenchmarkConfigSnapshot;
  result: RetrievalBenchmarkResult;
}

export interface RetrievalHistoryAppendResult {
  totalRecords: number;
  prunedRecords: number;
}

export interface RetrievalHistoryFilter {
  branch?: string;
  commitSha?: string;
  sinceUnixMs?: number;
  untilUnixMs?: number;
}

export interface RetrievalHistorySummaryRow {
  runId: string;
  timestamp: string;
  commitSha: string;
  branch: string;
  p50Ms: number;
  p95Ms: number;
  hitRate: number;
  queryCount: number;
  totalRuns: number;
}

export interface RetrievalBenchmarkStageDelta {
  stage: ContextStageName;
  baselineP95: number;
  currentP95: number;
  deltaMs: number;
  ratio: number;
}

export interface RetrievalBenchmarkHistoryComparison {
  baseline: RetrievalBenchmarkRunMetadata;
  current: RetrievalBenchmarkRunMetadata;
  overall: {
    p50DeltaMs: number;
    p95DeltaMs: number;
    p95Ratio: number;
    avgDeltaMs: number;
    hitRateDelta: number;
  };
  stages: RetrievalBenchmarkStageDelta[];
}

export interface RetrievalHistoryBaselineOptions {
  sameBranch?: boolean;
  sameConfig?: boolean;
  maxLookback?: number;
}

function toFixedNumber(value: number, decimals = 4): number {
  return Number(value.toFixed(decimals));
}

function isRecordLike(
  value: unknown,
): value is RetrievalBenchmarkHistoryRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as RetrievalBenchmarkHistoryRecord;
  return (
    typeof record.metadata?.runId === "string" &&
    typeof record.metadata?.timestamp === "string" &&
    typeof record.metadata?.commitSha === "string" &&
    typeof record.metadata?.branch === "string" &&
    typeof record.result?.overall?.p95 === "number"
  );
}

export function toConfigSnapshot(
  input: RetrievalBenchmarkInput,
): RetrievalBenchmarkConfigSnapshot {
  return {
    ...(input.queries && input.queries.length > 0
      ? { queries: [...input.queries] }
      : {}),
    runsPerQuery: input.runsPerQuery ?? 3,
    warmupRuns: input.warmupRuns ?? 1,
    tokenBudget: input.tokenBudget ?? 4000,
    includeCodeGraph: input.includeCodeGraph ?? true,
    includeGraphRAG: input.includeGraphRAG ?? true,
    template: input.template ?? "compact",
    clearCacheFirst: input.clearCacheFirst ?? true,
    compareAgainstMemoryOnly: input.compareAgainstMemoryOnly ?? false,
  };
}

export function createHistoryRecord(
  result: RetrievalBenchmarkResult,
  input: RetrievalBenchmarkInput,
  metadata: {
    commitSha: string;
    branch: string;
    source: string;
    projectPath: string;
    timestamp?: string;
    runId?: string;
  },
): RetrievalBenchmarkHistoryRecord {
  const timestamp = metadata.timestamp ?? new Date().toISOString();
  return {
    metadata: {
      runId: metadata.runId ?? randomUUID(),
      timestamp,
      unixMs: Date.parse(timestamp),
      commitSha: metadata.commitSha,
      branch: metadata.branch,
      source: metadata.source,
      projectPath: metadata.projectPath,
    },
    config: toConfigSnapshot(input),
    result,
  };
}

function compareConfigSnapshots(
  left: RetrievalBenchmarkConfigSnapshot,
  right: RetrievalBenchmarkConfigSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function loadHistoryRecords(
  historyPath: string,
): RetrievalBenchmarkHistoryRecord[] {
  if (!existsSync(historyPath)) {
    return [];
  }

  const raw = readFileSync(historyPath, "utf-8").trim();
  if (raw.length === 0) {
    return [];
  }

  const records: RetrievalBenchmarkHistoryRecord[] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as unknown;
      if (isRecordLike(parsed)) {
        records.push(parsed);
      }
    } catch {
      // Ignore malformed history rows.
    }
  }

  records.sort((left, right) => left.metadata.unixMs - right.metadata.unixMs);
  return records;
}

export function saveHistoryRecords(
  historyPath: string,
  records: RetrievalBenchmarkHistoryRecord[],
): void {
  const directory = dirname(historyPath);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  const contents =
    records.map((record) => JSON.stringify(record)).join("\n") +
    (records.length > 0 ? "\n" : "");
  writeFileSync(historyPath, contents, "utf-8");
}

export function appendHistoryRecord(
  historyPath: string,
  record: RetrievalBenchmarkHistoryRecord,
  retention: number,
): RetrievalHistoryAppendResult {
  const existing = loadHistoryRecords(historyPath);
  const withNew = [...existing, record];
  const keep = Math.max(1, retention);
  const trimmed = withNew.slice(-keep);
  saveHistoryRecords(historyPath, trimmed);

  return {
    totalRecords: trimmed.length,
    prunedRecords: Math.max(0, withNew.length - trimmed.length),
  };
}

export function filterHistoryRecords(
  records: RetrievalBenchmarkHistoryRecord[],
  filter: RetrievalHistoryFilter,
): RetrievalBenchmarkHistoryRecord[] {
  const branch = filter.branch?.trim();
  const commitSha = filter.commitSha?.trim();

  return records.filter((record) => {
    if (branch && record.metadata.branch !== branch) {
      return false;
    }

    if (commitSha && record.metadata.commitSha !== commitSha) {
      return false;
    }

    if (
      typeof filter.sinceUnixMs === "number" &&
      record.metadata.unixMs < filter.sinceUnixMs
    ) {
      return false;
    }

    if (
      typeof filter.untilUnixMs === "number" &&
      record.metadata.unixMs > filter.untilUnixMs
    ) {
      return false;
    }

    return true;
  });
}

export function summarizeHistoryRecords(
  records: RetrievalBenchmarkHistoryRecord[],
  limit = 20,
): RetrievalHistorySummaryRow[] {
  const sorted = [...records]
    .sort((left, right) => right.metadata.unixMs - left.metadata.unixMs)
    .slice(0, Math.max(1, limit));

  return sorted.map((record) => ({
    runId: record.metadata.runId,
    timestamp: record.metadata.timestamp,
    commitSha: record.metadata.commitSha,
    branch: record.metadata.branch,
    p50Ms: record.result.overall.p50,
    p95Ms: record.result.overall.p95,
    hitRate: record.result.cache.hitRate,
    queryCount: record.result.queryCount,
    totalRuns: record.result.totalRuns,
  }));
}

export function findBaselineRecord(
  records: RetrievalBenchmarkHistoryRecord[],
  current: RetrievalBenchmarkHistoryRecord,
  options: RetrievalHistoryBaselineOptions = {},
): RetrievalBenchmarkHistoryRecord | undefined {
  const sameBranch = options.sameBranch ?? true;
  const sameConfig = options.sameConfig ?? true;
  const maxLookback = Math.max(1, options.maxLookback ?? 50);

  let inspected = 0;
  const sorted = [...records].sort(
    (left, right) => right.metadata.unixMs - left.metadata.unixMs,
  );

  for (const candidate of sorted) {
    if (candidate.metadata.runId === current.metadata.runId) {
      continue;
    }

    if (candidate.metadata.unixMs >= current.metadata.unixMs) {
      continue;
    }

    if (sameBranch && candidate.metadata.branch !== current.metadata.branch) {
      continue;
    }

    if (
      sameConfig &&
      !compareConfigSnapshots(candidate.config, current.config)
    ) {
      continue;
    }

    inspected += 1;
    if (inspected > maxLookback) {
      break;
    }

    return candidate;
  }

  return undefined;
}

function safeRatio(current: number, baseline: number): number {
  return toFixedNumber(current / Math.max(0.01, baseline), 4);
}

function toStageMap(
  result: RetrievalBenchmarkResult,
): Map<ContextStageName, number> {
  const map = new Map<ContextStageName, number>();
  for (const stage of result.stages) {
    map.set(stage.stage, stage.p95);
  }
  return map;
}

export function compareHistoryRecords(
  baseline: RetrievalBenchmarkHistoryRecord,
  current: RetrievalBenchmarkHistoryRecord,
): RetrievalBenchmarkHistoryComparison {
  const baselineStages = toStageMap(baseline.result);
  const currentStages = toStageMap(current.result);

  const stageNames: ContextStageName[] = [
    "rag",
    "kag",
    "graphrag",
    "rerank",
    "format",
    "tokenize",
    "evidence",
    "total",
  ];

  const stages: RetrievalBenchmarkStageDelta[] = stageNames
    .filter(
      (stageName) =>
        baselineStages.has(stageName) || currentStages.has(stageName),
    )
    .map((stageName) => {
      const baselineP95 = baselineStages.get(stageName) ?? 0;
      const currentP95 = currentStages.get(stageName) ?? 0;
      return {
        stage: stageName,
        baselineP95,
        currentP95,
        deltaMs: toFixedNumber(currentP95 - baselineP95, 4),
        ratio: safeRatio(currentP95, baselineP95),
      };
    });

  return {
    baseline: baseline.metadata,
    current: current.metadata,
    overall: {
      p50DeltaMs: toFixedNumber(
        current.result.overall.p50 - baseline.result.overall.p50,
        4,
      ),
      p95DeltaMs: toFixedNumber(
        current.result.overall.p95 - baseline.result.overall.p95,
        4,
      ),
      p95Ratio: safeRatio(
        current.result.overall.p95,
        baseline.result.overall.p95,
      ),
      avgDeltaMs: toFixedNumber(
        current.result.overall.avg - baseline.result.overall.avg,
        4,
      ),
      hitRateDelta: toFixedNumber(
        current.result.cache.hitRate - baseline.result.cache.hitRate,
        4,
      ),
    },
    stages,
  };
}
