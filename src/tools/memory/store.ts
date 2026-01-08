import { randomUUID } from "crypto";
import { z } from "zod";
import type { IStorageBackend } from "@/storage/interface";
import type { PendingMemory } from "@/storage/types";
import type { EmbeddingClient } from "@/embeddings/provider";
import { type Memory, MemoryTypeSchema } from "@/types";
import type { VectorStore } from "@/vectors/interface";
import { MemoryRelationStorage } from "@/database/memory-relations";
import { RelationSuggestionStorage } from "@/database/relation-suggestions";
import { createRelationDetector } from "@/relations";
import { CodeGraphStorage } from "@/database/code-graph";
import { CrossLayerRelationStorage } from "@/database/cross-layer-relations";
import { CrossLayerSuggestionStorage } from "@/database/cross-layer-suggestions";
import { CrossLayerDetector } from "@/relations/cross-layer-detector";
import { LLMTagger } from "@/tagging";

export const StoreMemoryInputSchema = z.object({
  type: MemoryTypeSchema,
  title: z.string().describe("Short title for the memory"),
  content: z.string().describe("Full content of the memory"),
  summary: z.string().optional().describe("Brief summary"),
  importance: z
    .number()
    .min(0)
    .max(1)
    .default(0.5)
    .describe("Importance score 0-1"),
  tags: z.array(z.string()).default([]).describe("Tags for categorization"),
  autoTag: z.boolean().optional().default(false).describe("Auto-extract semantic tags via LLM"),
  relatedFiles: z.array(z.string()).default([]).describe("Related file paths"),
  gitCommit: z.string().optional().describe("Related git commit hash"),
  sourcePr: z.string().optional().describe("Source PR number/link"),
  experts: z.array(z.string()).default([]).describe("Subject matter experts"),
});

// Use z.input for the input type to allow optional fields with defaults to be omitted
export type StoreMemoryInput = z.input<typeof StoreMemoryInputSchema>;

/**
 * Result of storing a memory - can be either committed or pending
 */
export type StoreMemoryResult =
  | { status: "committed"; memory: Memory }
  | { status: "pending"; pendingId: string; message: string };

/**
 * Store a memory with mode-aware behavior:
 * - automatic: Store directly to SQLite + vectors
 * - suggested/manual: Store to pending_memories for later approval
 */
