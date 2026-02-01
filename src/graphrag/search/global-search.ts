/**
 * Global Search
 *
 * Community-centric search that uses map-reduce over community reports
 * to answer broad, analytical questions.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  createRelevanceExtractionPrompt,
  createSynthesisPrompt,
  RELEVANCE_EXTRACTION_SYSTEM,
  SYNTHESIS_SYSTEM,
} from "../extraction/prompts";
import type { GraphRAGStorage } from "../graph/graphrag-storage";
import type {
  CommunityReport,
  GlobalSearchConfig,
  GlobalSearchResult,
} from "../types";

/**
 * Function type for vector search over community reports
 */
export type ReportVectorSearch = (
  query: string,
) => Promise<Array<{ reportId: string; score: number }>>;

/**
 * Global search implementation
 */
export class GlobalSearch {
  private client: Anthropic | null = null;

  constructor(
    private storage: GraphRAGStorage,
    private vectorSearch: ReportVectorSearch,
    apiKey?: string,
  ) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (key) {
      this.client = new Anthropic({ apiKey: key });
    }
  }

  /**
   * Check if LLM client is available
   */
  get hasLLM(): boolean {
    return this.client !== null;
  }

  /**
   * Perform global search
   *
   * 1. Find relevant community reports via vector search
   * 2. Map: Extract relevant info from each report
   * 3. Reduce: Synthesize final answer from extracted info
   */
  async search(
    query: string,
    config: Partial<GlobalSearchConfig> = {},
  ): Promise<GlobalSearchResult> {
    const {
      communityLevel = 1,
      maxReports = 5,
      reportSelectionStrategy = "embedding",
    } = config;

    // Step 1: Find relevant community reports
    const reports = await this.findRelevantReports(
      query,
      communityLevel,
      maxReports,
      reportSelectionStrategy,
    );

    if (reports.length === 0) {
      return {
        answer:
          "No relevant information found in the knowledge graph. The graph may need to be built first using doclea_graphrag_build.",
        sourceCommunities: [],
        tokenUsage: { input: 0, output: 0 },
      };
    }

    // Step 2: Map - Extract relevant info from each report
    const extractedInfos: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const { report } of reports) {
      const { extracted, inputTokens, outputTokens } =
        await this.extractFromReport(report, query);
      extractedInfos.push(extracted);
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
    }

    // Step 3: Reduce - Synthesize final answer
    const { answer, inputTokens, outputTokens } = await this.synthesize(
      query,
      extractedInfos,
    );
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;

    return {
      answer,
      sourceCommunities: reports.map(({ report, score }, i) => ({
        report,
        relevanceScore: score,
        extractedInfo: extractedInfos[i],
      })),
      tokenUsage: { input: totalInputTokens, output: totalOutputTokens },
    };
  }

  /**
   * Find relevant reports using specified strategy
   */
  private async findRelevantReports(
    query: string,
    level: number,
    maxReports: number,
    strategy: "embedding" | "size" | "centrality",
  ): Promise<Array<{ report: CommunityReport; score: number }>> {
    if (strategy === "embedding") {
      // Use vector search
      const searchResults = await this.vectorSearch(query);
      const reports: Array<{ report: CommunityReport; score: number }> = [];

      for (const result of searchResults.slice(0, maxReports)) {
        const report = this.storage.getReportById(result.reportId);
        if (report) {
          reports.push({ report, score: result.score });
        }
      }

      return reports;
    }

    // Fallback: get reports at level, sort by entity count or rating
    const communities = this.storage.getCommunitiesAtLevel(level);
    const reports: Array<{ report: CommunityReport; score: number }> = [];

    for (const community of communities) {
      const report = this.storage.getReport(community.id);
      if (report) {
        const score =
          strategy === "size"
            ? community.entityCount / 100
            : (report.rating || 5) / 10;
        reports.push({ report, score });
      }
    }

    // Sort by score and take top N
    reports.sort((a, b) => b.score - a.score);
    return reports.slice(0, maxReports);
  }

  /**
   * Extract relevant information from a report
   */
  private async extractFromReport(
    report: CommunityReport,
    query: string,
  ): Promise<{ extracted: string; inputTokens: number; outputTokens: number }> {
    if (!this.client) {
      // Fallback: return summary if no LLM
      return {
        extracted: report.summary,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    try {
      const prompt = createRelevanceExtractionPrompt(
        query,
        report.title,
        report.summary,
        report.fullContent,
      );

      const response = await this.client.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 500,
        system: RELEVANCE_EXTRACTION_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      return {
        extracted: text || report.summary,
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
      };
    } catch (error) {
      console.warn("[doclea] Failed to extract from report:", error);
      return {
        extracted: report.summary,
        inputTokens: 0,
        outputTokens: 0,
      };
    }
  }

  /**
   * Synthesize final answer from extracted information
   */
  private async synthesize(
    query: string,
    extractedInfos: string[],
  ): Promise<{ answer: string; inputTokens: number; outputTokens: number }> {
    // Filter out empty or "no relevant information" responses
    const validInfos = extractedInfos.filter(
      (info) =>
        info &&
        !info.toLowerCase().includes("no relevant information") &&
        info.trim().length > 20,
    );

    if (validInfos.length === 0) {
      return {
        answer:
          "The community reports did not contain information directly relevant to your query.",
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    if (!this.client) {
      // Fallback: concatenate extracted info
      return {
        answer: `Based on the knowledge graph:\n\n${validInfos.join("\n\n")}`,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    try {
      const prompt = createSynthesisPrompt(query, validInfos);

      const response = await this.client.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 1000,
        system: SYNTHESIS_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      return {
        answer:
          text || `Based on the knowledge graph:\n\n${validInfos.join("\n\n")}`,
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
      };
    } catch (error) {
      console.warn("[doclea] Failed to synthesize answer:", error);
      return {
        answer: `Based on the knowledge graph:\n\n${validInfos.join("\n\n")}`,
        inputTokens: 0,
        outputTokens: 0,
      };
    }
  }

  /**
   * Get all community reports (for debugging/inspection)
   */
  getAllReports(level?: number): CommunityReport[] {
    if (level !== undefined) {
      const communities = this.storage.getCommunitiesAtLevel(level);
      const reports: CommunityReport[] = [];

      for (const community of communities) {
        const report = this.storage.getReport(community.id);
        if (report) {
          reports.push(report);
        }
      }

      return reports;
    }

    return this.storage.getAllReports();
  }
}
