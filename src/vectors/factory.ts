import { join } from "node:path";
import type { VectorConfig } from "@/types";
import type { VectorStore } from "./interface";
import { LibSqlVectorStore } from "./libsql";
import { QdrantVectorStore } from "./qdrant";

/**
 * Create a vector store based on configuration.
 * Auto-selects between Qdrant (Docker) and libSQL (embedded).
 */
export function createVectorStore(
  config: VectorConfig,
  projectPath: string,
): VectorStore {
  if (config.provider === "qdrant") {
    return new QdrantVectorStore({
      url: config.url,
      apiKey: config.apiKey,
      collectionName: config.collectionName ?? "doclea_vectors",
      vectorSize: config.vectorSize,
    });
  }

  // Default to libSQL (embedded) with native vector support
  const dbPath = join(projectPath, config.dbPath ?? ".doclea/vectors.db");
  return new LibSqlVectorStore({
    dbPath,
    vectorSize: config.vectorSize,
  });
}