export async function storeMemory(
  input: StoreMemoryInput,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<StoreMemoryResult> {
  const id = `mem_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const qdrantId = `vec_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  // Handle auto-tagging if enabled
  let tags = input.tags || [];
  if (input.autoTag) {
    try {
      const tagger = new LLMTagger();
      const result = await tagger.extractTags({
        title: input.title,
        type: input.type,
        content: input.content,
      });

      // Extract high-confidence tags (>= 0.7)
      const extractedTags = result.tags
        .filter((t) => t.confidence >= 0.7)
        .map((t) => t.name);

      // Merge and deduplicate (user-provided + extracted)
      tags = [...new Set([...tags, ...extractedTags])];

      if (extractedTags.length > 0) {
        console.log(
          `[doclea] Auto-tagged with ${extractedTags.length} tags: ${extractedTags.join(", ")}`,
        );
      }
    } catch (error) {
      // Graceful degradation - continue with user-provided tags only
      console.warn("[doclea] Auto-tagging failed:", error);
    }
  }

  // Build the memory data object (apply defaults for optional fields)
  const importance = input.importance ?? 0.5;
  const relatedFiles = input.relatedFiles ?? [];
  const experts = input.experts ?? [];

  const memoryData = {
    id,
    qdrantId,
    type: input.type,
    title: input.title,
    content: input.content,
    summary: input.summary,
    importance,
    tags,
    relatedFiles,
    gitCommit: input.gitCommit,
    sourcePr: input.sourcePr,
    experts,
  };

  // Check storage mode for branching logic
  const mode = storage.getStorageMode();

  if (mode === "suggested" || mode === "manual") {
    // Store as pending memory - no vectors, no relations yet
    const pending = storage.createPendingMemory({
      memoryData,
      source: "user_store",
      reason: mode === "suggested"
        ? "Auto-suggested for review before storage"
        : "Manual approval required before storage",
    });

    console.log(`[doclea] Created pending memory ${pending.id} (mode: ${mode})`);

    return {
      status: "pending",
      pendingId: pending.id,
      message: mode === "suggested"
        ? `Memory queued for review. Use list_pending_memories to see pending items, then approve_pending_memory to commit.`
        : `Memory stored as pending. Manual approval required via approve_pending_memory.`,
    };
  }

  // Automatic mode: commit directly to SQLite + vectors
  // Generate embedding from title + content
  const textToEmbed = `${input.title}\n\n${input.content}`;
  const vector = await embeddings.embed(textToEmbed);

  // Store vector in Qdrant
  await vectors.upsert(qdrantId, vector, {
    memoryId: id,
    type: input.type,
    title: input.title,
    tags,
    relatedFiles,
    importance,
  });

  // Store metadata in SQLite
  const memory = storage.createMemory(memoryData);

  // Non-blocking relation detection (fire and forget)
  detectRelationsAsync(memory, storage, vectors, embeddings).catch((err) =>
    console.error("[doclea] Relation detection failed:", err),
  );

  // Non-blocking cross-layer detection (memory → code)
  detectCrossLayerAsync(memory, storage).catch((err) =>
    console.error("[doclea] Cross-layer detection failed:", err),
  );

  return { status: "committed", memory };
}

/**
 * Async helper for non-blocking relation detection
 */
async function detectRelationsAsync(
  memory: Memory,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<void> {
  try {
    const rawDb = storage.getDatabase();
    const relationStorage = new MemoryRelationStorage(rawDb);
    const suggestionStorage = new RelationSuggestionStorage(rawDb, relationStorage);

    // Create a compatible db object for the detector
    const dbCompat = {
      getMemory: (id: string) => storage.getMemory(id),
      getMemoriesByIds: (ids: string[]) => storage.getMemoriesByIds(ids),
      findByRelatedFiles: (files: string[], excludeId?: string) =>
        storage.findByRelatedFiles(files, excludeId),
      findByTimeRange: (start: number, end: number, excludeId?: string) =>
        storage.findByTimeRange(start, end, excludeId),
      searchByTags: (tags: string[], excludeId?: string) =>
        storage.searchByTags(tags, excludeId),
      listMemories: (filters?: { type?: string; limit?: number }) =>
        storage.listMemories(filters),
      getDatabase: () => storage.getDatabase(),
    };

    const detector = createRelationDetector(
      dbCompat as any,
      relationStorage,
      suggestionStorage,
      vectors,
      embeddings,
    );

    const result = await detector.detectRelationsForMemory(memory);

    if (result.autoApproved.length > 0 || result.suggestions.length > 0) {
      console.log(
        `[doclea] Relation detection for ${memory.id}: ${result.autoApproved.length} auto-approved, ${result.suggestions.length} suggestions`,
      );
    }
  } catch (error) {
    // Silently fail - relation detection is non-critical
    console.warn("[doclea] Relation detection error:", error);
  }
}

/**
 * Async helper for non-blocking cross-layer detection (memory → code)
 */
async function detectCrossLayerAsync(
  memory: Memory,
  storage: IStorageBackend,
): Promise<void> {
  try {
    const rawDb = storage.getDatabase();
    const codeGraph = new CodeGraphStorage(rawDb);
    const relationStorage = new CrossLayerRelationStorage(rawDb);
    const suggestionStorage = new CrossLayerSuggestionStorage(
      rawDb,
      relationStorage,
    );

    // Create a compatible db object for the detector
    const dbCompat = {
      getMemory: (id: string) => storage.getMemory(id),
      getDatabase: () => storage.getDatabase(),
    };

    const detector = new CrossLayerDetector(
      dbCompat as any,
      codeGraph,
      relationStorage,
      suggestionStorage,
    );

    const result = await detector.detectForMemory(memory);

    if (result.autoApproved.length > 0 || result.suggestions.length > 0) {
      console.log(
        `[doclea] Cross-layer detection for ${memory.id}: ${result.autoApproved.length} auto-approved, ${result.suggestions.length} suggestions`,
      );
    }
  } catch (error) {
    // Silently fail - cross-layer detection is non-critical
    console.warn("[doclea] Cross-layer detection error:", error);
  }
}
