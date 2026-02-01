/**
 * GraphRAG Build Tool
 *
 * Builds or updates the GraphRAG knowledge graph from memories.
 */

import type { Database } from "bun:sqlite";
import { z } from "zod";
import type { EmbeddingClient } from "@/embeddings/provider";
import { HierarchyBuilder } from "@/graphrag/community/hierarchy-builder";
import { ReportGenerator } from "@/graphrag/community/report-generator";
import { EntityExtractor } from "@/graphrag/extraction/entity-extractor";
import { EntityMerger } from "@/graphrag/graph/entity-merger";
import { GraphBuilder } from "@/graphrag/graph/graph-builder";
import { GraphRAGStorage } from "@/graphrag/graph/graphrag-storage";
import type { IStorageBackend } from "@/storage/interface";
import type { VectorStore } from "@/vectors/interface";

export const BuildInputSchema = z.object({
  memoryIds: z
    .array(z.string())
    .optional()
    .describe("Specific memory IDs to process (default: all)"),
  reindexAll: z
    .boolean()
    .default(false)
    .describe("Clear existing graph and rebuild from scratch"),
  generateReports: z
    .boolean()
    .default(true)
    .describe("Generate community reports after building"),
  communityLevels: z
    .number()
    .min(1)
    .max(5)
    .default(3)
    .describe("Number of community hierarchy levels"),
});

export type BuildInput = z.infer<typeof BuildInputSchema>;

export interface BuildResult {
  entitiesExtracted: number;
  entitiesMerged: number;
  relationshipsExtracted: number;
  communitiesDetected: number;
  reportsGenerated: number;
  duration: number;
  errors: string[];
}

/**
 * Build the GraphRAG knowledge graph from memories
 */
export async function graphragBuild(
  input: BuildInput,
  storage: IStorageBackend,
  embeddings: EmbeddingClient,
  vectors: VectorStore,
): Promise<BuildResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let entitiesExtracted = 0;
  let entitiesMerged = 0;
  let relationshipsExtracted = 0;

  const db = storage.getDatabase();
  const graphStorage = new GraphRAGStorage(db);
  const extractor = new EntityExtractor();
  const merger = new EntityMerger(graphStorage);
  const graphBuilder = new GraphBuilder(graphStorage);
  const hierarchyBuilder = new HierarchyBuilder(graphStorage, graphBuilder);

  // Clear if reindexing
  if (input.reindexAll) {
    graphStorage.clearAll();
    console.log("[doclea] Cleared existing GraphRAG data");
  }

  // Get memories to process
  const memories = input.memoryIds
    ? storage.getMemoriesByIds(input.memoryIds)
    : storage.listMemories({});

  console.log(`[doclea] Processing ${memories.length} memories for GraphRAG`);

  // Extract entities and relationships from each memory
  for (const memory of memories) {
    try {
      // Skip if already processed (unless reindexing)
      if (!input.reindexAll) {
        const existingEntities = graphStorage.getEntitiesForMemory(memory.id);
        if (existingEntities.length > 0) {
          continue;
        }
      }

      const result = await extractor.extract(memory.content);

      // Merge entities (resolves duplicates)
      for (const extracted of result.entities) {
        const { merged } = await merger.findOrCreateEntity(
          extracted,
          memory.id,
        );
        entitiesExtracted++;
        if (merged) entitiesMerged++;
      }

      // Handle relationships
      for (const rel of result.relationships) {
        const source = graphStorage.getEntityByName(rel.sourceEntity);
        const target = graphStorage.getEntityByName(rel.targetEntity);

        if (source && target) {
          // Check if relationship already exists
          const existing = graphStorage.findRelationship(
            source.id,
            target.id,
            rel.relationshipType,
          );

          if (!existing) {
            const relationship = graphStorage.createRelationship({
              sourceEntityId: source.id,
              targetEntityId: target.id,
              relationshipType: rel.relationshipType,
              description: rel.description,
              strength: rel.strength,
              createdAt: Math.floor(Date.now() / 1000),
            });

            // Link to source memory
            graphStorage.linkRelationshipToMemory(
              relationship.id,
              memory.id,
              `${rel.sourceEntity} ${rel.relationshipType} ${rel.targetEntity}`,
            );

            relationshipsExtracted++;
          }
        }
      }
    } catch (error) {
      const errMsg = `Memory ${memory.id}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errMsg);
      console.warn(`[doclea] GraphRAG extraction error: ${errMsg}`);
    }
  }

  console.log(
    `[doclea] Extracted ${entitiesExtracted} entities, ${relationshipsExtracted} relationships`,
  );

  // Detect communities
  let communitiesDetected = 0;
  try {
    const { communities } = await hierarchyBuilder.clearAndRebuild({
      levels: input.communityLevels,
      resolutions: Array.from(
        { length: input.communityLevels },
        (_, i) => 1.0 / (i + 1),
      ),
    });
    communitiesDetected = communities.length;
    console.log(`[doclea] Detected ${communitiesDetected} communities`);
  } catch (error) {
    const errMsg = `Community detection: ${error instanceof Error ? error.message : String(error)}`;
    errors.push(errMsg);
    console.warn(`[doclea] ${errMsg}`);
  }

  // Generate reports
  let reportsGenerated = 0;
  if (input.generateReports && communitiesDetected > 0) {
    try {
      // Create embedder function for reports
      const reportEmbedder = async (text: string): Promise<string> => {
        const vector = await embeddings.embed(text);
        const embeddingId = `graphrag_report_${Date.now()}`;
        await vectors.upsert(embeddingId, vector, {
          memoryId: embeddingId,
          type: "graphrag_report",
          title: "Community Report",
          tags: ["graphrag", "community", "report"],
          relatedFiles: [],
          importance: 0.5,
          content: text.slice(0, 500),
        });
        return embeddingId;
      };

      const reportGenerator = new ReportGenerator(
        graphStorage,
        {},
        reportEmbedder,
      );

      const reports = await reportGenerator.generateAllReports(0);
      reportsGenerated = reports.length;
      console.log(`[doclea] Generated ${reportsGenerated} community reports`);
    } catch (error) {
      const errMsg = `Report generation: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errMsg);
      console.warn(`[doclea] ${errMsg}`);
    }
  }

  const duration = Date.now() - startTime;

  return {
    entitiesExtracted,
    entitiesMerged,
    relationshipsExtracted,
    communitiesDetected,
    reportsGenerated,
    duration,
    errors,
  };
}
