import { describe, expect, it } from "bun:test";
import type { Experiment } from "../../ab-testing/types";
import {
  assignVariant,
  generateSessionHash,
  selectVariantDeterministic,
  selectVariantRandom,
} from "../../ab-testing/variant-selector";
import { DEFAULT_SCORING_CONFIG } from "../../scoring/types";

const createTestExperiment = (
  overrides: Partial<Experiment> = {},
): Experiment => ({
  id: "test-exp",
  name: "Test Experiment",
  enabled: true,
  variants: [
    {
      id: "control",
      name: "Control",
      weight: 0.5,
      scoringConfig: { ...DEFAULT_SCORING_CONFIG, enabled: true },
    },
    {
      id: "treatment",
      name: "Treatment",
      weight: 0.5,
      scoringConfig: {
        ...DEFAULT_SCORING_CONFIG,
        enabled: true,
        weights: {
          ...DEFAULT_SCORING_CONFIG.weights,
          semantic: 0.7,
        },
      },
    },
  ],
  assignmentStrategy: "deterministic",
  ...overrides,
});

describe("selectVariantDeterministic", () => {
  it("should return same variant for same session ID", async () => {
    const experiment = createTestExperiment();

    const variant1 = await selectVariantDeterministic(
      "session-123",
      experiment,
    );
    const variant2 = await selectVariantDeterministic(
      "session-123",
      experiment,
    );
    const variant3 = await selectVariantDeterministic(
      "session-123",
      experiment,
    );

    expect(variant1.id).toBe(variant2.id);
    expect(variant2.id).toBe(variant3.id);
  });

  it("should return different variants for different session IDs", async () => {
    const experiment = createTestExperiment();

    // Test with multiple session IDs to find at least two different variants
    const variants = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const variant = await selectVariantDeterministic(
        `session-${i}`,
        experiment,
      );
      variants.add(variant.id);
    }

    // With 50/50 weights, we should see both variants
    expect(variants.size).toBeGreaterThan(1);
  });

  it("should isolate experiments", async () => {
    const exp1 = createTestExperiment({ id: "exp-1" });
    const exp2 = createTestExperiment({ id: "exp-2" });

    // Same session ID might get different variants in different experiments
    const variantsExp1 = new Set<string>();
    const variantsExp2 = new Set<string>();

    for (let i = 0; i < 50; i++) {
      const v1 = await selectVariantDeterministic(`session-${i}`, exp1);
      const v2 = await selectVariantDeterministic(`session-${i}`, exp2);
      variantsExp1.add(v1.id);
      variantsExp2.add(v2.id);
    }

    // Both experiments should have traffic in both variants
    expect(variantsExp1.size).toBeGreaterThan(1);
    expect(variantsExp2.size).toBeGreaterThan(1);
  });

  it("should respect variant weights", async () => {
    const experiment = createTestExperiment({
      variants: [
        {
          id: "control",
          name: "Control",
          weight: 0.9,
          scoringConfig: DEFAULT_SCORING_CONFIG,
        },
        {
          id: "treatment",
          name: "Treatment",
          weight: 0.1,
          scoringConfig: DEFAULT_SCORING_CONFIG,
        },
      ],
    });

    let controlCount = 0;
    let _treatmentCount = 0;

    for (let i = 0; i < 1000; i++) {
      const variant = await selectVariantDeterministic(
        `session-${i}`,
        experiment,
      );
      if (variant.id === "control") controlCount++;
      else _treatmentCount++;
    }

    // With 90/10 weights, control should be ~90% (allow 10% margin)
    const controlRatio = controlCount / 1000;
    expect(controlRatio).toBeGreaterThan(0.8);
    expect(controlRatio).toBeLessThan(1.0);
  });
});

describe("selectVariantRandom", () => {
  it("should return a valid variant", () => {
    const experiment = createTestExperiment();
    const variant = selectVariantRandom(experiment);

    expect(["control", "treatment"]).toContain(variant.id);
  });

  it("should distribute roughly evenly with equal weights", () => {
    const experiment = createTestExperiment();

    let controlCount = 0;
    let _treatmentCount = 0;

    for (let i = 0; i < 1000; i++) {
      const variant = selectVariantRandom(experiment);
      if (variant.id === "control") controlCount++;
      else _treatmentCount++;
    }

    // With 50/50 weights, should be roughly equal (allow 10% margin)
    const ratio = controlCount / 1000;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });
});

describe("assignVariant", () => {
  it("should use deterministic selection when configured", async () => {
    const experiment = createTestExperiment({
      assignmentStrategy: "deterministic",
    });

    const assignment1 = await assignVariant("session-123", experiment);
    const assignment2 = await assignVariant("session-123", experiment);

    expect(assignment1.variantId).toBe(assignment2.variantId);
    expect(assignment1.assignmentType).toBe("deterministic");
  });

  it("should use random selection when configured", async () => {
    const experiment = createTestExperiment({
      assignmentStrategy: "random",
    });

    const assignment = await assignVariant("session-123", experiment);

    expect(assignment.assignmentType).toBe("random");
    expect(["control", "treatment"]).toContain(assignment.variantId);
  });

  it("should include experiment and variant IDs", async () => {
    const experiment = createTestExperiment({ id: "my-experiment" });

    const assignment = await assignVariant("session-123", experiment);

    expect(assignment.experimentId).toBe("my-experiment");
    expect(["control", "treatment"]).toContain(assignment.variantId);
  });

  it("should include scoring config from variant", async () => {
    const experiment = createTestExperiment();

    const assignment = await assignVariant("session-123", experiment);

    expect(assignment.scoringConfig).toBeDefined();
    expect(assignment.scoringConfig.enabled).toBe(true);
  });
});

describe("generateSessionHash", () => {
  it("should generate 16-character hash", async () => {
    const hash = await generateSessionHash("session-123");
    expect(hash.length).toBe(16);
  });

  it("should generate consistent hashes", async () => {
    const hash1 = await generateSessionHash("session-123");
    const hash2 = await generateSessionHash("session-123");
    expect(hash1).toBe(hash2);
  });

  it("should generate different hashes for different sessions", async () => {
    const hash1 = await generateSessionHash("session-123");
    const hash2 = await generateSessionHash("session-456");
    expect(hash1).not.toBe(hash2);
  });
});
