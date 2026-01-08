import type { IStorageBackend } from "@/storage/interface";
import type { EmbeddingClient } from "./provider";

/**
 * Computes a SHA-256 hash of the content for cache key
 */
async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Wraps an embedding client with storage-based caching
 */
export class CachedEmbeddingClient implements EmbeddingClient {
  constructor(
    private client: EmbeddingClient,
    private storage: IStorageBackend,
    private model: string,
  ) {}

  async embed(text: string): Promise<number[]> {
    const contentHash = await hashContent(text);

    // Check cache first
    const cached = this.storage.getCachedEmbedding(contentHash, this.model);
    if (cached) {
      return cached;
    }

    // Generate embedding
    const embedding = await this.client.embed(text);

    // Cache it
    this.storage.setCachedEmbedding(contentHash, this.model, embedding);

    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // Compute hashes for all texts
    const hashes = await Promise.all(texts.map((t) => hashContent(t)));

    // Check cache for all
    const cachedMap = this.storage.getCachedEmbeddingsBatch(hashes, this.model);

    // Find which texts need embedding
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const hash = hashes[i];
      if (hash && !cachedMap.has(hash)) {
        uncachedIndices.push(i);
        uncachedTexts.push(texts[i] as string);
      }
    }

    // Generate embeddings for uncached texts
    let newEmbeddings: number[][] = [];
    if (uncachedTexts.length > 0) {
      newEmbeddings = await this.client.embedBatch(uncachedTexts);

      // Cache the new embeddings
      for (let i = 0; i < uncachedIndices.length; i++) {
        const idx = uncachedIndices[i];
        const hash = hashes[idx as number];
        const embedding = newEmbeddings[i];
        if (hash && embedding) {
          this.storage.setCachedEmbedding(hash, this.model, embedding);
        }
      }
    }

    // Assemble results in original order
    const results: number[][] = [];
    let uncachedIdx = 0;

    for (let i = 0; i < texts.length; i++) {
      const hash = hashes[i];
      if (hash) {
        const cached = cachedMap.get(hash);
        if (cached) {
          results.push(cached);
        } else {
          const embedding = newEmbeddings[uncachedIdx];
          if (embedding) {
            results.push(embedding);
          }
          uncachedIdx++;
        }
      }
    }

    return results;
  }
}
