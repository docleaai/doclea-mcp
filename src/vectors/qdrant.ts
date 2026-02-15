import { createHash } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import type {
  VectorPayload,
  VectorSearchFilters,
  VectorSearchResult,
  VectorStore,
} from "./interface";

// Re-export types from interface for backwards compatibility
export type { VectorPayload, VectorSearchResult } from "./interface";

const DEFAULT_VECTOR_SIZE = 768;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface QdrantConfig {
  url: string;
  apiKey?: string;
  collectionName: string;
  vectorSize?: number;
}

export class QdrantVectorStore implements VectorStore {
  private client: QdrantClient;
  private readonly collectionName: string;
  private readonly vectorSize: number;

  constructor(config: QdrantConfig) {
    this.client = new QdrantClient({
      url: config.url,
      apiKey: config.apiKey,
    });
    this.collectionName = config.collectionName;
    this.vectorSize = config.vectorSize ?? DEFAULT_VECTOR_SIZE;
  }

  async initialize(): Promise<void> {
    const collections = await this.client.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === this.collectionName,
    );

    if (exists) {
      const collectionInfo = await this.client.getCollection(
        this.collectionName,
      );
      const existingVectorSize =
        this.extractCollectionVectorSize(collectionInfo);
      if (
        existingVectorSize !== null &&
        existingVectorSize !== this.vectorSize
      ) {
        throw new Error(
          `Qdrant collection "${this.collectionName}" uses vector size ${existingVectorSize}, but config requires ${this.vectorSize}`,
        );
      }
      return;
    }

    await this.client.createCollection(this.collectionName, {
      vectors: {
        size: this.vectorSize,
        distance: "Cosine",
      },
      optimizers_config: {
        default_segment_number: 2,
      },
      replication_factor: 1,
    });

    // Create payload indexes for filtering
    await this.client.createPayloadIndex(this.collectionName, {
      field_name: "type",
      field_schema: "keyword",
    });
    await this.client.createPayloadIndex(this.collectionName, {
      field_name: "tags",
      field_schema: "keyword",
    });
    await this.client.createPayloadIndex(this.collectionName, {
      field_name: "importance",
      field_schema: "float",
    });
  }

  private extractCollectionVectorSize(collectionInfo: unknown): number | null {
    const vectors = (
      collectionInfo as {
        config?: { params?: { vectors?: unknown } };
      }
    ).config?.params?.vectors;
    if (typeof vectors !== "object" || vectors === null) {
      return null;
    }

    if ("size" in vectors && typeof vectors.size === "number") {
      return vectors.size;
    }

    for (const value of Object.values(vectors)) {
      if (
        typeof value === "object" &&
        value !== null &&
        "size" in value &&
        typeof value.size === "number"
      ) {
        return value.size;
      }
    }

    return null;
  }

  private validateVectorSize(vector: number[]): void {
    if (vector.length !== this.vectorSize) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.vectorSize}, got ${vector.length}`,
      );
    }
  }

  private toPointId(id: string): string | number {
    if (/^\d+$/.test(id)) {
      return Number.parseInt(id, 10);
    }
    if (UUID_REGEX.test(id)) {
      return id;
    }

    // Qdrant v1.12+ accepts integer/UUID IDs; map legacy IDs (e.g. vec_*)
    // to stable UUIDs so existing data can be updated/deleted consistently.
    const hex = createHash("sha256").update(id).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
      16,
      20,
    )}-${hex.slice(20, 32)}`;
  }

  async upsert(
    id: string,
    vector: number[],
    payload: VectorPayload,
  ): Promise<string> {
    this.validateVectorSize(vector);
    const pointId = this.toPointId(id);
    await this.client.upsert(this.collectionName, {
      wait: true,
      points: [
        {
          id: pointId,
          vector,
          payload,
        },
      ],
    });
    return id;
  }

  async search(
    vector: number[],
    filters?: VectorSearchFilters,
    limit: number = 10,
  ): Promise<VectorSearchResult[]> {
    this.validateVectorSize(vector);
    const filter = this.buildFilter(filters);

    const results = await this.client.search(this.collectionName, {
      vector,
      limit,
      filter: filter ? { must: filter } : undefined,
      with_payload: true,
    });

    return results.map((result) => ({
      id: String(result.id),
      memoryId: (result.payload as VectorPayload).memoryId,
      score: result.score,
      payload: result.payload as VectorPayload,
    }));
  }

  async delete(id: string): Promise<boolean> {
    try {
      const pointId = this.toPointId(id);
      await this.client.delete(this.collectionName, {
        wait: true,
        points: [pointId],
      });
      return true;
    } catch {
      return false;
    }
  }

  async deleteByMemoryId(memoryId: string): Promise<boolean> {
    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        filter: {
          must: [
            {
              key: "memoryId",
              match: { value: memoryId },
            },
          ],
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  private buildFilter(
    filters?: VectorSearchFilters,
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

  async getCollectionInfo(): Promise<{
    vectorsCount: number;
    pointsCount: number;
  }> {
    const info = await this.client.getCollection(this.collectionName);
    return {
      vectorsCount: info.indexed_vectors_count ?? 0,
      pointsCount: info.points_count ?? 0,
    };
  }
}
