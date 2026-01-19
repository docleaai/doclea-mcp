/**
 * JSON utilities for deterministic serialization
 *
 * Provides stable JSON stringification for cache keys and hashing.
 */

/**
 * Produces a deterministic JSON string by sorting object keys recursively.
 * This ensures the same object always produces the same string regardless
 * of property insertion order.
 *
 * @param obj - The value to stringify
 * @returns A deterministic JSON string
 *
 * @example
 * stableStringify({ b: 2, a: 1 }) === stableStringify({ a: 1, b: 2 }) // true
 */
export function stableStringify(obj: unknown): string {
  return JSON.stringify(obj, stableReplacer);
}

/**
 * JSON replacer function that sorts object keys for deterministic output.
 */
function stableReplacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  // Sort object keys and create a new object with sorted keys
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();

  for (const key of keys) {
    sorted[key] = (value as Record<string, unknown>)[key];
  }

  return sorted;
}

/**
 * Generates a SHA-256 hash of a value using stable JSON serialization.
 * Useful for creating deterministic cache keys.
 *
 * @param obj - The value to hash
 * @returns A hex-encoded SHA-256 hash string
 */
export async function stableHash(obj: unknown): Promise<string> {
  const json = stableStringify(obj);
  const encoder = new TextEncoder();
  const data = encoder.encode(json);

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
