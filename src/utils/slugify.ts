/**
 * Slugify utility for tag normalization
 *
 * Uses the battle-tested slugify library instead of hand-rolled regex.
 * Provides consistent tag formatting across the codebase.
 */

import slugify from "slugify";

/**
 * Format a raw tag into normalized slug format.
 *
 * Behavior (matches original hand-rolled implementation):
 * - Converts to lowercase
 * - Replaces ALL non-alphanumeric characters (except hyphens) with hyphens
 * - Collapses multiple hyphens into one
 * - Trims leading/trailing hyphens
 *
 * @param tag - Raw tag string to format
 * @returns Normalized slug-formatted tag
 *
 * @example
 * formatTag("Hello World") // "hello-world"
 * formatTag("API Key")     // "api-key"
 * formatTag("TypeScript")  // "typescript"
 * formatTag("Node.js")     // "node-js"
 */
export function formatTag(tag: string): string {
  // Pre-process: replace characters that slugify would remove
  // The original implementation converted ALL non-alphanumeric (except hyphen) to hyphens
  const preprocessed = tag.replace(/[^a-zA-Z0-9-]/g, "-");

  return slugify(preprocessed, {
    lower: true,
    strict: true,
    trim: true,
  });
}
