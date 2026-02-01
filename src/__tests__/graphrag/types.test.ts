/**
 * Tests for GraphRAG type schemas
 */

import { describe, expect, test } from "bun:test";
import {
  CommunityReportSchema,
  CommunitySchema,
  DriftSearchConfigSchema,
  EntitySchema,
  EntityTypeEnum,
  ExtractedEntitySchema,
  ExtractedRelationshipSchema,
  GlobalSearchConfigSchema,
  LocalSearchConfigSchema,
  RelationshipSchema,
} from "@/graphrag/types";

describe("GraphRAG Types", () => {
  describe("EntityTypeEnum", () => {
    test("accepts valid entity types", () => {
      const validTypes = [
        "PERSON",
        "ORGANIZATION",
        "TECHNOLOGY",
        "CONCEPT",
        "LOCATION",
        "EVENT",
        "PRODUCT",
        "OTHER",
      ];

      for (const type of validTypes) {
        const result = EntityTypeEnum.safeParse(type);
        expect(result.success).toBe(true);
      }
    });

    test("rejects invalid entity types", () => {
      const result = EntityTypeEnum.safeParse("INVALID");
      expect(result.success).toBe(false);
    });
  });

  describe("EntitySchema", () => {
    test("validates complete entity", () => {
      const entity = {
        id: "entity_123",
        canonicalName: "Test Entity",
        entityType: "TECHNOLOGY",
        description: "A test entity",
        mentionCount: 5,
        extractionConfidence: 0.95,
        extractionVersion: "v1",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700001000,
        embeddingId: "emb_123",
        metadata: { custom: "data" },
      };

      const result = EntitySchema.safeParse(entity);
      expect(result.success).toBe(true);
    });

    test("applies defaults for optional fields", () => {
      const entity = {
        id: "entity_123",
        canonicalName: "Test Entity",
        entityType: "CONCEPT",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700001000,
      };

      const result = EntitySchema.safeParse(entity);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mentionCount).toBe(1);
        expect(result.data.extractionConfidence).toBe(1);
        expect(result.data.metadata).toEqual({});
      }
    });

    test("validates confidence bounds", () => {
      const validEntity = {
        id: "entity_123",
        canonicalName: "Test",
        entityType: "CONCEPT",
        extractionConfidence: 0.5,
        firstSeenAt: 1700000000,
        lastSeenAt: 1700001000,
      };

      expect(EntitySchema.safeParse(validEntity).success).toBe(true);

      const invalidLow = { ...validEntity, extractionConfidence: -0.1 };
      expect(EntitySchema.safeParse(invalidLow).success).toBe(false);

      const invalidHigh = { ...validEntity, extractionConfidence: 1.1 };
      expect(EntitySchema.safeParse(invalidHigh).success).toBe(false);
    });
  });

  describe("RelationshipSchema", () => {
    test("validates complete relationship", () => {
      const relationship = {
        id: "rel_123",
        sourceEntityId: "entity_1",
        targetEntityId: "entity_2",
        relationshipType: "USES",
        description: "Entity 1 uses Entity 2",
        strength: 8,
        createdAt: 1700000000,
      };

      const result = RelationshipSchema.safeParse(relationship);
      expect(result.success).toBe(true);
    });

    test("validates strength bounds", () => {
      const baseRel = {
        id: "rel_123",
        sourceEntityId: "entity_1",
        targetEntityId: "entity_2",
        relationshipType: "USES",
        createdAt: 1700000000,
      };

      // Valid strengths
      expect(
        RelationshipSchema.safeParse({ ...baseRel, strength: 1 }).success,
      ).toBe(true);
      expect(
        RelationshipSchema.safeParse({ ...baseRel, strength: 10 }).success,
      ).toBe(true);

      // Invalid strengths
      expect(
        RelationshipSchema.safeParse({ ...baseRel, strength: 0 }).success,
      ).toBe(false);
      expect(
        RelationshipSchema.safeParse({ ...baseRel, strength: 11 }).success,
      ).toBe(false);
    });
  });

  describe("CommunitySchema", () => {
    test("validates complete community", () => {
      const community = {
        id: "comm_123",
        level: 0,
        parentId: "comm_parent",
        entityCount: 10,
        resolution: 1.0,
        modularity: 0.5,
        createdAt: 1700000000,
        updatedAt: 1700001000,
      };

      const result = CommunitySchema.safeParse(community);
      expect(result.success).toBe(true);
    });

    test("validates level is non-negative", () => {
      const baseCommunity = {
        id: "comm_123",
        entityCount: 5,
        createdAt: 1700000000,
        updatedAt: 1700001000,
      };

      expect(
        CommunitySchema.safeParse({ ...baseCommunity, level: 0 }).success,
      ).toBe(true);
      expect(
        CommunitySchema.safeParse({ ...baseCommunity, level: 3 }).success,
      ).toBe(true);
      expect(
        CommunitySchema.safeParse({ ...baseCommunity, level: -1 }).success,
      ).toBe(false);
    });
  });

  describe("CommunityReportSchema", () => {
    test("validates complete report", () => {
      const report = {
        id: "report_123",
        communityId: "comm_123",
        title: "Test Community Report",
        summary: "A summary of the community",
        fullContent: "Detailed content about the community",
        keyFindings: ["Finding 1", "Finding 2"],
        rating: 8.5,
        ratingExplanation: "High quality community",
        promptVersion: "v1",
        embeddingId: "emb_123",
        createdAt: 1700000000,
      };

      const result = CommunityReportSchema.safeParse(report);
      expect(result.success).toBe(true);
    });

    test("applies default for keyFindings", () => {
      const report = {
        id: "report_123",
        communityId: "comm_123",
        title: "Test",
        summary: "Summary",
        fullContent: "Content",
        createdAt: 1700000000,
      };

      const result = CommunityReportSchema.safeParse(report);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.keyFindings).toEqual([]);
      }
    });
  });

  describe("ExtractedEntitySchema", () => {
    test("validates extracted entity", () => {
      const extracted = {
        canonicalName: "Test Entity",
        entityType: "TECHNOLOGY",
        description: "A test",
        confidence: 0.9,
        mentionText: "test entity mentioned here",
      };

      const result = ExtractedEntitySchema.safeParse(extracted);
      expect(result.success).toBe(true);
    });

    test("requires all fields", () => {
      const incomplete = {
        canonicalName: "Test",
        entityType: "TECHNOLOGY",
      };

      const result = ExtractedEntitySchema.safeParse(incomplete);
      expect(result.success).toBe(false);
    });
  });

  describe("ExtractedRelationshipSchema", () => {
    test("validates extracted relationship", () => {
      const extracted = {
        sourceEntity: "Entity A",
        targetEntity: "Entity B",
        relationshipType: "USES",
        description: "A uses B",
        strength: 7,
        confidence: 0.85,
      };

      const result = ExtractedRelationshipSchema.safeParse(extracted);
      expect(result.success).toBe(true);
    });
  });

  describe("Search Config Schemas", () => {
    test("LocalSearchConfigSchema applies defaults", () => {
      const result = LocalSearchConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxDepth).toBe(2);
        expect(result.data.minEdgeWeight).toBe(3);
        expect(result.data.entitySimilarityBoost).toBe(true);
      }
    });

    test("GlobalSearchConfigSchema applies defaults", () => {
      const result = GlobalSearchConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.communityLevel).toBe(1);
        expect(result.data.maxReports).toBe(5);
        expect(result.data.reportSelectionStrategy).toBe("embedding");
      }
    });

    test("DriftSearchConfigSchema applies defaults", () => {
      const result = DriftSearchConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxIterations).toBe(3);
        expect(result.data.convergenceThreshold).toBe(0.9);
        expect(result.data.memoryWindow).toBe(5);
      }
    });
  });
});
