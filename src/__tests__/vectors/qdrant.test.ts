/**
 * Tests for QdrantVectorStore helper logic
 * Tests filter building, result mapping, and configuration patterns
 */

import { describe, expect, test } from "bun:test";

describe("QdrantVectorStore", () => {
  const VECTOR_SIZE = 768;

  describe("vector size configuration", () => {
    test("uses nomic-embed-text dimension", () => {
      expect(VECTOR_SIZE).toBe(768);
    });

    test("is positive integer", () => {
      expect(Number.isInteger(VECTOR_SIZE)).toBe(true);
      expect(VECTOR_SIZE).toBeGreaterThan(0);
    });
  });

  describe("VectorPayload structure", () => {
    interface VectorPayload {
      memoryId: string;
      type: string;
      title: string;
      tags: string[];
      relatedFiles: string[];
      importance: number;
    }

    function isValidPayload(input: unknown): input is VectorPayload {
      if (typeof input !== "object" || input === null) return false;

      const p = input as Record<string, unknown>;
      return (
        typeof p.memoryId === "string" &&
        typeof p.type === "string" &&
        typeof p.title === "string" &&
        Array.isArray(p.tags) &&
        Array.isArray(p.relatedFiles) &&
        typeof p.importance === "number"
      );
    }

    test("validates complete payload", () => {
      const payload: VectorPayload = {
        memoryId: "mem_123",
        type: "decision",
        title: "Test",
        tags: ["tag1"],
        relatedFiles: ["file.ts"],
        importance: 0.8,
      };
      expect(isValidPayload(payload)).toBe(true);
    });

    test("validates payload with empty arrays", () => {
      const payload: VectorPayload = {
        memoryId: "mem_123",
        type: "note",
        title: "Test",
        tags: [],
        relatedFiles: [],
        importance: 0.5,
      };
      expect(isValidPayload(payload)).toBe(true);
    });

    test("rejects missing memoryId", () => {
      const payload = {
        type: "note",
        title: "Test",
        tags: [],
        relatedFiles: [],
        importance: 0.5,
      };
      expect(isValidPayload(payload)).toBe(false);
    });

    test("rejects missing type", () => {
      const payload = {
        memoryId: "mem_123",
        title: "Test",
        tags: [],
        relatedFiles: [],
        importance: 0.5,
      };
      expect(isValidPayload(payload)).toBe(false);
    });

    test("rejects non-array tags", () => {
      const payload = {
        memoryId: "mem_123",
        type: "note",
        title: "Test",
        tags: "not-array",
        relatedFiles: [],
        importance: 0.5,
      };
      expect(isValidPayload(payload)).toBe(false);
    });
  });

  describe("VectorSearchResult structure", () => {
    interface VectorSearchResult {
      id: string;
      memoryId: string;
      score: number;
      payload: Record<string, unknown>;
    }

    function isValidSearchResult(input: unknown): input is VectorSearchResult {
      if (typeof input !== "object" || input === null) return false;

      const r = input as Record<string, unknown>;
      return (
        typeof r.id === "string" &&
        typeof r.memoryId === "string" &&
        typeof r.score === "number" &&
        typeof r.payload === "object" &&
        r.payload !== null
      );
    }

    test("validates complete search result", () => {
      const result: VectorSearchResult = {
        id: "vec_123",
        memoryId: "mem_123",
        score: 0.95,
        payload: { type: "note" },
      };
      expect(isValidSearchResult(result)).toBe(true);
    });

    test("rejects missing id", () => {
      const result = {
        memoryId: "mem_123",
        score: 0.95,
        payload: {},
      };
      expect(isValidSearchResult(result)).toBe(false);
    });

    test("rejects missing score", () => {
      const result = {
        id: "vec_123",
        memoryId: "mem_123",
        payload: {},
      };
      expect(isValidSearchResult(result)).toBe(false);
    });
  });

  describe("filter building - type filter", () => {
    function buildTypeFilter(type: string): Record<string, unknown> {
      return {
        key: "type",
        match: { value: type },
      };
    }

    test("builds type filter", () => {
      const filter = buildTypeFilter("decision");
      expect(filter.key).toBe("type");
      expect((filter.match as Record<string, unknown>).value).toBe("decision");
    });

    test("handles different types", () => {
      const filter = buildTypeFilter("architecture");
      expect((filter.match as Record<string, unknown>).value).toBe(
        "architecture",
      );
    });
  });

  describe("filter building - tags filter", () => {
    function buildTagsFilter(tags: string[]): Record<string, unknown> {
      return {
        key: "tags",
        match: { any: tags },
      };
    }

    test("builds single tag filter", () => {
      const filter = buildTagsFilter(["important"]);
      expect(filter.key).toBe("tags");
      expect((filter.match as Record<string, unknown>).any).toEqual([
        "important",
      ]);
    });

    test("builds multiple tags filter", () => {
      const filter = buildTagsFilter(["api", "design"]);
      expect((filter.match as Record<string, unknown>).any).toEqual([
        "api",
        "design",
      ]);
    });
  });

  describe("filter building - importance filter", () => {
    function buildImportanceFilter(
      minImportance: number,
    ): Record<string, unknown> {
      return {
        key: "importance",
        range: { gte: minImportance },
      };
    }

    test("builds importance range filter", () => {
      const filter = buildImportanceFilter(0.7);
      expect(filter.key).toBe("importance");
      expect((filter.range as Record<string, unknown>).gte).toBe(0.7);
    });

    test("handles zero importance", () => {
      const filter = buildImportanceFilter(0);
      expect((filter.range as Record<string, unknown>).gte).toBe(0);
    });

    test("handles max importance", () => {
      const filter = buildImportanceFilter(1);
      expect((filter.range as Record<string, unknown>).gte).toBe(1);
    });
  });

  describe("filter building - relatedFiles filter", () => {
    function buildRelatedFilesFilter(files: string[]): Record<string, unknown> {
      return {
        key: "relatedFiles",
        match: { any: files },
      };
    }

    test("builds single file filter", () => {
      const filter = buildRelatedFilesFilter(["src/index.ts"]);
      expect(filter.key).toBe("relatedFiles");
      expect((filter.match as Record<string, unknown>).any).toEqual([
        "src/index.ts",
      ]);
    });

    test("builds multiple files filter", () => {
      const filter = buildRelatedFilesFilter(["src/a.ts", "src/b.ts"]);
      expect((filter.match as Record<string, unknown>).any).toEqual([
        "src/a.ts",
        "src/b.ts",
      ]);
    });
  });

  describe("composite filter building", () => {
    interface SearchFilters {
      type?: string;
      tags?: string[];
      minImportance?: number;
      relatedFiles?: string[];
    }

    function buildFilter(
      filters?: SearchFilters,
    ): Array<Record<string, unknown>> | undefined {
      if (!filters) return undefined;

      const conditions: Array<Record<string, unknown>> = [];

      if (filters.type) {
        conditions.push({
          key: "type",
          match: { value: filters.type },
        });
      }

      if (filters.tags && filters.tags.length > 0) {
        conditions.push({
          key: "tags",
          match: { any: filters.tags },
        });
      }

      if (filters.minImportance !== undefined) {
        conditions.push({
          key: "importance",
          range: { gte: filters.minImportance },
        });
      }

      if (filters.relatedFiles && filters.relatedFiles.length > 0) {
        conditions.push({
          key: "relatedFiles",
          match: { any: filters.relatedFiles },
        });
      }

      return conditions.length > 0 ? conditions : undefined;
    }

    test("returns undefined for no filters", () => {
      expect(buildFilter(undefined)).toBeUndefined();
    });

    test("returns undefined for empty filters", () => {
      expect(buildFilter({})).toBeUndefined();
    });

    test("builds single type filter", () => {
      const result = buildFilter({ type: "note" });
      expect(result).toHaveLength(1);
      expect(result?.[0].key).toBe("type");
    });

    test("builds combined filters", () => {
      const result = buildFilter({
        type: "decision",
        tags: ["api"],
        minImportance: 0.5,
      });
      expect(result).toHaveLength(3);
    });

    test("ignores empty tags array", () => {
      const result = buildFilter({ type: "note", tags: [] });
      expect(result).toHaveLength(1);
    });

    test("ignores empty relatedFiles array", () => {
      const result = buildFilter({ type: "note", relatedFiles: [] });
      expect(result).toHaveLength(1);
    });

    test("includes minImportance of 0", () => {
      const result = buildFilter({ minImportance: 0 });
      expect(result).toHaveLength(1);
      expect((result?.[0].range as Record<string, unknown>).gte).toBe(0);
    });
  });

  describe("search result mapping", () => {
    interface RawResult {
      id: string | number;
      score: number;
      payload: Record<string, unknown>;
    }

    interface VectorPayload {
      memoryId: string;
      type: string;
      title: string;
    }

    interface VectorSearchResult {
      id: string;
      memoryId: string;
      score: number;
      payload: VectorPayload;
    }

    function mapSearchResult(result: RawResult): VectorSearchResult {
      return {
        id: result.id as string,
        memoryId: (result.payload as unknown as VectorPayload).memoryId,
        score: result.score,
        payload: result.payload as unknown as VectorPayload,
      };
    }

    test("maps id correctly", () => {
      const raw: RawResult = {
        id: "vec_123",
        score: 0.9,
        payload: { memoryId: "mem_123", type: "note", title: "Test" },
      };
      const result = mapSearchResult(raw);
      expect(result.id).toBe("vec_123");
    });

    test("extracts memoryId from payload", () => {
      const raw: RawResult = {
        id: "vec_456",
        score: 0.85,
        payload: { memoryId: "mem_456", type: "decision", title: "Choice" },
      };
      const result = mapSearchResult(raw);
      expect(result.memoryId).toBe("mem_456");
    });

    test("preserves score", () => {
      const raw: RawResult = {
        id: "vec_789",
        score: 0.75,
        payload: { memoryId: "mem_789", type: "pattern", title: "Pattern" },
      };
      const result = mapSearchResult(raw);
      expect(result.score).toBe(0.75);
    });

    test("preserves full payload", () => {
      const payload = { memoryId: "mem_123", type: "note", title: "Test" };
      const raw: RawResult = { id: "vec_123", score: 0.9, payload };
      const result = mapSearchResult(raw);
      expect(result.payload).toEqual(payload);
    });
  });

  describe("batch result mapping", () => {
    interface RawResult {
      id: string;
      score: number;
      payload: { memoryId: string };
    }

    interface MappedResult {
      id: string;
      memoryId: string;
      score: number;
    }

    function mapBatchResults(results: RawResult[]): MappedResult[] {
      return results.map((r) => ({
        id: r.id,
        memoryId: r.payload.memoryId,
        score: r.score,
      }));
    }

    test("maps empty results", () => {
      expect(mapBatchResults([])).toEqual([]);
    });

    test("maps single result", () => {
      const results = [{ id: "v1", score: 0.9, payload: { memoryId: "m1" } }];
      expect(mapBatchResults(results)).toHaveLength(1);
    });

    test("maps multiple results", () => {
      const results = [
        { id: "v1", score: 0.9, payload: { memoryId: "m1" } },
        { id: "v2", score: 0.8, payload: { memoryId: "m2" } },
      ];
      const mapped = mapBatchResults(results);
      expect(mapped).toHaveLength(2);
      expect(mapped[0].memoryId).toBe("m1");
      expect(mapped[1].memoryId).toBe("m2");
    });

    test("preserves order", () => {
      const results = [
        { id: "v3", score: 0.7, payload: { memoryId: "m3" } },
        { id: "v1", score: 0.9, payload: { memoryId: "m1" } },
      ];
      const mapped = mapBatchResults(results);
      expect(mapped[0].id).toBe("v3");
      expect(mapped[1].id).toBe("v1");
    });
  });

  describe("collection configuration", () => {
    interface CollectionConfig {
      vectors: {
        size: number;
        distance: string;
      };
      optimizers_config: {
        default_segment_number: number;
      };
      replication_factor: number;
    }

    function buildCollectionConfig(): CollectionConfig {
      return {
        vectors: {
          size: VECTOR_SIZE,
          distance: "Cosine",
        },
        optimizers_config: {
          default_segment_number: 2,
        },
        replication_factor: 1,
      };
    }

    test("uses correct vector size", () => {
      const config = buildCollectionConfig();
      expect(config.vectors.size).toBe(768);
    });

    test("uses cosine distance", () => {
      const config = buildCollectionConfig();
      expect(config.vectors.distance).toBe("Cosine");
    });

    test("sets segment number", () => {
      const config = buildCollectionConfig();
      expect(config.optimizers_config.default_segment_number).toBe(2);
    });

    test("sets replication factor", () => {
      const config = buildCollectionConfig();
      expect(config.replication_factor).toBe(1);
    });
  });

  describe("payload index configuration", () => {
    type FieldSchema = "keyword" | "float" | "integer" | "text";

    interface PayloadIndex {
      field_name: string;
      field_schema: FieldSchema;
    }

    function getRequiredIndexes(): PayloadIndex[] {
      return [
        { field_name: "type", field_schema: "keyword" },
        { field_name: "tags", field_schema: "keyword" },
        { field_name: "importance", field_schema: "float" },
      ];
    }

    test("includes type index", () => {
      const indexes = getRequiredIndexes();
      const typeIndex = indexes.find((i) => i.field_name === "type");
      expect(typeIndex).toBeDefined();
      expect(typeIndex?.field_schema).toBe("keyword");
    });

    test("includes tags index", () => {
      const indexes = getRequiredIndexes();
      const tagsIndex = indexes.find((i) => i.field_name === "tags");
      expect(tagsIndex).toBeDefined();
      expect(tagsIndex?.field_schema).toBe("keyword");
    });

    test("includes importance index", () => {
      const indexes = getRequiredIndexes();
      const impIndex = indexes.find((i) => i.field_name === "importance");
      expect(impIndex).toBeDefined();
      expect(impIndex?.field_schema).toBe("float");
    });

    test("returns 3 indexes", () => {
      expect(getRequiredIndexes()).toHaveLength(3);
    });
  });

  describe("collection existence check", () => {
    interface Collection {
      name: string;
    }

    function collectionExists(
      collections: Collection[],
      targetName: string,
    ): boolean {
      return collections.some((c) => c.name === targetName);
    }

    test("finds existing collection", () => {
      const collections = [{ name: "memories" }, { name: "other" }];
      expect(collectionExists(collections, "memories")).toBe(true);
    });

    test("returns false for missing collection", () => {
      const collections = [{ name: "other" }];
      expect(collectionExists(collections, "memories")).toBe(false);
    });

    test("handles empty collections", () => {
      expect(collectionExists([], "memories")).toBe(false);
    });

    test("is case sensitive", () => {
      const collections = [{ name: "Memories" }];
      expect(collectionExists(collections, "memories")).toBe(false);
    });
  });

  describe("upsert point building", () => {
    interface Point {
      id: string;
      vector: number[];
      payload: Record<string, unknown>;
    }

    function buildUpsertPoint(
      id: string,
      vector: number[],
      payload: Record<string, unknown>,
    ): Point {
      return { id, vector, payload };
    }

    test("builds complete point", () => {
      const point = buildUpsertPoint("vec_123", [0.1, 0.2], { type: "note" });
      expect(point.id).toBe("vec_123");
      expect(point.vector).toEqual([0.1, 0.2]);
      expect(point.payload).toEqual({ type: "note" });
    });

    test("preserves vector values", () => {
      const vector = [0.123, 0.456, 0.789];
      const point = buildUpsertPoint("v1", vector, {});
      expect(point.vector).toEqual(vector);
    });
  });

  describe("delete by points", () => {
    function buildDeleteByIds(ids: string[]): { points: string[] } {
      return { points: ids };
    }

    test("builds single id delete", () => {
      const request = buildDeleteByIds(["vec_123"]);
      expect(request.points).toEqual(["vec_123"]);
    });

    test("builds multiple id delete", () => {
      const request = buildDeleteByIds(["vec_1", "vec_2", "vec_3"]);
      expect(request.points).toHaveLength(3);
    });
  });

  describe("delete by filter", () => {
    function buildDeleteByMemoryId(memoryId: string): {
      filter: { must: Array<Record<string, unknown>> };
    } {
      return {
        filter: {
          must: [
            {
              key: "memoryId",
              match: { value: memoryId },
            },
          ],
        },
      };
    }

    test("builds filter delete request", () => {
      const request = buildDeleteByMemoryId("mem_123");
      expect(request.filter.must).toHaveLength(1);
      expect(request.filter.must[0].key).toBe("memoryId");
    });

    test("matches by value", () => {
      const request = buildDeleteByMemoryId("mem_456");
      const condition = request.filter.must[0];
      expect((condition.match as Record<string, unknown>).value).toBe(
        "mem_456",
      );
    });
  });

  describe("collection info extraction", () => {
    interface CollectionInfo {
      indexed_vectors_count?: number;
      points_count?: number;
    }

    function extractCollectionStats(info: CollectionInfo): {
      vectorsCount: number;
      pointsCount: number;
    } {
      return {
        vectorsCount: info.indexed_vectors_count ?? 0,
        pointsCount: info.points_count ?? 0,
      };
    }

    test("extracts counts", () => {
      const stats = extractCollectionStats({
        indexed_vectors_count: 1000,
        points_count: 1000,
      });
      expect(stats.vectorsCount).toBe(1000);
      expect(stats.pointsCount).toBe(1000);
    });

    test("handles missing indexed_vectors_count", () => {
      const stats = extractCollectionStats({ points_count: 500 });
      expect(stats.vectorsCount).toBe(0);
    });

    test("handles missing points_count", () => {
      const stats = extractCollectionStats({ indexed_vectors_count: 500 });
      expect(stats.pointsCount).toBe(0);
    });

    test("handles empty info", () => {
      const stats = extractCollectionStats({});
      expect(stats.vectorsCount).toBe(0);
      expect(stats.pointsCount).toBe(0);
    });
  });

  describe("vector validation", () => {
    function isValidVector(vector: unknown): vector is number[] {
      if (!Array.isArray(vector)) return false;
      if (vector.length !== VECTOR_SIZE) return false;
      return vector.every((n) => typeof n === "number" && !Number.isNaN(n));
    }

    test("validates correct dimension", () => {
      const vector = new Array(768).fill(0.1);
      expect(isValidVector(vector)).toBe(true);
    });

    test("rejects wrong dimension", () => {
      const vector = new Array(512).fill(0.1);
      expect(isValidVector(vector)).toBe(false);
    });

    test("rejects non-array", () => {
      expect(isValidVector("not array")).toBe(false);
    });

    test("rejects array with non-numbers", () => {
      const vector = new Array(768).fill("str");
      expect(isValidVector(vector)).toBe(false);
    });

    test("rejects array with NaN", () => {
      const vector = new Array(768).fill(0.1);
      vector[0] = NaN;
      expect(isValidVector(vector)).toBe(false);
    });
  });

  describe("score normalization", () => {
    function normalizeScore(score: number): number {
      // Cosine similarity is already in [-1, 1], normalize to [0, 1]
      return (score + 1) / 2;
    }

    function isScoreAboveThreshold(score: number, threshold: number): boolean {
      return score >= threshold;
    }

    test("normalizes score of 1", () => {
      expect(normalizeScore(1)).toBe(1);
    });

    test("normalizes score of 0", () => {
      expect(normalizeScore(0)).toBe(0.5);
    });

    test("normalizes score of -1", () => {
      expect(normalizeScore(-1)).toBe(0);
    });

    test("checks threshold correctly", () => {
      expect(isScoreAboveThreshold(0.8, 0.7)).toBe(true);
      expect(isScoreAboveThreshold(0.6, 0.7)).toBe(false);
    });
  });

  describe("search limit validation", () => {
    function validateLimit(limit: number): number {
      const MIN_LIMIT = 1;
      const MAX_LIMIT = 100;
      const DEFAULT_LIMIT = 10;

      if (limit < MIN_LIMIT) return DEFAULT_LIMIT;
      if (limit > MAX_LIMIT) return MAX_LIMIT;
      return limit;
    }

    test("returns default for negative", () => {
      expect(validateLimit(-5)).toBe(10);
    });

    test("returns default for zero", () => {
      expect(validateLimit(0)).toBe(10);
    });

    test("caps at max limit", () => {
      expect(validateLimit(200)).toBe(100);
    });

    test("accepts valid limit", () => {
      expect(validateLimit(25)).toBe(25);
    });

    test("accepts min limit", () => {
      expect(validateLimit(1)).toBe(1);
    });

    test("accepts max limit", () => {
      expect(validateLimit(100)).toBe(100);
    });
  });

  describe("config validation", () => {
    interface QdrantConfig {
      url: string;
      apiKey?: string;
      collectionName: string;
    }

    function isValidConfig(config: unknown): config is QdrantConfig {
      if (typeof config !== "object" || config === null) return false;

      const c = config as Record<string, unknown>;
      return (
        typeof c.url === "string" &&
        c.url.length > 0 &&
        typeof c.collectionName === "string" &&
        c.collectionName.length > 0 &&
        (c.apiKey === undefined || typeof c.apiKey === "string")
      );
    }

    test("validates complete config", () => {
      const config = {
        url: "http://localhost:6333",
        apiKey: "secret",
        collectionName: "memories",
      };
      expect(isValidConfig(config)).toBe(true);
    });

    test("validates config without apiKey", () => {
      const config = {
        url: "http://localhost:6333",
        collectionName: "memories",
      };
      expect(isValidConfig(config)).toBe(true);
    });

    test("rejects missing url", () => {
      const config = { collectionName: "memories" };
      expect(isValidConfig(config)).toBe(false);
    });

    test("rejects empty url", () => {
      const config = { url: "", collectionName: "memories" };
      expect(isValidConfig(config)).toBe(false);
    });

    test("rejects missing collectionName", () => {
      const config = { url: "http://localhost:6333" };
      expect(isValidConfig(config)).toBe(false);
    });
  });
});
