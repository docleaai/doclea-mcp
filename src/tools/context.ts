import { basename } from "node:path";
import { z } from "zod";
import {
  buildCacheKeyComponents,
  type ContextCacheConfig,
  generateCacheKey,
  getContextCache,
} from "../caching";
import { CodeGraphStorage } from "../database/code-graph";
import type { EmbeddingClient } from "../embeddings/provider";
import { GraphRAGStorage } from "../graphrag/graph/graphrag-storage";
import type { Entity } from "../graphrag/types";
import type { ScoringConfig } from "../scoring/types";
import type { IStorageBackend } from "../storage/interface";
import type { Memory } from "../types";
import { countTokens } from "../utils/tokens";
import type { VectorStore } from "../vectors";
import type { CallGraphResult, CodeNode } from "./code/types";
import { searchGraphEntities } from "./graphrag/entity-vectors";
import { searchMemory } from "./memory";

/**
 * Context builder that assembles RAG + KAG + GraphRAG context within token budget
 */
export const BuildContextInputSchema = z.object({
  query: z.string().describe("Search query to find relevant context"),
  tokenBudget: z
    .number()
    .min(100)
    .max(100000)
    .default(4000)
    .describe("Maximum tokens for the assembled context"),
  includeCodeGraph: z
    .boolean()
    .default(true)
    .describe("Include code relationships from KAG"),
  includeGraphRAG: z
    .boolean()
    .default(true)
    .describe("Include GraphRAG entity and community relationships"),
  filters: z
    .object({
      type: z
        .enum(["decision", "solution", "pattern", "architecture", "note"])
        .optional(),
      tags: z.array(z.string()).optional(),
      minImportance: z.number().min(0).max(1).optional(),
    })
    .optional()
    .describe("Filters for memory search"),
  template: z
    .enum(["default", "compact", "detailed"])
    .default("default")
    .describe("Output format template"),
  includeEvidence: z
    .boolean()
    .default(false)
    .describe(
      "Include structured evidence showing why each section was selected",
    ),
});

export type BuildContextInput = z.input<typeof BuildContextInputSchema>;

type ContextSectionSource = "rag" | "kag" | "graphrag";

interface ContextSectionMemoryEvidence {
  id: string;
  type: Memory["type"];
  tags: string[];
  importance: number;
  relatedFiles: string[];
}

interface ContextSectionCodeEvidence {
  nodeId: string;
  nodeType: CodeNode["type"];
  filePath: string;
  matchedEntity: string;
  callers: number;
  calls: number;
  implementations?: number;
}

interface ContextSectionGraphEvidence {
  entityId: string;
  entityType: Entity["entityType"];
  mentionCount: number;
  relationshipCount: number;
  communityIds: string[];
  sourceMemoryIds: string[];
}

interface ContextSectionEvidence {
  reason: string;
  queryTerms: string[];
  memory?: ContextSectionMemoryEvidence;
  code?: ContextSectionCodeEvidence;
  graph?: ContextSectionGraphEvidence;
}

interface ContextSection {
  id: string;
  title: string;
  content: string;
  tokens: number;
  relevance: number;
  source: ContextSectionSource;
  evidence: ContextSectionEvidence;
}

export interface ContextRerankCandidate {
  id: string;
  source: ContextSectionSource;
  relevance: number;
  queryTerms?: string[];
}

export interface ContextRerankConfig {
  route: ContextRoute;
  ragRatio: number;
  kagRatio: number;
  graphragRatio: number;
}

export interface ContextRerankResult {
  id: string;
  source: ContextSectionSource;
  rank: number;
  score: number;
  breakdown: {
    semantic: number;
    sourceBalance: number;
    novelty: number;
    redundancyPenalty: number;
  };
}

export interface ContextEvidenceItem {
  id: string;
  title: string;
  source: ContextSectionSource;
  rank: number;
  relevance: number;
  rerankerScore?: number;
  rerankerBreakdown?: {
    semantic: number;
    sourceBalance: number;
    novelty: number;
    redundancyPenalty: number;
  };
  tokens: number;
  included: boolean;
  exclusionReason?: "token_budget";
  reason: string;
  queryTerms: string[];
  memory?: ContextSectionMemoryEvidence;
  code?: ContextSectionCodeEvidence;
  graph?: ContextSectionGraphEvidence;
}

export type ContextRoute = "memory" | "code" | "hybrid";

interface RouteConfig {
  route: ContextRoute;
  ragRatio: number;
  kagRatio: number;
  graphragRatio: number;
  ragLimit: number;
  graphragLimit: number;
}

function getRouteConfig(
  query: string,
  includeCodeGraph: boolean,
  includeGraphRAG = true,
): RouteConfig {
  if (!includeCodeGraph && !includeGraphRAG) {
    return {
      route: "memory",
      ragRatio: 1,
      kagRatio: 0,
      graphragRatio: 0,
      ragLimit: 20,
      graphragLimit: 0,
    };
  }

  const normalized = query.toLowerCase();

  const codeIntent =
    /\b(call(?:ers?)?|callee|calls?|dependency|dependencies|import|implementation|implements|interface|class|function|method|impact|affected|break|references?|where.*defined|definition)\b/.test(
      normalized,
    ) ||
    /\b(trace|traverse|map|follow|flow|pipeline|chain|end-to-end|across)\b/.test(
      normalized,
    ) ||
    /\b(which|what|list|show)\b.{0,24}\b(files?|paths?)\b/.test(normalized) ||
    /\b(across|between)\b.{0,30}\b(apps?|packages?|services?|modules?)\b/.test(
      normalized,
    ) ||
    /[A-Za-z_][A-Za-z0-9_]*\(/.test(query);

  const memoryIntent =
    /\b(decision|why|reason|tradeoff|history|adr|note|context|previous|past|policy|convention)\b/.test(
      normalized,
    );

  if (codeIntent && !memoryIntent) {
    if (includeCodeGraph && includeGraphRAG) {
      return {
        route: "code",
        ragRatio: 0.2,
        kagRatio: 0.65,
        graphragRatio: 0.15,
        ragLimit: 8,
        graphragLimit: 6,
      };
    }
    if (includeCodeGraph) {
      return {
        route: "code",
        ragRatio: 0.25,
        kagRatio: 0.75,
        graphragRatio: 0,
        ragLimit: 8,
        graphragLimit: 0,
      };
    }
    return {
      route: "code",
      ragRatio: 0.8,
      kagRatio: 0,
      graphragRatio: 0.2,
      ragLimit: 12,
      graphragLimit: 6,
    };
  }

  if (memoryIntent && !codeIntent) {
    if (includeCodeGraph && includeGraphRAG) {
      return {
        route: "memory",
        ragRatio: 0.75,
        kagRatio: 0.1,
        graphragRatio: 0.15,
        ragLimit: 20,
        graphragLimit: 8,
      };
    }
    if (includeCodeGraph) {
      return {
        route: "memory",
        ragRatio: 0.9,
        kagRatio: 0.1,
        graphragRatio: 0,
        ragLimit: 20,
        graphragLimit: 0,
      };
    }
    return {
      route: "memory",
      ragRatio: 0.85,
      kagRatio: 0,
      graphragRatio: 0.15,
      ragLimit: 20,
      graphragLimit: 8,
    };
  }

  if (includeCodeGraph && includeGraphRAG) {
    return {
      route: "hybrid",
      ragRatio: 0.55,
      kagRatio: 0.3,
      graphragRatio: 0.15,
      ragLimit: 16,
      graphragLimit: 7,
    };
  }
  if (includeCodeGraph) {
    return {
      route: "hybrid",
      ragRatio: 0.7,
      kagRatio: 0.3,
      graphragRatio: 0,
      ragLimit: 16,
      graphragLimit: 0,
    };
  }
  return {
    route: "hybrid",
    ragRatio: 0.8,
    kagRatio: 0,
    graphragRatio: 0.2,
    ragLimit: 18,
    graphragLimit: 7,
  };
}

export function classifyContextRoute(
  query: string,
  includeCodeGraph: boolean,
): ContextRoute {
  // Route classification API keeps historical behavior and only reflects
  // memory-vs-code intent routing.
  return getRouteConfig(query, includeCodeGraph, false).route;
}

export interface ContextMetadata {
  totalTokens: number;
  sectionsIncluded: number;
  ragSections: number;
  kagSections: number;
  graphragSections: number;
  truncated: boolean;
  route: ContextRoute;
  stageTimings?: ContextStageTimings;
}

export type ContextStageName =
  | "rag"
  | "kag"
  | "graphrag"
  | "rerank"
  | "format"
  | "tokenize"
  | "evidence"
  | "total";

export interface ContextStageTimings {
  rag: number;
  kag: number;
  graphrag: number;
  rerank: number;
  format: number;
  tokenize: number;
  evidence: number;
  total: number;
}

const QUERY_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "be",
  "by",
  "for",
  "from",
  "how",
  "if",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "the",
  "to",
  "what",
  "which",
  "who",
  "with",
]);

