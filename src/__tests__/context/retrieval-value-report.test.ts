import { describe, expect, it } from "bun:test";
import {
  buildRetrievalValueMarkdownReport,
  createRetrievalValueReport,
  type RetrievalValueRun,
} from "../../tools/context-value-report";

function run(overrides: Partial<RetrievalValueRun>): RetrievalValueRun {
  return {
    queryId: "q-auth",
    query: "Why JWT?",
    mode: "no_mcp",
    latencyMs: 1,
    tokens: 0,
    sectionsIncluded: 0,
    ragSections: 0,
    kagSections: 0,
    graphragSections: 0,
    ...overrides,
  };
}

describe("retrieval value report", () => {
  it("computes mode summaries and lift deltas", () => {
    const report = createRetrievalValueReport({
      projectPath: "/repo",
      recallK: 5,
      runs: [
        run({
          mode: "no_mcp",
          latencyMs: 0,
          quality: { memoryRecall: 0, entityRecall: 0, precisionAtK: 0 },
        }),
        run({
          mode: "memory_only",
          latencyMs: 40,
          tokens: 600,
          sectionsIncluded: 4,
          ragSections: 4,
          route: "memory",
          quality: { memoryRecall: 0.5, entityRecall: 0, precisionAtK: 0.3 },
        }),
        run({
          mode: "mcp_full",
          latencyMs: 80,
          tokens: 1100,
          sectionsIncluded: 7,
          ragSections: 4,
          kagSections: 1,
          graphragSections: 2,
          route: "hybrid",
          quality: {
            memoryRecall: 1,
            entityRecall: 1,
            precisionAtK: 0.7,
          },
        }),
      ],
      generatedAt: "2026-02-14T00:00:00.000Z",
    });

    expect(report.queryCount).toBe(1);
    expect(report.modes).toHaveLength(3);
    expect(report.lifts).toHaveLength(2);

    const noMcpToFull = report.lifts.find(
      (lift) => lift.from === "no_mcp" && lift.to === "mcp_full",
    );

    expect(noMcpToFull?.memoryRecallDelta).toBe(1);
    expect(noMcpToFull?.entityRecallDelta).toBe(1);
    expect(noMcpToFull?.precisionAtKDelta).toBe(0.7);
  });

  it("renders markdown summary with lift and query detail", () => {
    const report = createRetrievalValueReport({
      projectPath: "/repo",
      recallK: 5,
      runs: [
        run({
          mode: "no_mcp",
          latencyMs: 0,
          quality: { memoryRecall: 0, entityRecall: 0, precisionAtK: 0 },
        }),
        run({
          mode: "mcp_full",
          latencyMs: 75,
          tokens: 900,
          sectionsIncluded: 6,
          ragSections: 3,
          kagSections: 1,
          graphragSections: 2,
          route: "hybrid",
          quality: {
            memoryRecall: 1,
            entityRecall: 1,
            precisionAtK: 0.6,
          },
        }),
      ],
      generatedAt: "2026-02-14T00:00:00.000Z",
    });

    const markdown = buildRetrievalValueMarkdownReport(report);

    expect(markdown).toContain("# MCP Value Report");
    expect(markdown).toContain("## Lift Summary");
    expect(markdown).toContain("no_mcp");
    expect(markdown).toContain("mcp_full");
    expect(markdown).toContain("## Query Detail");
    expect(markdown).toContain("q-auth");
  });
});
