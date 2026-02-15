import type { BuildContextInput, ContextEvidenceItem } from "./context";

export interface GoldenQueryExpectation {
  id: string;
  query: string;
  expectedMemoryIds?: string[];
  expectedEntityIds?: string[];
  expectedEntityNames?: string[];
  recallK?: number;
  minMemoryRecall?: number;
  minEntityRecall?: number;
  minPrecisionAtK?: number;
  includeCodeGraph?: boolean;
  includeGraphRAG?: boolean;
  tokenBudget?: number;
  template?: "default" | "compact" | "detailed";
  filters?: BuildContextInput["filters"];
}

export interface GoldenQueryGlobalThresholds {
  recallK: number;
  minMemoryRecall: number;
  minEntityRecall: number;
  minPrecisionAtK?: number;
}

export interface GoldenQueryEvaluationThresholds {
  recallK: number;
  minMemoryRecall: number;
  minEntityRecall: number;
  minPrecisionAtK?: number;
}

export interface GoldenQueryScore {
  expected: string[];
  retrievedTopK: string[];
  matched: string[];
  missing: string[];
  recall: number;
  precision: number;
  threshold: number;
}

export interface GoldenQueryEvaluation {
  queryId: string;
  query: string;
  thresholds: GoldenQueryEvaluationThresholds;
  memory: GoldenQueryScore;
  entity: GoldenQueryScore;
  precisionAtK: number;
  passed: boolean;
  failureReasons: string[];
}

export interface GoldenQueryGateReport {
  totalQueries: number;
  passedQueries: number;
  failedQueries: number;
  passed: boolean;
  averages: {
    memoryRecall: number;
    entityRecall: number;
    precisionAtK: number;
  };
  queries: GoldenQueryEvaluation[];
}

export interface GoldenQueryGateInput {
  queries: Array<{
    expectation: GoldenQueryExpectation;
    evidence: ContextEvidenceItem[];
  }>;
  defaults: GoldenQueryGlobalThresholds;
  entityNameById?: Record<string, string>;
}

export interface GoldenFixtureSnapshotRow {
  queryId: string;
  expectedMemoryIds: string[];
  expectedEntityNames: string[];
}

function toFixedNumber(value: number, decimals = 4): number {
  return Number(value.toFixed(decimals));
}

function toNormalizedSet(values: string[] | undefined): Set<string> {
  if (!values || values.length === 0) {
    return new Set<string>();
  }

  return new Set(
    values
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => value.toLowerCase()),
  );
}

function sortedFromSet(values: Set<string>): string[] {
  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

function resolveThresholds(
  expectation: GoldenQueryExpectation,
  defaults: GoldenQueryGlobalThresholds,
): GoldenQueryEvaluationThresholds {
  return {
    recallK: expectation.recallK ?? defaults.recallK,
    minMemoryRecall: expectation.minMemoryRecall ?? defaults.minMemoryRecall,
    minEntityRecall: expectation.minEntityRecall ?? defaults.minEntityRecall,
    minPrecisionAtK:
      expectation.minPrecisionAtK ?? defaults.minPrecisionAtK ?? undefined,
  };
}

function collectTopKSignals(
  evidence: ContextEvidenceItem[],
  recallK: number,
  entityNameById?: Record<string, string>,
): {
  memoryIds: Set<string>;
  entityIds: Set<string>;
  entityNames: Set<string>;
} {
  const ranked = evidence
    .filter((item) => item.rank > 0)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, Math.max(1, recallK));

  const memoryIds = new Set<string>();
  const entityIds = new Set<string>();
  const entityNames = new Set<string>();

  for (const item of ranked) {
    const memoryId = item.memory?.id?.trim();
    if (memoryId) {
      memoryIds.add(memoryId.toLowerCase());
    }

    if (item.graph?.sourceMemoryIds && item.graph.sourceMemoryIds.length > 0) {
      for (const linkedMemoryId of item.graph.sourceMemoryIds) {
        const normalized = linkedMemoryId.trim().toLowerCase();
        if (normalized.length > 0) {
          memoryIds.add(normalized);
        }
      }
    }

    const entityId = item.graph?.entityId?.trim();
    if (entityId) {
      const normalizedEntityId = entityId.toLowerCase();
      entityIds.add(normalizedEntityId);
      const mappedName = entityNameById?.[normalizedEntityId];
      if (mappedName && mappedName.trim().length > 0) {
        entityNames.add(mappedName.trim().toLowerCase());
      }
    }
  }

  return { memoryIds, entityIds, entityNames };
}

function scoreSet(
  expected: Set<string>,
  retrieved: Set<string>,
  threshold: number,
) {
  const matched = new Set<string>();
  const missing = new Set<string>();

  for (const expectedValue of expected) {
    if (retrieved.has(expectedValue)) {
      matched.add(expectedValue);
    } else {
      missing.add(expectedValue);
    }
  }

  const recall =
    expected.size === 0 ? 1 : toFixedNumber(matched.size / expected.size, 4);
  const precision =
    retrieved.size === 0
      ? expected.size === 0
        ? 1
        : 0
      : toFixedNumber(matched.size / retrieved.size, 4);

  return {
    expected: sortedFromSet(expected),
    retrievedTopK: sortedFromSet(retrieved),
    matched: sortedFromSet(matched),
    missing: sortedFromSet(missing),
    recall,
    precision,
    threshold,
  };
}

