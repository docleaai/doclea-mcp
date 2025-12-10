import { z } from "zod";

// Memory types
export const MemoryTypeSchema = z.enum([
  "decision",
  "solution",
  "pattern",
  "architecture",
  "note",
]);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const MemorySchema = z.object({
  id: z.string(),
  type: MemoryTypeSchema,
  title: z.string(),
  content: z.string(),
  summary: z.string().optional(),
  importance: z.number().min(0).max(1).default(0.5),
  tags: z.array(z.string()).default([]),
  relatedFiles: z.array(z.string()).default([]),
  gitCommit: z.string().optional(),
  sourcePr: z.string().optional(),
  experts: z.array(z.string()).default([]),
  qdrantId: z.string().optional(),
  createdAt: z.number(),
  accessedAt: z.number(),
});
export type Memory = z.infer<typeof MemorySchema>;

export const CreateMemorySchema = MemorySchema.omit({
  id: true,
  qdrantId: true,
  createdAt: true,
  accessedAt: true,
});
export type CreateMemory = z.infer<typeof CreateMemorySchema>;

export const UpdateMemorySchema = CreateMemorySchema.partial();
export type UpdateMemory = z.infer<typeof UpdateMemorySchema>;

// Document types
export const DocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  contentHash: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const ChunkSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  content: z.string(),
  qdrantId: z.string().optional(),
  startOffset: z.number(),
  endOffset: z.number(),
});
export type Chunk = z.infer<typeof ChunkSchema>;

// Embedding config - discriminated union per provider
export const LocalEmbeddingConfigSchema = z.object({
  provider: z.literal("local"),
  endpoint: z.string().default("http://localhost:8080"),
});

export const OpenAIEmbeddingConfigSchema = z.object({
  provider: z.literal("openai"),
  apiKey: z.string(),
  model: z.string().default("text-embedding-3-small"),
});

export const NomicEmbeddingConfigSchema = z.object({
  provider: z.literal("nomic"),
  apiKey: z.string(),
  model: z.string().default("nomic-embed-text-v1.5"),
});

export const VoyageEmbeddingConfigSchema = z.object({
  provider: z.literal("voyage"),
  apiKey: z.string(),
  model: z.string().default("voyage-3"),
});

export const OllamaEmbeddingConfigSchema = z.object({
  provider: z.literal("ollama"),
  endpoint: z.string().default("http://localhost:11434"),
  model: z.string().default("nomic-embed-text"),
});

export const TransformersEmbeddingConfigSchema = z.object({
  provider: z.literal("transformers"),
  /** Model name or HuggingFace ID. Options: mxbai-embed-xsmall-v1, all-MiniLM-L6-v2, embeddinggemma-300m, snowflake-arctic-embed-m, all-mpnet-base-v2 */
  model: z.string().default("mxbai-embed-xsmall-v1"),
  /** Custom cache directory for downloaded models */
  cacheDir: z.string().optional(),
  /** Custom embedding dimensions (for MRL-enabled models) */
  dimensions: z.number().optional(),
});

export const EmbeddingConfigSchema = z.discriminatedUnion("provider", [
  LocalEmbeddingConfigSchema,
  OpenAIEmbeddingConfigSchema,
  NomicEmbeddingConfigSchema,
  VoyageEmbeddingConfigSchema,
  OllamaEmbeddingConfigSchema,
  TransformersEmbeddingConfigSchema,
]);
export type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>;

// Vector store providers - discriminated union
export const SqliteVecConfigSchema = z.object({
  provider: z.literal("sqlite-vec"),
  dbPath: z.string().default(".doclea/vectors.db"),
  vectorSize: z.number().default(384), // all-MiniLM-L6-v2 dimension
});

export const QdrantConfigSchema = z.object({
  provider: z.literal("qdrant"),
  url: z.string(),
  apiKey: z.string().optional(),
  collectionName: z.string(),
});

export const VectorConfigSchema = z.discriminatedUnion("provider", [
  SqliteVecConfigSchema,
  QdrantConfigSchema,
]);
export type VectorConfig = z.infer<typeof VectorConfigSchema>;

// Legacy QdrantConfig type for backwards compatibility
export type QdrantConfig = z.infer<typeof QdrantConfigSchema>;

export const StorageConfigSchema = z.object({
  dbPath: z.string(),
});
export type StorageConfig = z.infer<typeof StorageConfigSchema>;

export const ConfigSchema = z.object({
  embedding: EmbeddingConfigSchema,
  vector: VectorConfigSchema,
  storage: StorageConfigSchema,
});
export type Config = z.infer<typeof ConfigSchema>;

// Default config factory - uses embedded backends (zero-config)
export const DEFAULT_CONFIG: Config = {
  embedding: { provider: "transformers", model: "mxbai-embed-xsmall-v1" },
  vector: {
    provider: "sqlite-vec",
    dbPath: ".doclea/vectors.db",
    vectorSize: 384,
  },
  storage: { dbPath: ".doclea/local.db" },
};

// Search types
export const SearchFiltersSchema = z.object({
  type: MemoryTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
  minImportance: z.number().optional(),
  relatedFiles: z.array(z.string()).optional(),
});
export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

export const SearchResultSchema = z.object({
  memory: MemorySchema,
  score: z.number(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

// Git types
export const ExpertSchema = z.object({
  name: z.string(),
  email: z.string(),
  commits: z.number(),
  percentage: z.number(),
  lastCommit: z.string(),
  linesOwned: z.number().optional(),
});
export type Expert = z.infer<typeof ExpertSchema>;

export const ExpertiseEntrySchema = z.object({
  path: z.string(),
  primaryExpert: ExpertSchema.nullable(),
  secondaryExperts: z.array(ExpertSchema),
  experts: z.array(ExpertSchema), // Full list for backwards compat
  busFactor: z.number(),
  busFactorRisk: z.boolean(),
  lastActivity: z.string(),
  totalCommits: z.number(),
  totalFiles: z.number(),
});
export type ExpertiseEntry = z.infer<typeof ExpertiseEntrySchema>;

export const ExpertiseRecommendationSchema = z.object({
  type: z.enum([
    "knowledge_transfer",
    "documentation",
    "mentorship",
    "review_coverage",
    "stale_code",
  ]),
  priority: z.enum(["high", "medium", "low"]),
  path: z.string(),
  message: z.string(),
  involvedExperts: z.array(z.string()),
});
export type ExpertiseRecommendation = z.infer<
  typeof ExpertiseRecommendationSchema
>;

export const ReviewerSuggestionSchema = z.object({
  name: z.string(),
  email: z.string(),
  reason: z.string(),
  relevance: z.number(), // 0-1 score (backwards compat)
  expertisePct: z.number(), // 0-100 percentage of ownership
  category: z.enum(["required", "optional"]),
  filesOwned: z.array(z.string()), // Which files they own
});
export type ReviewerSuggestion = z.infer<typeof ReviewerSuggestionSchema>;

export interface SuggestReviewersResult {
  required: ReviewerSuggestion[];
  optional: ReviewerSuggestion[];
  noOwner: string[]; // Files with no clear owner
  summary: string; // Human-readable summary
}
