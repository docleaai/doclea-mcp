import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { env, pipeline } from "@huggingface/transformers";
import type { EmbeddingClient } from "./provider";

/**
 * Supported embedding models for Transformers.js
 * Each model has different tradeoffs between size, speed, and quality
 */
export const TRANSFORMERS_MODELS = {
  // Smallest & fastest - excellent quality for size (recommended default)
  "mxbai-embed-xsmall-v1": {
    id: "mixedbread-ai/mxbai-embed-xsmall-v1",
    dimensions: 384,
    size: "~45MB",
    description: "Smallest, fastest. Great quality for size. English-focused.",
  },
  // Classic well-tested model
  "all-MiniLM-L6-v2": {
    id: "Xenova/all-MiniLM-L6-v2",
    dimensions: 384,
    size: "~90MB",
    description: "Classic, well-tested. Good balance of speed and quality.",
  },
  // Best quality for multilingual
  "embeddinggemma-300m": {
    id: "onnx-community/embeddinggemma-300m-ONNX",
    dimensions: 768,
    size: "~200MB",
    description: "Best quality. 100+ languages. Requires more storage.",
  },
  // Best retrieval benchmarks
  "snowflake-arctic-embed-m": {
    id: "Snowflake/snowflake-arctic-embed-m-v2.0",
    dimensions: 768,
    size: "~220MB",
    description: "Top MTEB retrieval scores. Multilingual support.",
  },
  // Larger MiniLM variant
  "all-mpnet-base-v2": {
    id: "Xenova/all-mpnet-base-v2",
    dimensions: 768,
    size: "~420MB",
    description: "Higher quality than MiniLM. Slower, larger.",
  },
} as const;

export type TransformersModelName = keyof typeof TRANSFORMERS_MODELS;

// Default model - smallest with excellent quality
const DEFAULT_MODEL: TransformersModelName = "mxbai-embed-xsmall-v1";

// XDG-compliant cache directory
function getCacheDir(): string {
  const xdgCache = process.env.XDG_CACHE_HOME;
  const baseDir = xdgCache || join(homedir(), ".cache");
  return join(baseDir, "doclea", "transformers");
}

export interface TransformersEmbeddingConfig {
  /** Model name or custom HuggingFace model ID */
  model?: TransformersModelName | string;
  /** Custom cache directory for downloaded models */
  cacheDir?: string;
  /** Show download progress (default: true) */
  showProgress?: boolean;
  /** Custom embedding dimensions (for MRL-enabled models) */
  dimensions?: number;
}

// Define a simplified type for the feature extraction pipeline
// The full type from @huggingface/transformers is too complex for TS
interface FeatureExtractionOutput {
  data: Float32Array;
  dims: number[];
}

type FeatureExtractionPipeline = (
  texts: string | string[],
  options?: { pooling?: string; normalize?: boolean },
) => Promise<FeatureExtractionOutput>;

/**
 * In-process embedding client using Transformers.js
 * Provides zero-config embeddings without external dependencies
 */
export class TransformersEmbeddingClient implements EmbeddingClient {
  private extractor: FeatureExtractionPipeline | null = null;
  private readonly modelId: string;
  private readonly modelName: TransformersModelName | null;
  private readonly cacheDir: string;
  private readonly showProgress: boolean;
  private readonly requestedDimensions?: number;
  private initPromise: Promise<void> | null = null;

  constructor(config: TransformersEmbeddingConfig = {}) {
    const modelInput = config.model ?? DEFAULT_MODEL;

    // Check if it's a known model name or a custom HuggingFace ID
    if (modelInput in TRANSFORMERS_MODELS) {
      this.modelName = modelInput as TransformersModelName;
      this.modelId = TRANSFORMERS_MODELS[this.modelName].id;
    } else {
      // Custom model ID (e.g., "organization/model-name")
      this.modelName = null;
      this.modelId = modelInput;
    }

    this.cacheDir = config.cacheDir ?? getCacheDir();
    this.showProgress = config.showProgress ?? true;
    this.requestedDimensions = config.dimensions;
  }

