import { QdrantClient } from "@qdrant/js-client-rest";
import type { SearchFilters } from "@/types";
import type { VectorPayload, VectorSearchResult, VectorStore } from "./interface";

// Re-export types from interface for backwards compatibility
export type { VectorPayload, VectorSearchResult } from "./interface";

const VECTOR_SIZE = 768; // nomic-embed-text-v1.5 dimension

export interface QdrantConfig {
  url: string;
  apiKey?: string;
  collectionName: string;
}

export class QdrantVectorStore implements VectorStore {
  private client: QdrantClient;
  private readonly collectionName: string;

  constructor(config: QdrantConfig) {
    this.client = new QdrantClient({
      url: config.url,
      apiKey: config.apiKey,
    });
    this.collectionName = config.collectionName;
  }

  async initialize(): Promise<void> {
    const collections = await this.client.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === this.collectionName,
    );

    if (!exists) {
      await this.client.createCollection(this.collectionName, {
        vectors: {
          size: VECTOR_SIZE,
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
  }

  async upsert(
    id: string,
    vector: number[],
    payload: VectorPayload,
  ): Promise<string> {
    await this.client.upsert(this.collectionName, {
      wait: true,
      points: [
        {
          id,
          vector,
          payload,
        },
      ],
    });
    return id;
  }

  async search(
    vector: number[],
    filters?: SearchFilters,
    limit: number = 10,
  ): Promise<VectorSearchResult[]> {
    const filter = this.buildFilter(filters);

    const results = await this.client.search(this.collectionName, {
      vector,
      limit,
      filter: filter ? { must: filter } : undefined,
      with_payload: true,
    });

    return results.map((result) => ({
      id: result.id as string,
      memoryId: (result.payload as VectorPayload).memoryId,
      score: result.score,
      payload: result.payload as VectorPayload,
    }));
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        points: [id],
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
