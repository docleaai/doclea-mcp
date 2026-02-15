import {
  compareHistoryRecords,
  filterHistoryRecords,
  findBaselineRecord,
  loadHistoryRecords,
  type RetrievalBenchmarkHistoryRecord,
  type RetrievalHistoryFilter,
  summarizeHistoryRecords,
} from "../src/tools/context-benchmark-history";

interface CliOptions {
  command: "list" | "compare";
  historyPath: string;
  branch?: string;
  commitSha?: string;
  since?: string;
  until?: string;
  limit: number;
  runId?: string;
  baselineRunId?: string;
  json: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const commandRaw = argv[2]?.toLowerCase();
  const hasExplicitCommand = commandRaw === "list" || commandRaw === "compare";
  const command = commandRaw === "compare" ? "compare" : "list";

  const options: CliOptions = {
    command,
    historyPath:
      process.env.DOCLEA_PERF_HISTORY_PATH ??
      ".doclea/benchmarks/retrieval-history.jsonl",
    limit: 20,
    json: false,
  };

  for (let i = hasExplicitCommand ? 3 : 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (!arg) {
      continue;
    }

    switch (arg) {
      case "--history":
        if (next) {
          options.historyPath = next;
          i++;
        }
        break;
      case "--branch":
        if (next) {
          options.branch = next;
          i++;
        }
        break;
      case "--commit":
        if (next) {
          options.commitSha = next;
          i++;
        }
        break;
      case "--since":
        if (next) {
          options.since = next;
          i++;
        }
        break;
      case "--until":
        if (next) {
          options.until = next;
          i++;
        }
        break;
      case "--limit":
        if (next) {
          const parsed = Number.parseInt(next, 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            options.limit = parsed;
          }
          i++;
        }
        break;
      case "--run-id":
        if (next) {
          options.runId = next;
          i++;
        }
        break;
      case "--baseline-run-id":
        if (next) {
          options.baselineRunId = next;
          i++;
        }
        break;
      case "--json":
        options.json = true;
        break;
      default:
        break;
    }
  }

  return options;
}

function toUnixMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toFilter(options: CliOptions): RetrievalHistoryFilter {
  return {
    ...(options.branch ? { branch: options.branch } : {}),
    ...(options.commitSha ? { commitSha: options.commitSha } : {}),
    ...(options.since ? { sinceUnixMs: toUnixMs(options.since) } : {}),
    ...(options.until ? { untilUnixMs: toUnixMs(options.until) } : {}),
  };
}

function printList(
  records: ReturnType<typeof summarizeHistoryRecords>,
  historyPath: string,
): void {
  console.log(`[doclea] Retrieval benchmark history: ${historyPath}`);
  if (records.length === 0) {
    console.log("No matching benchmark records found.");
    return;
  }

  for (const record of records) {
    console.log(
      `${record.timestamp} | ${record.branch} | ${record.commitSha.slice(0, 12)} | p95=${record.p95Ms}ms | p50=${record.p50Ms}ms | hitRate=${record.hitRate}% | runId=${record.runId}`,
    );
  }
}

function findRecordByRunId(
  records: RetrievalBenchmarkHistoryRecord[],
  runId: string,
): RetrievalBenchmarkHistoryRecord | undefined {
  return records.find((record) => record.metadata.runId === runId);
}

async function main(): Promise<void> {
  const options = parseArgs(Bun.argv);
  const allRecords = loadHistoryRecords(options.historyPath);
  const filteredRecords = filterHistoryRecords(allRecords, toFilter(options));

  if (options.command === "list") {
    const summary = summarizeHistoryRecords(filteredRecords, options.limit);
    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    printList(summary, options.historyPath);
    return;
  }

  const sorted = [...filteredRecords].sort(
    (left, right) => right.metadata.unixMs - left.metadata.unixMs,
  );

  const current = options.runId
    ? findRecordByRunId(sorted, options.runId)
    : sorted[0];

  if (!current) {
    console.error("[doclea] No current benchmark record found for comparison.");
    process.exitCode = 1;
    return;
  }

  const baseline = options.baselineRunId
    ? findRecordByRunId(allRecords, options.baselineRunId)
    : findBaselineRecord(allRecords, current, {
        sameBranch: true,
        sameConfig: true,
        maxLookback: options.limit,
      });

  if (!baseline) {
    console.error("[doclea] No baseline benchmark record found.");
    process.exitCode = 1;
    return;
  }

  const comparison = compareHistoryRecords(baseline, current);

  if (options.json) {
    console.log(JSON.stringify(comparison, null, 2));
    return;
  }

  console.log(
    `[doclea] Comparing ${current.metadata.runId} (${current.metadata.commitSha.slice(0, 12)}) vs ${baseline.metadata.runId} (${baseline.metadata.commitSha.slice(0, 12)})`,
  );
  console.log(
    `[doclea] Overall: p95 ${comparison.overall.p95DeltaMs}ms (${comparison.overall.p95Ratio}x), p50 ${comparison.overall.p50DeltaMs}ms, avg ${comparison.overall.avgDeltaMs}ms, hitRate ${comparison.overall.hitRateDelta}%`,
  );

  const significantStages = comparison.stages
    .filter((stage) => stage.deltaMs !== 0)
    .sort((left, right) => Math.abs(right.deltaMs) - Math.abs(left.deltaMs));

  if (significantStages.length === 0) {
    console.log("[doclea] No stage-level p95 changes detected.");
    return;
  }

  for (const stage of significantStages.slice(0, options.limit)) {
    const sign = stage.deltaMs >= 0 ? "+" : "";
    console.log(
      `${stage.stage}: ${sign}${stage.deltaMs}ms (${stage.ratio}x) baseline=${stage.baselineP95}ms current=${stage.currentP95}ms`,
    );
  }
}

await main();
