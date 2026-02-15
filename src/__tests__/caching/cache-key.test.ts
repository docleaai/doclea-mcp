import { describe, expect, it } from "bun:test";
import {
  buildCacheKeyComponents,
  generateCacheKey,
  hashScoringConfig,
  normalizeCacheQuery,
} from "../../caching/cache-key";
import { DEFAULT_SCORING_CONFIG } from "../../scoring/types";

describe("generateCacheKey", () => {
  it("should generate consistent keys for same input", async () => {
    const components = {
      query: "test query",
      tokenBudget: 4000,
      includeCodeGraph: true,
      includeGraphRAG: true,
      includeEvidence: false,
      template: "default",
    };

    const key1 = await generateCacheKey(components);
    const key2 = await generateCacheKey(components);

    expect(key1).toBe(key2);
    expect(key1.length).toBe(64); // SHA-256 hex string
  });

  it("should generate different keys for different queries", async () => {
    const key1 = await generateCacheKey({
      query: "query 1",
      tokenBudget: 4000,
      includeCodeGraph: true,
      includeGraphRAG: true,
      includeEvidence: false,
      template: "default",
    });

    const key2 = await generateCacheKey({
      query: "query 2",
      tokenBudget: 4000,
      includeCodeGraph: true,
      includeGraphRAG: true,
      includeEvidence: false,
      template: "default",
    });

    expect(key1).not.toBe(key2);
  });

  it("should generate different keys for different token budgets", async () => {
    const key1 = await generateCacheKey({
      query: "test",
      tokenBudget: 4000,
      includeCodeGraph: true,
      includeGraphRAG: true,
      includeEvidence: false,
      template: "default",
    });

    const key2 = await generateCacheKey({
      query: "test",
      tokenBudget: 8000,
      includeCodeGraph: true,
      includeGraphRAG: true,
      includeEvidence: false,
      template: "default",
    });

    expect(key1).not.toBe(key2);
  });

  it("should be order-independent for object properties", async () => {
    const key1 = await generateCacheKey({
      query: "test",
      tokenBudget: 4000,
      includeCodeGraph: true,
      includeGraphRAG: true,
      includeEvidence: false,
      template: "default",
    });

    // Same properties in different order
    const key2 = await generateCacheKey({
      template: "default",
      includeGraphRAG: true,
      includeEvidence: false,
      includeCodeGraph: true,
      tokenBudget: 4000,
      query: "test",
    });

    expect(key1).toBe(key2);
  });
});

describe("hashScoringConfig", () => {
  it("should generate consistent hashes for same config", async () => {
    const hash1 = await hashScoringConfig(DEFAULT_SCORING_CONFIG);
    const hash2 = await hashScoringConfig(DEFAULT_SCORING_CONFIG);

    expect(hash1).toBe(hash2);
  });

  it("should generate different hashes for different weights", async () => {
    const hash1 = await hashScoringConfig(DEFAULT_SCORING_CONFIG);

    const modifiedConfig = {
      ...DEFAULT_SCORING_CONFIG,
      weights: {
        ...DEFAULT_SCORING_CONFIG.weights,
        semantic: 0.9,
      },
    };
    const hash2 = await hashScoringConfig(modifiedConfig);

    expect(hash1).not.toBe(hash2);
  });

  it("should ignore irrelevant config fields", async () => {
    const hash1 = await hashScoringConfig(DEFAULT_SCORING_CONFIG);

    const modifiedConfig = {
      ...DEFAULT_SCORING_CONFIG,
      searchOverfetch: 10, // This should not affect the hash
    };
    const hash2 = await hashScoringConfig(modifiedConfig);

    expect(hash1).toBe(hash2);
  });
});

