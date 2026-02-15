/**
 * GraphRAG Build Tool
 *
 * Builds or updates the GraphRAG knowledge graph from memories.
 */

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
import {
  GRAPHRAG_REPORT_VECTOR_TYPE,
  indexGraphEntityVectors,
} from "./entity-vectors";

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
  memoriesProcessed: number;
  memoriesSkipped: number;
  noOp: boolean;
  entityVectorsIndexed: number;
  entityVectorsDeleted: number;
  relationshipsExtracted: number;
  communitiesDetected: number;
  communityRebuildSkipped: boolean;
  reportsGenerated: number;
  reportGenerationSkipped: boolean;
  reportVectorsDeleted: number;
  duration: number;
  errors: string[];
}

function normalizeEntityAlias(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`"'()[\]{}<>]/g, " ")
    .replace(/[_\-./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveEntityIdForRelationship(
  graphStorage: GraphRAGStorage,
  aliasesToEntityId: Map<string, string>,
  rawName: string,
): string | null {
  const normalized = normalizeEntityAlias(rawName);
  if (normalized.length === 0) {
    return null;
  }

  const mappedId = aliasesToEntityId.get(normalized);
  if (mappedId) {
    return mappedId;
  }

  const exact = graphStorage.getEntityByName(rawName);
  if (exact) {
    return exact.id;
  }

  for (const [alias, id] of aliasesToEntityId.entries()) {
    if (
      alias === normalized ||
      alias.includes(normalized) ||
      normalized.includes(alias)
    ) {
      return id;
    }
  }

  return null;
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
  let memoriesProcessed = 0;
  let memoriesSkipped = 0;
  let graphChanged = false;

  const db = storage.getDatabase();
  const graphStorage = new GraphRAGStorage(db);
  const extractor = new EntityExtractor();
  const merger = new EntityMerger(graphStorage);
  const graphBuilder = new GraphBuilder(graphStorage);
  const hierarchyBuilder = new HierarchyBuilder(graphStorage, graphBuilder);

  let entityVectorsIndexed = 0;
  let entityVectorsDeleted = 0;
  let reportVectorsDeleted = 0;
  const touchedEntityIds = new Set<string>();
  const deletedVectorIds = new Set<string>();
  const shouldRefreshTargetedMemories =
    !input.reindexAll && Boolean(input.memoryIds && input.memoryIds.length > 0);

  const preBuildEntities = graphStorage.listEntities({});
  const preBuildEntityEmbeddingIds = new Map<string, string>();
  for (const entity of preBuildEntities) {
    if (entity.embeddingId) {
      preBuildEntityEmbeddingIds.set(entity.id, entity.embeddingId);
    }
  }

  const preBuildReportEmbeddingIds = new Set<string>();
  for (const report of graphStorage.getAllReports()) {
    if (report.embeddingId) {
      preBuildReportEmbeddingIds.add(report.embeddingId);
    }
  }

  const deleteVectorSafely = async (
    vectorId: string,
    kind: "entity" | "report",
  ): Promise<void> => {
    if (deletedVectorIds.has(vectorId)) {
      return;
    }
    deletedVectorIds.add(vectorId);

    try {
      const deleted = await vectors.delete(vectorId);
      if (!deleted) {
        return;
      }
      if (kind === "entity") {
        entityVectorsDeleted++;
      } else {
        reportVectorsDeleted++;
      }
    } catch (error) {
      console.warn(
        `[doclea] Failed to delete ${kind} vector ${vectorId}:`,
        error,
      );
    }
  };

  // Clear if reindexing
  if (input.reindexAll) {
    const existingEntities = graphStorage.listEntities({});
    for (const entity of existingEntities) {
      if (!entity.embeddingId) {
        continue;
      }
      await deleteVectorSafely(entity.embeddingId, "entity");
    }

    const existingReports = graphStorage.getAllReports();
    for (const report of existingReports) {
      if (!report.embeddingId) {
        continue;
      }
      await deleteVectorSafely(report.embeddingId, "report");
    }

    graphStorage.clearAll();
    console.log("[doclea] Cleared existing GraphRAG data");
    graphChanged = true;
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
        if (shouldRefreshTargetedMemories && existingEntities.length > 0) {
          graphChanged = true;
          graphStorage.deleteEntitiesForMemory(memory.id);

          for (const existingEntity of existingEntities) {
            const stillExists = graphStorage.getEntity(existingEntity.id);
            if (!stillExists && existingEntity.embeddingId) {
              await deleteVectorSafely(existingEntity.embeddingId, "entity");
            }
          }
        } else if (existingEntities.length > 0) {
          memoriesSkipped++;
          continue;
        }
      }
      memoriesProcessed++;

      const result = await extractor.extract(memory.content);
      const aliasesToEntityId = new Map<string, string>();

      // Merge entities (resolves duplicates)
      for (const extracted of result.entities) {
        const { entity, merged } = await merger.findOrCreateEntity(
          extracted,
          memory.id,
        );
        graphChanged = true;
        touchedEntityIds.add(entity.id);
        entitiesExtracted++;
        if (merged) entitiesMerged++;

        const aliases = [
          extracted.canonicalName,
          extracted.mentionText,
          entity.canonicalName,
        ];
        for (const alias of aliases) {
          const normalizedAlias = normalizeEntityAlias(alias);
          if (normalizedAlias.length > 0) {
            aliasesToEntityId.set(normalizedAlias, entity.id);
          }
        }
      }

      // Handle relationships
      for (const rel of result.relationships) {
        const sourceId = resolveEntityIdForRelationship(
          graphStorage,
          aliasesToEntityId,
          rel.sourceEntity,
        );
        const targetId = resolveEntityIdForRelationship(
          graphStorage,
          aliasesToEntityId,
          rel.targetEntity,
        );
        if (!sourceId || !targetId || sourceId === targetId) {
          continue;
        }
        const source = graphStorage.getEntity(sourceId);
        const target = graphStorage.getEntity(targetId);

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

            graphChanged = true;
            relationshipsExtracted++;
          } else {
            const alreadyLinked = graphStorage
              .getRelationshipSources(existing.id)
              .some((sourceLink) => sourceLink.memoryId === memory.id);
            if (!alreadyLinked) {
              graphStorage.linkRelationshipToMemory(
                existing.id,
                memory.id,
                `${rel.sourceEntity} ${rel.relationshipType} ${rel.targetEntity}`,
              );
            }
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
  const noOp = !input.reindexAll && !graphChanged;

  // Index entity vectors for semantic GraphRAG retrieval
  if (input.reindexAll || touchedEntityIds.size > 0) {
    try {
      const indexed = await indexGraphEntityVectors(
        graphStorage,
        vectors,
        embeddings,
        input.reindexAll
          ? undefined
          : {
              entityIds: Array.from(touchedEntityIds),
            },
      );
      entityVectorsIndexed = indexed.indexed;
      if (indexed.failed > 0) {
        errors.push(
          `Entity vector indexing: failed to index ${indexed.failed} entities`,
        );
      }
      console.log(
        `[doclea] Indexed ${entityVectorsIndexed} GraphRAG entity vectors`,
      );
    } catch (error) {
      const errMsg = `Entity vector indexing: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errMsg);
      console.warn(`[doclea] ${errMsg}`);
    }
  } else {
    console.log(
      "[doclea] Skipping GraphRAG entity indexing (no entity changes)",
    );
  }

  // Detect communities
  let communitiesDetected = 0;
  let communityRebuildSkipped = false;
  if (noOp) {
    communityRebuildSkipped = true;
    console.log("[doclea] Skipping community detection (no graph changes)");
  } else {
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
  }

  // Generate reports
  let reportsGenerated = 0;
  let reportGenerationSkipped = false;
  if (!input.generateReports) {
    reportGenerationSkipped = true;
    console.log("[doclea] Skipping report generation (disabled)");
  } else if (communityRebuildSkipped) {
    reportGenerationSkipped = true;
    console.log("[doclea] Skipping report generation (no graph changes)");
  } else if (communitiesDetected === 0) {
    reportGenerationSkipped = true;
    console.log("[doclea] Skipping report generation (no communities)");
  } else {
    try {
      // Create embedder function for reports
      const reportEmbedder = async (
        text: string,
        context: {
          reportId: string;
          communityId: string;
          title: string;
          summary: string;
        },
      ): Promise<string> => {
        const vector = await embeddings.embed(text);
        const embeddingId = `graphrag_report_${context.reportId}`;
        await vectors.upsert(embeddingId, vector, {
          memoryId: embeddingId,
          type: GRAPHRAG_REPORT_VECTOR_TYPE,
          title: context.title,
          tags: ["graphrag", "community", "report"],
          relatedFiles: [],
          importance: 0.5,
          content: context.summary.slice(0, 500),
          reportId: context.reportId,
          communityId: context.communityId,
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

  // Garbage-collect stale entity vectors for entities removed this run.
  if (!input.reindexAll) {
    const postBuildEntityIds = new Set(
      graphStorage.listEntities({}).map((entity) => entity.id),
    );
    for (const [entityId, embeddingId] of preBuildEntityEmbeddingIds) {
      if (!postBuildEntityIds.has(entityId)) {
        await deleteVectorSafely(embeddingId, "entity");
      }
    }
  }

  // Garbage-collect stale report vectors after community rebuild/report regeneration.
  if (!input.reindexAll) {
    const postBuildReportEmbeddingIds = new Set(
      graphStorage
        .getAllReports()
        .map((report) => report.embeddingId)
        .filter((embeddingId): embeddingId is string => Boolean(embeddingId)),
    );
    for (const embeddingId of preBuildReportEmbeddingIds) {
      if (!postBuildReportEmbeddingIds.has(embeddingId)) {
        await deleteVectorSafely(embeddingId, "report");
      }
    }
  }

  const duration = Date.now() - startTime;

  return {
    entitiesExtracted,
    entitiesMerged,
    memoriesProcessed,
    memoriesSkipped,
    noOp,
    entityVectorsIndexed,
    entityVectorsDeleted,
    relationshipsExtracted,
    communitiesDetected,
    communityRebuildSkipped,
    reportsGenerated,
    reportGenerationSkipped,
    reportVectorsDeleted,
    duration,
    errors,
  };
}
