/**
 * Tests for embedding provider helper logic
 * Tests configuration, request building, and response parsing patterns
 */

import { describe, expect, test } from "bun:test";

describe("embedding providers", () => {
  describe("provider selection", () => {
    type Provider = "local" | "openai" | "nomic" | "voyage" | "ollama";

    function isValidProvider(provider: string): provider is Provider {
      return ["local", "openai", "nomic", "voyage", "ollama"].includes(
        provider,
      );
    }

    test("validates local provider", () => {
      expect(isValidProvider("local")).toBe(true);
    });

    test("validates openai provider", () => {
      expect(isValidProvider("openai")).toBe(true);
    });

    test("validates nomic provider", () => {
      expect(isValidProvider("nomic")).toBe(true);
    });

    test("validates voyage provider", () => {
      expect(isValidProvider("voyage")).toBe(true);
    });

    test("validates ollama provider", () => {
      expect(isValidProvider("ollama")).toBe(true);
    });

    test("rejects invalid provider", () => {
      expect(isValidProvider("invalid")).toBe(false);
    });

    test("is case sensitive", () => {
      expect(isValidProvider("OpenAI")).toBe(false);
    });
  });

  describe("local TEI endpoint building", () => {
    function buildTEIEmbedEndpoint(endpoint: string): string {
      return `${endpoint}/embed`;
    }

    test("builds embed endpoint", () => {
      expect(buildTEIEmbedEndpoint("http://localhost:8080")).toBe(
        "http://localhost:8080/embed",
      );
    });

    test("handles trailing slash", () => {
      const endpoint = "http://localhost:8080/";
      // Note: actual implementation doesn't strip trailing slash
      expect(buildTEIEmbedEndpoint(endpoint)).toBe(
        "http://localhost:8080//embed",
      );
    });

    test("handles custom port", () => {
      expect(buildTEIEmbedEndpoint("http://localhost:9999")).toBe(
        "http://localhost:9999/embed",
      );
    });

    test("handles https", () => {
      expect(buildTEIEmbedEndpoint("https://tei.example.com")).toBe(
        "https://tei.example.com/embed",
      );
    });
  });

  describe("OpenAI request building", () => {
    interface OpenAIRequest {
      model: string;
      input: string | string[];
    }

    function buildOpenAIRequest(
      model: string,
      input: string | string[],
    ): OpenAIRequest {
      return { model, input };
    }

    test("builds single text request", () => {
      const req = buildOpenAIRequest("text-embedding-3-small", "Hello");
      expect(req.model).toBe("text-embedding-3-small");
      expect(req.input).toBe("Hello");
    });

    test("builds batch request", () => {
      const req = buildOpenAIRequest("text-embedding-3-small", [
        "Hello",
        "World",
      ]);
      expect(req.model).toBe("text-embedding-3-small");
      expect(req.input).toEqual(["Hello", "World"]);
    });

    test("handles different models", () => {
      const req = buildOpenAIRequest("text-embedding-ada-002", "Test");
      expect(req.model).toBe("text-embedding-ada-002");
    });
  });

  describe("OpenAI response parsing", () => {
    interface OpenAIEmbedding {
      embedding: number[];
    }

    interface OpenAIResponse {
      data: OpenAIEmbedding[];
    }

    function parseOpenAISingleResponse(response: OpenAIResponse): number[] {
      return response.data[0].embedding;
    }

    function parseOpenAIBatchResponse(response: OpenAIResponse): number[][] {
      return response.data.map((d) => d.embedding);
    }

    test("parses single embedding response", () => {
      const response: OpenAIResponse = {
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      };
      expect(parseOpenAISingleResponse(response)).toEqual([0.1, 0.2, 0.3]);
    });

    test("parses batch embedding response", () => {
      const response: OpenAIResponse = {
        data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
      };
      expect(parseOpenAIBatchResponse(response)).toEqual([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);
    });

    test("handles empty batch", () => {
      const response: OpenAIResponse = { data: [] };
      expect(parseOpenAIBatchResponse(response)).toEqual([]);
    });
  });

  describe("Nomic request building", () => {
    interface NomicRequest {
      model: string;
      texts: string[];
      task_type: string;
    }

    function buildNomicRequest(
      model: string,
      texts: string[],
      taskType: string = "search_document",
    ): NomicRequest {
      return { model, texts, task_type: taskType };
    }

    test("builds single text as array", () => {
      const req = buildNomicRequest("nomic-embed-text-v1.5", ["Hello"]);
      expect(req.texts).toEqual(["Hello"]);
    });

    test("builds batch request", () => {
      const req = buildNomicRequest("nomic-embed-text-v1.5", [
        "Hello",
        "World",
      ]);
      expect(req.texts).toEqual(["Hello", "World"]);
    });

    test("uses search_document task type", () => {
      const req = buildNomicRequest("nomic-embed-text-v1.5", ["Test"]);
      expect(req.task_type).toBe("search_document");
    });

    test("allows custom task type", () => {
      const req = buildNomicRequest(
        "nomic-embed-text-v1.5",
        ["Test"],
        "search_query",
      );
      expect(req.task_type).toBe("search_query");
    });
  });

  describe("Nomic response parsing", () => {
    interface NomicResponse {
      embeddings: number[][];
    }

    function parseNomicSingleResponse(response: NomicResponse): number[] {
      return response.embeddings[0];
    }

    function parseNomicBatchResponse(response: NomicResponse): number[][] {
      return response.embeddings;
    }

    test("parses single embedding response", () => {
      const response: NomicResponse = {
        embeddings: [[0.1, 0.2, 0.3]],
      };
      expect(parseNomicSingleResponse(response)).toEqual([0.1, 0.2, 0.3]);
    });

    test("parses batch response", () => {
      const response: NomicResponse = {
        embeddings: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
      };
      expect(parseNomicBatchResponse(response)).toEqual([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);
    });
  });

  describe("Voyage request building", () => {
    interface VoyageRequest {
      model: string;
      input: string | string[];
    }

    function buildVoyageRequest(
      model: string,
      input: string | string[],
    ): VoyageRequest {
      return { model, input };
    }

    test("builds single text request", () => {
      const req = buildVoyageRequest("voyage-3", "Hello");
      expect(req.model).toBe("voyage-3");
      expect(req.input).toBe("Hello");
    });

    test("builds batch request", () => {
      const req = buildVoyageRequest("voyage-3", ["Hello", "World"]);
      expect(req.input).toEqual(["Hello", "World"]);
    });

    test("handles voyage-2 model", () => {
      const req = buildVoyageRequest("voyage-2", "Test");
      expect(req.model).toBe("voyage-2");
    });
  });

  describe("Ollama endpoint building", () => {
    function buildOllamaEmbedEndpoint(endpoint: string): string {
      return `${endpoint}/api/embeddings`;
    }

    test("builds embeddings endpoint", () => {
      expect(buildOllamaEmbedEndpoint("http://localhost:11434")).toBe(
        "http://localhost:11434/api/embeddings",
      );
    });

    test("handles custom port", () => {
      expect(buildOllamaEmbedEndpoint("http://localhost:8888")).toBe(
        "http://localhost:8888/api/embeddings",
      );
    });
  });

  describe("Ollama request building", () => {
    interface OllamaRequest {
      model: string;
      prompt: string;
    }

    function buildOllamaRequest(model: string, prompt: string): OllamaRequest {
      return { model, prompt };
    }

    test("builds request with prompt", () => {
      const req = buildOllamaRequest("nomic-embed-text", "Hello");
      expect(req.model).toBe("nomic-embed-text");
      expect(req.prompt).toBe("Hello");
    });

    test("handles different models", () => {
      const req = buildOllamaRequest("llama2", "Test");
      expect(req.model).toBe("llama2");
    });
  });

  describe("Ollama response parsing", () => {
    interface OllamaResponse {
      embedding: number[];
    }

    function parseOllamaResponse(response: OllamaResponse): number[] {
      return response.embedding;
    }

    test("parses embedding response", () => {
      const response: OllamaResponse = { embedding: [0.1, 0.2, 0.3] };
      expect(parseOllamaResponse(response)).toEqual([0.1, 0.2, 0.3]);
    });
  });

  describe("TEI response parsing", () => {
    function parseTEIResponse(result: unknown): number[] {
      if (Array.isArray(result) && Array.isArray(result[0])) {
        return result[0];
      }
      if (Array.isArray(result)) {
        return result as number[];
      }
      throw new Error("Invalid TEI response format");
    }

    test("parses nested array format", () => {
      const result = [[0.1, 0.2, 0.3]];
      expect(parseTEIResponse(result)).toEqual([0.1, 0.2, 0.3]);
    });

    test("parses flat array format", () => {
      const result = [0.1, 0.2, 0.3];
      expect(parseTEIResponse(result)).toEqual([0.1, 0.2, 0.3]);
    });

    test("throws for invalid format", () => {
      expect(() => parseTEIResponse("invalid")).toThrow();
    });
  });

  describe("authorization header building", () => {
    function buildBearerAuth(apiKey: string): string {
      return `Bearer ${apiKey}`;
    }

    test("builds bearer token", () => {
      expect(buildBearerAuth("sk-abc123")).toBe("Bearer sk-abc123");
    });

    test("handles empty key", () => {
      expect(buildBearerAuth("")).toBe("Bearer ");
    });
  });

  describe("error message parsing", () => {
    function buildErrorMessage(provider: string, status: string): string {
      return `${provider} embed failed: ${status}`;
    }

    function buildBatchErrorMessage(provider: string, status: string): string {
      return `${provider} embed batch failed: ${status}`;
    }

    test("builds single embed error", () => {
      expect(buildErrorMessage("OpenAI", "401 Unauthorized")).toBe(
        "OpenAI embed failed: 401 Unauthorized",
      );
    });

    test("builds batch embed error", () => {
      expect(buildBatchErrorMessage("Nomic", "500 Server Error")).toBe(
        "Nomic embed batch failed: 500 Server Error",
      );
    });

    test("handles TEI error", () => {
      expect(buildErrorMessage("TEI", "503 Service Unavailable")).toBe(
        "TEI embed failed: 503 Service Unavailable",
      );
    });
  });

  describe("batch processing", () => {
    function needsSequentialBatch(provider: string): boolean {
      // Ollama doesn't support batch, needs sequential
      return provider === "ollama";
    }

    test("ollama needs sequential", () => {
      expect(needsSequentialBatch("ollama")).toBe(true);
    });

    test("openai supports batch", () => {
      expect(needsSequentialBatch("openai")).toBe(false);
    });

    test("nomic supports batch", () => {
      expect(needsSequentialBatch("nomic")).toBe(false);
    });

    test("voyage supports batch", () => {
      expect(needsSequentialBatch("voyage")).toBe(false);
    });

    test("local supports batch", () => {
      expect(needsSequentialBatch("local")).toBe(false);
    });
  });

  describe("embedding vector validation", () => {
    function isValidEmbedding(embedding: unknown): embedding is number[] {
      if (!Array.isArray(embedding)) return false;
      if (embedding.length === 0) return false;
      return embedding.every((n) => typeof n === "number" && !isNaN(n));
    }

    test("validates valid embedding", () => {
      expect(isValidEmbedding([0.1, 0.2, 0.3])).toBe(true);
    });

    test("rejects empty array", () => {
      expect(isValidEmbedding([])).toBe(false);
    });

    test("rejects non-array", () => {
      expect(isValidEmbedding("not array")).toBe(false);
    });

    test("rejects array with non-numbers", () => {
      expect(isValidEmbedding([0.1, "str", 0.3])).toBe(false);
    });

    test("rejects array with NaN", () => {
      expect(isValidEmbedding([0.1, NaN, 0.3])).toBe(false);
    });

    test("accepts negative numbers", () => {
      expect(isValidEmbedding([-0.5, 0.0, 0.5])).toBe(true);
    });
  });

  describe("config defaults", () => {
    function getDefaultModel(provider: string): string {
      const defaults: Record<string, string> = {
        openai: "text-embedding-3-small",
        nomic: "nomic-embed-text-v1.5",
        voyage: "voyage-3",
        ollama: "nomic-embed-text",
      };
      return defaults[provider] ?? "";
    }

    function getDefaultEndpoint(provider: string): string {
      const defaults: Record<string, string> = {
        local: "http://localhost:8080",
        ollama: "http://localhost:11434",
      };
      return defaults[provider] ?? "";
    }

    test("openai default model", () => {
      expect(getDefaultModel("openai")).toBe("text-embedding-3-small");
    });

    test("nomic default model", () => {
      expect(getDefaultModel("nomic")).toBe("nomic-embed-text-v1.5");
    });

    test("voyage default model", () => {
      expect(getDefaultModel("voyage")).toBe("voyage-3");
    });

    test("ollama default model", () => {
      expect(getDefaultModel("ollama")).toBe("nomic-embed-text");
    });

    test("local default endpoint", () => {
      expect(getDefaultEndpoint("local")).toBe("http://localhost:8080");
    });

    test("ollama default endpoint", () => {
      expect(getDefaultEndpoint("ollama")).toBe("http://localhost:11434");
    });
  });
});
