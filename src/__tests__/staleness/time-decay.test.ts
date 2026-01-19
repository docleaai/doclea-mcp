/**
 * Time Decay Strategy Tests
 */

import { describe, expect, it } from "bun:test";
import { TimeDecayStrategy } from "@/staleness/strategies/time-decay";
import type { Memory } from "@/types";

const SECONDS_PER_DAY = 86400;

function createMockMemory(overrides: Partial<Memory> = {}): Memory {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: "test-memory-1",
    type: "decision",
    title: "Test Memory",
    content: "Test content",
    importance: 0.5,
    tags: [],
    relatedFiles: [],
    experts: [],
    createdAt: now - 30 * SECONDS_PER_DAY, // 30 days ago
    accessedAt: now - 30 * SECONDS_PER_DAY,
    accessCount: 1,
    needsReview: false,
    ...overrides,
  };
}

describe("TimeDecayStrategy", () => {
  const strategy = new TimeDecayStrategy({
    thresholdDays: 180,
    weight: 0.5,
  });

  it("should have correct type and weight", () => {
    expect(strategy.type).toBe("time_decay");
    expect(strategy.weight).toBe(0.5);
  });

  it("should return null for very recent memories (<7 days)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const memory = createMockMemory({
      createdAt: now - 3 * SECONDS_PER_DAY,
      accessedAt: now - 3 * SECONDS_PER_DAY,
    });

    const signal = await strategy.check(memory, { now });
    expect(signal).toBeNull();
  });

  it("should return proportional score based on age", async () => {
    const now = Math.floor(Date.now() / 1000);

    // 90 days = 50% of 180-day threshold
    const memory = createMockMemory({
      createdAt: now - 90 * SECONDS_PER_DAY,
      accessedAt: now - 90 * SECONDS_PER_DAY,
    });

    const signal = await strategy.check(memory, { now });
    expect(signal).not.toBeNull();
    expect(signal?.score).toBeCloseTo(0.5, 1);
    expect(signal?.strategy).toBe("time_decay");
    expect(signal?.weight).toBe(0.5);
  });

  it("should return score 1.0 when at or past threshold", async () => {
    const now = Math.floor(Date.now() / 1000);

    const memory = createMockMemory({
      createdAt: now - 200 * SECONDS_PER_DAY,
      accessedAt: now - 200 * SECONDS_PER_DAY,
    });

    const signal = await strategy.check(memory, { now });
    expect(signal).not.toBeNull();
    expect(signal?.score).toBe(1.0);
  });

  it("should use lastRefreshedAt as anchor when available", async () => {
    const now = Math.floor(Date.now() / 1000);

    // Created 200 days ago but refreshed 30 days ago
    const memory = createMockMemory({
      createdAt: now - 200 * SECONDS_PER_DAY,
      accessedAt: now - 200 * SECONDS_PER_DAY,
      lastRefreshedAt: now - 30 * SECONDS_PER_DAY,
    });

    const signal = await strategy.check(memory, { now });
    expect(signal).not.toBeNull();
    // Should use lastRefreshedAt, so ~30/180 = 0.167
    expect(signal?.score).toBeCloseTo(30 / 180, 1);
    expect(signal?.metadata?.anchorType).toBe("lastRefreshedAt");
  });

  it("should use accessedAt when more recent than createdAt", async () => {
    const now = Math.floor(Date.now() / 1000);

    // Created 200 days ago but accessed 30 days ago
    const memory = createMockMemory({
      createdAt: now - 200 * SECONDS_PER_DAY,
      accessedAt: now - 30 * SECONDS_PER_DAY,
    });

    const signal = await strategy.check(memory, { now });
    expect(signal).not.toBeNull();
    // Should use accessedAt, so ~30/180 = 0.167
    expect(signal?.score).toBeCloseTo(30 / 180, 1);
  });

  it("should include metadata in signal", async () => {
    const now = Math.floor(Date.now() / 1000);

    const memory = createMockMemory({
      createdAt: now - 90 * SECONDS_PER_DAY,
      accessedAt: now - 90 * SECONDS_PER_DAY,
    });

    const signal = await strategy.check(memory, { now });
    expect(signal).not.toBeNull();
    expect(signal?.metadata).toBeDefined();
    expect(signal?.metadata?.ageDays).toBe(90);
    expect(signal?.metadata?.thresholdDays).toBe(180);
    expect(signal?.metadata?.anchorType).toBe("createdAt");
  });
});
