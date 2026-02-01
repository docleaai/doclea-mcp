import { getEncoding, type Tiktoken } from "js-tiktoken";

/**
 * Token counting utility using js-tiktoken with cl100k_base encoding
 * Compatible with GPT-4 and Claude tokenization
 */

// Lazy-initialized encoder (synchronous but we keep async API for compatibility)
let encoder: Tiktoken | null = null;

/**
 * Get the tiktoken encoder instance (lazy initialization)
 */
function getEncoder(): Tiktoken {
  if (!encoder) {
    encoder = getEncoding("cl100k_base");
  }
  return encoder;
}

/**
 * Count the number of tokens in a text string
 *
 * @param text - The text to tokenize
 * @returns Number of tokens
 *
 * @example
 * const count = await countTokens("Hello world");
 * console.log(count); // 2
 */
export async function countTokens(text: string): Promise<number> {
  if (!text) return 0;

  const enc = getEncoder();
  const tokens = enc.encode(text);
  return tokens.length;
}

/**
 * Truncate text to fit within a maximum token limit
 * Preserves whole tokens (no mid-token cuts)
 *
 * @param text - The text to truncate
 * @param maxTokens - Maximum number of tokens
 * @returns Truncated text
 *
 * @example
 * const truncated = await truncateToTokens("Hello world, this is a test", 3);
 * console.log(truncated); // "Hello world,"
 */
export async function truncateToTokens(
  text: string,
  maxTokens: number,
): Promise<string> {
  if (!text) return "";
  if (maxTokens <= 0) return "";

  const enc = getEncoder();
  const tokens = enc.encode(text);

  if (tokens.length <= maxTokens) {
    return text;
  }

  const truncatedTokens = tokens.slice(0, maxTokens);
  return enc.decode(truncatedTokens);
}

/**
 * Count tokens for multiple texts efficiently
 *
 * @param texts - Array of texts to tokenize
 * @returns Array of token counts
 *
 * @example
 * const counts = await countTokensBatch(["Hello", "World", "Test"]);
 * console.log(counts); // [1, 1, 1]
 */
export async function countTokensBatch(texts: string[]): Promise<number[]> {
  if (texts.length === 0) return [];

  const enc = getEncoder();
  return texts.map((text) => {
    if (!text) return 0;
    return enc.encode(text).length;
  });
}

/**
 * Check if text fits within a token budget
 *
 * @param text - The text to check
 * @param maxTokens - Maximum allowed tokens
 * @returns True if text fits within budget
 */
export async function fitsInTokenBudget(
  text: string,
  maxTokens: number,
): Promise<boolean> {
  const count = await countTokens(text);
  return count <= maxTokens;
}

/**
 * Split text into chunks that fit within a token limit
 *
 * @param text - The text to split
 * @param maxTokensPerChunk - Maximum tokens per chunk
 * @param overlap - Number of overlapping tokens between chunks (default: 0)
 * @returns Array of text chunks
 */
export async function splitIntoTokenChunks(
  text: string,
  maxTokensPerChunk: number,
  overlap = 0,
): Promise<string[]> {
  if (!text) return [];
  if (maxTokensPerChunk <= 0) return [];

  const enc = getEncoder();
  const tokens = enc.encode(text);

  if (tokens.length <= maxTokensPerChunk) {
    return [text];
  }

  const chunks: string[] = [];
  const step = Math.max(1, maxTokensPerChunk - overlap);
  let start = 0;

  while (start < tokens.length) {
    const end = Math.min(start + maxTokensPerChunk, tokens.length);
    const chunkTokens = tokens.slice(start, end);
    const chunkText = enc.decode(chunkTokens);
    chunks.push(chunkText);
    start += step;
  }

  return chunks;
}

/**
 * Token information returned by getTokenInfo
 */
export interface TokenInfo {
  count: number;
  tokens: string[];
  tokenIds: number[];
}

/**
 * Get token-level information about text
 * Useful for debugging and understanding tokenization
 *
 * @param text - The text to analyze
 * @returns Token information including count and individual tokens
 */
export async function getTokenInfo(text: string): Promise<TokenInfo> {
  if (!text) {
    return { count: 0, tokens: [], tokenIds: [] };
  }

  const enc = getEncoder();
  const tokenIds = enc.encode(text);

  // Decode each token individually to get string representation
  const tokens = tokenIds.map((id) => enc.decode([id]));

  return {
    count: tokenIds.length,
    tokens,
    tokenIds: Array.from(tokenIds),
  };
}
