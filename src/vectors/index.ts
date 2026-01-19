// Vector store interface and types

// Factory
export { createVectorStore } from "./factory";
export type {
  VectorPayload,
  VectorSearchResult,
  VectorStore,
} from "./interface";
export type { LibSqlVectorConfig as SqliteVecConfig } from "./libsql";
// Legacy export for backward compatibility (deprecated)
export {
  type LibSqlVectorConfig,
  LibSqlVectorStore,
  LibSqlVectorStore as SqliteVecStore,
} from "./libsql";
// Implementations
export { type QdrantConfig, QdrantVectorStore } from "./qdrant";
