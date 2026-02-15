/**
 * GraphRAG Search Tool
 *
 * Search the GraphRAG knowledge graph using local, global, or drift modes.
 */

import { z } from "zod";
import type { EmbeddingClient } from "@/embeddings/provider";
import { GraphRAGStorage } from "@/graphrag/graph/graphrag-storage";
import { DriftSearch } from "@/graphrag/search/drift-search";
import { GlobalSearch } from "@/graphrag/search/global-search";
import { LocalSearch } from "@/graphrag/search/local-search";
import type {
  CommunityReport,
  DriftSearchResult,
  GlobalSearchResult,
  LocalSearchResult,
} from "@/graphrag/types";
import type { IStorageBackend } from "@/storage/interface";
import type { VectorStore } from "@/vectors/interface";
import {
  GRAPHRAG_REPORT_VECTOR_TYPE,
  searchGraphEntities,
} from "./entity-vectors";

export const SearchInputSchema = z.object({
  query: z.string().min(1).describe("Search query"),
  mode: z
    .enum(["local", "global", "drift"])
    .default("local")
    .describe(
      "Search mode: local (entity-centric), global (community-centric), drift (iterative)",
    ),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum results to return"),
  communityLevel: z
    .number()
    .min(0)
    .max(5)
    .default(1)
    .describe("Community level for global search"),
  maxIterations: z
    .number()
    .min(1)
    .max(10)
    .default(3)
    .describe("Maximum iterations for drift search"),
  maxDepth: z
    .number()
    .min(1)
    .max(5)
    .default(2)
    .describe("Maximum graph traversal depth for local search"),
});

export type SearchInput = z.infer<typeof SearchInputSchema>;

export type SearchResult =
  | { mode: "local"; result: LocalSearchResult }
  | { mode: "global"; result: GlobalSearchResult }
  | { mode: "drift"; result: DriftSearchResult };

/**
 * Search the GraphRAG knowledge graph
 */
export async function graphragSearch(
  input: SearchInput,
  storage: IStorageBackend,
  embeddings: EmbeddingClient,
  vectors: VectorStore,
): Promise<SearchResult> {
  const db = storage.getDatabase();
  const graphStorage = new GraphRAGStorage(db);

  // Create entity vector search function
  const entityVectorSearch = async (
    query: string,
  ): Promise<Array<{ entityId: string; score: number }>> => {
    const results = await searchGraphEntities(
      query,
      graphStorage,
      vectors,
      embeddings,
      {
        limit: Math.max(Math.min(input.limit, 50), 20),
        minScore: 0.12,
        minLexicalScore: 0.2,
      },
    );

    return results.map((result) => ({
      entityId: result.entityId,
      score: result.score,
    }));
  };

  // Create report vector search function
  const reportVectorSearch = async (
    query: string,
  ): Promise<Array<{ reportId: string; score: number }>> => {
    // Search vector store for reports
    const queryVector = await embeddings.embed(query);
    const vectorResults = await vectors.search(
      queryVector,
      {
        type: GRAPHRAG_REPORT_VECTOR_TYPE,
      },
      20,
    );

    // Map results to report IDs. Older payloads may not include reportId,
    // so we resolve via embedding_id fallback.
    const reportsByEmbeddingId = new Map<string, CommunityReport>();
    for (const report of graphStorage.getAllReports()) {
      if (report.embeddingId) {
        reportsByEmbeddingId.set(report.embeddingId, report);
      }
    }

    const resultsByReportId = new Map<string, number>();
    for (const hit of vectorResults) {
      const payload = hit.payload as Record<string, unknown>;
      const reportIdFromPayload =
        typeof payload.reportId === "string" ? payload.reportId : null;

      let report: CommunityReport | null = null;
      if (reportIdFromPayload) {
        report = graphStorage.getReportById(reportIdFromPayload);
      }
      if (!report && hit.memoryId) {
        report = reportsByEmbeddingId.get(hit.memoryId) ?? null;
      }
      if (!report && hit.id) {
        report = reportsByEmbeddingId.get(hit.id) ?? null;
      }
      if (!report) {
        continue;
      }

      const existingScore = resultsByReportId.get(report.id);
      if (existingScore === undefined || hit.score > existingScore) {
        resultsByReportId.set(report.id, hit.score);
      }
    }

    return Array.from(resultsByReportId.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 20)
      .map(([reportId, score]) => ({ reportId, score }));
  };

  // Create embedder function for drift search
  const textEmbedder = async (text: string): Promise<number[]> => {
    return embeddings.embed(text);
  };

  switch (input.mode) {
    case "local": {
      const localSearch = new LocalSearch(graphStorage, entityVectorSearch);
      const result = await localSearch.search(input.query, {
        maxDepth: input.maxDepth,
        minEdgeWeight: 2,
      });

      return { mode: "local", result };
    }

    case "global": {
      const globalSearch = new GlobalSearch(graphStorage, reportVectorSearch);
      const result = await globalSearch.search(input.query, {
        communityLevel: input.communityLevel,
        maxReports: Math.min(input.limit, 10),
      });

      return { mode: "global", result };
    }

    case "drift": {
      const driftSearch = new DriftSearch(
        graphStorage,
        entityVectorSearch,
        textEmbedder,
      );
      const result = await driftSearch.search(input.query, {
        maxIterations: input.maxIterations,
        convergenceThreshold: 0.9,
      });

      return { mode: "drift", result };
    }

    default:
      throw new Error(`Unknown search mode: ${input.mode}`);
  }
}

/**
 * Format search results for MCP response
 */
export function formatSearchResult(result: SearchResult): string {
  switch (result.mode) {
    case "local": {
      const { entities, relationships, totalExpanded } = result.result;

      const entityList = entities.slice(0, 20).map((e) => ({
        name: e.entity.canonicalName,
        type: e.entity.entityType,
        score: Math.round(e.relevanceScore * 100) / 100,
        depth: e.depth,
        mentions: e.entity.mentionCount,
      }));

      const relList = relationships.slice(0, 10).map((r) => ({
        type: r.relationshipType,
        strength: r.strength,
        description: r.description,
      }));

      return JSON.stringify(
        {
          mode: "local",
          totalEntities: entities.length,
          totalExpanded,
          entities: entityList,
          relationships: relList,
        },
        null,
        2,
      );
    }

    case "global": {
      const { answer, sourceCommunities, tokenUsage } = result.result;

      return JSON.stringify(
        {
          mode: "global",
          answer,
          sources: sourceCommunities.map((s) => ({
            title: s.report.title,
            relevance: Math.round(s.relevanceScore * 100) / 100,
            summary: s.report.summary,
          })),
          tokenUsage,
        },
        null,
        2,
      );
    }

    case "drift": {
      const { entities, iterations, hypotheses, converged } = result.result;

      return JSON.stringify(
        {
          mode: "drift",
          converged,
          iterations,
          hypothesesGenerated: hypotheses.length,
          totalEntities: entities.length,
          entities: entities.slice(0, 20).map((e) => ({
            name: e.entity.canonicalName,
            type: e.entity.entityType,
            score: Math.round(e.relevanceScore * 100) / 100,
          })),
          lastHypothesis: hypotheses[hypotheses.length - 1]?.slice(0, 200),
        },
        null,
        2,
      );
    }
  }
}
