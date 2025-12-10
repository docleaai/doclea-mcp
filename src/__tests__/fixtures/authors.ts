/**
 * Test fixtures for author data
 * Common author configurations for testing expertise mapping
 */

export interface TestAuthor {
  name: string;
  email: string;
}

// Individual authors for testing
export const ALICE: TestAuthor = {
  name: "Alice Developer",
  email: "alice@example.com",
};

export const BOB: TestAuthor = {
  name: "Bob Engineer",
  email: "bob@example.com",
};

export const CHARLIE: TestAuthor = {
  name: "Charlie Coder",
  email: "charlie@example.com",
};

export const DIANA: TestAuthor = {
  name: "Diana Dev",
  email: "diana@example.com",
};

export const EVE: TestAuthor = {
  name: "Eve Expert",
  email: "eve@example.com",
};

export const FRANK: TestAuthor = {
  name: "Frank Fixer",
  email: "frank@example.com",
};

// Special case authors
export const UNICODE_AUTHOR: TestAuthor = {
  name: "José García-Müller",
  email: "jose@example.com",
};

export const LONG_NAME_AUTHOR: TestAuthor = {
  name: "Alexander Bartholomew Christopher Davidson",
  email: "alex@example.com",
};

// Author with same name, different email (for exclusion testing)
export const ALICE_WORK: TestAuthor = {
  name: "Alice Developer",
  email: "alice@company.com",
};

// All standard test authors
export const ALL_AUTHORS = [ALICE, BOB, CHARLIE, DIANA, EVE, FRANK];

/**
 * Create an author with custom name/email
 */
export function createAuthor(name: string, email?: string): TestAuthor {
  return {
    name,
    email: email ?? `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
  };
}

/**
 * Create multiple authors with auto-generated emails
 */
export function createAuthors(
  count: number,
  prefix = "Developer",
): TestAuthor[] {
  return Array.from({ length: count }, (_, i) =>
    createAuthor(`${prefix} ${i + 1}`),
  );
}

// Pre-configured author scenarios

/**
 * Single dominant author (100% ownership)
 */
export const SINGLE_OWNER_SCENARIO = {
  authors: [{ ...ALICE, commits: 50 }],
  expectedPrimaryPercentage: 100,
  expectedBusFactorRisk: true,
};

/**
 * Two authors with 80/20 split (at risk threshold)
 */
export const AT_THRESHOLD_SCENARIO = {
  authors: [
    { ...ALICE, commits: 80 },
    { ...BOB, commits: 20 },
  ],
  expectedPrimaryPercentage: 80,
  expectedBusFactorRisk: true, // Exactly at 80%
};

/**
 * Two authors with 79/21 split (just below threshold)
 */
export const BELOW_THRESHOLD_SCENARIO = {
  authors: [
    { ...ALICE, commits: 79 },
    { ...BOB, commits: 21 },
  ],
  expectedPrimaryPercentage: 79,
  expectedBusFactorRisk: false, // Below 80%
};

/**
 * Three authors with even distribution (healthy)
 */
export const HEALTHY_DISTRIBUTION_SCENARIO = {
  authors: [
    { ...ALICE, commits: 40 },
    { ...BOB, commits: 35 },
    { ...CHARLIE, commits: 25 },
  ],
  expectedBusFactor: 3,
  expectedBusFactorRisk: false,
};

/**
 * Many contributors with small percentages
 */
export const MANY_CONTRIBUTORS_SCENARIO = {
  authors: [
    { ...ALICE, commits: 20 },
    { ...BOB, commits: 18 },
    { ...CHARLIE, commits: 17 },
    { ...DIANA, commits: 16 },
    { ...EVE, commits: 15 },
    { ...FRANK, commits: 14 },
  ],
  expectedBusFactor: 6, // All have >= 5%
  expectedBusFactorRisk: false,
};

/**
 * One major, one minor contributor (below 5%)
 */
export const MAJOR_MINOR_SCENARIO = {
  authors: [
    { ...ALICE, commits: 96 },
    { ...BOB, commits: 4 },
  ],
  expectedBusFactor: 1, // Only Alice >= 5%
  expectedBusFactorRisk: true,
};
