import { defineConfig } from "@klitchevo/code-council/config";

/**
 * Code Council Configuration
 *
 * This file configures the AI models and behavior for Code Council.
 * For full documentation, see: https://github.com/klitchevo/code-council
 */
export default defineConfig({
  /**
   * Models Configuration
   *
   * Specify which OpenRouter models to use for each review type.
   * Browse available models at: https://openrouter.ai/models
   */
  models: {
    // Default models used when specific type is not configured
    defaultModels: [
      "minimax/minimax-m2.1",
      "z-ai/glm-4.7",
      "moonshotai/kimi-k2-thinking",
      "deepseek/deepseek-v3.2",
      "google/gemini-3-pro-preview",
    ],

    // Uncomment and customize models for specific review types:
    // codeReview: ["anthropic/claude-sonnet-4", "openai/gpt-4o"],
    // frontendReview: ["anthropic/claude-sonnet-4"],
    // backendReview: ["openai/gpt-4o", "google/gemini-2.0-flash-exp"],
    // planReview: ["anthropic/claude-sonnet-4"],
    // discussion: ["anthropic/claude-sonnet-4", "openai/gpt-4o"],
    // tpsAudit: ["anthropic/claude-sonnet-4", "openai/gpt-4o"],
  },

  /**
   * Consensus Analysis Settings
   *
   * All reviews use consensus analysis by default. These settings
   * control how findings from multiple models are weighted and scored.
   */
  consensus: {
    // Weight specific models higher (1.0 = normal, >1 = higher weight)
    // modelWeights: {
    //   "anthropic/claude-sonnet-4": 1.2,
    //   "openai/gpt-4o": 1.0,
    // },

    // Confidence thresholds for categorizing findings
    highConfidenceThreshold: 0.8,
    moderateConfidenceThreshold: 0.5,
  },

  /**
   * LLM Behavior Settings
   */
  llm: {
    // Temperature: 0.0-2.0, lower = more focused/deterministic
    temperature: 0.3,

    // Maximum tokens in model responses
    maxTokens: 16384,
  },

  /**
   * Session Settings (for council discussions)
   */
  // session: {
  //   maxSessions: 100,           // Max concurrent sessions
  //   maxMessagesPerModel: 20,    // Messages before context windowing
  //   ttlMs: 1800000,             // Session timeout (30 min)
  //   rateLimitPerMinute: 10,     // Rate limit per session
  // },

  /**
   * Input Limits
   */
  // inputLimits: {
  //   maxCodeLength: 100000,      // Max code input length
  //   maxContextLength: 50000,    // Max context length
  //   maxModels: 10,              // Max models per review
  // },
});
