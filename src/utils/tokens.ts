import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AutoTokenizer, env } from "@huggingface/transformers";

/**
 * Supported tokenizer models
 * Should align with embedding models for accurate token counting
 */
export const TOKENIZER_MODELS = {
  // Default - matches mxbai-embed-xsmall-v1 embedding model
  "mxbai-embed-xsmall-v1": "mixedbread-ai/mxbai-embed-xsmall-v1",
  // Classic model - matches all-MiniLM-L6-v2 embedding model
  "all-MiniLM-L6-v2": "Xenova/all-MiniLM-L6-v2",
  // Larger models
  "all-mpnet-base-v2": "Xenova/all-mpnet-base-v2",
} as const;

export type TokenizerModelName = keyof typeof TOKENIZER_MODELS;

// Default tokenizer - matches default embedding model
const DEFAULT_TOKENIZER: TokenizerModelName = "mxbai-embed-xsmall-v1";

// XDG-compliant cache directory (shared with embeddings)
function getCacheDir(): string {
  const xdgCache = process.env.XDG_CACHE_HOME;
  const baseDir = xdgCache || join(homedir(), ".cache");
  return join(baseDir, "doclea", "transformers");
}

// Tokenizer instance cache - one per model
const tokenizerCache = new Map<
  string,
  Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>
>();

// Initialization promises to prevent race conditions
const initPromises = new Map<string, Promise<void>>();

/**
 * Get or initialize a tokenizer for the specified model
 * Uses lazy initialization with caching and race-condition prevention
 */
export async function getTokenizer(
  model: TokenizerModelName | string = DEFAULT_TOKENIZER,
): Promise<Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>> {
  // Resolve model ID
  const modelId =
    model in TOKENIZER_MODELS
      ? TOKENIZER_MODELS[model as TokenizerModelName]
      : model;

  // Return cached tokenizer if available
  if (tokenizerCache.has(modelId)) {
    return tokenizerCache.get(modelId)!;
  }

  // Use existing initialization promise if in progress
  if (initPromises.has(modelId)) {
    await initPromises.get(modelId);
    return tokenizerCache.get(modelId)!;
  }

  // Start new initialization
  const initPromise = (async () => {
    const cacheDir = getCacheDir();

    // Ensure cache directory exists
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    // Configure transformers.js environment
    env.cacheDir = cacheDir;

    // Load tokenizer
    const tokenizer = await AutoTokenizer.from_pretrained(modelId);
    tokenizerCache.set(modelId, tokenizer);
  })();

  initPromises.set(modelId, initPromise);

  try {
    await initPromise;
  } finally {
    initPromises.delete(modelId);
  }

  return tokenizerCache.get(modelId)!;
}

/**
 * Count the number of tokens in a text string
 *
 * @param text - The text to tokenize
 * @param model - Optional model name (defaults to mxbai-embed-xsmall-v1)
 * @returns Number of tokens
 *
 * @example
 * const count = await countTokens("Hello world");
 * console.log(count); // 2
 */
export async function countTokens(
  text: string,
  model?: TokenizerModelName | string,
): Promise<number> {
  if (!text) return 0;

  const tokenizer = await getTokenizer(model);
  const encoded = tokenizer.encode(text);
  return encoded.length;
}

/**
 * Truncate text to fit within a maximum token limit
 * Preserves whole tokens (no mid-token cuts)
 *
 * @param text - The text to truncate
 * @param maxTokens - Maximum number of tokens
 * @param model - Optional model name
 * @returns Truncated text
 *
 * @example
 * const truncated = await truncateToTokens("Hello world, this is a test", 3);
 * console.log(truncated); // "Hello world,"
 */
export async function truncateToTokens(
  text: string,
  maxTokens: number,
  model?: TokenizerModelName | string,
): Promise<string> {
  if (!text) return "";
  if (maxTokens <= 0) return "";

  const tokenizer = await getTokenizer(model);
  const encoded = tokenizer.encode(text);

  if (encoded.length <= maxTokens) {
    return text;
  }

  const truncated = encoded.slice(0, maxTokens);
  return tokenizer.decode(truncated, { skip_special_tokens: true });
}

/**
 * Count tokens for multiple texts efficiently
 *
 * @param texts - Array of texts to tokenize
 * @param model - Optional model name
 * @returns Array of token counts
 *
 * @example
 * const counts = await countTokensBatch(["Hello", "World", "Test"]);
 * console.log(counts); // [1, 1, 1]
 */
export async function countTokensBatch(
  texts: string[],
  model?: TokenizerModelName | string,
): Promise<number[]> {
  if (texts.length === 0) return [];

  const tokenizer = await getTokenizer(model);
  return texts.map((text) => {
    if (!text) return 0;
    const encoded = tokenizer.encode(text);
    return encoded.length;
  });
}

/**
 * Check if text fits within a token budget
 *
 * @param text - The text to check
 * @param maxTokens - Maximum allowed tokens
 * @param model - Optional model name
 * @returns True if text fits within budget
 */
export async function fitsInTokenBudget(
  text: string,
  maxTokens: number,
  model?: TokenizerModelName | string,
): Promise<boolean> {
  const count = await countTokens(text, model);
  return count <= maxTokens;
}

/**
 * Split text into chunks that fit within a token limit
 * Attempts to split on sentence boundaries when possible
 *
 * @param text - The text to split
 * @param maxTokensPerChunk - Maximum tokens per chunk
 * @param overlap - Number of overlapping tokens between chunks (default: 0)
 * @param model - Optional model name
 * @returns Array of text chunks
 */
export async function splitIntoTokenChunks(
  text: string,
  maxTokensPerChunk: number,
  overlap = 0,
  model?: TokenizerModelName | string,
): Promise<string[]> {
  if (!text) return [];
  if (maxTokensPerChunk <= 0) return [];

  const tokenizer = await getTokenizer(model);
  const encoded = tokenizer.encode(text);

  if (encoded.length <= maxTokensPerChunk) {
    return [text];
  }

  const chunks: string[] = [];
  const step = Math.max(1, maxTokensPerChunk - overlap);
  let start = 0;

  while (start < encoded.length) {
    const end = Math.min(start + maxTokensPerChunk, encoded.length);
    const chunkTokens = encoded.slice(start, end);
    const chunkText = tokenizer.decode(chunkTokens, {
      skip_special_tokens: true,
    });
    chunks.push(chunkText);
    start += step;
  }

  return chunks;
}

/**
 * Get token-level information about text
 * Useful for debugging and understanding tokenization
 *
 * @param text - The text to analyze
 * @param model - Optional model name
 * @returns Token information including count and individual tokens
 */
export async function getTokenInfo(
  text: string,
  model?: TokenizerModelName | string,
): Promise<{
  count: number;
  tokens: string[];
  tokenIds: number[];
}> {
  if (!text) {
    return { count: 0, tokens: [], tokenIds: [] };
  }

  const tokenizer = await getTokenizer(model);
  const encoded = tokenizer.encode(text);

  // Decode each token individually to get string representation
  const tokens = encoded.map((id: number) =>
    tokenizer.decode([id], { skip_special_tokens: true }),
  );

  return {
    count: encoded.length,
    tokens,
    tokenIds: Array.from(encoded),
  };
}