/**
 * GraphRAG type definitions and Zod schemas
 *
 * Defines types for entities, relationships, communities, and search operations.
 */

import { z } from "zod";

// Entity types
export const EntityTypeEnum = z.enum([
  "PERSON",
  "ORGANIZATION",
  "TECHNOLOGY",
  "CONCEPT",
  "LOCATION",
  "EVENT",
  "PRODUCT",
  "OTHER",
]);
export type EntityType = z.infer<typeof EntityTypeEnum>;

export const EntitySchema = z.object({
  id: z.string(),
  canonicalName: z.string(),
  entityType: EntityTypeEnum,
  description: z.string().optional(),
  mentionCount: z.number().default(1),
  extractionConfidence: z.number().min(0).max(1).default(1),
  extractionVersion: z.string().optional(),
  firstSeenAt: z.number(),
  lastSeenAt: z.number(),
  embeddingId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type Entity = z.infer<typeof EntitySchema>;

// Relationship types
export const RelationshipSchema = z.object({
  id: z.string(),
  sourceEntityId: z.string(),
  targetEntityId: z.string(),
  relationshipType: z.string(),
  description: z.string().optional(),
  strength: z.number().int().min(1).max(10).default(5),
  createdAt: z.number(),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

// Relationship source linkage
export const RelationshipSourceSchema = z.object({
  relationshipId: z.string(),
  memoryId: z.string(),
  evidenceText: z.string().optional(),
});
export type RelationshipSource = z.infer<typeof RelationshipSourceSchema>;

// Community types
export const CommunitySchema = z.object({
  id: z.string(),
  level: z.number().int().min(0),
  parentId: z.string().optional(),
  entityCount: z.number().default(0),
  resolution: z.number().optional(),
  modularity: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Community = z.infer<typeof CommunitySchema>;

// Community Report types
export const CommunityReportSchema = z.object({
  id: z.string(),
  communityId: z.string(),
  title: z.string(),
  summary: z.string(),
  fullContent: z.string(),
  keyFindings: z.array(z.string()).default([]),
  rating: z.number().optional(),
  ratingExplanation: z.string().optional(),
  promptVersion: z.string().optional(),
  embeddingId: z.string().optional(),
  createdAt: z.number(),
});
export type CommunityReport = z.infer<typeof CommunityReportSchema>;

// Entity-memory linkage
export const EntityMemorySchema = z.object({
  entityId: z.string(),
  memoryId: z.string(),
  mentionText: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1),
});
export type EntityMemory = z.infer<typeof EntityMemorySchema>;

// Extraction result types
export const ExtractedEntitySchema = z.object({
  canonicalName: z.string(),
  entityType: EntityTypeEnum,
  description: z.string().optional(),
  confidence: z.number().min(0).max(1),
  mentionText: z.string(),
});
export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;

export const ExtractedRelationshipSchema = z.object({
  sourceEntity: z.string(),
  targetEntity: z.string(),
  relationshipType: z.string(),
  description: z.string().optional(),
  strength: z.number().int().min(1).max(10),
  confidence: z.number().min(0).max(1),
});
export type ExtractedRelationship = z.infer<typeof ExtractedRelationshipSchema>;

// Extraction result wrapper
export const ExtractionResultSchema = z.object({
  entities: z.array(ExtractedEntitySchema),
  relationships: z.array(ExtractedRelationshipSchema),
  usedFallback: z.boolean(),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// Search config types
export const LocalSearchConfigSchema = z.object({
  maxDepth: z.number().default(2),
  minEdgeWeight: z.number().default(3),
  entitySimilarityBoost: z.boolean().default(true),
});
export type LocalSearchConfig = z.infer<typeof LocalSearchConfigSchema>;

export const GlobalSearchConfigSchema = z.object({
  communityLevel: z.number().default(1),
  maxReports: z.number().default(5),
  reportSelectionStrategy: z
    .enum(["embedding", "size", "centrality"])
    .default("embedding"),
});
export type GlobalSearchConfig = z.infer<typeof GlobalSearchConfigSchema>;

export const DriftSearchConfigSchema = z.object({
  maxIterations: z.number().default(3),
  convergenceThreshold: z.number().default(0.9),
  memoryWindow: z.number().default(5),
});
export type DriftSearchConfig = z.infer<typeof DriftSearchConfigSchema>;

// Leiden algorithm types
export interface LeidenInput {
  sources: Uint32Array;
  targets: Uint32Array;
  weights: Float64Array;
  nodeIdMap: Map<string, number>; // entity.id -> node index
  reverseMap: Map<number, string>; // node index -> entity.id
}

export interface LeidenResult {
  communities: Map<number, number>; // nodeId -> communityId
  modularity: number;
  iterations: number;
  diagnostics?: {
    memoryUsed: number;
    executionTime: number;
  };
}

// Search result types
export interface LocalSearchResult {
  entities: Array<{
    entity: Entity;
    relevanceScore: number;
    depth: number;
  }>;
  relationships: Relationship[];
  totalExpanded: number;
}

export interface GlobalSearchResult {
  answer: string;
  sourceCommunities: Array<{
    report: CommunityReport;
    relevanceScore: number;
    extractedInfo: string;
  }>;
  tokenUsage: { input: number; output: number };
}

export interface DriftSearchResult extends LocalSearchResult {
  iterations: number;
  hypotheses: string[];
  converged: boolean;
}

// GraphRAG statistics
export interface GraphRAGStats {
  entities: number;
  relationships: number;
  communities: number;
  reports: number;
}
