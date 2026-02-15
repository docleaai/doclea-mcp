/**
 * Community Report Generator
 *
 * Generates LLM-powered summaries and reports for detected communities.
 * Reports are used for global search (map-reduce over community summaries).
 */

import Anthropic from "@anthropic-ai/sdk";
import { nanoid } from "nanoid";
import { truncateToTokens } from "@/utils/tokens";
import {
  COMMUNITY_REPORT_SYSTEM,
  createCommunityReportUserPrompt,
} from "../extraction/prompts";
import type { GraphRAGStorage } from "../graph/graphrag-storage";
import type {
  Community,
  CommunityReport,
  Entity,
  Relationship,
} from "../types";

/**
 * Configuration for report generation
 */
export interface ReportConfig {
  /** Maximum tokens per report context (default: 4000) */
  maxTokensPerReport: number;
  /** LLM model to use (default: claude-3-haiku) */
  model: string;
  /** Version identifier for prompts */
  promptVersion: string;
  /** API key (uses ANTHROPIC_API_KEY env var if not provided) */
  apiKey?: string;
}

const DEFAULT_CONFIG: ReportConfig = {
  maxTokensPerReport: 4000,
  model: "claude-3-haiku-20240307",
  promptVersion: "v1",
};

/**
 * Result of report generation
 */
export interface GenerationResult {
  report: CommunityReport;
  entitiesUsed: number;
  relationshipsUsed: number;
  truncated: boolean;
}

export interface ReportEmbeddingContext {
  reportId: string;
  communityId: string;
  title: string;
  summary: string;
}

type ReportEmbedder = (
  text: string,
  context: ReportEmbeddingContext,
) => Promise<string>;

/**
 * Generates community reports using LLM
 */
export class ReportGenerator {
  private client: Anthropic | null = null;
  private config: ReportConfig;
  private embedder?: ReportEmbedder;

  constructor(
    private storage: GraphRAGStorage,
    config?: Partial<ReportConfig>,
    embedder?: ReportEmbedder,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }

    this.embedder = embedder;
  }

  /**
   * Check if LLM client is available
   */
  get hasLLM(): boolean {
    return this.client !== null;
  }

  /**
   * Generate report for a single community
   */
  async generateForCommunity(community: Community): Promise<GenerationResult> {
    // Get entities in community
    const entities = this.storage.getEntitiesInCommunity(community.id);

    if (entities.length === 0) {
      return this.createEmptyReport(community);
    }

    // Get relationships between community entities
    const { relationships, relationshipDescriptions } =
      this.getInternalRelationships(entities);

    // Format entity descriptions
    const entityDescriptions = this.formatEntities(entities);

    // Truncate if needed
    const { entityLines, relationshipLines, truncated } =
      await this.truncateContent(entityDescriptions, relationshipDescriptions);

    // Generate report via LLM or fallback
    let reportData: {
      title: string;
      summary: string;
      fullContent: string;
      keyFindings: string[];
      rating: number;
      ratingExplanation: string;
    };

    if (this.client) {
      reportData = await this.generateWithLLM(entityLines, relationshipLines);
    } else {
      reportData = this.generateFallback(entities, relationships);
    }

    const reportId = nanoid();

    // Embed the summary if embedder is available
    let embeddingId: string | undefined;
    if (this.embedder) {
      try {
        embeddingId = await this.embedder(reportData.summary, {
          reportId,
          communityId: community.id,
          title: reportData.title,
          summary: reportData.summary,
        });
      } catch (error) {
        console.warn("[doclea] Failed to embed community report:", error);
      }
    }

    // Store report
    const report = this.storage.createReport({
      id: reportId,
      communityId: community.id,
      title: reportData.title,
      summary: reportData.summary,
      fullContent: reportData.fullContent,
      keyFindings: reportData.keyFindings,
      rating: reportData.rating,
      ratingExplanation: reportData.ratingExplanation,
      promptVersion: this.config.promptVersion,
      embeddingId,
      createdAt: Math.floor(Date.now() / 1000),
    });

    return {
      report,
      entitiesUsed: entityLines.length,
      relationshipsUsed: relationshipLines.length,
      truncated,
    };
  }

  /**
   * Generate reports for all communities at a level
   */
  async generateAllReports(level = 0): Promise<GenerationResult[]> {
    const communities = this.storage.getCommunitiesAtLevel(level);
    const results: GenerationResult[] = [];

    for (const community of communities) {
      // Skip if report already exists
      const existing = this.storage.getReport(community.id);
      if (existing) continue;

      try {
        const result = await this.generateForCommunity(community);
        results.push(result);
      } catch (error) {
        console.warn(
          `[doclea] Failed to generate report for community ${community.id}:`,
          error,
        );
      }

      // Rate limit delay
      if (this.client) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    return results;
  }

  /**
   * Regenerate a specific report
   */
  async regenerateReport(
    communityId: string,
  ): Promise<GenerationResult | null> {
    const community = this.storage.getCommunity(communityId);
    if (!community) return null;

    // Delete existing report
    this.storage.deleteReport(communityId);

    return this.generateForCommunity(community);
  }

  /**
   * Generate report using LLM
   */
  private async generateWithLLM(
    entityLines: string[],
    relationshipLines: string[],
  ): Promise<{
    title: string;
    summary: string;
    fullContent: string;
    keyFindings: string[];
    rating: number;
    ratingExplanation: string;
  }> {
    const userPrompt = createCommunityReportUserPrompt(
      entityLines,
      relationshipLines,
    );

    const response = await this.client!.messages.create({
      model: this.config.model,
      max_tokens: 1500,
      system: COMMUNITY_REPORT_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from response
    const jsonStr = this.extractJSON(text);
    const parsed = JSON.parse(jsonStr);

    return {
      title: parsed.title || "Untitled Community",
      summary: parsed.summary || "No summary available",
      fullContent: parsed.full_content || parsed.summary || "",
      keyFindings: parsed.key_findings || [],
      rating: parsed.rating || 5,
      ratingExplanation: parsed.rating_explanation || "",
    };
  }

  /**
   * Generate fallback report without LLM
   */
  private generateFallback(
    entities: Entity[],
    relationships: Relationship[],
  ): {
    title: string;
    summary: string;
    fullContent: string;
    keyFindings: string[];
    rating: number;
    ratingExplanation: string;
  } {
    // Create simple statistical summary
    const typeGroups = new Map<string, Entity[]>();
    for (const entity of entities) {
      if (!typeGroups.has(entity.entityType)) {
        typeGroups.set(entity.entityType, []);
      }
      typeGroups.get(entity.entityType)!.push(entity);
    }

    // Find dominant type
    let dominantType = "CONCEPT";
    let maxCount = 0;
    for (const [type, group] of typeGroups) {
      if (group.length > maxCount) {
        maxCount = group.length;
        dominantType = type;
      }
    }

    // Get top entities by mention count
    const topEntities = [...entities]
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, 5);

    const title = `${dominantType} Community (${entities.length} entities)`;

    const summary = `A community of ${entities.length} entities, primarily ${dominantType.toLowerCase()}s. Key entities include ${topEntities.map((e) => e.canonicalName).join(", ")}.`;

    const fullContent =
      `This community contains ${entities.length} entities connected by ${relationships.length} relationships.\n\n` +
      `Entity breakdown:\n${Array.from(typeGroups.entries())
        .map(([type, group]) => `- ${type}: ${group.length}`)
        .join("\n")}\n\n` +
      `Top entities by mentions:\n${topEntities.map((e) => `- ${e.canonicalName} (${e.mentionCount} mentions)`).join("\n")}`;

    const keyFindings = [
      `Contains ${entities.length} entities`,
      `Dominated by ${dominantType.toLowerCase()} entities`,
      `Most mentioned: ${topEntities[0]?.canonicalName || "N/A"}`,
    ];

    return {
      title,
      summary,
      fullContent,
      keyFindings,
      rating: 5,
      ratingExplanation: "Auto-generated report (LLM unavailable)",
    };
  }

  /**
   * Create empty report for community with no entities
   */
  private createEmptyReport(community: Community): GenerationResult {
    const report = this.storage.createReport({
      communityId: community.id,
      title: "Empty Community",
      summary: "This community contains no entities.",
      fullContent: "No entities were assigned to this community.",
      keyFindings: [],
      rating: 0,
      ratingExplanation: "Empty community",
      promptVersion: this.config.promptVersion,
      createdAt: Math.floor(Date.now() / 1000),
    });

    return {
      report,
      entitiesUsed: 0,
      relationshipsUsed: 0,
      truncated: false,
    };
  }

  /**
   * Get relationships between entities in a community
   */
  private getInternalRelationships(entities: Entity[]): {
    relationships: Relationship[];
    relationshipDescriptions: string[];
  } {
    const entityIds = new Set(entities.map((e) => e.id));
    const entityMap = new Map(entities.map((e) => [e.id, e]));
    const relationships: Relationship[] = [];
    const seen = new Set<string>();

    for (const entity of entities) {
      const rels = this.storage.getRelationshipsForEntity(entity.id, "both");
      for (const rel of rels) {
        if (
          !seen.has(rel.id) &&
          entityIds.has(rel.sourceEntityId) &&
          entityIds.has(rel.targetEntityId)
        ) {
          seen.add(rel.id);
          relationships.push(rel);
        }
      }
    }

    const relationshipDescriptions = relationships.map((rel) => {
      const source = entityMap.get(rel.sourceEntityId);
      const target = entityMap.get(rel.targetEntityId);
      return `${source?.canonicalName} --[${rel.relationshipType}]--> ${target?.canonicalName}`;
    });

    return { relationships, relationshipDescriptions };
  }

  /**
   * Format entities for prompt
   */
  private formatEntities(entities: Entity[]): string[] {
    return entities.map(
      (e) =>
        `- ${e.canonicalName} (${e.entityType}): ${e.description || "No description"}`,
    );
  }

  /**
   * Truncate content to fit within token budget
   */
  private async truncateContent(
    entityLines: string[],
    relationshipLines: string[],
  ): Promise<{
    entityLines: string[];
    relationshipLines: string[];
    truncated: boolean;
  }> {
    const maxEntities = 50;
    const maxRelationships = 100;

    let truncated = false;

    let finalEntityLines = entityLines;
    let finalRelationshipLines = relationshipLines;

    if (entityLines.length > maxEntities) {
      finalEntityLines = entityLines.slice(0, maxEntities);
      truncated = true;
    }

    if (relationshipLines.length > maxRelationships) {
      finalRelationshipLines = relationshipLines.slice(0, maxRelationships);
      truncated = true;
    }

    return {
      entityLines: finalEntityLines,
      relationshipLines: finalRelationshipLines,
      truncated,
    };
  }

  /**
   * Extract JSON from LLM response
   */
  private extractJSON(rawString: string): string {
    const codeBlock = rawString.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) {
      return codeBlock[1].trim();
    }

    const jsonMatch = rawString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }

    throw new Error("No JSON found in response");
  }
}
