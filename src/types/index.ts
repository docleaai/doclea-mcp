import { z } from "zod";
import { ABTestingConfigSchema } from "@/ab-testing/types";
import { ContextCacheConfigSchema } from "@/caching/types";
import { ScoringConfigSchema } from "@/scoring/types";

// Memory types
export const MemoryTypeSchema = z.enum([
  "decision",
  "solution",
  "pattern",
  "architecture",
  "note",
]);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

/** Decay function types for per-memory override */
export const DecayFunctionTypeSchema = z.enum([
  "exponential",
  "linear",
  "step",
  "none",
]);
export type DecayFunctionType = z.infer<typeof DecayFunctionTypeSchema>;

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
  accessCount: z.number().int().min(0).default(0),
  needsReview: z.boolean().default(false),
  // Confidence decay fields (all optional, NULL = use global config)
  /** Per-memory decay rate multiplier (NULL = global, 0 = pinned/no decay) */
  decayRate: z.number().min(0).nullable().optional(),
  /** Decay anchor timestamp (NULL = use createdAt or accessedAt based on config) */
  lastRefreshedAt: z.number().nullable().optional(),
  /** Per-memory confidence floor (NULL = global floor) */
  confidenceFloor: z.number().min(0).max(1).nullable().optional(),
  /** Per-memory decay function override */
  decayFunction: DecayFunctionTypeSchema.nullable().optional(),
});
export type Memory = z.infer<typeof MemorySchema>;

export const CreateMemorySchema = MemorySchema.omit({
  id: true,
  qdrantId: true,
  createdAt: true,
  accessedAt: true,
  accessCount: true,
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
export const LibSqlConfigSchema = z.object({
  provider: z.literal("libsql"),
  dbPath: z.string().default(".doclea/vectors.db"),
  vectorSize: z.number().default(384), // all-MiniLM-L6-v2 dimension
});

// Legacy alias for backwards compatibility
export const SqliteVecConfigSchema = LibSqlConfigSchema;

export const QdrantConfigSchema = z.object({
  provider: z.literal("qdrant"),
  url: z.string(),
  apiKey: z.string().optional(),
  collectionName: z.string().default("doclea_vectors"),
});

export const VectorConfigSchema = z.discriminatedUnion("provider", [
  LibSqlConfigSchema,
  QdrantConfigSchema,
]);
export type VectorConfig = z.infer<typeof VectorConfigSchema>;

// Legacy QdrantConfig type for backwards compatibility
export type QdrantConfig = z.infer<typeof QdrantConfigSchema>;

// Storage backend and mode types
export const StorageBackendTypeSchema = z.enum(["sqlite", "memory"]);
export type StorageBackendType = z.infer<typeof StorageBackendTypeSchema>;

export const StorageModeSchema = z.enum(["manual", "suggested", "automatic"]);
export type StorageMode = z.infer<typeof StorageModeSchema>;

export const StorageConfigSchema = z.object({
  backend: StorageBackendTypeSchema.default("sqlite"),
  dbPath: z.string().default(".doclea/local.db"),
  mode: StorageModeSchema.default("automatic"),
});
export type StorageConfig = z.infer<typeof StorageConfigSchema>;

export const ConfigSchema = z.object({
  embedding: EmbeddingConfigSchema,
  vector: VectorConfigSchema,
  storage: StorageConfigSchema,
  scoring: ScoringConfigSchema.optional(),
  cache: ContextCacheConfigSchema.optional(),
  abTesting: ABTestingConfigSchema.optional(),
});
export type Config = z.infer<typeof ConfigSchema>;

// Default config factory - uses embedded backends (zero-config)
export const DEFAULT_CONFIG: Config = {
  embedding: { provider: "transformers", model: "mxbai-embed-xsmall-v1" },
  vector: {
    provider: "libsql",
    dbPath: ".doclea/vectors.db",
    vectorSize: 384,
  },
  storage: {
    backend: "sqlite",
    dbPath: ".doclea/local.db",
    mode: "automatic",
  },
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

// Scoring schemas for multi-factor relevance scoring
export const AppliedBoostSchema = z.object({
  name: z.string(),
  factor: z.number(),
  reason: z.string(),
});
export type AppliedBoost = z.infer<typeof AppliedBoostSchema>;

export const ScoreBreakdownSchema = z.object({
  semantic: z.number().min(0).max(1),
  recency: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  frequency: z.number().min(0).max(1),
  weights: z.object({
    semantic: z.number(),
    recency: z.number(),
    confidence: z.number(),
    frequency: z.number(),
  }),
  boosts: z.array(AppliedBoostSchema).default([]),
  rawScore: z.number(),
  finalScore: z.number(),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const ScoredSearchResultSchema = z.object({
  memory: MemorySchema,
  score: z.number(),
  breakdown: ScoreBreakdownSchema.optional(),
});
export type ScoredSearchResult = z.infer<typeof ScoredSearchResultSchema>;

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
