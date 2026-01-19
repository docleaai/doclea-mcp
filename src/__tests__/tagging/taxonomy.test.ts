import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  getTaxonomyManager,
  resetTaxonomyManager,
  TaxonomyManager,
  type TaxonomyStorage,
} from "@/tagging/taxonomy";
import type { TagDefinition } from "@/tagging/types";

/**
 * Mock in-memory storage for testing
 */
class MockTaxonomyStorage implements TaxonomyStorage {
  private tags = new Map<string, TagDefinition>();

  getAllCustomTags(): TagDefinition[] {
    return Array.from(this.tags.values());
  }

  getTag(canonical: string): TagDefinition | null {
    return this.tags.get(canonical) || null;
  }

  upsertTag(tag: TagDefinition): void {
    this.tags.set(tag.canonical, tag);
  }

  deleteTag(canonical: string): boolean {
    return this.tags.delete(canonical);
  }

  clear(): void {
    this.tags.clear();
  }
}

describe("TaxonomyManager", () => {
  beforeEach(() => {
    resetTaxonomyManager();
  });

  afterEach(() => {
    resetTaxonomyManager();
  });

  describe("singleton pattern", () => {
    it("should return same instance from getInstance", () => {
      const manager1 = TaxonomyManager.getInstance();
      const manager2 = TaxonomyManager.getInstance();
      expect(manager1).toBe(manager2);
    });

    it("should return same instance from getTaxonomyManager", () => {
      const manager1 = getTaxonomyManager();
      const manager2 = getTaxonomyManager();
      expect(manager1).toBe(manager2);
    });
  });

  describe("factory pattern", () => {
    it("should create initialized instance with storage", async () => {
      const storage = new MockTaxonomyStorage();
      const manager = await TaxonomyManager.create(storage);
      expect(manager.isInitialized()).toBe(true);
    });

    it("should return same instance if already created", async () => {
      const storage = new MockTaxonomyStorage();
      const manager1 = await TaxonomyManager.create(storage);
      const manager2 = await TaxonomyManager.create(storage);
      expect(manager1).toBe(manager2);
    });
  });

  describe("normalize", () => {
    let manager: TaxonomyManager;

    beforeEach(() => {
      manager = getTaxonomyManager();
    });

    it('should resolve alias "ts" to "typescript"', () => {
      expect(manager.normalize("ts")).toBe("typescript");
    });

    it('should resolve alias "k8s" to "kubernetes"', () => {
      expect(manager.normalize("k8s")).toBe("kubernetes");
    });

    it('should resolve alias "postgres" to "postgresql"', () => {
      expect(manager.normalize("postgres")).toBe("postgresql");
    });

    it('should resolve alias "reactjs" to "react"', () => {
      expect(manager.normalize("reactjs")).toBe("react");
    });

    it("should be case-insensitive", () => {
      expect(manager.normalize("TypeScript")).toBe("typescript");
      expect(manager.normalize("REACT")).toBe("react");
      expect(manager.normalize("Docker")).toBe("docker");
    });

    it("should return canonical for exact matches", () => {
      expect(manager.normalize("typescript")).toBe("typescript");
      expect(manager.normalize("react")).toBe("react");
    });

    it("should format unknown tags", () => {
      expect(manager.normalize("my-custom-tag")).toBe("my-custom-tag");
      expect(manager.normalize("Some New Tag")).toBe("some-new-tag");
      expect(manager.normalize("tag_with_underscores")).toBe(
        "tag-with-underscores",
      );
    });

    it("should return null for empty/invalid input", () => {
      expect(manager.normalize("")).toBeNull();
      expect(manager.normalize("   ")).toBeNull();
      expect(manager.normalize(null as any)).toBeNull();
    });

    describe("strict mode", () => {
      it("should return null for unknown tags in strict mode", () => {
        // Reset and create manager with strict mode
        resetTaxonomyManager();
        const strictManager = getTaxonomyManager();
        strictManager.updateConfig({ strictMode: true });
        expect(strictManager.normalize("ts")).toBe("typescript"); // Known alias
        expect(strictManager.normalize("unknown-tag")).toBeNull(); // Unknown
      });
    });
  });

  describe("normalizeTags", () => {
    let manager: TaxonomyManager;

    beforeEach(() => {
      manager = getTaxonomyManager();
    });

    it("should normalize array of tags", () => {
      const result = manager.normalizeTags(["ts", "postgres", "docker"]);
      expect(result).toEqual(["typescript", "postgresql", "docker"]);
    });

    it("should deduplicate tags", () => {
      const result = manager.normalizeTags([
        "ts",
        "typescript",
        "TypeScript",
        "TS",
      ]);
      expect(result).toEqual(["typescript"]);
    });

    it("should filter out invalid tags", () => {
      const result = manager.normalizeTags(["ts", "", "react", "   "]);
      expect(result).toEqual(["typescript", "react"]);
    });

    it("should handle empty array", () => {
      expect(manager.normalizeTags([])).toEqual([]);
    });

    it("should handle non-array input", () => {
      expect(manager.normalizeTags(null as any)).toEqual([]);
      expect(manager.normalizeTags("string" as any)).toEqual([]);
    });
  });

  describe("getDefinition", () => {
    let manager: TaxonomyManager;

    beforeEach(() => {
      manager = getTaxonomyManager();
    });

    it("should return definition for canonical name", () => {
      const def = manager.getDefinition("typescript");
      expect(def).not.toBeNull();
      expect(def?.canonical).toBe("typescript");
      expect(def?.category).toBe("technology");
    });

    it("should return definition for alias", () => {
      const def = manager.getDefinition("ts");
      expect(def).not.toBeNull();
      expect(def?.canonical).toBe("typescript");
    });

    it("should return null for unknown tag", () => {
      const def = manager.getDefinition("nonexistent-tag");
      expect(def).toBeNull();
    });
  });

  describe("hasTag", () => {
    let manager: TaxonomyManager;

    beforeEach(() => {
      manager = getTaxonomyManager();
    });

    it("should return true for existing canonical", () => {
      expect(manager.hasTag("typescript")).toBe(true);
    });

    it("should return true for existing alias", () => {
      expect(manager.hasTag("ts")).toBe(true);
      expect(manager.hasTag("k8s")).toBe(true);
    });

    it("should return false for unknown tag", () => {
      expect(manager.hasTag("nonexistent")).toBe(false);
    });
  });

  describe("custom tags", () => {
    let manager: TaxonomyManager;
    let storage: MockTaxonomyStorage;

    beforeEach(async () => {
      storage = new MockTaxonomyStorage();
      manager = await TaxonomyManager.create(storage);
    });

    it("should add custom tag", () => {
      manager.addCustomTag({
        canonical: "my-custom-tech",
        aliases: ["mct"],
        category: "technology",
        description: "My custom technology",
      });

      expect(manager.hasTag("my-custom-tech")).toBe(true);
      expect(manager.hasTag("mct")).toBe(true);
      expect(manager.normalize("mct")).toBe("my-custom-tech");
    });

    it("should persist custom tag to storage", () => {
      manager.addCustomTag({
        canonical: "custom-tag",
        aliases: [],
        category: "custom",
      });

      const stored = storage.getTag("custom-tag");
      expect(stored).not.toBeNull();
      expect(stored?.source).toBe("custom");
    });

    it("should throw error for collision with built-in tag", () => {
      expect(() => {
        manager.addCustomTag({
          canonical: "typescript",
          aliases: [],
          category: "technology",
        });
      }).toThrow(/conflicts with built-in/);
    });

    it("should throw error for alias collision with built-in", () => {
      expect(() => {
        manager.addCustomTag({
          canonical: "my-ts",
          aliases: ["ts"], // conflicts with typescript alias
          category: "technology",
        });
      }).toThrow(/conflicts with built-in/);
    });

    it("should allow override when allowOverride is true", async () => {
      resetTaxonomyManager();
      storage = new MockTaxonomyStorage();
      manager = await TaxonomyManager.create(storage, { allowOverride: true });

      // Should not throw
      manager.addCustomTag({
        canonical: "ts", // Override the "ts" alias
        aliases: [],
        category: "custom",
      });

      expect(manager.hasTag("ts")).toBe(true);
    });

    it("should remove custom tag", () => {
      manager.addCustomTag({
        canonical: "temp-tag",
        aliases: ["temp"],
        category: "custom",
      });

      expect(manager.hasTag("temp-tag")).toBe(true);

      const removed = manager.removeCustomTag("temp-tag");
      expect(removed).toBe(true);
      expect(manager.hasTag("temp-tag")).toBe(false);
      expect(manager.hasTag("temp")).toBe(false);
    });

    it("should not remove built-in tags", () => {
      const removed = manager.removeCustomTag("typescript");
      expect(removed).toBe(false);
      expect(manager.hasTag("typescript")).toBe(true);
    });

    it("should export and import custom tags", () => {
      manager.addCustomTag({
        canonical: "export-test",
        aliases: ["et"],
        category: "custom",
      });

      const exported = manager.exportCustomTags();
      expect(exported.length).toBeGreaterThan(0);
      expect(exported.find((t) => t.canonical === "export-test")).toBeDefined();
    });
  });

  describe("suggestTags", () => {
    let manager: TaxonomyManager;

    beforeEach(() => {
      manager = getTaxonomyManager();
    });

    it("should return exact match with score 1", () => {
      const suggestions = manager.suggestTags("react");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].tag.canonical).toBe("react");
      expect(suggestions[0].score).toBe(1);
      expect(suggestions[0].matchType).toBe("exact");
    });

    it("should return alias match with high score", () => {
      const suggestions = manager.suggestTags("ts");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].tag.canonical).toBe("typescript");
      expect(suggestions[0].matchType).toBe("alias");
    });

    it("should return fuzzy matches", () => {
      const suggestions = manager.suggestTags("typescrit"); // typo
      expect(suggestions.length).toBeGreaterThan(0);
      // typescript should be suggested as fuzzy match
      const tsMatch = suggestions.find((s) => s.tag.canonical === "typescript");
      expect(tsMatch).toBeDefined();
      expect(tsMatch?.matchType).toBe("fuzzy");
    });

    it("should limit results", () => {
      const suggestions = manager.suggestTags("a", 3);
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it("should handle empty query", () => {
      const suggestions = manager.suggestTags("");
      expect(suggestions.length).toBe(0);
    });
  });

  describe("getTagsByCategory", () => {
    let manager: TaxonomyManager;

    beforeEach(() => {
      manager = getTaxonomyManager();
    });

    it("should return tags in category", () => {
      const techTags = manager.getTagsByCategory("technology");
      expect(techTags.length).toBeGreaterThan(0);
      for (const tag of techTags) {
        expect(tag.category).toBe("technology");
      }
    });

    it("should return concept tags", () => {
      const conceptTags = manager.getTagsByCategory("concept");
      expect(conceptTags.length).toBeGreaterThan(0);
      expect(conceptTags.some((t) => t.canonical === "authentication")).toBe(
        true,
      );
    });
  });

  describe("getAllTags", () => {
    let manager: TaxonomyManager;

    beforeEach(() => {
      manager = getTaxonomyManager();
    });

    it("should return all built-in tags", () => {
      const allTags = manager.getAllTags();
      expect(allTags.length).toBeGreaterThan(50); // We have ~70 built-in tags
    });

    it("should include custom tags", async () => {
      const storage = new MockTaxonomyStorage();
      const mgr = await TaxonomyManager.create(storage);

      const countBefore = mgr.getAllTags().length;

      mgr.addCustomTag({
        canonical: "unique-custom",
        aliases: [],
        category: "custom",
      });

      const countAfter = mgr.getAllTags().length;
      expect(countAfter).toBe(countBefore + 1);
    });
  });

  describe("getChildTags", () => {
    let manager: TaxonomyManager;

    beforeEach(() => {
      manager = getTaxonomyManager();
    });

    it("should return child tags for parent", () => {
      const reactChildren = manager.getChildTags("react");
      expect(reactChildren.some((t) => t.canonical === "nextjs")).toBe(true);
    });

    it("should return children for nodejs", () => {
      const nodeChildren = manager.getChildTags("nodejs");
      expect(nodeChildren.length).toBeGreaterThan(0);
      // express, fastify, nestjs should be children
      expect(nodeChildren.some((t) => t.canonical === "express")).toBe(true);
    });

    it("should return empty array for tags without children", () => {
      const children = manager.getChildTags("vue");
      expect(children.length).toBe(0);
    });
  });

  describe("getStats", () => {
    let manager: TaxonomyManager;

    beforeEach(() => {
      manager = getTaxonomyManager();
    });

    it("should return statistics about taxonomy", () => {
      const stats = manager.getStats();
      expect(stats.builtInCount).toBeGreaterThan(0);
      expect(stats.totalCount).toBeGreaterThanOrEqual(stats.builtInCount);
      expect(stats.aliasCount).toBeGreaterThan(stats.builtInCount);
      expect(stats.byCategory.technology).toBeGreaterThan(0);
    });
  });

  describe("updateConfig", () => {
    let manager: TaxonomyManager;

    beforeEach(() => {
      manager = getTaxonomyManager();
    });

    it("should update configuration", () => {
      manager.updateConfig({ strictMode: true });
      const config = manager.getConfig();
      expect(config.strictMode).toBe(true);
    });

    it("should preserve other config options", () => {
      manager.updateConfig({ maxFuzzyDistance: 5 });
      const config = manager.getConfig();
      expect(config.maxFuzzyDistance).toBe(5);
      expect(config.minSuggestionScore).toBe(0.3); // default preserved
    });
  });
});