function extractQueryTerms(query: string): string[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !QUERY_STOPWORDS.has(term));

  return Array.from(new Set(terms));
}

function findMatchedTerms(
  queryTerms: string[],
  textSegments: string[],
): string[] {
  if (queryTerms.length === 0) {
    return [];
  }

  const haystack = textSegments.join(" ").toLowerCase();
  return queryTerms.filter((term) => haystack.includes(term)).slice(0, 6);
}

/**
 * Build context from RAG, KAG, and GraphRAG retrieval sources
 */
export async function buildContext(
  input: BuildContextInput,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<{
  context: string;
  metadata: ContextMetadata;
  evidence?: ContextEvidenceItem[];
}> {
  const sections: ContextSection[] = [];
  const includeEvidence = input.includeEvidence ?? false;
  const includeCodeGraph = input.includeCodeGraph ?? true;
  const includeGraphRAG = input.includeGraphRAG ?? true;
  const tokenBudget = input.tokenBudget ?? 4000;
  const template = input.template ?? "default";
  const routeConfig = getRouteConfig(
    input.query,
    includeCodeGraph,
    includeGraphRAG,
  );
  const startedAt = performance.now();
  const stageTimings: ContextStageTimings = {
    rag: 0,
    kag: 0,
    graphrag: 0,
    rerank: 0,
    format: 0,
    tokenize: 0,
    evidence: 0,
    total: 0,
  };

  // Reserve tokens for section headers and formatting overhead
  const FORMATTING_OVERHEAD = 200;
  const availableTokens = tokenBudget - FORMATTING_OVERHEAD;

  // 1. RAG: Semantic search for relevant memories
  const ragStartedAt = performance.now();
  const ragSections = await buildRAGContext(
    input.query,
    availableTokens * routeConfig.ragRatio,
    input.filters,
    storage,
    vectors,
    embeddings,
    routeConfig.ragLimit,
  );
  stageTimings.rag = toFixedNumber(performance.now() - ragStartedAt);
  sections.push(...ragSections);

  // 2. KAG: Code graph relationships (if enabled)
  let kagSections: ContextSection[] = [];
  if (includeCodeGraph && routeConfig.kagRatio > 0) {
    const kagStartedAt = performance.now();
    kagSections = await buildKAGContext(
      input.query,
      availableTokens * routeConfig.kagRatio,
      storage,
    );
    stageTimings.kag = toFixedNumber(performance.now() - kagStartedAt);
    sections.push(...kagSections);
  }

  // 3. GraphRAG: Entity + community relationships
  if (includeGraphRAG && routeConfig.graphragRatio > 0) {
    const graphragStartedAt = performance.now();
    const graphragResult = await buildGraphRAGContext(
      input.query,
      availableTokens * routeConfig.graphragRatio,
      storage,
      vectors,
      embeddings,
      routeConfig.graphragLimit,
    );
    stageTimings.graphrag = toFixedNumber(
      performance.now() - graphragStartedAt,
    );
    sections.push(...graphragResult.sections);
  }

  // 4. Rank by relevance and fit within budget
  const rerankStartedAt = performance.now();
  const { selectedSections, ranking } = selectWithinBudget(
    sections,
    availableTokens,
    routeConfig,
  );
  stageTimings.rerank = toFixedNumber(performance.now() - rerankStartedAt);

  // 5. Format as markdown
  const formatStartedAt = performance.now();
  const context = formatAsMarkdown(selectedSections, template, input.query);
  stageTimings.format = toFixedNumber(performance.now() - formatStartedAt);

  const tokenizeStartedAt = performance.now();
  const totalTokens = await countTokens(context);
  stageTimings.tokenize = toFixedNumber(performance.now() - tokenizeStartedAt);
  const evidenceStartedAt = performance.now();
  const evidence = includeEvidence
    ? buildSelectionEvidence(sections, selectedSections, ranking)
    : undefined;
  stageTimings.evidence = toFixedNumber(performance.now() - evidenceStartedAt);
  stageTimings.total = toFixedNumber(performance.now() - startedAt);

  return {
    context,
    metadata: {
      totalTokens,
      sectionsIncluded: selectedSections.length,
      ragSections: selectedSections.filter((s) => s.source === "rag").length,
      kagSections: selectedSections.filter((s) => s.source === "kag").length,
      graphragSections: selectedSections.filter((s) => s.source === "graphrag")
        .length,
      truncated: sections.length > selectedSections.length,
      route: routeConfig.route,
      stageTimings,
    },
    ...(evidence ? { evidence } : {}),
  };
}

/**
 * Build RAG context from semantic search
 */
async function buildRAGContext(
  query: string,
  _tokenBudget: number,
  filters: BuildContextInput["filters"],
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
  limit = 20,
): Promise<ContextSection[]> {
  const result = await buildRAGContextInternal(
    query,
    filters,
    storage,
    vectors,
    embeddings,
    limit,
  );
  return result.sections;
}

async function buildRAGContextInternal(
  query: string,
  filters: BuildContextInput["filters"],
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
  limit = 20,
): Promise<{ sections: ContextSection[]; memoryIds: string[] }> {
  const sections: ContextSection[] = [];
  const memoryIds: string[] = [];
  const queryTerms = extractQueryTerms(query);

  // Search memories
  const results = await searchMemory(
    {
      query,
      limit,
      ...filters,
    },
    storage,
    vectors,
    embeddings,
  );

  for (const result of results) {
    const tags = result.memory.tags ?? [];
    const relatedFiles = result.memory.relatedFiles ?? [];
    const matchedTerms = findMatchedTerms(queryTerms, [
      result.memory.title,
      result.memory.summary ?? "",
      result.memory.content,
      tags.join(" "),
      relatedFiles.join(" "),
    ]);
    const content = formatMemory(result.memory);
    const tokens = await countTokens(content);
    const reasonParts = [`semantic score ${toFixedNumber(result.score, 3)}`];

    if (matchedTerms.length > 0) {
      reasonParts.push(`matched query terms: ${matchedTerms.join(", ")}`);
    }
    reasonParts.push(`memory type ${result.memory.type}`);

    sections.push({
      id: `rag:${result.memory.id}`,
      title: result.memory.title,
      content,
      tokens,
      relevance: result.score,
      source: "rag",
      evidence: {
        reason: reasonParts.join("; "),
        queryTerms: matchedTerms,
        memory: {
          id: result.memory.id,
          type: result.memory.type,
          tags,
          importance: result.memory.importance ?? 0,
          relatedFiles,
        },
      },
    });

    memoryIds.push(result.memory.id);
  }

  return { sections, memoryIds };
}

/**
 * Build KAG context from code graph relationships
 */
async function buildKAGContext(
  query: string,
  _tokenBudget: number,
  storage: IStorageBackend,
): Promise<ContextSection[]> {
  const sections: ContextSection[] = [];
  const codeGraph = new CodeGraphStorage(storage.getDatabase());
  const queryTerms = extractQueryTerms(query);

  // Extract potential function/class names from query
  const codeEntities = extractCodeEntities(query);

  for (const entityName of codeEntities) {
    const entityLookupCandidates = buildEntityLookupCandidates(entityName);
    let node: CodeNode | null = null;
    let matchedEntityName = entityName;

    for (const candidateName of entityLookupCandidates) {
      const candidateNode = await codeGraph.findNodeByName(candidateName);
      if (!candidateNode) {
        continue;
      }
      node = candidateNode;
      matchedEntityName = candidateName;
      break;
    }

    if (!node) continue;

    // Get call graph
    const callGraph = await codeGraph.getCallGraph(node.id, 2);
    const callRelationships = extractCallRelationships(node, callGraph);

    if (callGraph.nodes.length > 1) {
      const content = formatCallGraph(node, callGraph);
      const tokens = await countTokens(content);
      const matchedTerms = findMatchedTerms(queryTerms, [
        entityName,
        node.name,
        node.filePath,
        node.signature ?? "",
        ...callRelationships.callers,
        ...callRelationships.calls,
      ]);
      const reasonParts = [
        `matched entity "${entityName}" to code node "${node.name}"${matchedEntityName !== entityName ? ` via "${matchedEntityName}"` : ""}`,
        `depth-2 call graph has ${callRelationships.callers.length} callers and ${callRelationships.calls.length} callees`,
      ];

      if (matchedTerms.length > 0) {
        reasonParts.push(`matched query terms: ${matchedTerms.join(", ")}`);
      }

      sections.push({
        id: `kag:callgraph:${node.id}`,
        title: `Code: ${node.name}`,
        content,
        tokens,
        relevance: 0.8, // High relevance when mentioned in query
        source: "kag",
        evidence: {
          reason: reasonParts.join("; "),
          queryTerms: matchedTerms,
          code: {
            nodeId: node.id,
            nodeType: node.type,
            filePath: node.filePath,
            matchedEntity: matchedEntityName,
            callers: callRelationships.callers.length,
            calls: callRelationships.calls.length,
          },
        },
      });
    }

    // Get implementations if it's an interface
    if (node.type === "interface") {
      const implementations = await codeGraph.findImplementations(node.id);
      if (implementations.length > 0) {
        const content = formatImplementations(node, implementations);
        const tokens = await countTokens(content);
        const matchedTerms = findMatchedTerms(queryTerms, [
          entityName,
          node.name,
          node.filePath,
          ...implementations.map((impl) => impl.name),
          ...implementations.map((impl) => impl.filePath),
        ]);
        const reasonParts = [
          `matched interface "${entityName}" with ${implementations.length} implementations${matchedEntityName !== entityName ? ` via "${matchedEntityName}"` : ""}`,
        ];

        if (matchedTerms.length > 0) {
          reasonParts.push(`matched query terms: ${matchedTerms.join(", ")}`);
        }

        sections.push({
          id: `kag:implementations:${node.id}`,
          title: `Implementations: ${node.name}`,
          content,
          tokens,
          relevance: 0.7,
          source: "kag",
          evidence: {
            reason: reasonParts.join("; "),
            queryTerms: matchedTerms,
            code: {
              nodeId: node.id,
              nodeType: node.type,
              filePath: node.filePath,
              matchedEntity: matchedEntityName,
              callers: callRelationships.callers.length,
              calls: callRelationships.calls.length,
              implementations: implementations.length,
            },
          },
        });
      }
    }
  }

  if (isFileLookupQuery(query) || sections.length === 0) {
    const fileLookupSections = await buildKAGFileLookupContext(
      query,
      storage,
      24,
    );
    sections.push(...fileLookupSections);
  }

  return sections;
}

interface GraphEntityCandidate {
  entityId: string;
  score: number;
  vectorScore?: number;
  lexicalScore?: number;
}

interface GraphRelationshipSummary {
  type: string;
  strength: number;
  entityName: string;
}

function formatGraphEntitySection(
  entity: Entity,
  relationships: GraphRelationshipSummary[],
  communitySummary: string[],
  reportSummary?: string,
): string {
  const parts: string[] = [];

  parts.push(`\`${entity.canonicalName}\` (${entity.entityType})`);
  if (entity.description) {
    parts.push(entity.description);
  }
  parts.push(
    `Mentions: ${entity.mentionCount} | Extraction confidence: ${Math.round(
      entity.extractionConfidence * 100,
    )}%`,
  );

  if (relationships.length > 0) {
    parts.push("");
    parts.push("Related entities:");
    for (const rel of relationships.slice(0, 5)) {
      parts.push(`- ${rel.entityName} (${rel.type}, strength ${rel.strength})`);
    }
  }

  if (communitySummary.length > 0) {
    parts.push("");
    parts.push(`Communities: ${communitySummary.join(", ")}`);
  }

  if (reportSummary) {
    parts.push("");
    parts.push(`Community insight: ${reportSummary}`);
  }

  return parts.join("\n");
}

async function buildGraphRAGContext(
  query: string,
  _tokenBudget: number,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
  limit = 8,
): Promise<{ sections: ContextSection[]; memoryIds: string[] }> {
  const sections: ContextSection[] = [];
  const memoryIds = new Set<string>();

  if (typeof (storage as Partial<IStorageBackend>).getDatabase !== "function") {
    return { sections, memoryIds: [] };
  }

  try {
    const graphStorage = new GraphRAGStorage(storage.getDatabase());
    const entities = graphStorage.listEntities({ limit: 1 });
    if (entities.length === 0) {
      return { sections, memoryIds: [] };
    }

    const queryTerms = extractQueryTerms(query);

    const candidates: GraphEntityCandidate[] = (
      await searchGraphEntities(query, graphStorage, vectors, embeddings, {
        limit,
        minScore: 0.18,
        minLexicalScore: 0.2,
      })
    ).map((candidate) => ({
      entityId: candidate.entityId,
      score: candidate.score,
      vectorScore: candidate.vectorScore,
      lexicalScore: candidate.lexicalScore,
    }));

    for (const candidate of candidates) {
      const entity = graphStorage.getEntity(candidate.entityId);
      if (!entity) {
        continue;
      }
      const rels = graphStorage
        .getRelationshipsForEntity(entity.id, "both")
        .sort((left, right) => right.strength - left.strength)
        .slice(0, 8);

      const relationshipSummaries: GraphRelationshipSummary[] = [];
      for (const rel of rels) {
        const relatedEntityId =
          rel.sourceEntityId === entity.id
            ? rel.targetEntityId
            : rel.sourceEntityId;
        const relatedEntity = graphStorage.getEntity(relatedEntityId);
        if (!relatedEntity) {
          continue;
        }
        relationshipSummaries.push({
          type: rel.relationshipType,
          strength: rel.strength,
          entityName: relatedEntity.canonicalName,
        });
      }

      const communities = graphStorage
        .getCommunitiesForEntity(entity.id)
        .sort((left, right) => left.level - right.level);
      const communitySummary = communities
        .slice(0, 3)
        .map((community) => `L${community.level}:${community.id.slice(0, 8)}`);

      let reportSummary: string | undefined;
      for (const community of communities) {
        const report = graphStorage.getReport(community.id);
        if (report?.summary) {
          reportSummary =
            report.summary.length > 220
              ? `${report.summary.slice(0, 220)}...`
              : report.summary;
          break;
        }
      }

      const entityMemories = graphStorage
        .getMemoriesForEntity(entity.id)
        .sort((left, right) => right.confidence - left.confidence);
      const sourceMemoryIds = entityMemories
        .slice(0, 8)
        .map((memoryLink) => memoryLink.memoryId);

      for (const memoryId of sourceMemoryIds) {
        memoryIds.add(memoryId);
      }

      const matchedTerms = findMatchedTerms(queryTerms, [
        entity.canonicalName,
        entity.description ?? "",
        ...relationshipSummaries.map((summary) => summary.entityName),
        ...relationshipSummaries.map((summary) => summary.type),
        reportSummary ?? "",
      ]);

      const reasonParts = [
        `GraphRAG entity match score ${toFixedNumber(candidate.score, 3)}`,
        `${relationshipSummaries.length} related entities`,
      ];
      if (candidate.vectorScore !== undefined) {
        reasonParts.push(
          `vector similarity ${toFixedNumber(candidate.vectorScore, 3)}`,
        );
      }
      if (candidate.lexicalScore !== undefined) {
        reasonParts.push(
          `lexical relevance ${toFixedNumber(candidate.lexicalScore, 3)}`,
        );
      }
      if (matchedTerms.length > 0) {
        reasonParts.push(`matched query terms: ${matchedTerms.join(", ")}`);
      }
      if (sourceMemoryIds.length > 0) {
        reasonParts.push(`backed by ${sourceMemoryIds.length} linked memories`);
      }

      const content = formatGraphEntitySection(
        entity,
        relationshipSummaries,
        communitySummary,
        reportSummary,
      );
      const tokens = await countTokens(content);

      sections.push({
        id: `graphrag:entity:${entity.id}`,
        title: `Knowledge Graph: ${entity.canonicalName}`,
        content,
        tokens,
        relevance: Math.min(1, candidate.score),
        source: "graphrag",
        evidence: {
          reason: reasonParts.join("; "),
          queryTerms: matchedTerms,
          graph: {
            entityId: entity.id,
            entityType: entity.entityType,
            mentionCount: entity.mentionCount,
            relationshipCount: relationshipSummaries.length,
            communityIds: communities
              .slice(0, 3)
              .map((community) => community.id),
            sourceMemoryIds,
          },
        },
      });
    }
  } catch {
    // GraphRAG is optional for context retrieval. If graph tables are unavailable
    // or not initialized, skip this source without failing the whole request.
    return { sections: [], memoryIds: [] };
  }

  return { sections, memoryIds: Array.from(memoryIds) };
}

function extractCallRelationships(
  node: CodeNode,
  graph: CallGraphResult,
): { callers: string[]; calls: string[] } {
  const callers = graph.edges
    .filter((edge) => edge.toNode === node.id && edge.edgeType === "calls")
    .map((edge) => {
      const caller = graph.nodes.find(
        (candidate) => candidate.id === edge.fromNode,
      );
      return caller?.name;
    })
    .filter((name): name is string => Boolean(name));

  const calls = graph.edges
    .filter((edge) => edge.fromNode === node.id && edge.edgeType === "calls")
    .map((edge) => {
      const called = graph.nodes.find(
        (candidate) => candidate.id === edge.toNode,
      );
      return called?.name;
    })
    .filter((name): name is string => Boolean(name));

  return {
    callers: Array.from(new Set(callers)),
    calls: Array.from(new Set(calls)),
  };
}

/**
 * Extract potential code entity names from query
 */
function extractCodeEntities(query: string): string[] {
  const entities: string[] = [];

  // Look for camelCase or PascalCase identifiers
  const camelCaseRegex = /\b[a-z][a-zA-Z0-9]*\b|\b[A-Z][a-zA-Z0-9]*\b/g;
  const matches = query.match(camelCaseRegex) || [];

  // Filter for likely function/class names (at least 3 chars, contains uppercase)
  for (const match of matches) {
    if (
      match.length >= 3 &&
      (/[A-Z]/.test(match) || query.includes(`${match}(`))
    ) {
      entities.push(match);
    }
  }

  return Array.from(new Set(entities)); // Deduplicate
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

function buildEntityLookupCandidates(entityName: string): string[] {
  const candidates = new Set<string>();
  const normalized = entityName.trim();
  if (normalized.length === 0) {
    return [];
  }

  candidates.add(normalized);
  const kebab = toKebabCase(normalized);
  if (kebab.length > 0) {
    candidates.add(kebab);
    candidates.add(`${kebab}.ts`);
    candidates.add(`${kebab}.tsx`);
    candidates.add(`${kebab}.js`);
    candidates.add(`${kebab}.jsx`);

    const suffixMatch = kebab.match(/^(.*)-(controller|service|model|module)$/);
    if (suffixMatch) {
      const [, base, suffix] = suffixMatch;
      candidates.add(base);
      candidates.add(`${base}.${suffix}`);
      candidates.add(`${base}.${suffix}.ts`);
      candidates.add(`${base}.${suffix}.tsx`);
      candidates.add(`${base}-${suffix}.ts`);
      candidates.add(`${base}-${suffix}.tsx`);
    }
  }

  return Array.from(candidates);
}

function isFileLookupQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  return (
    /\b(in which files?|which files?|file paths?|exact file paths?)\b/.test(
      normalized,
    ) ||
    /\bwhere\b.{0,30}\b(defined|implemented|written|located)\b/.test(
      normalized,
    ) ||
    /\blist\b.{0,20}\bfiles?\b/.test(normalized) ||
    /\b(trace|map|traverse|follow)\b.{0,40}\b(flow|pipeline|chain|files?|paths?|implementation)\b/.test(
      normalized,
    ) ||
    /\bend[- ]to[- ]end\b/.test(normalized) ||
    /\bacross\b.{0,30}\b(apps?|packages?|services?)\b/.test(normalized)
  );
}

function buildFileSearchHints(
  query: string,
  queryTerms: string[],
  codeEntities: string[],
): string[] {
  const normalizedQuery = query.toLowerCase();
  const hints = new Set<string>();
  const weakTerms = new Set([
    "files",
    "file",
    "paths",
    "path",
    "exact",
    "where",
    "across",
    "include",
    "using",
    "modules",
    "module",
    "define",
    "defined",
    "imported",
    "referenced",
    "query",
    "queries",
    "mutation",
    "mutations",
    "code",
  ]);

  for (const term of queryTerms) {
    if (
      (term.length >= 5 || /^(api|sse|rbac)$/.test(term)) &&
      !weakTerms.has(term)
    ) {
      hints.add(term);
    }
  }

  for (let index = 0; index < queryTerms.length - 1; index++) {
    const left = queryTerms[index] ?? "";
    const right = queryTerms[index + 1] ?? "";
    if (
      left.length >= 4 &&
      right.length >= 4 &&
      !weakTerms.has(left) &&
      !weakTerms.has(right)
    ) {
      hints.add(`${left}-${right}`);
      hints.add(`${left}_${right}`);
      hints.add(`${left}${right}`);
    }
  }

  for (let index = 0; index < queryTerms.length - 2; index++) {
    const first = queryTerms[index] ?? "";
    const second = queryTerms[index + 1] ?? "";
    const third = queryTerms[index + 2] ?? "";
    if (
      first.length >= 4 &&
      second.length >= 4 &&
      third.length >= 4 &&
      !weakTerms.has(first) &&
      !weakTerms.has(second) &&
      !weakTerms.has(third)
    ) {
      hints.add(`${first}-${second}-${third}`);
      hints.add(`${first}_${second}_${third}`);
    }
  }

  for (let index = 0; index < queryTerms.length - 1; index++) {
    const left = queryTerms[index] ?? "";
    const right = queryTerms[index + 1] ?? "";
    if (left.length < 3 || right.length < 3) {
      continue;
    }

    if (
      (left === "access" && (right === "code" || right === "codes")) ||
      (left.length >= 5 && right.length >= 5)
    ) {
      hints.add(`${left}-${right}`);
      hints.add(`${left}_${right}`);
      hints.add(`${left}${right}`);

      if (right === "code") {
        hints.add(`${left}-codes`);
        hints.add(`${left}_codes`);
      }
    }
  }

  if (/\baccess\s+codes?\b/i.test(query)) {
    hints.add("access-code");
    hints.add("access-codes");
    hints.add("access_code");
    hints.add("access_codes");
    hints.add("accesscode");
    hints.add("accesscodes");
  }

  if (/\bscoring\s+worker\b/.test(normalizedQuery)) {
    hints.add("scoring-worker");
    hints.add("service-scoring-worker");
  }
  if (/\bscoring\s+intake\b/.test(normalizedQuery)) {
    hints.add("scoring-intake");
    hints.add("service-scoring-intake");
  }
  if (/\bcompetition\s+submissions?\b/.test(normalizedQuery)) {
    hints.add("competition-submissions");
  }
  if (/\binternal\s+submissions?\b/.test(normalizedQuery)) {
    hints.add("internal-submissions");
  }
  if (/\bqueue\b/.test(normalizedQuery) && /\bworker\b/.test(normalizedQuery)) {
    hints.add("queue-worker");
  }
  if (/\boutbox\b/.test(normalizedQuery)) {
    hints.add("outbox");
    hints.add("mission-outbox-events");
    hints.add("mission_outbox_events");
  }
  if (
    /\bdatabase[_\s-]?url\b/.test(normalizedQuery) ||
    /\bpostgres[_\s-]?url\b/.test(normalizedQuery) ||
    /\benv\b/.test(normalizedQuery)
  ) {
    hints.add("config");
    hints.add("env");
    hints.add("database-url");
    hints.add("postgres-url");
  }
  if (/\brbac\b/.test(normalizedQuery)) {
    hints.add("permission-guard");
    hints.add("permissions");
  }
  if (/\bsse\b/.test(normalizedQuery)) {
    hints.add("sse");
    hints.add("sse-events");
    hints.add("sse-constants");
  }

  for (const entity of codeEntities) {
    const kebab = toKebabCase(entity);
    if (kebab.length < 5) {
      continue;
    }
    hints.add(kebab);

    const suffixMatch = kebab.match(/^(.*)-(controller|service|model|module)$/);
    if (suffixMatch) {
      const [, base, suffix] = suffixMatch;
      hints.add(base);
      hints.add(`${base}.${suffix}`);
      hints.add(`${base}-${suffix}`);
    }
  }

  return Array.from(hints)
    .filter((hint) => hint.length >= 3)
    .slice(0, 24);
}

async function buildKAGFileLookupContext(
  query: string,
  storage: IStorageBackend,
  limit = 24,
): Promise<ContextSection[]> {
  const queryTerms = extractQueryTerms(query);
  const codeEntities = extractCodeEntities(query);
  const hints = buildFileSearchHints(query, queryTerms, codeEntities);
  if (hints.length === 0) {
    return [];
  }

  const whereClauses = hints.map(
    () => "(lower(file_path) LIKE ? OR lower(name) LIKE ?)",
  );
  const queryParams: string[] = [];
  for (const hint of hints) {
    const pattern = `%${hint}%`;
    queryParams.push(pattern, pattern);
  }

  const sql = `
    SELECT file_path, COUNT(*) AS node_count
    FROM code_nodes
    WHERE (${whereClauses.join(" OR ")})
      AND lower(file_path) NOT LIKE '%/dist/%'
      AND lower(file_path) NOT LIKE '%/build/%'
      AND lower(file_path) NOT LIKE '%/generated/%'
      AND lower(file_path) NOT LIKE '%/__tests__/%'
      AND lower(file_path) NOT LIKE '%/coverage/%'
      AND lower(file_path) NOT LIKE '%.spec.ts'
      AND lower(file_path) NOT LIKE '%.spec.tsx'
      AND lower(file_path) NOT LIKE '%.test.ts'
      AND lower(file_path) NOT LIKE '%.test.tsx'
      AND lower(file_path) NOT LIKE '%.d.ts'
    GROUP BY file_path
  `;
  const rows = storage
    .getDatabase()
    .query(sql)
    .all(...queryParams) as Array<{
    file_path: string;
    node_count: number;
  }>;

  const rankedLexicalRows = rows
    .map((row) => {
      const normalizedFilePath = row.file_path.toLowerCase();
      const fileName = basename(row.file_path).toLowerCase();
      let hintMatches = 0;
      let hintScore = 0;
      let longestHint = 0;

      for (const hint of hints) {
        const normalizedHint = hint.toLowerCase();
        const pathSegmentMatch =
          normalizedFilePath.includes(`/${normalizedHint}/`) ||
          normalizedFilePath.includes(`/${normalizedHint}.`) ||
          normalizedFilePath.endsWith(`/${normalizedHint}`);
        const fileNameMatch =
          fileName === normalizedHint ||
          fileName.startsWith(`${normalizedHint}.`) ||
          fileName.startsWith(`${normalizedHint}-`) ||
          fileName.startsWith(`${normalizedHint}_`);
        const containsMatch = normalizedFilePath.includes(normalizedHint);

        if (fileNameMatch) {
          hintScore += Math.max(10, Math.min(20, normalizedHint.length + 7));
          hintMatches += 1;
          longestHint = Math.max(longestHint, normalizedHint.length);
          continue;
        }

        if (pathSegmentMatch) {
          hintScore += Math.max(8, Math.min(18, normalizedHint.length + 5));
          hintMatches += 1;
          longestHint = Math.max(longestHint, normalizedHint.length);
          continue;
        }

        if (containsMatch) {
          hintScore += Math.max(
            3,
            Math.min(10, Math.floor(normalizedHint.length / 2)),
          );
          hintMatches += 1;
          longestHint = Math.max(longestHint, normalizedHint.length);
        }
      }

      const termMatches = queryTerms.reduce((count, term) => {
        if (term.length < 4) {
          return count;
        }
        return normalizedFilePath.includes(term) ? count + 1 : count;
      }, 0);

      const score =
        hintScore +
        termMatches * 2.5 +
        Math.min(3, row.node_count * 0.1) +
        Math.min(4, longestHint * 0.15);

      return {
        ...row,
        score,
        termMatches,
        hintMatches,
        traversalEdges: 0,
      };
    })
    .filter((row) => row.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.hintMatches - left.hintMatches ||
        left.file_path.localeCompare(right.file_path),
    );

  const rowByPath = new Map(
    rankedLexicalRows.map((row) => [
      row.file_path,
      {
        ...row,
        lexicalMatch: row.hintMatches > 0,
      },
    ]),
  );

  const anchorRows = rankedLexicalRows.slice(
    0,
    Math.min(8, rankedLexicalRows.length),
  );
  const anchorPaths = anchorRows.map((row) => row.file_path);

  if (anchorPaths.length > 0) {
    const placeholders = anchorPaths.map(() => "?").join(", ");
    const neighborSql = `
      SELECT
        n2.file_path AS file_path,
        COUNT(*) AS edge_count,
        COUNT(DISTINCT n2.id) AS node_count
      FROM code_nodes n1
      JOIN code_edges e ON (e.from_node = n1.id OR e.to_node = n1.id)
      JOIN code_nodes n2 ON (n2.id = e.from_node OR n2.id = e.to_node)
      WHERE n1.file_path IN (${placeholders})
        AND n2.file_path NOT IN (${placeholders})
        AND lower(n2.file_path) NOT LIKE '%/dist/%'
        AND lower(n2.file_path) NOT LIKE '%/build/%'
        AND lower(n2.file_path) NOT LIKE '%/generated/%'
        AND lower(n2.file_path) NOT LIKE '%/__tests__/%'
        AND lower(n2.file_path) NOT LIKE '%/coverage/%'
        AND lower(n2.file_path) NOT LIKE '%.spec.ts'
        AND lower(n2.file_path) NOT LIKE '%.spec.tsx'
        AND lower(n2.file_path) NOT LIKE '%.test.ts'
        AND lower(n2.file_path) NOT LIKE '%.test.tsx'
        AND lower(n2.file_path) NOT LIKE '%.d.ts'
      GROUP BY n2.file_path
      ORDER BY edge_count DESC
      LIMIT ?
    `;

    const neighbors = storage
      .getDatabase()
      .query(neighborSql)
      .all(...anchorPaths, ...anchorPaths, Math.max(limit, 24)) as Array<{
      file_path: string;
      edge_count: number;
      node_count: number;
    }>;

    for (const neighbor of neighbors) {
      const existing = rowByPath.get(neighbor.file_path);
      const traversalBoost =
        Math.max(2, Math.min(18, Number(neighbor.edge_count) * 1.2)) +
        Math.min(2.5, Number(neighbor.node_count) * 0.08);
      if (existing) {
        existing.traversalEdges += Number(neighbor.edge_count);
        existing.score += Math.min(4, traversalBoost * 0.4);
        continue;
      }

      rowByPath.set(neighbor.file_path, {
        file_path: neighbor.file_path,
        node_count: Number(neighbor.node_count),
        score: Math.min(6, traversalBoost * 0.45),
        termMatches: 0,
        hintMatches: 0,
        traversalEdges: Number(neighbor.edge_count),
        lexicalMatch: false,
      });
    }
  }

  const combinedRows = Array.from(rowByPath.values()).sort(
    (left, right) =>
      right.score - left.score ||
      right.hintMatches - left.hintMatches ||
      right.traversalEdges - left.traversalEdges ||
      left.file_path.localeCompare(right.file_path),
  );

  const lexicalRows = combinedRows.filter((row) => row.lexicalMatch);
  const traversalRows = combinedRows.filter((row) => !row.lexicalMatch);
  const lexicalTarget = Math.max(1, Math.floor(limit * 0.7));
  const rankedRows = [
    ...lexicalRows.slice(0, lexicalTarget),
    ...traversalRows.slice(0, Math.max(0, limit - lexicalTarget)),
  ].slice(0, Math.max(1, limit));

  const maxScore =
    rankedRows.length > 0
      ? Math.max(...rankedRows.map((row) => row.score), 0.0001)
      : 0.0001;

  const sections: ContextSection[] = [];

  for (const row of rankedRows) {
    const matchedTerms = findMatchedTerms(queryTerms, [row.file_path]);
    const reasonParts = [
      `file-path retrieval score ${toFixedNumber(row.score, 2)}`,
      `lexical hint hits ${row.hintMatches}`,
      `${row.node_count} indexed code nodes in file`,
    ];
    if (row.termMatches > 0) {
      reasonParts.push(`query term matches ${row.termMatches}`);
    }
    if (row.traversalEdges > 0) {
      reasonParts.push(
        `connected via ${row.traversalEdges} code-graph edges from lexical anchors`,
      );
    }

    if (matchedTerms.length > 0) {
      reasonParts.push(`matched query terms: ${matchedTerms.join(", ")}`);
    }

    const content = `\`${row.file_path}\`\nIndexed code nodes: ${row.node_count}`;
    const tokens = await countTokens(content);

    sections.push({
      id: `kag:file-path:${row.file_path}`,
      title: `File: ${basename(row.file_path)}`,
      content,
      tokens,
      relevance: Math.min(0.92, 0.75 + row.hintMatches * 0.04),
      source: "kag",
      evidence: {
        reason: reasonParts.join("; "),
        queryTerms: matchedTerms,
        code: {
          nodeId: `file:${row.file_path}`,
          nodeType: "module",
          filePath: row.file_path,
          matchedEntity: hints[0] ?? "file-path",
          callers: 0,
          calls: 0,
        },
      },
    });
  }

  return sections;
}

function normalizeSourceTargets(config: ContextRerankConfig): {
  rag: number;
  kag: number;
  graphrag: number;
} {
  const rag = Math.max(0, config.ragRatio);
  const kag = Math.max(0, config.kagRatio);
  const graphrag = Math.max(0, config.graphragRatio);
  const total = rag + kag + graphrag;
  if (total <= 0) {
    return { rag: 0.5, kag: 0.25, graphrag: 0.25 };
  }
  return { rag: rag / total, kag: kag / total, graphrag: graphrag / total };
}

function getRouteSourceBoost(
  route: ContextRoute,
  source: ContextSectionSource,
): number {
  if (route === "code") {
    if (source === "kag") return 0.08;
    if (source === "graphrag") return 0.04;
    return -0.04;
  }
  if (route === "memory") {
    if (source === "rag") return 0.08;
    if (source === "graphrag") return 0.04;
    return -0.04;
  }
  if (source === "graphrag") {
    return 0.02;
  }
  return 0;
}

export function rerankContextCandidates(
  candidates: ContextRerankCandidate[],
  config: ContextRerankConfig,
): ContextRerankResult[] {
  if (candidates.length === 0) {
    return [];
  }

  const targets = normalizeSourceTargets(config);
  const maxRelevance =
    Math.max(...candidates.map((candidate) => candidate.relevance), 0.0001) ||
    1;

  const remaining = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const reranked: ContextRerankResult[] = [];
  const coveredTerms = new Set<string>();
  const sourceCounts: Record<ContextSectionSource, number> = {
    rag: 0,
    kag: 0,
    graphrag: 0,
  };

  while (remaining.size > 0) {
    let best: {
      candidate: ContextRerankCandidate;
      score: number;
      breakdown: ContextRerankResult["breakdown"];
    } | null = null;

    for (const candidate of remaining.values()) {
      const semantic = Math.max(0, candidate.relevance / maxRelevance);
      const selectedCount = reranked.length;
      const currentShare =
        selectedCount === 0
          ? 0
          : sourceCounts[candidate.source] / selectedCount;
      const targetShare =
        candidate.source === "rag"
          ? targets.rag
          : candidate.source === "kag"
            ? targets.kag
            : targets.graphrag;
      const sourceBalanceRaw = targetShare - currentShare;
      const sourceBalance = Math.max(-1, Math.min(1, sourceBalanceRaw));

      const terms = (candidate.queryTerms ?? []).map((term) =>
        term.toLowerCase(),
      );
      const unseenTerms = terms.filter((term) => !coveredTerms.has(term));
      const novelty =
        terms.length === 0 ? 0 : unseenTerms.length / terms.length;
      const redundancyPenalty = terms.length === 0 ? 0 : (1 - novelty) * 0.08;

      const last = reranked[reranked.length - 1];
      const previous = reranked[reranked.length - 2];
      const streakPenalty =
        last &&
        previous &&
        last.source === candidate.source &&
        previous.source === candidate.source
          ? 0.05
          : 0;

      const score =
        semantic * 0.72 +
        sourceBalance * 0.18 +
        novelty * 0.1 +
        getRouteSourceBoost(config.route, candidate.source) -
        redundancyPenalty -
        streakPenalty;

      if (
        !best ||
        score > best.score ||
        (score === best.score && semantic > best.breakdown.semantic)
      ) {
        best = {
          candidate,
          score,
          breakdown: {
            semantic: toFixedNumber(semantic, 4),
            sourceBalance: toFixedNumber(sourceBalance, 4),
            novelty: toFixedNumber(novelty, 4),
            redundancyPenalty: toFixedNumber(
              redundancyPenalty + streakPenalty,
              4,
            ),
          },
        };
      }
    }

    if (!best) {
      break;
    }

    reranked.push({
      id: best.candidate.id,
      source: best.candidate.source,
      rank: reranked.length + 1,
      score: toFixedNumber(best.score, 4),
      breakdown: best.breakdown,
    });

    sourceCounts[best.candidate.source] += 1;
    for (const term of best.candidate.queryTerms ?? []) {
      coveredTerms.add(term.toLowerCase());
    }
    remaining.delete(best.candidate.id);
  }

  return reranked;
}

/**
 * Select sections that fit within token budget.
 * Uses route-aware hybrid fusion reranking to avoid source collapse.
 */
function selectWithinBudget(
  sections: ContextSection[],
  budget: number,
  routeConfig: RouteConfig,
): { selectedSections: ContextSection[]; ranking: ContextRerankResult[] } {
  const ranking = rerankContextCandidates(
    sections.map((section) => ({
      id: section.id,
      source: section.source,
      relevance: section.relevance,
      queryTerms: section.evidence.queryTerms,
    })),
    {
      route: routeConfig.route,
      ragRatio: routeConfig.ragRatio,
      kagRatio: routeConfig.kagRatio,
      graphragRatio: routeConfig.graphragRatio,
    },
  );

  const sectionMap = new Map(sections.map((section) => [section.id, section]));
  const selected: ContextSection[] = [];
  let usedTokens = 0;

  for (const rankItem of ranking) {
    const section = sectionMap.get(rankItem.id);
    if (!section) {
      continue;
    }
    if (usedTokens + section.tokens <= budget) {
      selected.push(section);
      usedTokens += section.tokens;
    }
  }

  // Sort selected sections for coherent final markdown output.
  const selectedSections = selected.sort((a, b) => {
    const sourceOrder: Record<ContextSectionSource, number> = {
      rag: 0,
      graphrag: 1,
      kag: 2,
    };
    if (a.source !== b.source) {
      return sourceOrder[a.source] - sourceOrder[b.source];
    }
    return b.relevance - a.relevance;
  });

  return { selectedSections, ranking };
}

function buildSelectionEvidence(
  allSections: ContextSection[],
  selectedSections: ContextSection[],
  ranking: ContextRerankResult[],
): ContextEvidenceItem[] {
  const selectedIds = new Set(selectedSections.map((section) => section.id));
  const rankingById = new Map(ranking.map((item) => [item.id, item]));
  const rankedSections = [...allSections].sort((left, right) => {
    const leftRank = rankingById.get(left.id)?.rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank =
      rankingById.get(right.id)?.rank ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank;
  });

  return rankedSections.map((section) => {
    const included = selectedIds.has(section.id);
    const rankItem = rankingById.get(section.id);
    return {
      id: section.id,
      title: section.title,
      source: section.source,
      rank: rankItem?.rank ?? 0,
      relevance: toFixedNumber(section.relevance, 4),
      ...(rankItem
        ? {
            rerankerScore: rankItem.score,
            rerankerBreakdown: rankItem.breakdown,
          }
        : {}),
      tokens: section.tokens,
      included,
      ...(included ? {} : { exclusionReason: "token_budget" as const }),
      reason: section.evidence.reason,
      queryTerms: section.evidence.queryTerms,
      ...(section.evidence.memory ? { memory: section.evidence.memory } : {}),
      ...(section.evidence.code ? { code: section.evidence.code } : {}),
      ...(section.evidence.graph ? { graph: section.evidence.graph } : {}),
    };
  });
}

/**
 * Format memory for context
 */
function formatMemory(memory: Memory): string {
  const parts: string[] = [];

  // Title and type
  parts.push(`**${memory.title}** (${memory.type})`);

  // Summary or content
  if (memory.summary) {
    parts.push(memory.summary);
  } else if (memory.content) {
    const preview =
      memory.content.length > 300
        ? `${memory.content.substring(0, 300)}...`
        : memory.content;
    parts.push(preview);
  }

  // Metadata
  const meta: string[] = [];
  if (memory.tags?.length > 0) {
    meta.push(`Tags: ${memory.tags.join(", ")}`);
  }
  if (memory.importance) {
    meta.push(`Importance: ${Math.round(memory.importance * 100)}%`);
  }
  if (meta.length > 0) {
    parts.push(`*${meta.join(" | ")}*`);
  }

  return parts.join("\n");
}

/**
 * Format call graph for context
 */
function formatCallGraph(node: CodeNode, graph: CallGraphResult): string {
  const parts: string[] = [];

  parts.push(`\`${node.name}\` (${node.type})`);

  if (node.signature) {
    parts.push(`\`\`\`\n${node.signature}\n\`\`\``);
  }

  if (node.summary) {
    parts.push(node.summary);
  }

  // Callers
  const { callers, calls } = extractCallRelationships(node, graph);

  if (callers.length > 0) {
    parts.push(`\nCalled by: ${callers.slice(0, 5).join(", ")}`);
    if (callers.length > 5) {
      parts.push(`and ${callers.length - 5} more...`);
    }
  }

  // Calls
  if (calls.length > 0) {
    parts.push(`\nCalls: ${calls.slice(0, 5).join(", ")}`);
    if (calls.length > 5) {
      parts.push(`and ${calls.length - 5} more...`);
    }
  }

  return parts.join("\n");
}

/**
 * Format implementations for context
 */
function formatImplementations(
  iface: CodeNode,
  implementations: CodeNode[],
): string {
  const parts: string[] = [];

  parts.push(
    `Interface \`${iface.name}\` has ${implementations.length} implementations:`,
  );

  for (const impl of implementations.slice(0, 5)) {
    parts.push(`- \`${impl.name}\` in ${impl.filePath}`);
  }

  if (implementations.length > 5) {
    parts.push(`- and ${implementations.length - 5} more...`);
  }

  return parts.join("\n");
}

/**
 * Format sections as markdown
 */
function formatAsMarkdown(
  sections: ContextSection[],
  template: "default" | "compact" | "detailed",
  query: string,
): string {
  const parts: string[] = [];

  // Header
  parts.push(`# Context for: ${query}`);
  parts.push("");

  if (sections.length === 0) {
    parts.push("*No relevant context found.*");
    return parts.join("\n");
  }

  // Group by source
  const ragSections = sections.filter((s) => s.source === "rag");
  const graphSections = sections.filter((s) => s.source === "graphrag");
  const kagSections = sections.filter((s) => s.source === "kag");

  // RAG sections
  if (ragSections.length > 0) {
    parts.push("## Relevant Memories");
    parts.push("");

    for (const section of ragSections) {
      if (template === "compact") {
        parts.push(`### ${section.title}`);
        parts.push(section.content.split("\n")[0]); // First line only
      } else {
        parts.push(`### ${section.title}`);
        parts.push(section.content);
      }
      parts.push("");
    }
  }

  // GraphRAG sections
  if (graphSections.length > 0) {
    parts.push("## Knowledge Graph Insights");
    parts.push("");

    for (const section of graphSections) {
      parts.push(`### ${section.title}`);
      parts.push(section.content);
      parts.push("");
    }
  }

  // KAG sections
  if (kagSections.length > 0) {
    parts.push("## Code Relationships");
    parts.push("");

    for (const section of kagSections) {
      parts.push(`### ${section.title}`);
      parts.push(section.content);
      parts.push("");
    }
  }

  return parts.join("\n");
}

// ============================================
// Cached Context Building
// ============================================

/** Result type for cached context building */
export interface CachedContextMetadata extends ContextMetadata {
  cacheHit: boolean;
}

export interface CachedContextResult {
  context: string;
  metadata: CachedContextMetadata;
  evidence?: ContextEvidenceItem[];
}

/** Internal result with memory IDs for cache tracking */
interface ContextResultWithMemoryIds {
  result: {
    context: string;
    metadata: ContextMetadata;
    evidence?: ContextEvidenceItem[];
  };
  memoryIds: string[];
}

/**
 * Build context with caching support.
 * Checks cache first, computes if not found, and stores result.
 *
 * @param input - Context build input parameters
 * @param storage - Storage backend
 * @param vectors - Vector store
 * @param embeddings - Embedding client
 * @param cacheConfig - Optional cache configuration
 * @param scoringConfig - Optional scoring configuration (used for cache key)
 */
export async function buildContextWithCache(
  input: BuildContextInput,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
  cacheConfig?: ContextCacheConfig,
  scoringConfig?: ScoringConfig,
): Promise<CachedContextResult> {
  const cache = getContextCache<ContextResultWithMemoryIds>(cacheConfig);
  const includeEvidence = input.includeEvidence ?? false;
  const includeCodeGraph = input.includeCodeGraph ?? true;
  const includeGraphRAG = input.includeGraphRAG ?? true;
  const tokenBudget = input.tokenBudget ?? 4000;
  const template = input.template ?? "default";
  const routeConfig = getRouteConfig(
    input.query,
    includeCodeGraph,
    includeGraphRAG,
  );
  const startedAt = performance.now();
  const stageTimings: ContextStageTimings = {
    rag: 0,
    kag: 0,
    graphrag: 0,
    rerank: 0,
    format: 0,
    tokenize: 0,
    evidence: 0,
    total: 0,
  };

  // Generate cache key
  const keyComponents = await buildCacheKeyComponents(input, scoringConfig);
  const cacheKey = await generateCacheKey(keyComponents);

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached) {
    return {
      ...cached.result,
      metadata: {
        ...cached.result.metadata,
        cacheHit: true,
      },
    };
  }

  // Build context (cache miss)
  const sections: ContextSection[] = [];
  const trackedMemoryIds = new Set<string>();

  // Reserve tokens for section headers and formatting overhead
  const FORMATTING_OVERHEAD = 200;
  const availableTokens = tokenBudget - FORMATTING_OVERHEAD;

  // 1. RAG: Semantic search for relevant memories
  const ragStartedAt = performance.now();
  const ragResult = await buildRAGContextInternal(
    input.query,
    input.filters,
    storage,
    vectors,
    embeddings,
    routeConfig.ragLimit,
  );
  stageTimings.rag = toFixedNumber(performance.now() - ragStartedAt);
  sections.push(...ragResult.sections);
  for (const memoryId of ragResult.memoryIds) {
    trackedMemoryIds.add(memoryId);
  }

  // 2. KAG: Code graph relationships (if enabled)
  if (includeCodeGraph && routeConfig.kagRatio > 0) {
    const kagStartedAt = performance.now();
    const kagSections = await buildKAGContext(
      input.query,
      availableTokens * routeConfig.kagRatio,
      storage,
    );
    stageTimings.kag = toFixedNumber(performance.now() - kagStartedAt);
    sections.push(...kagSections);
  }

  // 3. GraphRAG: Entity + community relationships
  if (includeGraphRAG && routeConfig.graphragRatio > 0) {
    const graphragStartedAt = performance.now();
    const graphragResult = await buildGraphRAGContext(
      input.query,
      availableTokens * routeConfig.graphragRatio,
      storage,
      vectors,
      embeddings,
      routeConfig.graphragLimit,
    );
    stageTimings.graphrag = toFixedNumber(
      performance.now() - graphragStartedAt,
    );
    sections.push(...graphragResult.sections);
    for (const memoryId of graphragResult.memoryIds) {
      trackedMemoryIds.add(memoryId);
    }
  }

  // 4. Rank by relevance and fit within budget
  const rerankStartedAt = performance.now();
  const { selectedSections, ranking } = selectWithinBudget(
    sections,
    availableTokens,
    routeConfig,
  );
  stageTimings.rerank = toFixedNumber(performance.now() - rerankStartedAt);

  // 5. Format as markdown
  const formatStartedAt = performance.now();
  const context = formatAsMarkdown(selectedSections, template, input.query);
  stageTimings.format = toFixedNumber(performance.now() - formatStartedAt);

  const tokenizeStartedAt = performance.now();
  const totalTokens = await countTokens(context);
  stageTimings.tokenize = toFixedNumber(performance.now() - tokenizeStartedAt);
  const evidenceStartedAt = performance.now();
  const evidence = includeEvidence
    ? buildSelectionEvidence(sections, selectedSections, ranking)
    : undefined;
  stageTimings.evidence = toFixedNumber(performance.now() - evidenceStartedAt);
  stageTimings.total = toFixedNumber(performance.now() - startedAt);

  const result: ContextResultWithMemoryIds = {
    result: {
      context,
      metadata: {
        totalTokens,
        sectionsIncluded: selectedSections.length,
        ragSections: selectedSections.filter((s) => s.source === "rag").length,
        kagSections: selectedSections.filter((s) => s.source === "kag").length,
        graphragSections: selectedSections.filter(
          (s) => s.source === "graphrag",
        ).length,
        truncated: sections.length > selectedSections.length,
        route: routeConfig.route,
        stageTimings,
      },
      ...(evidence ? { evidence } : {}),
    },
    memoryIds: Array.from(trackedMemoryIds),
  };

  // Store in cache
  cache.set(cacheKey, result, result.memoryIds);

  return {
    ...result.result,
    metadata: {
      ...result.result.metadata,
      cacheHit: false,
    },
  };
}

