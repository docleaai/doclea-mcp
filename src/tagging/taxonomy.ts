/**
 * TaxonomyManager - Manages tag vocabulary with canonical forms, aliases, and fuzzy matching
 *
 * Features:
 * - Canonical form normalization (ts → typescript, k8s → kubernetes)
 * - Category-based organization (technology, concept, domain, action, custom)
 * - Fuzzy tag suggestions using Levenshtein distance
 * - SQLite persistence for custom tags
 * - Factory pattern for safe async initialization
 */

import { BUILT_IN_TAXONOMY } from "./built-in-taxonomy";
import { stringSimilarity } from "./levenshtein";
import type {
  TagCategory,
  TagDefinition,
  TagMatchType,
  TagSuggestion,
  TaxonomyConfig,
} from "./types";
import { DEFAULT_TAXONOMY_CONFIG } from "./types";

/**
 * Storage interface for custom tag persistence
 * Implemented by TagTaxonomyStorage class
 */
export interface TaxonomyStorage {
  getAllCustomTags(): TagDefinition[];
  getTag(canonical: string): TagDefinition | null;
  upsertTag(tag: TagDefinition): void;
  deleteTag(canonical: string): boolean;
}

// Singleton instance
let instance: TaxonomyManager | null = null;

/**
 * TaxonomyManager singleton class
 * Use TaxonomyManager.create(db) or getTaxonomyManager() to get instance
 */
export class TaxonomyManager {
  private config: Required<TaxonomyConfig>;
  private builtInTags: Map<string, TagDefinition> = new Map();
  private customTags: Map<string, TagDefinition> = new Map();
  private aliasIndex: Map<string, string> = new Map(); // alias → canonical
  private storage: TaxonomyStorage | null = null;
  private initialized = false;

  private constructor(config: Partial<TaxonomyConfig> = {}) {
    this.config = { ...DEFAULT_TAXONOMY_CONFIG, ...config };
    this.loadBuiltInTags();
  }

  /**
   * Factory method for creating initialized TaxonomyManager
   * Preferred over getInstance() when storage is available
   */
  static async create(
    storage: TaxonomyStorage,
    config: Partial<TaxonomyConfig> = {},
  ): Promise<TaxonomyManager> {
    if (instance) {
      // If instance exists but not initialized with storage, initialize it
      if (!instance.initialized && storage) {
        await instance.initializeWithStorage(storage);
      }
      return instance;
    }

    instance = new TaxonomyManager(config);
    await instance.initializeWithStorage(storage);
    return instance;
  }

  /**
   * Get singleton instance (may not be initialized with storage)
   * For initialization, use TaxonomyManager.create() instead
   */
  static getInstance(config: Partial<TaxonomyConfig> = {}): TaxonomyManager {
    if (!instance) {
      instance = new TaxonomyManager(config);
    }
    return instance;
  }

