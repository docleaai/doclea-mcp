/**
 * Storage layer for cross-layer relation suggestions
 */

import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import type {
  CrossLayerDetectionMethod,
  CrossLayerDirection,
  CrossLayerRelationStorage,
  CrossLayerRelationType,
} from "./cross-layer-relations";

/**
 * Suggestion status
 */
export type CrossLayerSuggestionStatus = "pending" | "approved" | "rejected";

/**
 * Cross-layer suggestion interface
 */
export interface CrossLayerSuggestion {
  id: string;
  memoryId: string;
  codeNodeId: string;
  direction: CrossLayerDirection;
  suggestedType: CrossLayerRelationType;
  confidence: number;
  reason: string;
  detectionMethod: CrossLayerDetectionMethod;
  status: CrossLayerSuggestionStatus;
  createdAt: number;
  reviewedAt?: number;
}

/**
 * Database row for cross_layer_suggestions
 */
interface CrossLayerSuggestionRow {
  id: string;
  memory_id: string;
  code_node_id: string;
  direction: string;
  suggested_type: string;
  confidence: number;
  reason: string;
  detection_method: string;
  status: string;
  created_at: number;
  reviewed_at: number | null;
}

/**
 * Options for getting suggestions
 */
export interface GetCrossLayerSuggestionsOptions {
  memoryId?: string;
  codeNodeId?: string;
  direction?: CrossLayerDirection;
  detectionMethod?: CrossLayerDetectionMethod;
  minConfidence?: number;
  limit?: number;
  offset?: number;
}

/**
 * Result of bulk review operation
 */
export interface CrossLayerBulkReviewResult {
  processed: number;
  relationsCreated: number;
  failed: string[];
}

/**
 * Storage class for cross-layer relation suggestions
 */
export class CrossLayerSuggestionStorage {
  constructor(
    private db: Database,
    private relationStorage: CrossLayerRelationStorage,
  ) {}

  /**
   * Create a new suggestion
   */
  async createSuggestion(
    memoryId: string,
    codeNodeId: string,
    direction: CrossLayerDirection,
    suggestedType: CrossLayerRelationType,
    confidence: number,
    reason: string,
    detectionMethod: CrossLayerDetectionMethod,
  ): Promise<CrossLayerSuggestion> {
    const id = randomUUID();
    const createdAt = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(`
			INSERT INTO cross_layer_suggestions (
				id, memory_id, code_node_id, direction, suggested_type,
				confidence, reason, detection_method, status, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
			ON CONFLICT(memory_id, code_node_id, detection_method) DO UPDATE SET
				direction = excluded.direction,
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
      memoryId,
      codeNodeId,
      direction,
      suggestedType,
      confidence,
      reason,
      detectionMethod,
      createdAt,
    ) as CrossLayerSuggestionRow;

    return this.mapRow(result);
  }

  /**
   * Get a suggestion by ID
   */
  async getSuggestion(id: string): Promise<CrossLayerSuggestion | null> {
    const stmt = this.db.prepare(
      "SELECT * FROM cross_layer_suggestions WHERE id = ?",
    );
    const result = stmt.get(id) as CrossLayerSuggestionRow | undefined;
    return result ? this.mapRow(result) : null;
  }

  /**
   * Get pending suggestions with optional filters
   */
  async getPendingSuggestions(
    options: GetCrossLayerSuggestionsOptions = {},
  ): Promise<CrossLayerSuggestion[]> {
    let query =
      "SELECT * FROM cross_layer_suggestions WHERE status = 'pending'";
    const params: (string | number)[] = [];

    if (options.memoryId) {
      query += " AND memory_id = ?";
      params.push(options.memoryId);
    }

    if (options.codeNodeId) {
      query += " AND code_node_id = ?";
      params.push(options.codeNodeId);
    }

    if (options.direction) {
      query += " AND direction = ?";
      params.push(options.direction);
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
    const results = stmt.all(...params) as CrossLayerSuggestionRow[];
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

    // Create the cross-layer relation
    await this.relationStorage.createRelation({
      memoryId: suggestion.memoryId,
      codeNodeId: suggestion.codeNodeId,
      relationType: suggestion.suggestedType,
      direction: suggestion.direction,
      confidence: suggestion.confidence,
      metadata: {
        detectionMethod: suggestion.detectionMethod,
        reason: suggestion.reason,
      },
    });

    // Update suggestion status
    const reviewedAt = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(
      "UPDATE cross_layer_suggestions SET status = 'approved', reviewed_at = ? WHERE id = ?",
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
      "UPDATE cross_layer_suggestions SET status = 'rejected', reviewed_at = ? WHERE id = ?",
    );
    const result = stmt.run(reviewedAt, id);
    return result.changes > 0;
  }

  /**
   * Bulk approve suggestions
   */
  async bulkApprove(ids: string[]): Promise<CrossLayerBulkReviewResult> {
    const result: CrossLayerBulkReviewResult = {
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
      } catch {
        result.failed.push(id);
      }
    }

    return result;
  }

  /**
   * Bulk reject suggestions
   */
  async bulkReject(ids: string[]): Promise<CrossLayerBulkReviewResult> {
    const result: CrossLayerBulkReviewResult = {
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
      } catch {
        result.failed.push(id);
      }
    }

    return result;
  }

  /**
   * Check if a suggestion already exists
   */
  async suggestionExists(
    memoryId: string,
    codeNodeId: string,
    detectionMethod: CrossLayerDetectionMethod,
  ): Promise<boolean> {
    const stmt = this.db.prepare(`
			SELECT 1 FROM cross_layer_suggestions
			WHERE memory_id = ? AND code_node_id = ? AND detection_method = ?
			LIMIT 1
		`);
    const result = stmt.get(memoryId, codeNodeId, detectionMethod);
    return !!result;
  }

  /**
   * Delete all suggestions for a memory
   */
  async deleteSuggestionsForMemory(memoryId: string): Promise<number> {
    const stmt = this.db.prepare(
      "DELETE FROM cross_layer_suggestions WHERE memory_id = ?",
    );
    const result = stmt.run(memoryId);
    return result.changes;
  }

  /**
   * Delete all suggestions for a code node
   */
  async deleteSuggestionsForCodeNode(codeNodeId: string): Promise<number> {
    const stmt = this.db.prepare(
      "DELETE FROM cross_layer_suggestions WHERE code_node_id = ?",
    );
    const result = stmt.run(codeNodeId);
    return result.changes;
  }

  /**
   * Get count of pending suggestions
   */
  async getPendingCount(): Promise<number> {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM cross_layer_suggestions WHERE status = 'pending'",
    );
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Map database row to CrossLayerSuggestion
   */
  private mapRow(row: CrossLayerSuggestionRow): CrossLayerSuggestion {
    return {
      id: row.id,
      memoryId: row.memory_id,
      codeNodeId: row.code_node_id,
      direction: row.direction as CrossLayerDirection,
      suggestedType: row.suggested_type as CrossLayerRelationType,
      confidence: row.confidence,
      reason: row.reason,
      detectionMethod: row.detection_method as CrossLayerDetectionMethod,
      status: row.status as CrossLayerSuggestionStatus,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at ?? undefined,
    };
  }
}