// ============================================
// Retrieval Benchmarking
// ============================================

const DEFAULT_BENCHMARK_QUERIES = [
  "What are our authentication decisions?",
  "What calls validateToken?",
  "What breaks if I change PaymentService?",
  "Show architecture context for caching strategy",
  "Which implementations exist for repository interfaces?",
];

export interface RetrievalBenchmarkInput {
  queries?: string[];
  runsPerQuery?: number;
  warmupRuns?: number;
  tokenBudget?: number;
  includeCodeGraph?: boolean;
  includeGraphRAG?: boolean;
  template?: "default" | "compact" | "detailed";
  clearCacheFirst?: boolean;
  compareAgainstMemoryOnly?: boolean;
  filters?: BuildContextInput["filters"];
}

interface LatencySummary {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

interface RouteBenchmarkStats extends LatencySummary {
  route: ContextRoute;
  runs: number;
}

export interface RetrievalBenchmarkComparisonProfile {
  includeCodeGraph: boolean;
  includeGraphRAG: boolean;
  overall: LatencySummary;
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  routes: RouteBenchmarkStats[];
  stages: StageBenchmarkStats[];
}

export interface RetrievalBenchmarkComparison {
  baseline: RetrievalBenchmarkComparisonProfile;
  requested: RetrievalBenchmarkComparisonProfile;
  overhead: {
    ratios: {
      avg: number;
      p50: number;
      p95: number;
      p99: number;
    };
    percent: {
      avg: number;
      p50: number;
      p95: number;
      p99: number;
    };
  };
}

export interface RetrievalBenchmarkResult {
  totalRuns: number;
  queryCount: number;
  runsPerQuery: number;
  warmupRuns: number;
  overall: LatencySummary;
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  routes: RouteBenchmarkStats[];
  stages: StageBenchmarkStats[];
  querySamples: Array<{
    query: string;
    route: ContextRoute;
    latencyMs: number;
    tokens: number;
    sectionsIncluded: number;
  }>;
  comparison?: RetrievalBenchmarkComparison;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function toFixedNumber(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

function summarizeLatency(values: number[]): LatencySummary {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  }

  const sum = values.reduce((acc, current) => acc + current, 0);
  return {
    min: toFixedNumber(Math.min(...values)),
    max: toFixedNumber(Math.max(...values)),
    avg: toFixedNumber(sum / values.length),
    p50: toFixedNumber(percentile(values, 50)),
    p95: toFixedNumber(percentile(values, 95)),
    p99: toFixedNumber(percentile(values, 99)),
  };
}

type RetrievalBenchmarkCoreResult = Omit<
  RetrievalBenchmarkResult,
  "comparison"
>;

interface RetrievalBenchmarkScenarioInput {
  queries: string[];
  runsPerQuery: number;
  warmupRuns: number;
  tokenBudget: number;
  includeCodeGraph: boolean;
  includeGraphRAG: boolean;
  template: "default" | "compact" | "detailed";
  clearCacheFirst: boolean;
  filters?: BuildContextInput["filters"];
}

interface StageBenchmarkStats extends LatencySummary {
  stage: ContextStageName;
  runs: number;
}

function toComparisonProfile(
  result: RetrievalBenchmarkCoreResult,
  config: {
    includeCodeGraph: boolean;
    includeGraphRAG: boolean;
  },
): RetrievalBenchmarkComparisonProfile {
  return {
    includeCodeGraph: config.includeCodeGraph,
    includeGraphRAG: config.includeGraphRAG,
    overall: result.overall,
    cache: result.cache,
    routes: result.routes,
    stages: result.stages,
  };
}

function ratio(requested: number, baseline: number): number {
  // Protect against near-zero rounded latency values in synthetic test runs.
  const safeBaseline = Math.max(0.01, baseline);
  return toFixedNumber(requested / safeBaseline, 2);
}

function buildComparison(
  requestedResult: RetrievalBenchmarkCoreResult,
  requestedConfig: {
    includeCodeGraph: boolean;
    includeGraphRAG: boolean;
  },
  baselineResult: RetrievalBenchmarkCoreResult,
): RetrievalBenchmarkComparison {
  const ratios = {
    avg: ratio(requestedResult.overall.avg, baselineResult.overall.avg),
    p50: ratio(requestedResult.overall.p50, baselineResult.overall.p50),
    p95: ratio(requestedResult.overall.p95, baselineResult.overall.p95),
    p99: ratio(requestedResult.overall.p99, baselineResult.overall.p99),
  };

  return {
    requested: toComparisonProfile(requestedResult, requestedConfig),
    baseline: toComparisonProfile(baselineResult, {
      includeCodeGraph: false,
      includeGraphRAG: false,
    }),
    overhead: {
      ratios,
      percent: {
        avg: toFixedNumber((ratios.avg - 1) * 100),
        p50: toFixedNumber((ratios.p50 - 1) * 100),
        p95: toFixedNumber((ratios.p95 - 1) * 100),
        p99: toFixedNumber((ratios.p99 - 1) * 100),
      },
    },
  };
}

async function runRetrievalBenchmarkScenario(
  input: RetrievalBenchmarkScenarioInput,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
  cacheConfig?: ContextCacheConfig,
  scoringConfig?: ScoringConfig,
): Promise<RetrievalBenchmarkCoreResult> {
  const cache = getContextCache(cacheConfig);
  if (input.clearCacheFirst) {
    cache.clear();
    cache.resetStats();
  }

  const allLatencies: number[] = [];
  const routeLatencies: Record<ContextRoute, number[]> = {
    memory: [],
    code: [],
    hybrid: [],
  };
  const stageLatencies: Record<ContextStageName, number[]> = {
    rag: [],
    kag: [],
    graphrag: [],
    rerank: [],
    format: [],
    tokenize: [],
    evidence: [],
    total: [],
  };

  let cacheHits = 0;
  let cacheMisses = 0;
  const querySamples: RetrievalBenchmarkCoreResult["querySamples"] = [];

  for (const query of input.queries) {
    for (let i = 0; i < input.warmupRuns; i++) {
      await buildContextWithCache(
        {
          query,
          tokenBudget: input.tokenBudget,
          includeCodeGraph: input.includeCodeGraph,
          includeGraphRAG: input.includeGraphRAG,
          filters: input.filters,
          template: input.template,
        },
        storage,
        vectors,
        embeddings,
        cacheConfig,
        scoringConfig,
      );
    }

    for (let run = 0; run < input.runsPerQuery; run++) {
      const startedAt = performance.now();
      const result = await buildContextWithCache(
        {
          query,
          tokenBudget: input.tokenBudget,
          includeCodeGraph: input.includeCodeGraph,
          includeGraphRAG: input.includeGraphRAG,
          filters: input.filters,
          template: input.template,
        },
        storage,
        vectors,
        embeddings,
        cacheConfig,
        scoringConfig,
      );
      const latencyMs = performance.now() - startedAt;

      allLatencies.push(latencyMs);
      routeLatencies[result.metadata.route].push(latencyMs);
      if (result.metadata.stageTimings) {
        const stageTimings = result.metadata.stageTimings;
        for (const stage of Object.keys(stageLatencies) as ContextStageName[]) {
          stageLatencies[stage].push(stageTimings[stage]);
        }
      }

      if (result.metadata.cacheHit) {
        cacheHits++;
      } else {
        cacheMisses++;
      }

      if (run === 0) {
        querySamples.push({
          query,
          route: result.metadata.route,
          latencyMs: toFixedNumber(latencyMs),
          tokens: result.metadata.totalTokens,
          sectionsIncluded: result.metadata.sectionsIncluded,
        });
      }
    }
  }

  const totalRuns = allLatencies.length;
  const routeOrder: ContextRoute[] = ["memory", "code", "hybrid"];

  const routeStats: RouteBenchmarkStats[] = routeOrder
    .filter((route) => routeLatencies[route].length > 0)
    .map((route) => ({
      route,
      runs: routeLatencies[route].length,
      ...summarizeLatency(routeLatencies[route]),
    }));
  const stageOrder: ContextStageName[] = [
    "rag",
    "kag",
    "graphrag",
    "rerank",
    "format",
    "tokenize",
    "evidence",
    "total",
  ];
  const stageStats: StageBenchmarkStats[] = stageOrder
    .filter((stage) => stageLatencies[stage].length > 0)
    .map((stage) => ({
      stage,
      runs: stageLatencies[stage].length,
      ...summarizeLatency(stageLatencies[stage]),
    }));

  return {
    totalRuns,
    queryCount: input.queries.length,
    runsPerQuery: input.runsPerQuery,
    warmupRuns: input.warmupRuns,
    overall: summarizeLatency(allLatencies),
    cache: {
      hits: cacheHits,
      misses: cacheMisses,
      hitRate:
        totalRuns === 0 ? 0 : toFixedNumber((cacheHits / totalRuns) * 100),
    },
    routes: routeStats,
    stages: stageStats,
    querySamples,
  };
}

export async function benchmarkContextRetrieval(
  input: RetrievalBenchmarkInput,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
  cacheConfig?: ContextCacheConfig,
  scoringConfig?: ScoringConfig,
): Promise<RetrievalBenchmarkResult> {
  const queries =
    input.queries && input.queries.length > 0
      ? input.queries
      : DEFAULT_BENCHMARK_QUERIES;

  const runsPerQuery = input.runsPerQuery ?? 3;
  const warmupRuns = input.warmupRuns ?? 1;
  const tokenBudget = input.tokenBudget ?? 4000;
  const includeCodeGraph = input.includeCodeGraph ?? true;
  const includeGraphRAG = input.includeGraphRAG ?? true;
  const template = input.template ?? "compact";
  const clearCacheFirst = input.clearCacheFirst ?? true;
  const compareAgainstMemoryOnly = input.compareAgainstMemoryOnly ?? false;
  const shouldResetPerScenario = compareAgainstMemoryOnly
    ? true
    : clearCacheFirst;

  const requested = await runRetrievalBenchmarkScenario(
    {
      queries,
      runsPerQuery,
      warmupRuns,
      tokenBudget,
      includeCodeGraph,
      includeGraphRAG,
      template,
      clearCacheFirst: shouldResetPerScenario,
      filters: input.filters,
    },
    storage,
    vectors,
    embeddings,
    cacheConfig,
    scoringConfig,
  );

  if (!compareAgainstMemoryOnly) {
    return requested;
  }

  const baseline =
    !includeCodeGraph && !includeGraphRAG
      ? requested
      : await runRetrievalBenchmarkScenario(
          {
            queries,
            runsPerQuery,
            warmupRuns,
            tokenBudget,
            includeCodeGraph: false,
            includeGraphRAG: false,
            template,
            clearCacheFirst: true,
            filters: input.filters,
          },
          storage,
          vectors,
          embeddings,
          cacheConfig,
          scoringConfig,
        );

  return {
    ...requested,
    comparison: buildComparison(
      requested,
      { includeCodeGraph, includeGraphRAG },
      baseline,
    ),
  };
}
