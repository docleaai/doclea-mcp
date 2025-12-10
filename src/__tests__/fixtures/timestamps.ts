/**
 * Test fixtures for timestamps and date calculations
 * All timestamps are in milliseconds unless noted otherwise
 */

// Reference point: Use a fixed date for deterministic tests
// January 15, 2025 00:00:00 UTC
export const REFERENCE_DATE = new Date("2025-01-15T00:00:00.000Z");
export const REFERENCE_TIMESTAMP = REFERENCE_DATE.getTime();
export const REFERENCE_UNIX = Math.floor(REFERENCE_TIMESTAMP / 1000);

// Time constants in milliseconds
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const ONE_WEEK_MS = 7 * ONE_DAY_MS;
export const ONE_MONTH_MS = 30 * ONE_DAY_MS;
export const THREE_MONTHS_MS = 3 * ONE_MONTH_MS;
export const SIX_MONTHS_MS = 6 * ONE_MONTH_MS;
export const ONE_YEAR_MS = 365 * ONE_DAY_MS;

// Time constants in seconds (for git timestamps)
export const ONE_DAY_UNIX = 86400;
export const ONE_WEEK_UNIX = 7 * ONE_DAY_UNIX;
export const ONE_MONTH_UNIX = 30 * ONE_DAY_UNIX;
export const THREE_MONTHS_UNIX = 3 * ONE_MONTH_UNIX;
export const SIX_MONTHS_UNIX = 6 * ONE_MONTH_UNIX;
export const ONE_YEAR_UNIX = 365 * ONE_DAY_UNIX;

/**
 * Get a timestamp relative to the reference date
 * Negative values = past, positive = future
 */
export function getRelativeTimestamp(daysFromRef: number): number {
  return REFERENCE_TIMESTAMP + daysFromRef * ONE_DAY_MS;
}

/**
 * Get a Unix timestamp relative to the reference date
 */
export function getRelativeUnix(daysFromRef: number): number {
  return REFERENCE_UNIX + daysFromRef * ONE_DAY_UNIX;
}

// Pre-calculated timestamps for common test scenarios

/** Yesterday */
export const YESTERDAY = getRelativeTimestamp(-1);
export const YESTERDAY_UNIX = getRelativeUnix(-1);

/** One week ago */
export const ONE_WEEK_AGO = getRelativeTimestamp(-7);
export const ONE_WEEK_AGO_UNIX = getRelativeUnix(-7);

/** One month ago */
export const ONE_MONTH_AGO = getRelativeTimestamp(-30);
export const ONE_MONTH_AGO_UNIX = getRelativeUnix(-30);

/** Exactly 30 days ago (for recent activity boundary) */
export const EXACTLY_30_DAYS_AGO = getRelativeTimestamp(-30);
export const EXACTLY_30_DAYS_AGO_UNIX = getRelativeUnix(-30);

/** Just inside 30-day window (29 days ago) */
export const INSIDE_30_DAY_WINDOW = getRelativeTimestamp(-29);
export const INSIDE_30_DAY_WINDOW_UNIX = getRelativeUnix(-29);

/** Just outside 30-day window (31 days ago) */
export const OUTSIDE_30_DAY_WINDOW = getRelativeTimestamp(-31);
export const OUTSIDE_30_DAY_WINDOW_UNIX = getRelativeUnix(-31);

/** Three months ago */
export const THREE_MONTHS_AGO = getRelativeTimestamp(-90);
export const THREE_MONTHS_AGO_UNIX = getRelativeUnix(-90);

/** Just inside 3-month window (89 days ago) */
export const INSIDE_3_MONTH_WINDOW = getRelativeTimestamp(-89);
export const INSIDE_3_MONTH_WINDOW_UNIX = getRelativeUnix(-89);

/** Just outside 3-month window (91 days ago) */
export const OUTSIDE_3_MONTH_WINDOW = getRelativeTimestamp(-91);
export const OUTSIDE_3_MONTH_WINDOW_UNIX = getRelativeUnix(-91);

/** Exactly 6 months ago (stale threshold) */
export const EXACTLY_6_MONTHS_AGO = getRelativeTimestamp(-180);
export const EXACTLY_6_MONTHS_AGO_UNIX = getRelativeUnix(-180);

/** Just inside 6-month window (179 days ago) - NOT stale */
export const INSIDE_6_MONTH_WINDOW = getRelativeTimestamp(-179);
export const INSIDE_6_MONTH_WINDOW_UNIX = getRelativeUnix(-179);

/** Just outside 6-month window (181 days ago) - IS stale */
export const OUTSIDE_6_MONTH_WINDOW = getRelativeTimestamp(-181);
export const OUTSIDE_6_MONTH_WINDOW_UNIX = getRelativeUnix(-181);

/** One year ago */
export const ONE_YEAR_AGO = getRelativeTimestamp(-365);
export const ONE_YEAR_AGO_UNIX = getRelativeUnix(-365);

/** Two years ago */
export const TWO_YEARS_AGO = getRelativeTimestamp(-730);
export const TWO_YEARS_AGO_UNIX = getRelativeUnix(-730);

/**
 * Format a timestamp as ISO date string (YYYY-MM-DD)
 */
export function formatDateString(timestamp: number): string {
  return new Date(timestamp).toISOString().split("T")[0]!;
}

/**
 * Format a Unix timestamp as ISO date string
 */
export function formatUnixDateString(unixTimestamp: number): string {
  return formatDateString(unixTimestamp * 1000);
}
