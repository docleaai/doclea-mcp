import type { EmbeddingConfig } from "@/types";
import { TransformersEmbeddingClient } from "./transformers";

export interface EmbeddingClient {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export { CachedEmbeddingClient } from "./cached";
export type {
  TransformersEmbeddingConfig,
  TransformersModelName,
} from "./transformers";
export {
  TRANSFORMERS_MODELS,
  TransformersEmbeddingClient,
} from "./transformers";

export function createEmbeddingClient(
  config: EmbeddingConfig,
): EmbeddingClient {
  switch (config.provider) {
    case "local":
      return new LocalTEIClient(config.endpoint);
    case "openai":
      return new OpenAIClient(config.apiKey, config.model);
    case "nomic":
      return new NomicClient(config.apiKey, config.model);
    case "voyage":
      return new VoyageClient(config.apiKey, config.model);
    case "ollama":
      return new OllamaClient(config.endpoint, config.model);
    case "transformers":
      return new TransformersEmbeddingClient({
        model: config.model,
        cacheDir: config.cacheDir,
        dimensions: config.dimensions,
      });
  }
}

// Local HuggingFace Text Embeddings Inference
class LocalTEIClient implements EmbeddingClient {
  constructor(private endpoint: string) {}

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.endpoint}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: text }),
    });

    if (!response.ok) {
      throw new Error(`TEI embed failed: ${response.statusText}`);
    }

    const result = await response.json();
    // TEI returns [[...embedding...]] for single input
    return Array.isArray(result[0]) ? result[0] : result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.endpoint}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: texts }),
    });

    if (!response.ok) {
      throw new Error(`TEI embed batch failed: ${response.statusText}`);
    }

    return response.json();
  }
}

// OpenAI Embeddings
class OpenAIClient implements EmbeddingClient {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async embed(text: string): Promise<number[]> {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embed failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embed batch failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data.map((d: { embedding: number[] }) => d.embedding);
  }
}

// Nomic Embeddings
class NomicClient implements EmbeddingClient {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async embed(text: string): Promise<number[]> {
    const response = await fetch(
      "https://api-atlas.nomic.ai/v1/embedding/text",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          texts: [text],
          task_type: "search_document",
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Nomic embed failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.embeddings[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(
      "https://api-atlas.nomic.ai/v1/embedding/text",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          texts,
          task_type: "search_document",
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Nomic embed batch failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.embeddings;
  }
}

// Voyage AI Embeddings
class VoyageClient implements EmbeddingClient {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async embed(text: string): Promise<number[]> {
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Voyage embed failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      throw new Error(`Voyage embed batch failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data.map((d: { embedding: number[] }) => d.embedding);
  }
}

// Ollama Embeddings
class OllamaClient implements EmbeddingClient {
  constructor(
    private endpoint: string,
    private model: string,
  ) {}

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.endpoint}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embed failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama doesn't support batch, so we do sequential
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}
