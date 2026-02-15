import { describe, expect, it } from "bun:test";
import type { ContextEvidenceItem } from "../../tools/context";
import {
  buildGoldenFixtureSnapshotRows,
  evaluateGoldenQueryGate,
} from "../../tools/context-quality-gate";

function evidenceItem(
  id: string,
  rank: number,
  options: Partial<ContextEvidenceItem> = {},
): ContextEvidenceItem {
  return {
    id,
    title: id,
    source: "rag",
    rank,
    relevance: 0.9,
    tokens: 40,
    included: true,
    reason: "test",
    queryTerms: ["test"],
    ...options,
  };
}

describe("context quality gate", () => {
  it("passes when expected memory and entity hits are retrieved in top-k", () => {
    const report = evaluateGoldenQueryGate({
      defaults: {
        recallK: 3,
        minMemoryRecall: 1,
        minEntityRecall: 1,
      },
      entityNameById: {
        "entity-auth": "authservice",
      },
      queries: [
        {
          expectation: {
            id: "auth-query",
            query: "why auth",
            expectedMemoryIds: ["mem-auth"],
            expectedEntityNames: ["authservice"],
          },
          evidence: [
            evidenceItem("rag-auth", 1, {
              memory: {
                id: "mem-auth",
                type: "decision",
                tags: ["auth"],
                importance: 0.9,
                relatedFiles: ["src/auth.ts"],
              },
            }),
            evidenceItem("graph-auth", 2, {
              source: "graphrag",
              graph: {
                entityId: "entity-auth",
                entityType: "CONCEPT",
                mentionCount: 3,
                relationshipCount: 1,
                communityIds: ["community-auth"],
                sourceMemoryIds: ["mem-auth"],
              },
            }),
          ],
        },
      ],
    });

    expect(report.passed).toBe(true);
    expect(report.failedQueries).toBe(0);
    expect(report.queries[0]?.memory.recall).toBe(1);
    expect(report.queries[0]?.entity.recall).toBe(1);
  });

  it("fails with clear missing-hit reasons when recall drops below threshold", () => {
    const report = evaluateGoldenQueryGate({
      defaults: {
        recallK: 2,
        minMemoryRecall: 1,
        minEntityRecall: 1,
        minPrecisionAtK: 0.6,
      },
      queries: [
        {
          expectation: {
            id: "payments-query",
            query: "payment failure",
            expectedMemoryIds: ["mem-payments"],
            expectedEntityIds: ["entity-payments"],
          },
          evidence: [
            evidenceItem("rag-other", 1, {
              memory: {
                id: "mem-unrelated",
                type: "note",
                tags: ["misc"],
                importance: 0.2,
                relatedFiles: [],
              },
            }),
          ],
        },
      ],
    });

    expect(report.passed).toBe(false);
    expect(report.failedQueries).toBe(1);
    expect(report.queries[0]?.failureReasons).toContain("memory recall 0 < 1");
    expect(report.queries[0]?.failureReasons).toContain("entity recall 0 < 1");
    expect(report.queries[0]?.memory.missing).toContain("mem-payments");
    expect(report.queries[0]?.entity.missing).toContain("entity-payments");
  });

  it("builds fixture snapshot rows from top-k retrieval signals", () => {
    const report = evaluateGoldenQueryGate({
      defaults: {
        recallK: 3,
        minMemoryRecall: 0,
        minEntityRecall: 0,
      },
      entityNameById: {
        "entity-payments": "paymentservice",
      },
      queries: [
        {
          expectation: {
            id: "snapshot-query",
            query: "payments",
          },
          evidence: [
            evidenceItem("rag-payments", 1, {
              memory: {
                id: "mem-payments",
                type: "solution",
                tags: ["payments"],
                importance: 0.7,
                relatedFiles: [],
              },
            }),
            evidenceItem("graph-payments", 2, {
              source: "graphrag",
              graph: {
                entityId: "entity-payments",
                entityType: "CONCEPT",
                mentionCount: 5,
                relationshipCount: 2,
                communityIds: [],
                sourceMemoryIds: ["mem-payments"],
              },
            }),
          ],
        },
      ],
    });

    const snapshots = buildGoldenFixtureSnapshotRows(report);
    expect(snapshots).toEqual([
      {
        queryId: "snapshot-query",
        expectedMemoryIds: ["mem-payments"],
        expectedEntityNames: ["paymentservice"],
      },
    ]);
  });
});
