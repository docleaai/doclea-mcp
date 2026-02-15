/**
 * GraphRAG Storage Class
 *
 * Provides CRUD operations for GraphRAG entities, relationships,
 * communities, and reports. Follows the code-graph.ts pattern.
 */

import type { Database } from "bun:sqlite";
import { nanoid } from "nanoid";
import type {
  Community,
  CommunityReport,
  Entity,
  EntityMemory,
  GraphRAGStats,
  Relationship,
  RelationshipSource,
} from "../types";

type CreateEntityInput = Pick<Entity, "canonicalName" | "entityType"> &
  Partial<Omit<Entity, "id" | "canonicalName" | "entityType" | "metadata">> & {
    metadata?: Record<string, unknown>;
  };

type CreateCommunityReportInput = Pick<
  CommunityReport,
  "communityId" | "title" | "summary" | "fullContent"
> &
  Partial<Pick<CommunityReport, "id">> &
  Partial<
    Omit<CommunityReport, "communityId" | "title" | "summary" | "fullContent">
  >;

export class GraphRAGStorage {
  constructor(private db: Database) {}

  // ============================================================================
  // Entity Operations
  // ============================================================================

  createEntity(entity: CreateEntityInput): Entity {
    const id = nanoid();
    const now = Math.floor(Date.now() / 1000);

    this.db
      .query(
        `INSERT INTO graphrag_entities (
          id, canonical_name, entity_type, description, mention_count,
          extraction_confidence, extraction_version, first_seen_at, last_seen_at,
          embedding_id, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        entity.canonicalName,
        entity.entityType,
        entity.description ?? null,
        entity.mentionCount ?? 1,
        entity.extractionConfidence ?? 1.0,
        entity.extractionVersion ?? null,
        entity.firstSeenAt ?? now,
        entity.lastSeenAt ?? now,
        entity.embeddingId ?? null,
        JSON.stringify(entity.metadata ?? {}),
      );

    return {
      id,
      canonicalName: entity.canonicalName,
      entityType: entity.entityType,
      description: entity.description,
      mentionCount: entity.mentionCount ?? 1,
      extractionConfidence: entity.extractionConfidence ?? 1.0,
      extractionVersion: entity.extractionVersion,
      firstSeenAt: entity.firstSeenAt ?? now,
      lastSeenAt: entity.lastSeenAt ?? now,
      embeddingId: entity.embeddingId,
      metadata: entity.metadata ?? {},
    };
  }

  getEntity(id: string): Entity | null {
    const row = this.db
      .query("SELECT * FROM graphrag_entities WHERE id = ?")
      .get(id) as any;
    return row ? this.rowToEntity(row) : null;
  }

  getEntityByName(canonicalName: string): Entity | null {
    const row = this.db
      .query(
        "SELECT * FROM graphrag_entities WHERE canonical_name = ? COLLATE NOCASE LIMIT 1",
      )
      .get(canonicalName) as any;
    return row ? this.rowToEntity(row) : null;
  }

  updateEntity(id: string, updates: Partial<Entity>): Entity | null {
    const existing = this.getEntity(id);
    if (!existing) return null;

    const now = Math.floor(Date.now() / 1000);

    // Build SET clause dynamically
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.canonicalName !== undefined) {
      setClauses.push("canonical_name = ?");
      values.push(updates.canonicalName);
    }
    if (updates.entityType !== undefined) {
      setClauses.push("entity_type = ?");
      values.push(updates.entityType);
    }
    if (updates.description !== undefined) {
      setClauses.push("description = ?");
      values.push(updates.description);
    }
    if (updates.mentionCount !== undefined) {
      setClauses.push("mention_count = ?");
      values.push(updates.mentionCount);
    }
    if (updates.extractionConfidence !== undefined) {
      setClauses.push("extraction_confidence = ?");
      values.push(updates.extractionConfidence);
    }
    if (updates.lastSeenAt !== undefined) {
      setClauses.push("last_seen_at = ?");
      values.push(updates.lastSeenAt);
    }
    if (updates.embeddingId !== undefined) {
      setClauses.push("embedding_id = ?");
      values.push(updates.embeddingId);
    }
    if (updates.metadata !== undefined) {
      setClauses.push("metadata = ?");
      values.push(JSON.stringify(updates.metadata));
    }

    if (setClauses.length === 0) return existing;

    values.push(id);
    this.db
      .query(
        `UPDATE graphrag_entities SET ${setClauses.join(", ")} WHERE id = ?`,
      )
      .run(...values);

    return this.getEntity(id);
  }

  deleteEntity(id: string): void {
    this.db.query("DELETE FROM graphrag_entities WHERE id = ?").run(id);
  }

  listEntities(options?: {
    type?: string;
    limit?: number;
    offset?: number;
  }): Entity[] {
    let query = "SELECT * FROM graphrag_entities";
    const params: any[] = [];

    if (options?.type) {
      query += " WHERE entity_type = ?";
      params.push(options.type);
    }

    query += " ORDER BY mention_count DESC";

    if (options?.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }
    if (options?.offset) {
      query += " OFFSET ?";
      params.push(options.offset);
    }

    const rows = this.db.query(query).all(...params) as any[];
    return rows.map((row) => this.rowToEntity(row));
  }

  // ============================================================================
  // Entity-Memory Linkage
  // ============================================================================

  linkEntityToMemory(
    entityId: string,
    memoryId: string,
    mentionText: string,
    confidence: number,
  ): void {
    this.db
      .query(
        `INSERT INTO graphrag_entity_memories (entity_id, memory_id, mention_text, confidence)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(entity_id, memory_id) DO UPDATE SET
           mention_text = excluded.mention_text,
           confidence = excluded.confidence`,
      )
      .run(entityId, memoryId, mentionText, confidence);
  }

  unlinkEntityFromMemory(entityId: string, memoryId: string): void {
    this.db
      .query(
        "DELETE FROM graphrag_entity_memories WHERE entity_id = ? AND memory_id = ?",
      )
      .run(entityId, memoryId);
  }

  getEntitiesForMemory(memoryId: string): Entity[] {
    const rows = this.db
      .query(
        `SELECT e.* FROM graphrag_entities e
         JOIN graphrag_entity_memories em ON e.id = em.entity_id
         WHERE em.memory_id = ?`,
      )
      .all(memoryId) as any[];
    return rows.map((row) => this.rowToEntity(row));
  }

  getMemoriesForEntity(entityId: string): EntityMemory[] {
    const rows = this.db
      .query("SELECT * FROM graphrag_entity_memories WHERE entity_id = ?")
      .all(entityId) as any[];
    return rows.map((row) => ({
      entityId: row.entity_id,
      memoryId: row.memory_id,
      mentionText: row.mention_text,
      confidence: row.confidence,
    }));
  }

  // ============================================================================
  // Relationship Operations
  // ============================================================================

  createRelationship(rel: Omit<Relationship, "id">): Relationship {
    const id = nanoid();
    const now = Math.floor(Date.now() / 1000);

    this.db
      .query(
        `INSERT INTO graphrag_relationships (
          id, source_entity_id, target_entity_id, relationship_type,
          description, strength, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        rel.sourceEntityId,
        rel.targetEntityId,
        rel.relationshipType,
        rel.description ?? null,
        rel.strength,
        rel.createdAt ?? now,
      );

    return {
      id,
      sourceEntityId: rel.sourceEntityId,
      targetEntityId: rel.targetEntityId,
      relationshipType: rel.relationshipType,
      description: rel.description,
      strength: rel.strength,
      createdAt: rel.createdAt ?? now,
    };
  }

  getRelationship(id: string): Relationship | null {
    const row = this.db
      .query("SELECT * FROM graphrag_relationships WHERE id = ?")
      .get(id) as any;
    return row ? this.rowToRelationship(row) : null;
  }

  getRelationshipsForEntity(
    entityId: string,
    direction: "source" | "target" | "both" = "both",
  ): Relationship[] {
    let query: string;
    let params: string[];

    switch (direction) {
      case "source":
        query =
          "SELECT * FROM graphrag_relationships WHERE source_entity_id = ?";
        params = [entityId];
        break;
      case "target":
        query =
          "SELECT * FROM graphrag_relationships WHERE target_entity_id = ?";
        params = [entityId];
        break;
      default:
        query =
          "SELECT * FROM graphrag_relationships WHERE source_entity_id = ? OR target_entity_id = ?";
        params = [entityId, entityId];
        break;
    }

    const rows = this.db.query(query).all(...params) as any[];
    return rows.map((row) => this.rowToRelationship(row));
  }

  findRelationship(
    sourceId: string,
    targetId: string,
    relationshipType: string,
  ): Relationship | null {
    const row = this.db
      .query(
        `SELECT * FROM graphrag_relationships
         WHERE source_entity_id = ? AND target_entity_id = ? AND relationship_type = ?`,
      )
      .get(sourceId, targetId, relationshipType) as any;
    return row ? this.rowToRelationship(row) : null;
  }

  deleteRelationship(id: string): void {
    this.db.query("DELETE FROM graphrag_relationships WHERE id = ?").run(id);
  }

  // ============================================================================
  // Relationship-Memory Linkage
  // ============================================================================

  linkRelationshipToMemory(
    relationshipId: string,
    memoryId: string,
    evidenceText: string,
  ): void {
    this.db
      .query(
        `INSERT INTO graphrag_relationship_sources (relationship_id, memory_id, evidence_text)
         VALUES (?, ?, ?)
         ON CONFLICT(relationship_id, memory_id) DO UPDATE SET
           evidence_text = excluded.evidence_text`,
      )
      .run(relationshipId, memoryId, evidenceText);
  }

  getRelationshipSources(relationshipId: string): RelationshipSource[] {
    const rows = this.db
      .query(
        "SELECT * FROM graphrag_relationship_sources WHERE relationship_id = ?",
      )
      .all(relationshipId) as any[];
    return rows.map((row) => ({
      relationshipId: row.relationship_id,
      memoryId: row.memory_id,
      evidenceText: row.evidence_text,
    }));
  }

  // ============================================================================
  // Community Operations
  // ============================================================================

  createCommunity(community: Omit<Community, "id">): Community {
    const id = nanoid();
    const now = Math.floor(Date.now() / 1000);

    this.db
      .query(
        `INSERT INTO graphrag_communities (
          id, level, parent_id, entity_count, resolution, modularity,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        community.level,
        community.parentId ?? null,
        community.entityCount ?? 0,
        community.resolution ?? null,
        community.modularity ?? null,
        community.createdAt ?? now,
        community.updatedAt ?? now,
      );

    return {
      id,
      level: community.level,
      parentId: community.parentId,
      entityCount: community.entityCount ?? 0,
      resolution: community.resolution,
      modularity: community.modularity,
      createdAt: community.createdAt ?? now,
      updatedAt: community.updatedAt ?? now,
    };
  }

  getCommunity(id: string): Community | null {
    const row = this.db
      .query("SELECT * FROM graphrag_communities WHERE id = ?")
      .get(id) as any;
    return row ? this.rowToCommunity(row) : null;
  }

  getCommunitiesAtLevel(level: number): Community[] {
    const rows = this.db
      .query("SELECT * FROM graphrag_communities WHERE level = ?")
      .all(level) as any[];
    return rows.map((row) => this.rowToCommunity(row));
  }

  updateCommunity(id: string, updates: Partial<Community>): Community | null {
    const existing = this.getCommunity(id);
    if (!existing) return null;

    const now = Math.floor(Date.now() / 1000);
    const setClauses: string[] = ["updated_at = ?"];
    const values: any[] = [now];

    if (updates.entityCount !== undefined) {
      setClauses.push("entity_count = ?");
      values.push(updates.entityCount);
    }
    if (updates.modularity !== undefined) {
      setClauses.push("modularity = ?");
      values.push(updates.modularity);
    }
    if (updates.parentId !== undefined) {
      setClauses.push("parent_id = ?");
      values.push(updates.parentId);
    }

    values.push(id);
    this.db
      .query(
        `UPDATE graphrag_communities SET ${setClauses.join(", ")} WHERE id = ?`,
      )
      .run(...values);

    return this.getCommunity(id);
  }

  addEntityToCommunity(communityId: string, entityId: string): void {
    this.db
      .query(
        `INSERT INTO graphrag_community_members (community_id, entity_id)
         VALUES (?, ?)
         ON CONFLICT(community_id, entity_id) DO NOTHING`,
      )
      .run(communityId, entityId);

    // Update entity count
    const count = (
      this.db
        .query(
          "SELECT COUNT(*) as count FROM graphrag_community_members WHERE community_id = ?",
        )
        .get(communityId) as any
    ).count;

    this.db
      .query("UPDATE graphrag_communities SET entity_count = ? WHERE id = ?")
      .run(count, communityId);
  }

  removeEntityFromCommunity(communityId: string, entityId: string): void {
    this.db
      .query(
        "DELETE FROM graphrag_community_members WHERE community_id = ? AND entity_id = ?",
      )
      .run(communityId, entityId);
  }

  getEntitiesInCommunity(communityId: string): Entity[] {
    const rows = this.db
      .query(
        `SELECT e.* FROM graphrag_entities e
         JOIN graphrag_community_members cm ON e.id = cm.entity_id
         WHERE cm.community_id = ?`,
      )
      .all(communityId) as any[];
    return rows.map((row) => this.rowToEntity(row));
  }

  getCommunitiesForEntity(entityId: string): Community[] {
    const rows = this.db
      .query(
        `SELECT c.* FROM graphrag_communities c
         JOIN graphrag_community_members cm ON c.id = cm.community_id
         WHERE cm.entity_id = ?`,
      )
      .all(entityId) as any[];
    return rows.map((row) => this.rowToCommunity(row));
  }

  // ============================================================================
  // Community Reports
  // ============================================================================

  createReport(report: CreateCommunityReportInput): CommunityReport {
    const id = report.id ?? nanoid();
    const now = Math.floor(Date.now() / 1000);

    this.db
      .query(
        `INSERT INTO graphrag_community_reports (
          id, community_id, title, summary, full_content, key_findings,
          rating, rating_explanation, prompt_version, embedding_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        report.communityId,
        report.title,
        report.summary,
        report.fullContent,
        JSON.stringify(report.keyFindings ?? []),
        report.rating ?? null,
        report.ratingExplanation ?? null,
        report.promptVersion ?? null,
        report.embeddingId ?? null,
        report.createdAt ?? now,
      );

    return {
      id,
      communityId: report.communityId,
      title: report.title,
      summary: report.summary,
      fullContent: report.fullContent,
      keyFindings: report.keyFindings ?? [],
      rating: report.rating,
      ratingExplanation: report.ratingExplanation,
      promptVersion: report.promptVersion,
      embeddingId: report.embeddingId,
      createdAt: report.createdAt ?? now,
    };
  }

  getReport(communityId: string): CommunityReport | null {
    const row = this.db
      .query("SELECT * FROM graphrag_community_reports WHERE community_id = ?")
      .get(communityId) as any;
    return row ? this.rowToReport(row) : null;
  }

  getReportById(id: string): CommunityReport | null {
    const row = this.db
      .query("SELECT * FROM graphrag_community_reports WHERE id = ?")
      .get(id) as any;
    return row ? this.rowToReport(row) : null;
  }

  getAllReports(): CommunityReport[] {
    const rows = this.db
      .query("SELECT * FROM graphrag_community_reports")
      .all() as any[];
    return rows.map((row) => this.rowToReport(row));
  }

  deleteReport(communityId: string): void {
    this.db
      .query("DELETE FROM graphrag_community_reports WHERE community_id = ?")
      .run(communityId);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  getStats(): GraphRAGStats {
    const entities = (
      this.db
        .query("SELECT COUNT(*) as count FROM graphrag_entities")
        .get() as any
    ).count;
    const relationships = (
      this.db
        .query("SELECT COUNT(*) as count FROM graphrag_relationships")
        .get() as any
    ).count;
    const communities = (
      this.db
        .query("SELECT COUNT(*) as count FROM graphrag_communities")
        .get() as any
    ).count;
    const reports = (
      this.db
        .query("SELECT COUNT(*) as count FROM graphrag_community_reports")
        .get() as any
    ).count;

    return { entities, relationships, communities, reports };
  }

  getEntityTypeDistribution(): Array<{ type: string; count: number }> {
    const rows = this.db
      .query(
        "SELECT entity_type as type, COUNT(*) as count FROM graphrag_entities GROUP BY entity_type ORDER BY count DESC",
      )
      .all() as any[];
    return rows;
  }

  // ============================================================================
  // Cleanup Operations
  // ============================================================================

  clearAll(): void {
    this.db.query("DELETE FROM graphrag_entity_memories").run();
    this.db.query("DELETE FROM graphrag_community_reports").run();
    this.db.query("DELETE FROM graphrag_community_members").run();
    this.db.query("DELETE FROM graphrag_communities").run();
    this.db.query("DELETE FROM graphrag_relationship_sources").run();
    this.db.query("DELETE FROM graphrag_relationships").run();
    this.db.query("DELETE FROM graphrag_entities").run();
  }

  clearCommunities(): void {
    this.db.query("DELETE FROM graphrag_community_reports").run();
    this.db.query("DELETE FROM graphrag_community_members").run();
    this.db.query("DELETE FROM graphrag_communities").run();
  }

  deleteOrphanedEntities(): number {
    const result = this.db
      .query(
        `DELETE FROM graphrag_entities
         WHERE id NOT IN (SELECT entity_id FROM graphrag_entity_memories)`,
      )
      .run();
    return result.changes;
  }

  deleteEntitiesForMemory(memoryId: string): void {
    // First, get entity IDs that are only linked to this memory
    const orphanedEntityIds = this.db
      .query(
        `SELECT em.entity_id FROM graphrag_entity_memories em
         WHERE em.memory_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM graphrag_entity_memories em2
           WHERE em2.entity_id = em.entity_id AND em2.memory_id != ?
         )`,
      )
      .all(memoryId, memoryId) as any[];

    // Delete entity-memory links for this memory
    this.db
      .query("DELETE FROM graphrag_entity_memories WHERE memory_id = ?")
      .run(memoryId);

    // Delete relationship sources for this memory
    this.db
      .query("DELETE FROM graphrag_relationship_sources WHERE memory_id = ?")
      .run(memoryId);

    // Delete orphaned entities (entities that were only in this memory)
    for (const { entity_id } of orphanedEntityIds) {
      this.deleteEntity(entity_id);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private rowToEntity(row: any): Entity {
    return {
      id: row.id,
      canonicalName: row.canonical_name,
      entityType: row.entity_type,
      description: row.description,
      mentionCount: row.mention_count,
      extractionConfidence: row.extraction_confidence,
      extractionVersion: row.extraction_version,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      embeddingId: row.embedding_id,
      metadata: JSON.parse(row.metadata || "{}"),
    };
  }

  private rowToRelationship(row: any): Relationship {
    return {
      id: row.id,
      sourceEntityId: row.source_entity_id,
      targetEntityId: row.target_entity_id,
      relationshipType: row.relationship_type,
      description: row.description,
      strength: row.strength,
      createdAt: row.created_at,
    };
  }

  private rowToCommunity(row: any): Community {
    return {
      id: row.id,
      level: row.level,
      parentId: row.parent_id,
      entityCount: row.entity_count,
      resolution: row.resolution,
      modularity: row.modularity,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToReport(row: any): CommunityReport {
    return {
      id: row.id,
      communityId: row.community_id,
      title: row.title,
      summary: row.summary,
      fullContent: row.full_content,
      keyFindings: JSON.parse(row.key_findings || "[]"),
      rating: row.rating,
      ratingExplanation: row.rating_explanation,
      promptVersion: row.prompt_version,
      embeddingId: row.embedding_id,
      createdAt: row.created_at,
    };
  }
}