  private async initialize(): Promise<void> {
    if (this.extractor) return;

    // Use single initialization promise to prevent race conditions
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    // Ensure cache directory exists
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }

    // Configure transformers.js environment
    env.cacheDir = this.cacheDir;

    // Create progress callback for first-run download
    const progressCallback = this.showProgress
      ? (progress: {
          status: string;
          file?: string;
          progress?: number;
          loaded?: number;
          total?: number;
        }) => {
          if (progress.status === "downloading" && progress.file) {
            const pct = progress.progress?.toFixed(1) ?? "?";
            process.stderr.write(
              `\r[doclea] Downloading ${progress.file}: ${pct}%`,
            );
          } else if (progress.status === "done" && progress.file) {
            process.stderr.write(
              `\r[doclea] Downloaded ${progress.file}        \n`,
            );
          }
        }
      : undefined;

    // Create feature extraction pipeline
    // Cast to our simplified type to avoid TS2590 "too complex" error
    this.extractor = (await pipeline("feature-extraction", this.modelId, {
      progress_callback: progressCallback,
    })) as unknown as FeatureExtractionPipeline;
  }

  async embed(text: string): Promise<number[]> {
    await this.initialize();

    if (!this.extractor) {
      throw new Error("Transformers.js pipeline not initialized");
    }

    const output = await this.extractor(text, {
      pooling: "mean",
      normalize: true,
    });

    // Output is a Tensor, convert to array
    let embedding = Array.from(output.data as Float32Array);

    // Apply MRL truncation if requested dimensions < native dimensions
    if (
      this.requestedDimensions &&
      this.requestedDimensions < embedding.length
    ) {
      embedding = embedding.slice(0, this.requestedDimensions);
      // Re-normalize after truncation
      const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      embedding = embedding.map((v) => v / norm);
    }

    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    await this.initialize();

    if (!this.extractor) {
      throw new Error("Transformers.js pipeline not initialized");
    }

    if (texts.length === 0) {
      return [];
    }

    // Process all texts at once (transformers.js handles batching)
    const output = await this.extractor(texts, {
      pooling: "mean",
      normalize: true,
    });

    // Output dimensions: [batch_size, embedding_dim]
    const data = output.data as Float32Array;
    const embeddingDim = output.dims[1];
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i++) {
      const start = i * embeddingDim;
      const end = start + embeddingDim;
      let embedding = Array.from(data.slice(start, end));

      // Apply MRL truncation if requested
      if (
        this.requestedDimensions &&
        this.requestedDimensions < embedding.length
      ) {
        embedding = embedding.slice(0, this.requestedDimensions);
        // Re-normalize after truncation
        const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
        embedding = embedding.map((v) => v / norm);
      }

      results.push(embedding);
    }

    return results;
  }

  /**
   * Get the embedding dimension for this model
   */
  getEmbeddingDimension(): number {
    // If user requested specific dimensions (MRL), use that
    if (this.requestedDimensions) {
      return this.requestedDimensions;
    }

    // Use known model dimensions
    if (this.modelName && this.modelName in TRANSFORMERS_MODELS) {
      return TRANSFORMERS_MODELS[this.modelName].dimensions;
    }

    // Default fallback for unknown models
    return 384;
  }

  /**
   * Get the model ID being used
   */
  getModelId(): string {
    return this.modelId;
  }

  /**
   * Check if model is already cached (no download needed)
   */
  isModelCached(): boolean {
    // Check if the model directory exists in cache
    const modelDir = join(this.cacheDir, this.modelId.replace("/", "--"));
    return existsSync(modelDir);
  }

  /**
   * List available pre-configured models
   */
  static listModels(): Array<{
    name: TransformersModelName;
    id: string;
    dimensions: number;
    size: string;
    description: string;
  }> {
    return Object.entries(TRANSFORMERS_MODELS).map(([name, info]) => ({
      name: name as TransformersModelName,
      ...info,
    }));
  }
}
