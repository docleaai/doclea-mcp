// Vector store interface and types
export type {
  VectorStore,
  VectorPayload,
  VectorSearchResult,
} from "./interface";

// Implementations
export { QdrantVectorStore, type QdrantConfig } from "./qdrant";
export { SqliteVecStore, type SqliteVecConfig } from "./sqlite-vec";

// Factory
export { createVectorStore } from "./factory";