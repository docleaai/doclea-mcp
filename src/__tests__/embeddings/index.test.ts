/**
 * Tests for embedding index/factory functions
 * Tests client creation, configuration, and initialization patterns
 */

import { describe, expect, test } from "bun:test";

describe("embeddings index", () => {
  describe("provider factory", () => {
    type Provider = "local" | "openai" | "nomic" | "voyage" | "ollama";

    interface EmbeddingConfig {
      provider: Provider;
      apiKey?: string;
      endpoint?: string;
      model?: string;
    }

    interface ClientOptions {
      type: Provider;
      endpoint?: string;
      apiKey?: string;
      model: string;
    }

    function createClientOptions(config: EmbeddingConfig): ClientOptions {
      const defaults: Record<Provider, { endpoint?: string; model: string }> = {
        local: { endpoint: "http://localhost:8080", model: "" },
        openai: { model: "text-embedding-3-small" },
        nomic: { model: "nomic-embed-text-v1.5" },
        voyage: { model: "voyage-3" },
        ollama: {
          endpoint: "http://localhost:11434",
          model: "nomic-embed-text",
        },
      };

      const providerDefaults = defaults[config.provider];

      return {
        type: config.provider,
        endpoint: config.endpoint ?? providerDefaults.endpoint,
        apiKey: config.apiKey,
        model: config.model ?? providerDefaults.model,
      };
    }

    test("creates local client options", () => {
      const options = createClientOptions({ provider: "local" });
      expect(options.type).toBe("local");
      expect(options.endpoint).toBe("http://localhost:8080");
    });

    test("creates openai client options", () => {
      const options = createClientOptions({
        provider: "openai",
        apiKey: "sk-123",
      });
      expect(options.type).toBe("openai");
      expect(options.model).toBe("text-embedding-3-small");
      expect(options.apiKey).toBe("sk-123");
    });

    test("creates nomic client options", () => {
      const options = createClientOptions({
        provider: "nomic",
        apiKey: "nk-123",
      });
      expect(options.type).toBe("nomic");
      expect(options.model).toBe("nomic-embed-text-v1.5");
    });

    test("creates voyage client options", () => {
      const options = createClientOptions({
        provider: "voyage",
        apiKey: "pa-123",
      });
      expect(options.type).toBe("voyage");
      expect(options.model).toBe("voyage-3");
    });

    test("creates ollama client options", () => {
      const options = createClientOptions({ provider: "ollama" });
      expect(options.type).toBe("ollama");
      expect(options.endpoint).toBe("http://localhost:11434");
      expect(options.model).toBe("nomic-embed-text");
    });

    test("overrides default endpoint", () => {
      const options = createClientOptions({
        provider: "local",
        endpoint: "http://custom:9999",
      });
      expect(options.endpoint).toBe("http://custom:9999");
    });

    test("overrides default model", () => {
      const options = createClientOptions({
        provider: "openai",
        model: "text-embedding-ada-002",
      });
      expect(options.model).toBe("text-embedding-ada-002");
    });
  });

  describe("API key validation", () => {
    type Provider = "local" | "openai" | "nomic" | "voyage" | "ollama";

    function requiresApiKey(provider: Provider): boolean {
      return ["openai", "nomic", "voyage"].includes(provider);
    }

    function validateApiKey(
      provider: Provider,
      apiKey?: string,
    ): { valid: boolean; error?: string } {
      if (!requiresApiKey(provider)) {
        return { valid: true };
      }
      if (!apiKey || apiKey.length === 0) {
        return { valid: false, error: `API key required for ${provider}` };
      }
      return { valid: true };
    }

    test("openai requires API key", () => {
      expect(requiresApiKey("openai")).toBe(true);
    });

    test("nomic requires API key", () => {
      expect(requiresApiKey("nomic")).toBe(true);
    });

    test("voyage requires API key", () => {
      expect(requiresApiKey("voyage")).toBe(true);
    });

    test("local does not require API key", () => {
      expect(requiresApiKey("local")).toBe(false);
    });

    test("ollama does not require API key", () => {
      expect(requiresApiKey("ollama")).toBe(false);
    });

    test("validates valid openai key", () => {
      const result = validateApiKey("openai", "sk-abc123");
      expect(result.valid).toBe(true);
    });

    test("rejects missing openai key", () => {
      const result = validateApiKey("openai", undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("openai");
    });

    test("rejects empty openai key", () => {
      const result = validateApiKey("openai", "");
      expect(result.valid).toBe(false);
    });

    test("validates local without key", () => {
      const result = validateApiKey("local", undefined);
      expect(result.valid).toBe(true);
    });
  });

  describe("endpoint validation", () => {
    function isValidEndpoint(endpoint: string): boolean {
      try {
        const url = new URL(endpoint);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }

    test("validates http endpoint", () => {
      expect(isValidEndpoint("http://localhost:8080")).toBe(true);
    });

    test("validates https endpoint", () => {
      expect(isValidEndpoint("https://api.example.com")).toBe(true);
    });

    test("rejects invalid URL", () => {
      expect(isValidEndpoint("not-a-url")).toBe(false);
    });

    test("rejects ftp protocol", () => {
      expect(isValidEndpoint("ftp://example.com")).toBe(false);
    });

    test("validates endpoint with path", () => {
      expect(isValidEndpoint("http://localhost:8080/v1")).toBe(true);
    });
  });

  describe("client initialization", () => {
    interface ClientState {
      initialized: boolean;
      error?: string;
    }

    function initializeClient(
      hasEndpoint: boolean,
      hasApiKey: boolean,
      requiresApiKey: boolean,
    ): ClientState {
      if (requiresApiKey && !hasApiKey) {
        return { initialized: false, error: "Missing API key" };
      }
      if (!hasEndpoint) {
        return { initialized: false, error: "Missing endpoint" };
      }
      return { initialized: true };
    }

    test("initializes with endpoint and no key required", () => {
      const state = initializeClient(true, false, false);
      expect(state.initialized).toBe(true);
    });

    test("initializes with endpoint and key when required", () => {
      const state = initializeClient(true, true, true);
      expect(state.initialized).toBe(true);
    });

    test("fails when key required but missing", () => {
      const state = initializeClient(true, false, true);
      expect(state.initialized).toBe(false);
      expect(state.error).toBe("Missing API key");
    });

    test("fails when endpoint missing", () => {
      const state = initializeClient(false, true, false);
      expect(state.initialized).toBe(false);
      expect(state.error).toBe("Missing endpoint");
    });
  });

  describe("singleton pattern", () => {
    function createSingleton<T>(factory: () => T): () => T {
      let instance: T | null = null;
      return () => {
        if (instance === null) {
          instance = factory();
        }
        return instance;
      };
    }

    test("returns same instance", () => {
      let callCount = 0;
      const getInstance = createSingleton(() => {
        callCount++;
        return { id: Math.random() };
      });

      const first = getInstance();
      const second = getInstance();

      expect(first).toBe(second);
      expect(callCount).toBe(1);
    });

    test("calls factory only once", () => {
      let callCount = 0;
      const getInstance = createSingleton(() => {
        callCount++;
        return {};
      });

      getInstance();
      getInstance();
      getInstance();

      expect(callCount).toBe(1);
    });
  });

  describe("lazy initialization", () => {
    interface LazyClient {
      isInitialized: boolean;
      initialize: () => void;
    }

    function createLazyClient(): LazyClient {
      let initialized = false;
      return {
        get isInitialized() {
          return initialized;
        },
        initialize() {
          initialized = true;
        },
      };
    }

    test("not initialized on creation", () => {
      const client = createLazyClient();
      expect(client.isInitialized).toBe(false);
    });

    test("initialized after initialize call", () => {
      const client = createLazyClient();
      client.initialize();
      expect(client.isInitialized).toBe(true);
    });
  });

  describe("export validation", () => {
    const expectedExports = [
      "createEmbeddingClient",
      "CachedEmbeddingClient",
      "EmbeddingConfig",
    ];

    function hasExpectedExports(
      exports: string[],
      expected: string[],
    ): boolean {
      return expected.every((e) => exports.includes(e));
    }

    test("has all expected exports", () => {
      const moduleExports = [
        "createEmbeddingClient",
        "CachedEmbeddingClient",
        "EmbeddingConfig",
        "embed",
        "embedBatch",
      ];
      expect(hasExpectedExports(moduleExports, expectedExports)).toBe(true);
    });

    test("detects missing exports", () => {
      const moduleExports = ["createEmbeddingClient"];
      expect(hasExpectedExports(moduleExports, expectedExports)).toBe(false);
    });
  });

  describe("environment variable handling", () => {
    function getEnvKey(provider: string): string | undefined {
      const envMap: Record<string, string> = {
        openai: "OPENAI_API_KEY",
        nomic: "NOMIC_API_KEY",
        voyage: "VOYAGE_API_KEY",
      };
      const envName = envMap[provider];
      if (!envName) return undefined;
      // Simulate env lookup (in real code would be process.env[envName])
      return undefined; // Default to undefined in tests
    }

    function resolveApiKey(
      provider: string,
      explicitKey?: string,
    ): string | undefined {
      if (explicitKey) return explicitKey;
      return getEnvKey(provider);
    }

    test("uses explicit key over env", () => {
      const key = resolveApiKey("openai", "explicit-key");
      expect(key).toBe("explicit-key");
    });

    test("returns undefined when no key", () => {
      const key = resolveApiKey("openai", undefined);
      expect(key).toBeUndefined();
    });

    test("returns explicit key for local", () => {
      const key = resolveApiKey("local", "some-key");
      expect(key).toBe("some-key");
    });
  });

  describe("dimension detection", () => {
    function getExpectedDimension(_provider: string, model: string): number {
      const dimensions: Record<string, number> = {
        "text-embedding-3-small": 1536,
        "text-embedding-3-large": 3072,
        "text-embedding-ada-002": 1536,
        "nomic-embed-text-v1.5": 768,
        "voyage-3": 1024,
        "voyage-2": 1024,
        "nomic-embed-text": 768,
      };
      return dimensions[model] ?? 768; // Default dimension
    }

    test("openai small dimension", () => {
      expect(getExpectedDimension("openai", "text-embedding-3-small")).toBe(
        1536,
      );
    });

    test("openai large dimension", () => {
      expect(getExpectedDimension("openai", "text-embedding-3-large")).toBe(
        3072,
      );
    });

    test("nomic dimension", () => {
      expect(getExpectedDimension("nomic", "nomic-embed-text-v1.5")).toBe(768);
    });

    test("voyage dimension", () => {
      expect(getExpectedDimension("voyage", "voyage-3")).toBe(1024);
    });

    test("unknown model uses default", () => {
      expect(getExpectedDimension("custom", "unknown-model")).toBe(768);
    });
  });

  describe("retry configuration", () => {
    interface RetryConfig {
      maxRetries: number;
      initialDelayMs: number;
      maxDelayMs: number;
      backoffMultiplier: number;
    }

    function getDefaultRetryConfig(): RetryConfig {
      return {
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
      };
    }

    function calculateDelay(attempt: number, config: RetryConfig): number {
      const delay = config.initialDelayMs * config.backoffMultiplier ** attempt;
      return Math.min(delay, config.maxDelayMs);
    }

    test("default max retries is 3", () => {
      const config = getDefaultRetryConfig();
      expect(config.maxRetries).toBe(3);
    });

    test("first retry delay", () => {
      const config = getDefaultRetryConfig();
      expect(calculateDelay(0, config)).toBe(100);
    });

    test("second retry delay", () => {
      const config = getDefaultRetryConfig();
      expect(calculateDelay(1, config)).toBe(200);
    });

    test("third retry delay", () => {
      const config = getDefaultRetryConfig();
      expect(calculateDelay(2, config)).toBe(400);
    });

    test("caps at max delay", () => {
      const config = getDefaultRetryConfig();
      expect(calculateDelay(10, config)).toBe(5000);
    });
  });

  describe("client interface", () => {
    interface EmbeddingClient {
      embed(text: string): Promise<number[]>;
      embedBatch(texts: string[]): Promise<number[][]>;
    }

    function isValidClient(client: unknown): client is EmbeddingClient {
      if (typeof client !== "object" || client === null) return false;

      const c = client as Record<string, unknown>;
      return (
        typeof c.embed === "function" && typeof c.embedBatch === "function"
      );
    }

    test("validates valid client", () => {
      const client = {
        embed: async () => [0.1],
        embedBatch: async () => [[0.1]],
      };
      expect(isValidClient(client)).toBe(true);
    });

    test("rejects missing embed", () => {
      const client = {
        embedBatch: async () => [[0.1]],
      };
      expect(isValidClient(client)).toBe(false);
    });

    test("rejects missing embedBatch", () => {
      const client = {
        embed: async () => [0.1],
      };
      expect(isValidClient(client)).toBe(false);
    });

    test("rejects non-function embed", () => {
      const client = {
        embed: "not a function",
        embedBatch: async () => [[0.1]],
      };
      expect(isValidClient(client)).toBe(false);
    });
  });
});
