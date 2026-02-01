/**
 * Database migrations module
 *
 * Exports the migration runner and all migration definitions
 */

export { MigrationRunner } from "./runner";
export type {
  Migration,
  MigrationDatabase,
  MigrationOptions,
  MigrationResult,
  MigrationStatus,
} from "./types";

// Import all migrations
import { migration001Initial } from "./001_initial";
import { migration002CodeGraph } from "./002_code_graph";
import { migration003MemoryRelations } from "./003_memory_relations";
import { migration004RelationSuggestions } from "./004_relation_suggestions";
import { migration005CrossLayerRelations } from "./005_cross_layer_relations";
import { migration006PendingMemories } from "./006_pending_memories";
import { migration007AccessTracking } from "./007_access_tracking";
import { migration008TagTaxonomy } from "./008_tag_taxonomy";
import { migration009BackfillTags } from "./009_backfill_tags";
import { migration010ReviewStatus } from "./010_review_status";
import { migration011ConfidenceDecay } from "./011_confidence_decay";
import { migration012GraphRAG } from "./012_graphrag";

/**
 * All migrations in version order
 * Add new migrations here as they are created
 */
export const migrations = [
  migration001Initial,
  migration002CodeGraph,
  migration003MemoryRelations,
  migration004RelationSuggestions,
  migration005CrossLayerRelations,
  migration006PendingMemories,
  migration007AccessTracking,
  migration008TagTaxonomy,
  migration009BackfillTags,
  migration010ReviewStatus,
  migration011ConfidenceDecay,
  migration012GraphRAG,
];

/**
 * Create a migration runner with all defined migrations
 */
export function createMigrationRunner(
  dbPath: string,
): import("./runner").MigrationRunner {
  const { MigrationRunner } = require("./runner");
  return new MigrationRunner(dbPath, migrations);
}
