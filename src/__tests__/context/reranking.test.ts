import { describe, expect, it } from "bun:test";
import {
  type ContextRerankCandidate,
  rerankContextCandidates,
} from "../../tools/context";

function candidate(
  id: string,
  source: "rag" | "kag",
  relevance: number,
  queryTerms: string[],
): ContextRerankCandidate {
  return { id, source, relevance, queryTerms };
}

describe("context hybrid fusion reranking", () => {
  it("prioritizes KAG candidates for code-intent routes", () => {
    const ranked = rerankContextCandidates(
      [
        candidate("rag-1", "rag", 1.0, ["auth", "token"]),
        candidate("rag-2", "rag", 0.95, ["auth", "strategy"]),
        candidate("kag-1", "kag", 0.9, ["validate", "token"]),
        candidate("kag-2", "kag", 0.88, ["caller", "impact"]),
      ],
      {
        route: "code",
        ragRatio: 0.25,
        kagRatio: 0.75,
        graphragRatio: 0,
      },
    );

    expect(ranked.length).toBe(4);
    expect(ranked[0]?.source).toBe("kag");
  });

  it("prioritizes RAG candidates for memory-intent routes", () => {
    const ranked = rerankContextCandidates(
      [
        candidate("rag-1", "rag", 0.88, ["decision", "history"]),
        candidate("kag-1", "kag", 0.9, ["validate", "caller"]),
      ],
      {
        route: "memory",
        ragRatio: 0.9,
        kagRatio: 0.1,
        graphragRatio: 0,
      },
    );

    expect(ranked.length).toBe(2);
    expect(ranked[0]?.id).toBe("rag-1");
  });

  it("reduces source collapse for hybrid routes", () => {
    const ranked = rerankContextCandidates(
      [
        candidate("rag-1", "rag", 0.95, ["auth", "token"]),
        candidate("rag-2", "rag", 0.93, ["auth", "token"]),
        candidate("rag-3", "rag", 0.91, ["auth", "token"]),
        candidate("kag-1", "kag", 0.86, ["validate", "handler"]),
        candidate("kag-2", "kag", 0.84, ["dependency", "impact"]),
      ],
      {
        route: "hybrid",
        ragRatio: 0.7,
        kagRatio: 0.3,
        graphragRatio: 0,
      },
    );

    const topThree = ranked.slice(0, 3);
    expect(topThree.some((item) => item.source === "kag")).toBe(true);
  });

  it("boosts novel query-term coverage over redundant candidates", () => {
    const ranked = rerankContextCandidates(
      [
        candidate("rag-1", "rag", 0.9, ["auth", "token"]),
        candidate("rag-2", "rag", 0.88, ["auth", "token"]),
        candidate("rag-3", "rag", 0.87, ["refresh", "rotation"]),
      ],
      {
        route: "memory",
        ragRatio: 1,
        kagRatio: 0,
        graphragRatio: 0,
      },
    );

    expect(ranked[0]?.id).toBe("rag-1");
    expect(ranked[1]?.id).toBe("rag-3");
  });
});
