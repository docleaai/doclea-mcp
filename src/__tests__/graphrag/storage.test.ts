/**
 * Tests for GraphRAGStorage class
 */

import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { GraphRAGStorage } from "@/graphrag/graph/graphrag-storage";
import { migration012GraphRAG } from "@/migrations/012_graphrag";

describe("GraphRAGStorage", () => {
  let db: Database;
  let storage: GraphRAGStorage;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(":memory:");

    // Create migration database adapter
    const migrationDb = {
      run: (sql: string, ...params: unknown[]) => db.run(sql, ...params),
      exec: (sql: string) => db.exec(sql),
      query: <T = unknown>(sql: string, ...params: unknown[]) =>
        db.query(sql).all(...params) as T[],
      get: <T = unknown>(sql: string, ...params: unknown[]) =>
        db.query(sql).get(...params) as T | undefined,
    };

    // Run migration
    migration012GraphRAG.up(migrationDb);

    // Create storage instance
    storage = new GraphRAGStorage(db);
  });

  describe("Entity Operations", () => {
    test("creates entity with all fields", () => {
      const entity = storage.createEntity({
        canonicalName: "Test Entity",
        entityType: "TECHNOLOGY",
        description: "A test entity",
        mentionCount: 5,
        extractionConfidence: 0.95,
        firstSeenAt: 1700000000,
        lastSeenAt: 1700001000,
      });

      expect(entity.id).toBeDefined();
      expect(entity.canonicalName).toBe("Test Entity");
      expect(entity.entityType).toBe("TECHNOLOGY");
      expect(entity.mentionCount).toBe(5);
    });

    test("retrieves entity by id", () => {
      const created = storage.createEntity({
        canonicalName: "Test",
        entityType: "CONCEPT",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });

      const retrieved = storage.getEntity(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.canonicalName).toBe("Test");
    });

    test("retrieves entity by name (case insensitive)", () => {
      storage.createEntity({
        canonicalName: "TypeScript",
        entityType: "TECHNOLOGY",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });

      const found = storage.getEntityByName("typescript");
      expect(found).not.toBeNull();
      expect(found?.canonicalName).toBe("TypeScript");
    });

    test("updates entity", () => {
      const entity = storage.createEntity({
        canonicalName: "Original",
        entityType: "CONCEPT",
        mentionCount: 1,
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });

      const updated = storage.updateEntity(entity.id, {
        canonicalName: "Updated",
        mentionCount: 5,
      });

      expect(updated?.canonicalName).toBe("Updated");
      expect(updated?.mentionCount).toBe(5);
    });

    test("deletes entity", () => {
      const entity = storage.createEntity({
        canonicalName: "ToDelete",
        entityType: "CONCEPT",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });

      storage.deleteEntity(entity.id);
      const retrieved = storage.getEntity(entity.id);
      expect(retrieved).toBeNull();
    });

    test("lists entities with limit", () => {
      for (let i = 0; i < 10; i++) {
        storage.createEntity({
          canonicalName: `Entity ${i}`,
          entityType: "CONCEPT",
          mentionCount: i + 1,
          firstSeenAt: 1700000000,
          lastSeenAt: 1700000000,
        });
      }

      const entities = storage.listEntities({ limit: 5 });
      expect(entities.length).toBe(5);
    });

    test("lists entities by type", () => {
      storage.createEntity({
        canonicalName: "Tech1",
        entityType: "TECHNOLOGY",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });
      storage.createEntity({
        canonicalName: "Person1",
        entityType: "PERSON",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });

      const techEntities = storage.listEntities({ type: "TECHNOLOGY" });
      expect(techEntities.length).toBe(1);
      expect(techEntities[0].entityType).toBe("TECHNOLOGY");
    });
  });

  describe("Entity-Memory Linkage", () => {
    test("links entity to memory", () => {
      const entity = storage.createEntity({
        canonicalName: "Test",
        entityType: "CONCEPT",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });

      storage.linkEntityToMemory(entity.id, "mem_123", "test mention", 0.9);

      const memories = storage.getMemoriesForEntity(entity.id);
      expect(memories.length).toBe(1);
      expect(memories[0].memoryId).toBe("mem_123");
      expect(memories[0].confidence).toBe(0.9);
    });

    test("gets entities for memory", () => {
      const entity1 = storage.createEntity({
        canonicalName: "Entity1",
        entityType: "CONCEPT",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });
      const entity2 = storage.createEntity({
        canonicalName: "Entity2",
        entityType: "TECHNOLOGY",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });

      storage.linkEntityToMemory(entity1.id, "mem_123", "e1", 0.9);
      storage.linkEntityToMemory(entity2.id, "mem_123", "e2", 0.8);

      const entities = storage.getEntitiesForMemory("mem_123");
      expect(entities.length).toBe(2);
    });

    test("unlinks entity from memory", () => {
      const entity = storage.createEntity({
        canonicalName: "Test",
        entityType: "CONCEPT",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });

      storage.linkEntityToMemory(entity.id, "mem_123", "test", 0.9);
      storage.unlinkEntityFromMemory(entity.id, "mem_123");

      const memories = storage.getMemoriesForEntity(entity.id);
      expect(memories.length).toBe(0);
    });
  });

  describe("Relationship Operations", () => {
    let entity1Id: string;
    let entity2Id: string;

    beforeEach(() => {
      entity1Id = storage.createEntity({
        canonicalName: "Entity1",
        entityType: "CONCEPT",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      }).id;

      entity2Id = storage.createEntity({
        canonicalName: "Entity2",
        entityType: "TECHNOLOGY",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      }).id;
    });

    test("creates relationship", () => {
      const rel = storage.createRelationship({
        sourceEntityId: entity1Id,
        targetEntityId: entity2Id,
        relationshipType: "USES",
        description: "Entity1 uses Entity2",
        strength: 8,
        createdAt: 1700000000,
      });

      expect(rel.id).toBeDefined();
      expect(rel.relationshipType).toBe("USES");
      expect(rel.strength).toBe(8);
    });

    test("gets relationships for entity (both directions)", () => {
      storage.createRelationship({
        sourceEntityId: entity1Id,
        targetEntityId: entity2Id,
        relationshipType: "USES",
        strength: 8,
        createdAt: 1700000000,
      });

      const rels1 = storage.getRelationshipsForEntity(entity1Id, "both");
      const rels2 = storage.getRelationshipsForEntity(entity2Id, "both");

      expect(rels1.length).toBe(1);
      expect(rels2.length).toBe(1);
    });

    test("gets relationships for entity (source only)", () => {
      storage.createRelationship({
        sourceEntityId: entity1Id,
        targetEntityId: entity2Id,
        relationshipType: "USES",
        strength: 8,
        createdAt: 1700000000,
      });

      const rels = storage.getRelationshipsForEntity(entity1Id, "source");
      expect(rels.length).toBe(1);

      const emptyRels = storage.getRelationshipsForEntity(entity2Id, "source");
      expect(emptyRels.length).toBe(0);
    });

    test("finds specific relationship", () => {
      storage.createRelationship({
        sourceEntityId: entity1Id,
        targetEntityId: entity2Id,
        relationshipType: "USES",
        strength: 8,
        createdAt: 1700000000,
      });

      const found = storage.findRelationship(entity1Id, entity2Id, "USES");
      expect(found).not.toBeNull();
      expect(found?.relationshipType).toBe("USES");

      const notFound = storage.findRelationship(entity1Id, entity2Id, "OTHER");
      expect(notFound).toBeNull();
    });

    test("deletes relationship", () => {
      const rel = storage.createRelationship({
        sourceEntityId: entity1Id,
        targetEntityId: entity2Id,
        relationshipType: "USES",
        strength: 8,
        createdAt: 1700000000,
      });

      storage.deleteRelationship(rel.id);
      const found = storage.getRelationship(rel.id);
      expect(found).toBeNull();
    });
  });

  describe("Community Operations", () => {
    test("creates community", () => {
      const community = storage.createCommunity({
        level: 0,
        entityCount: 10,
        resolution: 1.0,
        modularity: 0.5,
        createdAt: 1700000000,
        updatedAt: 1700000000,
      });

      expect(community.id).toBeDefined();
      expect(community.level).toBe(0);
      expect(community.entityCount).toBe(10);
    });

    test("gets communities at level", () => {
      storage.createCommunity({
        level: 0,
        entityCount: 5,
        createdAt: 1700000000,
        updatedAt: 1700000000,
      });
      storage.createCommunity({
        level: 1,
        entityCount: 10,
        createdAt: 1700000000,
        updatedAt: 1700000000,
      });
      storage.createCommunity({
        level: 0,
        entityCount: 3,
        createdAt: 1700000000,
        updatedAt: 1700000000,
      });

      const level0 = storage.getCommunitiesAtLevel(0);
      expect(level0.length).toBe(2);

      const level1 = storage.getCommunitiesAtLevel(1);
      expect(level1.length).toBe(1);
    });

    test("adds entity to community", () => {
      const entity = storage.createEntity({
        canonicalName: "Test",
        entityType: "CONCEPT",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });

      const community = storage.createCommunity({
        level: 0,
        entityCount: 0,
        createdAt: 1700000000,
        updatedAt: 1700000000,
      });

      storage.addEntityToCommunity(community.id, entity.id);

      const entities = storage.getEntitiesInCommunity(community.id);
      expect(entities.length).toBe(1);
      expect(entities[0].id).toBe(entity.id);

      // Check entity count was updated
      const updatedCommunity = storage.getCommunity(community.id);
      expect(updatedCommunity?.entityCount).toBe(1);
    });

    test("gets communities for entity", () => {
      const entity = storage.createEntity({
        canonicalName: "Test",
        entityType: "CONCEPT",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });

      const comm1 = storage.createCommunity({
        level: 0,
        entityCount: 0,
        createdAt: 1700000000,
        updatedAt: 1700000000,
      });
      const comm2 = storage.createCommunity({
        level: 1,
        entityCount: 0,
        createdAt: 1700000000,
        updatedAt: 1700000000,
      });

      storage.addEntityToCommunity(comm1.id, entity.id);
      storage.addEntityToCommunity(comm2.id, entity.id);

      const communities = storage.getCommunitiesForEntity(entity.id);
      expect(communities.length).toBe(2);
    });
  });

  describe("Community Reports", () => {
    test("creates report", () => {
      const community = storage.createCommunity({
        level: 0,
        entityCount: 5,
        createdAt: 1700000000,
        updatedAt: 1700000000,
      });

      const report = storage.createReport({
        communityId: community.id,
        title: "Test Report",
        summary: "A test summary",
        fullContent: "Full content here",
        keyFindings: ["Finding 1", "Finding 2"],
        rating: 8,
        ratingExplanation: "Good quality",
        promptVersion: "v1",
        createdAt: 1700000000,
      });

      expect(report.id).toBeDefined();
      expect(report.title).toBe("Test Report");
      expect(report.keyFindings.length).toBe(2);
    });

    test("gets report by community", () => {
      const community = storage.createCommunity({
        level: 0,
        entityCount: 5,
        createdAt: 1700000000,
        updatedAt: 1700000000,
      });

      storage.createReport({
        communityId: community.id,
        title: "Test",
        summary: "Summary",
        fullContent: "Content",
        createdAt: 1700000000,
      });

      const report = storage.getReport(community.id);
      expect(report).not.toBeNull();
      expect(report?.title).toBe("Test");
    });

    test("deletes report", () => {
      const community = storage.createCommunity({
        level: 0,
        entityCount: 5,
        createdAt: 1700000000,
        updatedAt: 1700000000,
      });

      storage.createReport({
        communityId: community.id,
        title: "Test",
        summary: "Summary",
        fullContent: "Content",
        createdAt: 1700000000,
      });

      storage.deleteReport(community.id);
      const report = storage.getReport(community.id);
      expect(report).toBeNull();
    });
  });

  describe("Statistics", () => {
    test("gets correct stats", () => {
      // Create entities
      const e1 = storage.createEntity({
        canonicalName: "E1",
        entityType: "CONCEPT",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });
      const e2 = storage.createEntity({
        canonicalName: "E2",
        entityType: "TECHNOLOGY",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });

      // Create relationship
      storage.createRelationship({
        sourceEntityId: e1.id,
        targetEntityId: e2.id,
        relationshipType: "USES",
        strength: 5,
        createdAt: 1700000000,
      });

      // Create community and report
      const comm = storage.createCommunity({
        level: 0,
        entityCount: 2,
        createdAt: 1700000000,
        updatedAt: 1700000000,
      });

      storage.createReport({
        communityId: comm.id,
        title: "Test",
        summary: "Summary",
        fullContent: "Content",
        createdAt: 1700000000,
      });

      const stats = storage.getStats();
      expect(stats.entities).toBe(2);
      expect(stats.relationships).toBe(1);
      expect(stats.communities).toBe(1);
      expect(stats.reports).toBe(1);
    });

    test("gets entity type distribution", () => {
      storage.createEntity({
        canonicalName: "T1",
        entityType: "TECHNOLOGY",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });
      storage.createEntity({
        canonicalName: "T2",
        entityType: "TECHNOLOGY",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });
      storage.createEntity({
        canonicalName: "P1",
        entityType: "PERSON",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });

      const distribution = storage.getEntityTypeDistribution();
      expect(distribution.length).toBeGreaterThanOrEqual(2);

      const techEntry = distribution.find((d) => d.type === "TECHNOLOGY");
      expect(techEntry?.count).toBe(2);
    });
  });

  describe("Cleanup Operations", () => {
    test("clears all data", () => {
      storage.createEntity({
        canonicalName: "Test",
        entityType: "CONCEPT",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });

      storage.clearAll();

      const stats = storage.getStats();
      expect(stats.entities).toBe(0);
      expect(stats.relationships).toBe(0);
      expect(stats.communities).toBe(0);
      expect(stats.reports).toBe(0);
    });

    test("deletes orphaned entities", () => {
      const e1 = storage.createEntity({
        canonicalName: "WithMemory",
        entityType: "CONCEPT",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });
      const e2 = storage.createEntity({
        canonicalName: "Orphan",
        entityType: "CONCEPT",
        firstSeenAt: 1700000000,
        lastSeenAt: 1700000000,
      });

      // Link only e1 to a memory
      storage.linkEntityToMemory(e1.id, "mem_123", "mention", 0.9);

      const deleted = storage.deleteOrphanedEntities();
      expect(deleted).toBe(1);

      // e1 should still exist, e2 should be deleted
      expect(storage.getEntity(e1.id)).not.toBeNull();
      expect(storage.getEntity(e2.id)).toBeNull();
    });
  });
});
