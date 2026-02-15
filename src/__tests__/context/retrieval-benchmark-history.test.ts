import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RetrievalBenchmarkResult } from "../../tools/context";
import {
  appendHistoryRecord,
  compareHistoryRecords,
  createHistoryRecord,
  filterHistoryRecords,
  findBaselineRecord,
  loadHistoryRecords,
  summarizeHistoryRecords,
} from "../../tools/context-benchmark-history";

const tempDirs: string[] = [];

function createTempPath(fileName: string): string {
  const dir = mkdtempSync(join(tmpdir(), "doclea-history-test-"));
  tempDirs.push(dir);
  return join(dir, fileName);
}

function createBenchmarkResult(
  overrides: Partial<RetrievalBenchmarkResult> = {},
) {
  const base: RetrievalBenchmarkResult = {
    totalRuns: 4,
    queryCount: 2,
    runsPerQuery: 2,
    warmupRuns: 1,
    overall: {
      min: 10,
      max: 100,
      avg: 40,
      p50: 30,
      p95: 90,
      p99: 100,
    },
    cache: {
      hits: 2,
      misses: 2,
      hitRate: 50,
    },
    routes: [
      {
        route: "memory",
        runs: 2,
        min: 10,
        max: 30,
        avg: 20,
        p50: 20,
        p95: 30,
        p99: 30,
      },
    ],
    stages: [
      {
        stage: "rag",
        runs: 4,
        min: 2,
        max: 20,
        avg: 8,
        p50: 6,
        p95: 18,
        p99: 20,
      },
      {
        stage: "total",
        runs: 4,
        min: 10,
        max: 100,
        avg: 40,
        p50: 30,
        p95: 90,
        p99: 100,
      },
    ],
    querySamples: [
      {
        query: "auth",
        route: "memory",
        latencyMs: 30,
        tokens: 500,
        sectionsIncluded: 3,
      },
    ],
  };

  return {
    ...base,
    ...overrides,
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("retrieval benchmark history", () => {
  it("appends records and applies retention pruning", () => {
    const historyPath = createTempPath("retrieval-history.jsonl");

    const first = createHistoryRecord(
      createBenchmarkResult({
        overall: { min: 10, max: 80, avg: 35, p50: 25, p95: 70, p99: 80 },
      }),
      {},
      {
        commitSha: "sha-1",
        branch: "main",
        source: "test",
        projectPath: "/repo",
        timestamp: "2026-02-14T10:00:00.000Z",
        runId: "run-1",
      },
    );

    const second = createHistoryRecord(
      createBenchmarkResult({
        overall: { min: 12, max: 90, avg: 38, p50: 28, p95: 80, p99: 90 },
      }),
      {},
      {
        commitSha: "sha-2",
        branch: "main",
        source: "test",
        projectPath: "/repo",
        timestamp: "2026-02-14T11:00:00.000Z",
        runId: "run-2",
      },
    );

    const third = createHistoryRecord(
      createBenchmarkResult({
        overall: { min: 15, max: 120, avg: 50, p50: 40, p95: 110, p99: 120 },
      }),
      {},
      {
        commitSha: "sha-3",
        branch: "main",
        source: "test",
        projectPath: "/repo",
        timestamp: "2026-02-14T12:00:00.000Z",
        runId: "run-3",
      },
    );

    appendHistoryRecord(historyPath, first, 2);
    appendHistoryRecord(historyPath, second, 2);
    const appendResult = appendHistoryRecord(historyPath, third, 2);

    expect(appendResult.totalRecords).toBe(2);
    expect(appendResult.prunedRecords).toBe(1);

    const records = loadHistoryRecords(historyPath);
    expect(records).toHaveLength(2);
    expect(records[0]?.metadata.runId).toBe("run-2");
    expect(records[1]?.metadata.runId).toBe("run-3");
  });

  it("filters records by branch and commit and summarizes newest first", () => {
    const historyPath = createTempPath("history.jsonl");

    const mainRecord = createHistoryRecord(
      createBenchmarkResult(),
      {},
      {
        commitSha: "sha-main",
        branch: "main",
        source: "test",
        projectPath: "/repo",
        timestamp: "2026-02-14T10:00:00.000Z",
        runId: "main-run",
      },
    );
    const featureRecord = createHistoryRecord(
      createBenchmarkResult(),
      {},
      {
        commitSha: "sha-feature",
        branch: "feature/quality",
        source: "test",
        projectPath: "/repo",
        timestamp: "2026-02-14T11:00:00.000Z",
        runId: "feature-run",
      },
    );

    appendHistoryRecord(historyPath, mainRecord, 20);
    appendHistoryRecord(historyPath, featureRecord, 20);

    const records = loadHistoryRecords(historyPath);
    const filtered = filterHistoryRecords(records, {
      branch: "feature/quality",
      commitSha: "sha-feature",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.metadata.runId).toBe("feature-run");

    const summary = summarizeHistoryRecords(records, 2);
    expect(summary[0]?.runId).toBe("feature-run");
    expect(summary[1]?.runId).toBe("main-run");
  });

  it("finds a baseline and computes latency deltas", () => {
    const historyPath = createTempPath("compare.jsonl");

    const baseline = createHistoryRecord(
      createBenchmarkResult({
        overall: { min: 8, max: 60, avg: 25, p50: 20, p95: 50, p99: 60 },
        cache: { hits: 3, misses: 1, hitRate: 75 },
        stages: [
          {
            stage: "rag",
            runs: 4,
            min: 2,
            max: 12,
            avg: 6,
            p50: 5,
            p95: 11,
            p99: 12,
          },
          {
            stage: "total",
            runs: 4,
            min: 8,
            max: 60,
            avg: 25,
            p50: 20,
            p95: 50,
            p99: 60,
          },
        ],
      }),
      { includeCodeGraph: true, includeGraphRAG: true },
      {
        commitSha: "sha-old",
        branch: "main",
        source: "test",
        projectPath: "/repo",
        timestamp: "2026-02-14T08:00:00.000Z",
        runId: "baseline-run",
      },
    );

    const current = createHistoryRecord(
      createBenchmarkResult({
        overall: { min: 9, max: 95, avg: 35, p50: 28, p95: 80, p99: 95 },
        cache: { hits: 2, misses: 2, hitRate: 50 },
        stages: [
          {
            stage: "rag",
            runs: 4,
            min: 3,
            max: 18,
            avg: 8,
            p50: 7,
            p95: 16,
            p99: 18,
          },
          {
            stage: "total",
            runs: 4,
            min: 9,
            max: 95,
            avg: 35,
            p50: 28,
            p95: 80,
            p99: 95,
          },
        ],
      }),
      { includeCodeGraph: true, includeGraphRAG: true },
      {
        commitSha: "sha-new",
        branch: "main",
        source: "test",
        projectPath: "/repo",
        timestamp: "2026-02-14T09:00:00.000Z",
        runId: "current-run",
      },
    );

    appendHistoryRecord(historyPath, baseline, 20);
    appendHistoryRecord(historyPath, current, 20);

    const records = loadHistoryRecords(historyPath);
    const resolvedCurrent = records.find(
      (record) => record.metadata.runId === "current-run",
    );
    expect(resolvedCurrent).toBeDefined();

    const foundBaseline = findBaselineRecord(records, resolvedCurrent!, {
      sameBranch: true,
      sameConfig: true,
      maxLookback: 5,
    });

    expect(foundBaseline?.metadata.runId).toBe("baseline-run");

    const comparison = compareHistoryRecords(foundBaseline!, resolvedCurrent!);
    expect(comparison.overall.p95DeltaMs).toBe(30);
    expect(comparison.overall.p95Ratio).toBe(1.6);
    expect(comparison.overall.hitRateDelta).toBe(-25);

    const ragDelta = comparison.stages.find((stage) => stage.stage === "rag");
    expect(ragDelta?.deltaMs).toBe(5);
  });
});