function computeCombinedPrecision(
  memoryExpected: Set<string>,
  memoryRetrieved: Set<string>,
  entityExpected: Set<string>,
  entityRetrieved: Set<string>,
): number {
  const expectedCombined = new Set<string>();
  const retrievedCombined = new Set<string>();

  for (const id of memoryExpected) {
    expectedCombined.add(`memory:${id}`);
  }
  for (const id of entityExpected) {
    expectedCombined.add(`entity:${id}`);
  }
  for (const id of memoryRetrieved) {
    retrievedCombined.add(`memory:${id}`);
  }
  for (const id of entityRetrieved) {
    retrievedCombined.add(`entity:${id}`);
  }

  if (retrievedCombined.size === 0) {
    return expectedCombined.size === 0 ? 1 : 0;
  }

  let matched = 0;
  for (const id of retrievedCombined) {
    if (expectedCombined.has(id)) {
      matched++;
    }
  }

  return toFixedNumber(matched / retrievedCombined.size, 4);
}

export function evaluateGoldenQuery(
  expectation: GoldenQueryExpectation,
  evidence: ContextEvidenceItem[],
  defaults: GoldenQueryGlobalThresholds,
  entityNameById?: Record<string, string>,
): GoldenQueryEvaluation {
  const thresholds = resolveThresholds(expectation, defaults);
  const topKSignals = collectTopKSignals(
    evidence,
    thresholds.recallK,
    entityNameById,
  );

  const expectedMemory = toNormalizedSet(expectation.expectedMemoryIds);
  const expectedEntityIds = toNormalizedSet(expectation.expectedEntityIds);
  const expectedEntityNames = toNormalizedSet(expectation.expectedEntityNames);
  const expectedEntity = new Set<string>([
    ...expectedEntityIds,
    ...expectedEntityNames,
  ]);

  const retrievedEntity =
    expectedEntityIds.size > 0
      ? new Set<string>([...topKSignals.entityIds, ...topKSignals.entityNames])
      : topKSignals.entityNames.size > 0
        ? new Set<string>(topKSignals.entityNames)
        : new Set<string>(topKSignals.entityIds);

  const memoryScore = scoreSet(
    expectedMemory,
    topKSignals.memoryIds,
    thresholds.minMemoryRecall,
  );
  const entityScore = scoreSet(
    expectedEntity,
    retrievedEntity,
    thresholds.minEntityRecall,
  );

  const precisionAtK = computeCombinedPrecision(
    expectedMemory,
    topKSignals.memoryIds,
    expectedEntity,
    retrievedEntity,
  );

  const failureReasons: string[] = [];
  if (memoryScore.recall < thresholds.minMemoryRecall) {
    failureReasons.push(
      `memory recall ${memoryScore.recall} < ${thresholds.minMemoryRecall}`,
    );
  }
  if (entityScore.recall < thresholds.minEntityRecall) {
    failureReasons.push(
      `entity recall ${entityScore.recall} < ${thresholds.minEntityRecall}`,
    );
  }
  if (
    thresholds.minPrecisionAtK !== undefined &&
    precisionAtK < thresholds.minPrecisionAtK
  ) {
    failureReasons.push(
      `precision@${thresholds.recallK} ${precisionAtK} < ${thresholds.minPrecisionAtK}`,
    );
  }

  return {
    queryId: expectation.id,
    query: expectation.query,
    thresholds,
    memory: memoryScore,
    entity: entityScore,
    precisionAtK,
    passed: failureReasons.length === 0,
    failureReasons,
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return toFixedNumber(
    values.reduce((sum, value) => sum + value, 0) / values.length,
    4,
  );
}

export function evaluateGoldenQueryGate(
  input: GoldenQueryGateInput,
): GoldenQueryGateReport {
  const evaluations = input.queries.map(({ expectation, evidence }) =>
    evaluateGoldenQuery(
      expectation,
      evidence,
      input.defaults,
      input.entityNameById,
    ),
  );

  const passedQueries = evaluations.filter((evaluation) => evaluation.passed);

  return {
    totalQueries: evaluations.length,
    passedQueries: passedQueries.length,
    failedQueries: evaluations.length - passedQueries.length,
    passed: passedQueries.length === evaluations.length,
    averages: {
      memoryRecall: average(
        evaluations.map((evaluation) => evaluation.memory.recall),
      ),
      entityRecall: average(
        evaluations.map((evaluation) => evaluation.entity.recall),
      ),
      precisionAtK: average(
        evaluations.map((evaluation) => evaluation.precisionAtK),
      ),
    },
    queries: evaluations,
  };
}

export function buildGoldenFixtureSnapshotRows(
  report: GoldenQueryGateReport,
): GoldenFixtureSnapshotRow[] {
  return report.queries.map((query) => ({
    queryId: query.queryId,
    expectedMemoryIds: query.memory.retrievedTopK,
    expectedEntityNames: query.entity.retrievedTopK,
  }));
}