describe("buildCacheKeyComponents", () => {
  it("should build components with defaults", async () => {
    const components = await buildCacheKeyComponents({
      query: "test query",
    });

    expect(components.query).toBe("test query");
    expect(components.tokenBudget).toBe(4000);
    expect(components.includeCodeGraph).toBe(true);
    expect(components.includeGraphRAG).toBe(true);
    expect(components.includeEvidence).toBe(false);
    expect(components.template).toBe("default");
  });

  it("normalizes cache-key query casing, whitespace, and edge punctuation", async () => {
    const components = await buildCacheKeyComponents({
      query: "  WHAT calls ValidateToken??  ",
    });

    expect(components.query).toBe("what calls validatetoken");
  });

  it("should include graph mode in key components", async () => {
    const components = await buildCacheKeyComponents({
      query: "test query",
      includeGraphRAG: false,
    });

    expect(components.includeGraphRAG).toBe(false);
  });

  it("should include evidence mode in key components", async () => {
    const components = await buildCacheKeyComponents({
      query: "test query",
      includeEvidence: true,
    });

    expect(components.includeEvidence).toBe(true);
  });

  it("should include filters when provided", async () => {
    const components = await buildCacheKeyComponents({
      query: "test",
      filters: {
        type: "decision",
        tags: ["tag1", "tag2"],
        minImportance: 0.5,
      },
    });

    expect(components.filters).toBeDefined();
    expect(components.filters?.type).toBe("decision");
    expect(components.filters?.tags).toEqual(["tag1", "tag2"]);
    expect(components.filters?.minImportance).toBe(0.5);
  });

  it("should sort tags for consistent ordering", async () => {
    const components1 = await buildCacheKeyComponents({
      query: "test",
      filters: { tags: ["b", "a", "c"] },
    });

    const components2 = await buildCacheKeyComponents({
      query: "test",
      filters: { tags: ["c", "a", "b"] },
    });

    expect(components1.filters?.tags).toEqual(["a", "b", "c"]);
    expect(components2.filters?.tags).toEqual(["a", "b", "c"]);
  });

  it("should include scoring config hash when enabled", async () => {
    const components = await buildCacheKeyComponents(
      { query: "test" },
      DEFAULT_SCORING_CONFIG,
    );

    expect(components.scoringConfigHash).toBeDefined();
    expect(components.scoringConfigHash?.length).toBe(64);
  });

  it("should not include scoring config hash when disabled", async () => {
    const components = await buildCacheKeyComponents(
      { query: "test" },
      { ...DEFAULT_SCORING_CONFIG, enabled: false },
    );

    expect(components.scoringConfigHash).toBeUndefined();
  });

  it("should omit empty filters", async () => {
    const components = await buildCacheKeyComponents({
      query: "test",
      filters: { tags: [] }, // Empty tags array
    });

    expect(components.filters?.tags).toBeUndefined();
  });

  it("should generate different keys for evidence mode", async () => {
    const withEvidence = await generateCacheKey({
      query: "test",
      tokenBudget: 4000,
      includeCodeGraph: true,
      includeGraphRAG: true,
      includeEvidence: true,
      template: "default",
    });
    const withoutEvidence = await generateCacheKey({
      query: "test",
      tokenBudget: 4000,
      includeCodeGraph: true,
      includeGraphRAG: true,
      includeEvidence: false,
      template: "default",
    });

    expect(withEvidence).not.toBe(withoutEvidence);
  });

  it("should generate different keys for graph mode", async () => {
    const withGraph = await generateCacheKey({
      query: "test",
      tokenBudget: 4000,
      includeCodeGraph: true,
      includeGraphRAG: true,
      includeEvidence: false,
      template: "default",
    });
    const withoutGraph = await generateCacheKey({
      query: "test",
      tokenBudget: 4000,
      includeCodeGraph: true,
      includeGraphRAG: false,
      includeEvidence: false,
      template: "default",
    });

    expect(withGraph).not.toBe(withoutGraph);
  });

  it("should generate identical keys for equivalent query variants", async () => {
    const key1 = await generateCacheKey(
      await buildCacheKeyComponents({
        query: "What calls validateToken?",
      }),
    );
    const key2 = await generateCacheKey(
      await buildCacheKeyComponents({
        query: "  what   calls validatetoken  ",
      }),
    );

    expect(key1).toBe(key2);
  });

  it("should preserve meaningful internal punctuation differences", async () => {
    const key1 = await generateCacheKey(
      await buildCacheKeyComponents({
        query: "c++ memory model",
      }),
    );
    const key2 = await generateCacheKey(
      await buildCacheKeyComponents({
        query: "c memory model",
      }),
    );

    expect(key1).not.toBe(key2);
  });

  it("collapses representative query variants to improve cache hit potential", async () => {
    const variants = [
      "What calls validateToken?",
      "what calls validatetoken",
      "  WHAT   calls validateToken?? ",
      '"what calls validateToken"',
      "What calls validateToken?!",
      "what calls validateToken",
      "What calls validateSession?",
      "  what calls validateSession  ",
    ];

    const rawUnique = new Set(variants).size;
    const normalizedQueries = await Promise.all(
      variants.map(
        async (query) => (await buildCacheKeyComponents({ query })).query,
      ),
    );
    const normalizedUnique = new Set(normalizedQueries).size;

    expect(normalizedUnique).toBeLessThan(rawUnique);
    expect(normalizedUnique).toBe(2);
  });
});

describe("normalizeCacheQuery", () => {
  it("falls back safely when edge-punctuation stripping empties the string", () => {
    expect(normalizeCacheQuery("???")).toBe("???");
  });
});
