/**
 * Tests for config loading and path resolution
 */

import { describe, expect, test } from "bun:test";

describe("config", () => {
  const CONFIG_FILE = ".doclea/config.json";

  describe("config file path", () => {
    function getConfigPath(projectPath: string): string {
      return `${projectPath}/${CONFIG_FILE}`;
    }

    test("builds correct path", () => {
      expect(getConfigPath("/home/user/project")).toBe(
        "/home/user/project/.doclea/config.json",
      );
    });

    test("handles root path", () => {
      expect(getConfigPath("/")).toBe("//.doclea/config.json");
    });

    test("handles relative path", () => {
      expect(getConfigPath(".")).toBe("./.doclea/config.json");
    });
  });

  describe("db path resolution", () => {
    interface Config {
      storage: { dbPath: string };
    }

    function getDbPath(config: Config, projectPath: string): string {
      return `${projectPath}/${config.storage.dbPath}`;
    }

    test("resolves db path from config", () => {
      const config = { storage: { dbPath: ".doclea/local.db" } };
      expect(getDbPath(config, "/home/user/project")).toBe(
        "/home/user/project/.doclea/local.db",
      );
    });

    test("handles custom db path", () => {
      const config = { storage: { dbPath: "data/memories.db" } };
      expect(getDbPath(config, "/project")).toBe("/project/data/memories.db");
    });
  });

  describe("default config structure", () => {
    interface DefaultConfig {
      embedding: { provider: string; endpoint: string };
      qdrant: { url: string; collectionName: string };
      storage: { dbPath: string };
    }

    const DEFAULT_CONFIG: DefaultConfig = {
      embedding: { provider: "local", endpoint: "http://localhost:8080" },
      qdrant: {
        url: "http://localhost:6333",
        collectionName: "doclea_memories",
      },
      storage: { dbPath: ".doclea/local.db" },
    };

    test("uses local provider by default", () => {
      expect(DEFAULT_CONFIG.embedding.provider).toBe("local");
    });

    test("uses default local endpoint", () => {
      expect(DEFAULT_CONFIG.embedding.endpoint).toBe("http://localhost:8080");
    });

    test("uses default qdrant url", () => {
      expect(DEFAULT_CONFIG.qdrant.url).toBe("http://localhost:6333");
    });

    test("uses default collection name", () => {
      expect(DEFAULT_CONFIG.qdrant.collectionName).toBe("doclea_memories");
    });

    test("uses default db path", () => {
      expect(DEFAULT_CONFIG.storage.dbPath).toBe(".doclea/local.db");
    });
  });

  describe("config validation", () => {
    interface Config {
      embedding: { provider: string };
      qdrant: { url: string; collectionName: string };
      storage: { dbPath: string };
    }

    function isValidConfig(config: unknown): config is Config {
      if (typeof config !== "object" || config === null) return false;

      const c = config as Record<string, unknown>;

      if (typeof c.embedding !== "object" || c.embedding === null) return false;
      if (typeof c.qdrant !== "object" || c.qdrant === null) return false;
      if (typeof c.storage !== "object" || c.storage === null) return false;

      const embedding = c.embedding as Record<string, unknown>;
      const qdrant = c.qdrant as Record<string, unknown>;
      const storage = c.storage as Record<string, unknown>;

      return (
        typeof embedding.provider === "string" &&
        typeof qdrant.url === "string" &&
        typeof qdrant.collectionName === "string" &&
        typeof storage.dbPath === "string"
      );
    }

    test("validates complete config", () => {
      const config = {
        embedding: { provider: "local", endpoint: "http://localhost:8080" },
        qdrant: { url: "http://localhost:6333", collectionName: "memories" },
        storage: { dbPath: ".doclea/local.db" },
      };
      expect(isValidConfig(config)).toBe(true);
    });

    test("rejects missing embedding", () => {
      const config = {
        qdrant: { url: "http://localhost:6333", collectionName: "memories" },
        storage: { dbPath: ".doclea/local.db" },
      };
      expect(isValidConfig(config)).toBe(false);
    });

    test("rejects missing qdrant", () => {
      const config = {
        embedding: { provider: "local" },
        storage: { dbPath: ".doclea/local.db" },
      };
      expect(isValidConfig(config)).toBe(false);
    });

    test("rejects missing storage", () => {
      const config = {
        embedding: { provider: "local" },
        qdrant: { url: "http://localhost:6333", collectionName: "memories" },
      };
      expect(isValidConfig(config)).toBe(false);
    });

    test("rejects null config", () => {
      expect(isValidConfig(null)).toBe(false);
    });
  });

  describe("config error building", () => {
    function buildConfigError(path: string, message: string): string {
      return `Failed to load config from ${path}: ${message}`;
    }

    test("builds error message", () => {
      const error = buildConfigError(
        "/project/.doclea/config.json",
        "Invalid JSON",
      );
      expect(error).toBe(
        "Failed to load config from /project/.doclea/config.json: Invalid JSON",
      );
    });

    test("handles parse error", () => {
      const error = buildConfigError("/config.json", "Unexpected token");
      expect(error).toContain("Unexpected token");
    });
  });

  describe("embedding provider extraction", () => {
    type Provider = "local" | "openai" | "nomic" | "voyage" | "ollama";

    function getEmbeddingProvider(config: {
      embedding: { provider: string };
    }): Provider | null {
      const p = config.embedding.provider;
      if (["local", "openai", "nomic", "voyage", "ollama"].includes(p)) {
        return p as Provider;
      }
      return null;
    }

    test("extracts local provider", () => {
      expect(getEmbeddingProvider({ embedding: { provider: "local" } })).toBe(
        "local",
      );
    });

    test("extracts openai provider", () => {
      expect(getEmbeddingProvider({ embedding: { provider: "openai" } })).toBe(
        "openai",
      );
    });

    test("returns null for invalid provider", () => {
      expect(
        getEmbeddingProvider({ embedding: { provider: "invalid" } }),
      ).toBeNull();
    });
  });

  describe("qdrant config extraction", () => {
    interface QdrantConfig {
      url: string;
      apiKey?: string;
      collectionName: string;
    }

    function extractQdrantConfig(config: {
      qdrant: Record<string, unknown>;
    }): QdrantConfig | null {
      const q = config.qdrant;
      if (typeof q.url !== "string" || typeof q.collectionName !== "string") {
        return null;
      }
      return {
        url: q.url,
        apiKey: typeof q.apiKey === "string" ? q.apiKey : undefined,
        collectionName: q.collectionName,
      };
    }

    test("extracts complete qdrant config", () => {
      const config = {
        qdrant: {
          url: "http://localhost:6333",
          apiKey: "secret",
          collectionName: "memories",
        },
      };
      const extracted = extractQdrantConfig(config);
      expect(extracted?.url).toBe("http://localhost:6333");
      expect(extracted?.apiKey).toBe("secret");
      expect(extracted?.collectionName).toBe("memories");
    });

    test("extracts config without apiKey", () => {
      const config = {
        qdrant: { url: "http://localhost:6333", collectionName: "memories" },
      };
      const extracted = extractQdrantConfig(config);
      expect(extracted?.apiKey).toBeUndefined();
    });

    test("returns null for missing url", () => {
      const config = { qdrant: { collectionName: "memories" } };
      expect(extractQdrantConfig(config)).toBeNull();
    });
  });

  describe("auto-detection", () => {
    // Constants matching the implementation
    const QDRANT_DEFAULT_URL = "http://localhost:6333";
    const TEI_DEFAULT_ENDPOINT = "http://localhost:8080";

    interface Config {
      embedding: { provider: string; endpoint?: string; model?: string };
      vector: {
        provider: string;
        url?: string;
        collectionName?: string;
        dbPath?: string;
      };
      storage: { dbPath: string };
    }

    const DEFAULT_CONFIG: Config = {
      embedding: { provider: "transformers", model: "mxbai-embed-xsmall-v1" },
      vector: { provider: "sqlite-vec", dbPath: ".doclea/vectors.db" },
      storage: { dbPath: ".doclea/local.db" },
    };

    function simulateDetectConfig(
      qdrantRunning: boolean,
      teiRunning: boolean,
    ): Config {
      const config: Config = { ...DEFAULT_CONFIG };

      if (qdrantRunning) {
        config.vector = {
          provider: "qdrant",
          url: QDRANT_DEFAULT_URL,
          collectionName: "doclea-memories",
        };
      }

      if (teiRunning) {
        config.embedding = {
          provider: "local",
          endpoint: TEI_DEFAULT_ENDPOINT,
        };
      }

      return config;
    }

    test("uses embedded backends when no services running", () => {
      const config = simulateDetectConfig(false, false);
      expect(config.embedding.provider).toBe("transformers");
      expect(config.vector.provider).toBe("sqlite-vec");
    });

    test("uses Qdrant when running", () => {
      const config = simulateDetectConfig(true, false);
      expect(config.vector.provider).toBe("qdrant");
      expect(config.vector.url).toBe(QDRANT_DEFAULT_URL);
      expect(config.vector.collectionName).toBe("doclea-memories");
    });

    test("uses TEI when running", () => {
      const config = simulateDetectConfig(false, true);
      expect(config.embedding.provider).toBe("local");
      expect(config.embedding.endpoint).toBe(TEI_DEFAULT_ENDPOINT);
    });

    test("uses both Docker services when running", () => {
      const config = simulateDetectConfig(true, true);
      expect(config.embedding.provider).toBe("local");
      expect(config.vector.provider).toBe("qdrant");
    });

    test("keeps embedded storage regardless of services", () => {
      const configNoServices = simulateDetectConfig(false, false);
      const configAllServices = simulateDetectConfig(true, true);

      expect(configNoServices.storage.dbPath).toBe(".doclea/local.db");
      expect(configAllServices.storage.dbPath).toBe(".doclea/local.db");
    });
  });

  describe("vector config extraction (new schema)", () => {
    type VectorProvider = "sqlite-vec" | "qdrant";

    interface SqliteVecConfig {
      provider: "sqlite-vec";
      dbPath: string;
      vectorSize?: number;
    }

    interface QdrantConfig {
      provider: "qdrant";
      url: string;
      apiKey?: string;
      collectionName: string;
    }

    type VectorConfig = SqliteVecConfig | QdrantConfig;

    function extractVectorConfig(
      config: Record<string, unknown>,
    ): VectorConfig | null {
      if (typeof config.provider !== "string") return null;

      if (config.provider === "sqlite-vec") {
        if (typeof config.dbPath !== "string") return null;
        return {
          provider: "sqlite-vec",
          dbPath: config.dbPath,
          vectorSize:
            typeof config.vectorSize === "number"
              ? config.vectorSize
              : undefined,
        };
      }

      if (config.provider === "qdrant") {
        if (
          typeof config.url !== "string" ||
          typeof config.collectionName !== "string"
        ) {
          return null;
        }
        return {
          provider: "qdrant",
          url: config.url,
          apiKey: typeof config.apiKey === "string" ? config.apiKey : undefined,
          collectionName: config.collectionName,
        };
      }

      return null;
    }

    test("extracts sqlite-vec config", () => {
      const config = {
        provider: "sqlite-vec",
        dbPath: ".doclea/vectors.db",
        vectorSize: 384,
      };
      const extracted = extractVectorConfig(config);
      expect(extracted?.provider).toBe("sqlite-vec");
      expect((extracted as SqliteVecConfig)?.dbPath).toBe(".doclea/vectors.db");
      expect((extracted as SqliteVecConfig)?.vectorSize).toBe(384);
    });

    test("extracts qdrant config", () => {
      const config = {
        provider: "qdrant",
        url: "http://localhost:6333",
        collectionName: "memories",
      };
      const extracted = extractVectorConfig(config);
      expect(extracted?.provider).toBe("qdrant");
      expect((extracted as QdrantConfig)?.url).toBe("http://localhost:6333");
    });

    test("returns null for invalid provider", () => {
      const config = { provider: "invalid", dbPath: "test.db" };
      expect(extractVectorConfig(config)).toBeNull();
    });
  });

  describe("embedding provider extraction (new schema)", () => {
    type Provider =
      | "local"
      | "openai"
      | "nomic"
      | "voyage"
      | "ollama"
      | "transformers";

    function getEmbeddingProviderNew(config: {
      embedding: { provider: string };
    }): Provider | null {
      const p = config.embedding.provider;
      if (
        [
          "local",
          "openai",
          "nomic",
          "voyage",
          "ollama",
          "transformers",
        ].includes(p)
      ) {
        return p as Provider;
      }
      return null;
    }

    test("extracts transformers provider", () => {
      expect(
        getEmbeddingProviderNew({ embedding: { provider: "transformers" } }),
      ).toBe("transformers");
    });

    test("extracts local provider", () => {
      expect(
        getEmbeddingProviderNew({ embedding: { provider: "local" } }),
      ).toBe("local");
    });

    test("extracts all valid providers", () => {
      const providers: Provider[] = [
        "local",
        "openai",
        "nomic",
        "voyage",
        "ollama",
        "transformers",
      ];
      for (const provider of providers) {
        expect(getEmbeddingProviderNew({ embedding: { provider } })).toBe(
          provider,
        );
      }
    });
  });
});
