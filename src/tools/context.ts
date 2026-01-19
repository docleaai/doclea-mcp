import { z } from "zod";
import {
  buildCacheKeyComponents,
  type ContextCacheConfig,
  generateCacheKey,
  getContextCache,
} from "../caching";
import { CodeGraphStorage } from "../database/code-graph";
import type { EmbeddingClient } from "../embeddings/provider";
import type { ScoringConfig } from "../scoring/types";
import type { IStorageBackend } from "../storage/interface";
import { countTokens } from "../utils/tokens";
import type { VectorStore } from "../vectors";
import { searchMemory } from "./memory";

/**
 * Context builder that assembles RAG + KAG context within token budget
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
});

export type BuildContextInput = z.infer<typeof BuildContextInputSchema>;

interface ContextSection {
  title: string;
  content: string;
  tokens: number;
  relevance: number;
  source: string;
}

/**
 * Build context from RAG semantic search and KAG code relationships
 */
export async function buildContext(
  input: BuildContextInput,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<{
  context: string;
  metadata: {
    totalTokens: number;
    sectionsIncluded: number;
    ragSections: number;
    kagSections: number;
    truncated: boolean;
  };
}> {
  const sections: ContextSection[] = [];

  // Reserve tokens for section headers and formatting overhead
  const FORMATTING_OVERHEAD = 200;
  const availableTokens = input.tokenBudget - FORMATTING_OVERHEAD;

  // 1. RAG: Semantic search for relevant memories
  const ragSections = await buildRAGContext(
    input.query,
    availableTokens * 0.7, // Allocate 70% to RAG
    input.filters,
    storage,
    vectors,
    embeddings,
  );
  sections.push(...ragSections);

  // 2. KAG: Code graph relationships (if enabled)
  let kagSections: ContextSection[] = [];
  if (input.includeCodeGraph) {
    kagSections = await buildKAGContext(
      input.query,
      availableTokens * 0.3, // Allocate 30% to KAG
      storage,
    );
    sections.push(...kagSections);
  }

  // 3. Rank by relevance and fit within budget
  const selectedSections = selectWithinBudget(sections, availableTokens);

  // 4. Format as markdown
  const context = formatAsMarkdown(
    selectedSections,
    input.template,
    input.query,
  );

  const totalTokens = await countTokens(context);

  return {
    context,
    metadata: {
      totalTokens,
      sectionsIncluded: selectedSections.length,
      ragSections: selectedSections.filter((s) => s.source === "rag").length,
      kagSections: selectedSections.filter((s) => s.source === "kag").length,
      truncated: sections.length > selectedSections.length,
    },
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
): Promise<ContextSection[]> {
  const sections: ContextSection[] = [];

  // Search memories
  const results = await searchMemory(
    {
      query,
      limit: 20, // Get more results for ranking
      ...filters,
    },
    storage,
    vectors,
    embeddings,
  );

  for (const result of results) {
    const content = formatMemory(result.memory);
    const tokens = await countTokens(content);

    sections.push({
      title: result.memory.title,
      content,
      tokens,
      relevance: result.score,
      source: "rag",
    });
  }

  return sections;
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

  // Extract potential function/class names from query
  const codeEntities = extractCodeEntities(query);

  for (const entityName of codeEntities) {
    // Try to find the node
    const node = await codeGraph.findNodeByName(entityName);
    if (!node) continue;

    // Get call graph
    const callGraph = await codeGraph.getCallGraph(node.id, 2);

    if (callGraph.nodes.length > 1) {
      const content = formatCallGraph(node, callGraph);
      const tokens = await countTokens(content);

      sections.push({
        title: `Code: ${node.name}`,
        content,
        tokens,
        relevance: 0.8, // High relevance when mentioned in query
        source: "kag",
      });
    }

    // Get implementations if it's an interface
    if (node.type === "interface") {
      const implementations = await codeGraph.findImplementations(node.id);
      if (implementations.length > 0) {
        const content = formatImplementations(node, implementations);
        const tokens = await countTokens(content);

        sections.push({
          title: `Implementations: ${node.name}`,
          content,
          tokens,
          relevance: 0.7,
          source: "kag",
        });
      }
    }
  }

  return sections;
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

/**
 * Select sections that fit within token budget
 */
function selectWithinBudget(
  sections: ContextSection[],
  budget: number,
): ContextSection[] {
  // Sort by relevance (descending)
  const sorted = [...sections].sort((a, b) => b.relevance - a.relevance);

  const selected: ContextSection[] = [];
  let usedTokens = 0;

  for (const section of sorted) {
    if (usedTokens + section.tokens <= budget) {
      selected.push(section);
      usedTokens += section.tokens;
    }
  }

  // Sort selected sections back to original order for coherent output
  return selected.sort((a, b) => {
    // RAG sections first, then KAG
    if (a.source !== b.source) {
      return a.source === "rag" ? -1 : 1;
    }
    // Within same source, maintain relevance order
    return b.relevance - a.relevance;
  });
}

/**
 * Format memory for context
 */
function formatMemory(memory: any): string {
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
function formatCallGraph(node: any, graph: any): string {
  const parts: string[] = [];

  parts.push(`\`${node.name}\` (${node.type})`);

  if (node.signature) {
    parts.push(`\`\`\`\n${node.signature}\n\`\`\``);
  }

  if (node.summary) {
    parts.push(node.summary);
  }

  // Callers
  const callers = graph.edges
    .filter((e: any) => e.toNode === node.id && e.edgeType === "calls")
    .map((e: any) => {
      const caller = graph.nodes.find((n: any) => n.id === e.fromNode);
      return caller?.name;
    })
    .filter(Boolean);

  if (callers.length > 0) {
    parts.push(`\nCalled by: ${callers.slice(0, 5).join(", ")}`);
    if (callers.length > 5) {
      parts.push(`and ${callers.length - 5} more...`);
    }
  }

  // Calls
  const calls = graph.edges
    .filter((e: any) => e.fromNode === node.id && e.edgeType === "calls")
    .map((e: any) => {
      const called = graph.nodes.find((n: any) => n.id === e.toNode);
      return called?.name;
    })
    .filter(Boolean);

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
function formatImplementations(iface: any, implementations: any[]): string {
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
export interface CachedContextResult {
  context: string;
  metadata: {
    totalTokens: number;
    sectionsIncluded: number;
    ragSections: number;
    kagSections: number;
    truncated: boolean;
    cacheHit: boolean;
  };
}

/** Internal result with memory IDs for cache tracking */
interface ContextResultWithMemoryIds {
  result: Omit<CachedContextResult, "metadata"> & {
    metadata: Omit<CachedContextResult["metadata"], "cacheHit">;
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
  const memoryIds: string[] = [];

  // Reserve tokens for section headers and formatting overhead
  const FORMATTING_OVERHEAD = 200;
  const availableTokens = input.tokenBudget - FORMATTING_OVERHEAD;

  // 1. RAG: Semantic search for relevant memories
  const ragResult = await buildRAGContextWithIds(
    input.query,
    availableTokens * 0.7,
    input.filters,
    storage,
    vectors,
    embeddings,
  );
  sections.push(...ragResult.sections);
  memoryIds.push(...ragResult.memoryIds);

  // 2. KAG: Code graph relationships (if enabled)
  if (input.includeCodeGraph) {
    const kagSections = await buildKAGContext(
      input.query,
      availableTokens * 0.3,
      storage,
    );
    sections.push(...kagSections);
  }

  // 3. Rank by relevance and fit within budget
  const selectedSections = selectWithinBudget(sections, availableTokens);

  // 4. Format as markdown
  const context = formatAsMarkdown(
    selectedSections,
    input.template,
    input.query,
  );

  const totalTokens = await countTokens(context);

  const result: ContextResultWithMemoryIds = {
    result: {
      context,
      metadata: {
        totalTokens,
        sectionsIncluded: selectedSections.length,
        ragSections: selectedSections.filter((s) => s.source === "rag").length,
        kagSections: selectedSections.filter((s) => s.source === "kag").length,
        truncated: sections.length > selectedSections.length,
      },
    },
    memoryIds,
  };

  // Store in cache
  cache.set(cacheKey, result, memoryIds);

  return {
    ...result.result,
    metadata: {
      ...result.result.metadata,
      cacheHit: false,
    },
  };
}

/**
 * Build RAG context and return memory IDs for cache tracking.
 */
async function buildRAGContextWithIds(
  query: string,
  _tokenBudget: number,
  filters: BuildContextInput["filters"],
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<{ sections: ContextSection[]; memoryIds: string[] }> {
  const sections: ContextSection[] = [];
  const memoryIds: string[] = [];

  // Search memories
  const results = await searchMemory(
    {
      query,
      limit: 20,
      ...filters,
    },
    storage,
    vectors,
    embeddings,
  );

  for (const result of results) {
    const content = formatMemory(result.memory);
    const tokens = await countTokens(content);

    sections.push({
      title: result.memory.title,
      content,
      tokens,
      relevance: result.score,
      source: "rag",
    });

    // Track memory ID for targeted cache invalidation
    memoryIds.push(result.memory.id);
  }

  return { sections, memoryIds };
}
