import { join } from "node:path";
import type { VectorConfig } from "@/types";
import type { VectorStore } from "./interface";
import { QdrantVectorStore } from "./qdrant";
import { SqliteVecStore } from "./sqlite-vec";

/**
 * Create a vector store based on configuration.
 * Auto-selects between Qdrant (Docker) and sqlite-vec (embedded).
 */
export function createVectorStore(
  config: VectorConfig,
  projectPath: string,
): VectorStore {
  if (config.provider === "qdrant") {
    return new QdrantVectorStore({
      url: config.url,
      apiKey: config.apiKey,
      collectionName: config.collectionName,
    });
  }

  // Default to sqlite-vec (embedded)
  const dbPath = join(projectPath, config.dbPath ?? ".doclea/vectors.db");
  return new SqliteVecStore({
    dbPath,
    vectorSize: config.vectorSize,
  });
}