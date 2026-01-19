/**
 * A/B Testing Module
 *
 * Provides experiment management, variant assignment, and metrics collection
 * for comparing different scoring configurations.
 */

// Experiment management
export {
  ExperimentManager,
  getExperimentManager,
  resetExperimentManager,
} from "./experiment-manager";
// Metrics collection
export {
  getMetricsCollector,
  MetricsCollector,
  resetMetricsCollector,
} from "./metrics-collector";
// Types and schemas
export {
  type ABTestingConfig,
  ABTestingConfigSchema,
  type AggregatedMetrics,
  DEFAULT_AB_TESTING_CONFIG,
  type Experiment,
  ExperimentSchema,
  type ExperimentVariant,
  ExperimentVariantSchema,
  type MetricsSample,
  type VariantAssignment,
} from "./types";
// Variant selection
export {
  assignVariant,
  generateSessionHash,
  selectVariantDeterministic,
  selectVariantRandom,
} from "./variant-selector";
