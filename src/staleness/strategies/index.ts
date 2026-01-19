/**
 * Staleness Detection Strategies
 *
 * Exports all strategy implementations.
 */

export {
  BaseStalenessStrategy,
  type IStalenessStrategy,
  type StrategyContext,
} from "./base";
export {
  GitChangesStrategy,
  type GitChangesStrategyContext,
} from "./git-changes";
export {
  RelatedUpdatesStrategy,
  type RelatedUpdatesStrategyContext,
} from "./related-updates";
export {
  SupersededStrategy,
  type SupersededStrategyContext,
} from "./superseded";
export { TimeDecayStrategy } from "./time-decay";