  /**
   * Initialize with storage for custom tag persistence
   * Must be called before using custom tag features
   */
  async initializeWithStorage(storage: TaxonomyStorage): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.storage = storage;
    this.loadCustomTagsFromStorage();
    this.initialized = true;
  }

  /**
   * Check if manager is initialized with storage
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Load built-in tags into index
   */
  private loadBuiltInTags(): void {
    for (const tag of BUILT_IN_TAXONOMY) {
      const canonical = tag.canonical.toLowerCase();
      this.builtInTags.set(canonical, tag);

      // Index the canonical name itself
      this.aliasIndex.set(canonical, canonical);

      // Index all aliases
      for (const alias of tag.aliases) {
        const normalizedAlias = alias.toLowerCase();
        this.aliasIndex.set(normalizedAlias, canonical);
      }
    }
  }

  /**
   * Load custom tags from storage into index
   */
  private loadCustomTagsFromStorage(): void {
    if (!this.storage) return;

    const customTags = this.storage.getAllCustomTags();
    for (const tag of customTags) {
      this.addToCustomIndex(tag);
    }
  }

  /**
   * Add a tag to the custom index
   */
  private addToCustomIndex(tag: TagDefinition): void {
    const canonical = tag.canonical.toLowerCase();
    this.customTags.set(canonical, tag);

    // Index canonical (only if not overriding built-in or override allowed)
    if (!this.aliasIndex.has(canonical) || this.config.allowOverride) {
      this.aliasIndex.set(canonical, canonical);
    }

    // Index aliases
    for (const alias of tag.aliases) {
      const normalizedAlias = alias.toLowerCase();
      if (!this.aliasIndex.has(normalizedAlias) || this.config.allowOverride) {
        this.aliasIndex.set(normalizedAlias, canonical);
      }
    }
  }

  /**
   * Remove a tag from the custom index
   */
  private removeFromCustomIndex(canonical: string): void {
    const tag = this.customTags.get(canonical);
    if (!tag) return;

    this.customTags.delete(canonical);

    // Remove from alias index (only if pointing to this canonical)
    if (this.aliasIndex.get(canonical) === canonical) {
      // Check if built-in has this canonical
      if (this.builtInTags.has(canonical)) {
        // Restore built-in mapping
        this.aliasIndex.set(canonical, canonical);
      } else {
        this.aliasIndex.delete(canonical);
      }
    }

    // Remove aliases
    for (const alias of tag.aliases) {
      const normalizedAlias = alias.toLowerCase();
      if (this.aliasIndex.get(normalizedAlias) === canonical) {
        // Check if built-in has this alias
        const builtInCanonical =
          this.findBuiltInCanonicalForAlias(normalizedAlias);
        if (builtInCanonical) {
          this.aliasIndex.set(normalizedAlias, builtInCanonical);
        } else {
          this.aliasIndex.delete(normalizedAlias);
        }
      }
    }
  }

  /**
   * Find built-in canonical for an alias
   */
  private findBuiltInCanonicalForAlias(alias: string): string | null {
    for (const [canonical, tag] of this.builtInTags) {
      if (canonical === alias) return canonical;
      if (tag.aliases.some((a) => a.toLowerCase() === alias)) {
        return canonical;
      }
    }
    return null;
  }

  // =========================================================================
  // PUBLIC API - Normalization
  // =========================================================================

  /**
   * Normalize a tag to its canonical form
   *
   * @param tag Raw tag input
   * @returns Canonical tag name, or normalized format if unknown (or null in strict mode)
   */
  normalize(tag: string): string | null {
    if (!tag || typeof tag !== "string") {
      return null;
    }

    const normalized = tag.toLowerCase().trim();
    if (!normalized) {
      return null;
    }

    // 1. Check alias index for exact match (O(1))
    const canonical = this.aliasIndex.get(normalized);
    if (canonical) {
      return canonical;
    }

    // 2. Format unknown tag
    const formatted = this.formatTag(normalized);

    // 3. In strict mode, reject unknown tags
    if (this.config.strictMode) {
      return null;
    }

    return formatted;
  }

  /**
   * Normalize an array of tags, deduplicating results
   *
   * @param tags Array of raw tags
   * @returns Array of unique canonical tags
   */
  normalizeTags(tags: string[]): string[] {
    if (!Array.isArray(tags)) {
      return [];
    }

    const seen = new Set<string>();
    const result: string[] = [];

    for (const tag of tags) {
      const normalized = this.normalize(tag);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    }

    return result;
  }

  /**
   * Format a raw tag into normalized format
   * lowercase → replace non-alphanum with hyphen → collapse hyphens → trim
   */
  private formatTag(tag: string): string {
    return tag
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-") // Replace non-alphanum with hyphen
      .replace(/-+/g, "-") // Collapse multiple hyphens
      .replace(/^-|-$/g, ""); // Trim leading/trailing hyphens
  }

  // =========================================================================
  // PUBLIC API - Tag Lookup
  // =========================================================================

  /**
   * Get tag definition by canonical name or alias
   *
   * @param tag Tag name (canonical or alias)
   * @returns TagDefinition or null
   */
  getDefinition(tag: string): TagDefinition | null {
    const normalized = tag.toLowerCase().trim();
    const canonical = this.aliasIndex.get(normalized);

    if (!canonical) {
      return null;
    }

    // Check custom tags first (may override)
    if (this.config.allowOverride && this.customTags.has(canonical)) {
      return this.customTags.get(canonical) || null;
    }

    // Check built-in
    if (this.builtInTags.has(canonical)) {
      return this.builtInTags.get(canonical) || null;
    }

    // Check custom (non-override)
    return this.customTags.get(canonical) || null;
  }

  /**
   * Check if a tag exists in the taxonomy
   *
   * @param tag Tag name (canonical or alias)
   * @returns True if tag exists
   */
  hasTag(tag: string): boolean {
    const normalized = tag.toLowerCase().trim();
    return this.aliasIndex.has(normalized);
  }

  // =========================================================================
  // PUBLIC API - Custom Tags
  // =========================================================================

  /**
   * Add a custom tag definition
   * Throws error if tag conflicts with existing and allowOverride is false
   *
   * @param definition Tag definition (source will be set to "custom")
   * @throws Error if collision detected and allowOverride is false
   */
  addCustomTag(
    definition: Omit<TagDefinition, "source"> & { source?: "custom" },
  ): void {
    const tag: TagDefinition = {
      ...definition,
      source: "custom",
      canonical: definition.canonical.toLowerCase(),
      aliases: definition.aliases.map((a) => a.toLowerCase()),
    };

    // Check for collisions with built-in
    if (!this.config.allowOverride) {
      // Check canonical collision
      if (this.builtInTags.has(tag.canonical)) {
        throw new Error(
          `Tag "${tag.canonical}" conflicts with built-in tag. Set allowOverride: true to override.`,
        );
      }

      // Check alias collisions
      for (const alias of tag.aliases) {
        const existingCanonical = this.aliasIndex.get(alias);
        if (existingCanonical && this.builtInTags.has(existingCanonical)) {
          throw new Error(
            `Alias "${alias}" conflicts with built-in tag "${existingCanonical}". Set allowOverride: true to override.`,
          );
        }
      }
    }

    // Add to index
    this.addToCustomIndex(tag);

    // Persist to storage
    if (this.storage) {
      this.storage.upsertTag(tag);
    }
  }

  /**
   * Remove a custom tag
   *
   * @param canonical Canonical name of tag to remove
   * @returns True if tag was removed
   */
  removeCustomTag(canonical: string): boolean {
    const normalized = canonical.toLowerCase();

    // Cannot remove built-in tags
    if (this.builtInTags.has(normalized) && !this.customTags.has(normalized)) {
      return false;
    }

    // Check if custom tag exists
    if (!this.customTags.has(normalized)) {
      return false;
    }

    // Remove from index
    this.removeFromCustomIndex(normalized);

    // Remove from storage
    if (this.storage) {
      return this.storage.deleteTag(normalized);
    }

    return true;
  }

  /**
   * Get all custom tags
   */
  getCustomTags(): TagDefinition[] {
    return Array.from(this.customTags.values());
  }

  /**
   * Export custom tags for backup
   */
  exportCustomTags(): TagDefinition[] {
    return this.getCustomTags();
  }

  /**
   * Import custom tags from backup
   * Existing tags with same canonical will be replaced
   *
   * @param tags Array of tag definitions to import
   * @returns Number of tags imported
   */
  importCustomTags(tags: TagDefinition[]): number {
    let imported = 0;

    for (const tag of tags) {
      try {
        // Extract source to pass correct type to addCustomTag
        const { source: _source, ...tagWithoutSource } = tag;
        this.addCustomTag(tagWithoutSource);
        imported++;
      } catch {
        // Skip tags that conflict
      }
    }

    return imported;
  }

  // =========================================================================
  // PUBLIC API - Fuzzy Suggestions
  // =========================================================================

  /**
   * Get tag suggestions for a query using fuzzy matching
   *
   * @param query Search query
   * @param limit Maximum number of suggestions (default: 10)
   * @returns Array of TagSuggestions sorted by score
   */
  suggestTags(query: string, limit: number = 10): TagSuggestion[] {
    if (!query || typeof query !== "string") {
      return [];
    }

    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) {
      return [];
    }

    const suggestions: TagSuggestion[] = [];
    const seen = new Set<string>();

    // Get all tags (built-in + custom)
    const allTags = this.getAllTags();

    for (const tag of allTags) {
      if (seen.has(tag.canonical)) continue;
      seen.add(tag.canonical);

      // Check exact match on canonical
      if (tag.canonical === normalizedQuery) {
        suggestions.push({
          tag,
          score: 1.0,
          matchType: "exact" as TagMatchType,
        });
        continue;
      }

      // Check exact match on alias
      const aliasMatch = tag.aliases.find(
        (a) => a.toLowerCase() === normalizedQuery,
      );
      if (aliasMatch) {
        suggestions.push({
          tag,
          score: 0.99, // Slightly lower than exact canonical match
          matchType: "alias" as TagMatchType,
        });
        continue;
      }

      // Check fuzzy match on canonical
      const canonicalScore = stringSimilarity(normalizedQuery, tag.canonical);
      if (canonicalScore >= this.config.minSuggestionScore) {
        suggestions.push({
          tag,
          score: canonicalScore,
          matchType: "fuzzy" as TagMatchType,
        });
        continue;
      }

      // Check fuzzy match on aliases
      let bestAliasScore = 0;
      for (const alias of tag.aliases) {
        const aliasScore = stringSimilarity(
          normalizedQuery,
          alias.toLowerCase(),
        );
        if (aliasScore > bestAliasScore) {
          bestAliasScore = aliasScore;
        }
      }

      if (bestAliasScore >= this.config.minSuggestionScore) {
        suggestions.push({
          tag,
          score: bestAliasScore * 0.95, // Slightly penalize alias matches
          matchType: "fuzzy" as TagMatchType,
        });
      }
    }

    // Sort by score descending and limit
    return suggestions.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // =========================================================================
  // PUBLIC API - Category & Hierarchy
  // =========================================================================

  /**
   * Get all tags in a category
   *
   * @param category Tag category to filter
   * @returns Array of TagDefinitions in that category
   */
  getTagsByCategory(category: TagCategory): TagDefinition[] {
    const result: TagDefinition[] = [];

    // Built-in tags
    for (const tag of this.builtInTags.values()) {
      if (tag.category === category) {
        result.push(tag);
      }
    }

    // Custom tags (may include same category)
    for (const tag of this.customTags.values()) {
      if (tag.category === category) {
        // Avoid duplicates if custom overrides built-in
        if (!result.some((t) => t.canonical === tag.canonical)) {
          result.push(tag);
        }
      }
    }

    return result;
  }

  /**
   * Get all tags (built-in + custom)
   */
  getAllTags(): TagDefinition[] {
    const result = new Map<string, TagDefinition>();

    // Add built-in tags
    for (const [canonical, tag] of this.builtInTags) {
      result.set(canonical, tag);
    }

    // Add/override with custom tags
    for (const [canonical, tag] of this.customTags) {
      if (this.config.allowOverride || !result.has(canonical)) {
        result.set(canonical, tag);
      }
    }

    return Array.from(result.values());
  }

  /**
   * Get child tags for a parent (hierarchical)
   * Note: parent field is metadata only, does not auto-apply
   *
   * @param parent Parent tag canonical name
   * @returns Array of child TagDefinitions
   */
  getChildTags(parent: string): TagDefinition[] {
    const normalizedParent = parent.toLowerCase();
    const children: TagDefinition[] = [];

    for (const tag of this.getAllTags()) {
      if (tag.parent?.toLowerCase() === normalizedParent) {
        children.push(tag);
      }
    }

    return children;
  }

  // =========================================================================
  // PUBLIC API - Configuration
  // =========================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TaxonomyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<TaxonomyConfig> {
    return { ...this.config };
  }

  /**
   * Get statistics about the taxonomy
   */
  getStats(): {
    builtInCount: number;
    customCount: number;
    totalCount: number;
    aliasCount: number;
    byCategory: Record<string, number>;
  } {
    const byCategory: Record<string, number> = {};

    for (const tag of this.getAllTags()) {
      byCategory[tag.category] = (byCategory[tag.category] || 0) + 1;
    }

    return {
      builtInCount: this.builtInTags.size,
      customCount: this.customTags.size,
      totalCount: this.getAllTags().length,
      aliasCount: this.aliasIndex.size,
      byCategory,
    };
  }
}

/**
 * Get the singleton TaxonomyManager instance
 * Note: For initialization with storage, use TaxonomyManager.create() instead
 */
export function getTaxonomyManager(
  config: Partial<TaxonomyConfig> = {},
): TaxonomyManager {
  return TaxonomyManager.getInstance(config);
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetTaxonomyManager(): void {
  instance = null;
}
