/**
 * GraphRAG schema migration
 *
 * Creates tables for the GraphRAG enhancement layer:
 * - graphrag_entities: Named entities extracted from memories
 * - graphrag_relationships: Relationships between entities
 * - graphrag_relationship_sources: Junction table for relationship-memory links
 * - graphrag_communities: Leiden community assignments (hierarchical)
 * - graphrag_community_members: Junction table for community-entity membership
 * - graphrag_community_reports: LLM-generated community summaries
 * - graphrag_entity_memories: Junction table for entity-memory links
 */

import type { Migration, MigrationDatabase } from "./types";

export const migration012GraphRAG: Migration = {
  version: "012",
  name: "graphrag",
  destructive: false,

  up(db: MigrationDatabase): void {
    // Entities extracted from memories
    db.exec(`
      CREATE TABLE IF NOT EXISTS graphrag_entities (
        id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        description TEXT,
        mention_count INTEGER DEFAULT 1,
        extraction_confidence REAL DEFAULT 1.0,
        extraction_version TEXT,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        embedding_id TEXT,
        metadata TEXT DEFAULT '{}'
      )
    `);

    // Relationships between entities
    db.exec(`
      CREATE TABLE IF NOT EXISTS graphrag_relationships (
        id TEXT PRIMARY KEY,
        source_entity_id TEXT NOT NULL REFERENCES graphrag_entities(id) ON DELETE CASCADE,
        target_entity_id TEXT NOT NULL REFERENCES graphrag_entities(id) ON DELETE CASCADE,
        relationship_type TEXT NOT NULL,
        description TEXT,
        strength INTEGER CHECK(strength >= 1 AND strength <= 10),
        created_at INTEGER NOT NULL,
        UNIQUE(source_entity_id, target_entity_id, relationship_type)
      )
    `);

    // Relationship-memory linkage (junction table - replaces JSON array)
    db.exec(`
      CREATE TABLE IF NOT EXISTS graphrag_relationship_sources (
        relationship_id TEXT NOT NULL REFERENCES graphrag_relationships(id) ON DELETE CASCADE,
        memory_id TEXT NOT NULL,
        evidence_text TEXT,
        PRIMARY KEY(relationship_id, memory_id)
      )
    `);

    // Leiden community assignments (hierarchical)
    db.exec(`
      CREATE TABLE IF NOT EXISTS graphrag_communities (
        id TEXT PRIMARY KEY,
        level INTEGER NOT NULL,
        parent_id TEXT REFERENCES graphrag_communities(id) ON DELETE SET NULL,
        entity_count INTEGER DEFAULT 0,
        resolution REAL,
        modularity REAL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Community-entity membership (junction table - replaces JSON array)
    db.exec(`
      CREATE TABLE IF NOT EXISTS graphrag_community_members (
        community_id TEXT NOT NULL REFERENCES graphrag_communities(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL REFERENCES graphrag_entities(id) ON DELETE CASCADE,
        PRIMARY KEY(community_id, entity_id)
      )
    `);

    // LLM-generated community reports
    db.exec(`
      CREATE TABLE IF NOT EXISTS graphrag_community_reports (
        id TEXT PRIMARY KEY,
        community_id TEXT NOT NULL REFERENCES graphrag_communities(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        full_content TEXT NOT NULL,
        key_findings TEXT DEFAULT '[]',
        rating REAL,
        rating_explanation TEXT,
        prompt_version TEXT,
        embedding_id TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE(community_id)
      )
    `);

    // Entity-memory linkage (junction table)
    db.exec(`
      CREATE TABLE IF NOT EXISTS graphrag_entity_memories (
        entity_id TEXT NOT NULL REFERENCES graphrag_entities(id) ON DELETE CASCADE,
        memory_id TEXT NOT NULL,
        mention_text TEXT,
        confidence REAL DEFAULT 1.0,
        PRIMARY KEY(entity_id, memory_id)
      )
    `);

    // Create indexes for performance
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_graphrag_entities_name ON graphrag_entities(canonical_name)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_graphrag_entities_type ON graphrag_entities(entity_type)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_graphrag_entities_mentions ON graphrag_entities(mention_count DESC)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_graphrag_rel_source ON graphrag_relationships(source_entity_id)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_graphrag_rel_target ON graphrag_relationships(target_entity_id)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_graphrag_communities_level ON graphrag_communities(level)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_graphrag_communities_parent ON graphrag_communities(parent_id)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_graphrag_entity_memories_memory ON graphrag_entity_memories(memory_id)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_graphrag_community_members_entity ON graphrag_community_members(entity_id)",
    );
  },

  down(db: MigrationDatabase): void {
    // Drop indexes first
    db.exec("DROP INDEX IF EXISTS idx_graphrag_community_members_entity");
    db.exec("DROP INDEX IF EXISTS idx_graphrag_entity_memories_memory");
    db.exec("DROP INDEX IF EXISTS idx_graphrag_communities_parent");
    db.exec("DROP INDEX IF EXISTS idx_graphrag_communities_level");
    db.exec("DROP INDEX IF EXISTS idx_graphrag_rel_target");
    db.exec("DROP INDEX IF EXISTS idx_graphrag_rel_source");
    db.exec("DROP INDEX IF EXISTS idx_graphrag_entities_mentions");
    db.exec("DROP INDEX IF EXISTS idx_graphrag_entities_type");
    db.exec("DROP INDEX IF EXISTS idx_graphrag_entities_name");

    // Drop tables in reverse order (respecting foreign keys)
    db.exec("DROP TABLE IF EXISTS graphrag_entity_memories");
    db.exec("DROP TABLE IF EXISTS graphrag_community_reports");
    db.exec("DROP TABLE IF EXISTS graphrag_community_members");
    db.exec("DROP TABLE IF EXISTS graphrag_communities");
    db.exec("DROP TABLE IF EXISTS graphrag_relationship_sources");
    db.exec("DROP TABLE IF EXISTS graphrag_relationships");
    db.exec("DROP TABLE IF EXISTS graphrag_entities");
  },
};
