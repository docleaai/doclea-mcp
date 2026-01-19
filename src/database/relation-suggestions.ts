/**
 * Storage layer for relation suggestions
 */

import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import type {
  BulkReviewResult,
  DetectionMethod,
  ExtendedRelationType,
  GetSuggestionsOptions,
  RelationSuggestion,
  SuggestionStatus,
} from "@/relations/types";
import type {
  MemoryRelationStorage,
  MemoryRelationType,
} from "./memory-relations";

/**
 * Database row for relation_suggestions
 */
interface SuggestionRow {
  id: string;
  source_id: string;
  target_id: string;
  suggested_type: string;
  confidence: number;
  reason: string;
  detection_method: string;
  status: string;
  created_at: number;
  reviewed_at: number | null;
}

/**
 * Storage class for managing relation suggestions
 */
export class RelationSuggestionStorage {
  constructor(
    private db: Database,
    private relationStorage: MemoryRelationStorage,
  ) {}

  /**
   * Create a new suggestion
   */
  async createSuggestion(
    sourceId: string,
    targetId: string,
    suggestedType: ExtendedRelationType,
    confidence: number,
    reason: string,
    detectionMethod: DetectionMethod,
  ): Promise<RelationSuggestion> {
    const id = randomUUID();
    const createdAt = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(`
			INSERT INTO relation_suggestions (
				id, source_id, target_id, suggested_type, confidence,
				reason, detection_method, status, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
			ON CONFLICT(source_id, target_id, detection_method) DO UPDATE SET
				suggested_type = excluded.suggested_type,
				confidence = excluded.confidence,
				reason = excluded.reason,
				status = 'pending',
				created_at = excluded.created_at,
				reviewed_at = NULL
			RETURNING *
		`);

    const result = stmt.get(
      id,
      sourceId,
      targetId,
      suggestedType,
      confidence,
      reason,
      detectionMethod,
      createdAt,
    ) as SuggestionRow;

    return this.mapRow(result);
  }

  /**
   * Get a suggestion by ID
   */
  async getSuggestion(id: string): Promise<RelationSuggestion | null> {
    const stmt = this.db.prepare(
      "SELECT * FROM relation_suggestions WHERE id = ?",
    );
    const result = stmt.get(id) as SuggestionRow | undefined;
    return result ? this.mapRow(result) : null;
  }

  /**
   * Get pending suggestions with optional filters
   */
  async getPendingSuggestions(
    options: GetSuggestionsOptions = {},
  ): Promise<RelationSuggestion[]> {
    let query = "SELECT * FROM relation_suggestions WHERE status = 'pending'";
    const params: (string | number)[] = [];

    if (options.sourceId) {
      query += " AND source_id = ?";
      params.push(options.sourceId);
    }

    if (options.targetId) {
      query += " AND target_id = ?";
      params.push(options.targetId);
    }

    if (options.detectionMethod) {
      query += " AND detection_method = ?";
      params.push(options.detectionMethod);
    }

    if (options.minConfidence !== undefined) {
      query += " AND confidence >= ?";
      params.push(options.minConfidence);
    }

    query += " ORDER BY confidence DESC, created_at DESC";

    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    if (options.offset) {
      query += " OFFSET ?";
      params.push(options.offset);
    }

    const stmt = this.db.prepare(query);
    const results = stmt.all(...params) as SuggestionRow[];
    return results.map((r) => this.mapRow(r));
  }

  /**
   * Approve a suggestion and create the relation
   */
  async approveSuggestion(id: string): Promise<boolean> {
    const suggestion = await this.getSuggestion(id);
    if (!suggestion || suggestion.status !== "pending") {
      return false;
    }

    // Create the relation
    // Map extended types to base types if needed
    const relationType = this.mapExtendedTypeToBase(suggestion.suggestedType);
    await this.relationStorage.createRelation(
      suggestion.sourceId,
      suggestion.targetId,
      relationType,
      suggestion.confidence,
      {
        detectionMethod: suggestion.detectionMethod,
        reason: suggestion.reason,
        autoApproved: false,
      },
    );

    // Update suggestion status
    const reviewedAt = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(
      "UPDATE relation_suggestions SET status = 'approved', reviewed_at = ? WHERE id = ?",
    );
    stmt.run(reviewedAt, id);

    return true;
  }

  /**
   * Reject a suggestion
   */
  async rejectSuggestion(id: string): Promise<boolean> {
    const suggestion = await this.getSuggestion(id);
    if (!suggestion || suggestion.status !== "pending") {
      return false;
    }

    const reviewedAt = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(
      "UPDATE relation_suggestions SET status = 'rejected', reviewed_at = ? WHERE id = ?",
    );
    const result = stmt.run(reviewedAt, id);
    return result.changes > 0;
  }

  /**
   * Bulk approve suggestions
   */
  async bulkApprove(ids: string[]): Promise<BulkReviewResult> {
    const result: BulkReviewResult = {
      processed: 0,
      relationsCreated: 0,
      failed: [],
    };

    for (const id of ids) {
      try {
        const approved = await this.approveSuggestion(id);
        if (approved) {
          result.processed++;
          result.relationsCreated++;
        } else {
          result.failed.push(id);
        }
      } catch (_error) {
        result.failed.push(id);
      }
    }

    return result;
  }

  /**
   * Bulk reject suggestions
   */
  async bulkReject(ids: string[]): Promise<BulkReviewResult> {
    const result: BulkReviewResult = {
      processed: 0,
      relationsCreated: 0,
      failed: [],
    };

    for (const id of ids) {
      try {
        const rejected = await this.rejectSuggestion(id);
        if (rejected) {
          result.processed++;
        } else {
          result.failed.push(id);
        }
      } catch (_error) {
        result.failed.push(id);
      }
    }

    return result;
  }

  /**
   * Check if a suggestion already exists for a source/target/method combination
   */
  async suggestionExists(
    sourceId: string,
    targetId: string,
    detectionMethod: DetectionMethod,
  ): Promise<boolean> {
    const stmt = this.db.prepare(`
			SELECT 1 FROM relation_suggestions
			WHERE source_id = ? AND target_id = ? AND detection_method = ?
			LIMIT 1
		`);
    const result = stmt.get(sourceId, targetId, detectionMethod);
    return !!result;
  }

  /**
   * Delete all suggestions for a memory (cascade helper)
   */
  async deleteSuggestionsForMemory(memoryId: string): Promise<number> {
    const stmt = this.db.prepare(
      "DELETE FROM relation_suggestions WHERE source_id = ? OR target_id = ?",
    );
    const result = stmt.run(memoryId, memoryId);
    return result.changes;
  }

  /**
   * Get count of pending suggestions
   */
  async getPendingCount(): Promise<number> {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM relation_suggestions WHERE status = 'pending'",
    );
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Map extended relation types to base types
   * New types "causes" and "solves" map to "references" for now
   */
  private mapExtendedTypeToBase(
    type: ExtendedRelationType,
  ): MemoryRelationType {
    switch (type) {
      case "causes":
      case "solves":
        return "references";
      default:
        return type as MemoryRelationType;
    }
  }

  /**
   * Map database row to RelationSuggestion
   */
  private mapRow(row: SuggestionRow): RelationSuggestion {
    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      suggestedType: row.suggested_type as ExtendedRelationType,
      confidence: row.confidence,
      reason: row.reason,
      detectionMethod: row.detection_method as DetectionMethod,
      status: row.status as SuggestionStatus,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at ?? undefined,
    };
  }
}
