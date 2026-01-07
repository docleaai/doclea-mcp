import { z } from "zod";
import {
	TokenBudgetManager,
	createBudgetFromModel,
	MODEL_CONTEXT_WINDOWS,
	DEFAULT_RATIOS,
	CONSERVATIVE_RATIOS,
	CONTEXT_HEAVY_RATIOS,
	BUDGET_PRESETS,
	type BudgetCategory,
	type BudgetAllocation,
	type ModelName,
} from "../utils/budget";

/**
 * Zod schema for budget categories
 */
const BudgetCategorySchema = z.enum(["system", "context", "user", "response"]);

/**
 * Allocate token budget across categories
 */
export const AllocateBudgetInputSchema = z.object({
	totalBudget: z
		.number()
		.min(100)
		.optional()
		.describe("Total token budget (or use modelName)"),
	modelName: z
		.enum([
			"gpt-4-turbo",
			"gpt-4",
			"gpt-3.5-turbo",
			"claude-opus",
			"claude-sonnet",
			"claude-haiku",
			"llama-3-70b",
			"llama-3-8b",
			"mistral-medium",
			"mixtral-8x7b",
		])
		.optional()
		.describe("Model name (auto-detects context window)"),
	preset: z
		.enum(["balanced", "contextHeavy", "conservative", "chat"])
		.default("balanced")
		.describe("Budget allocation preset"),
	customRatios: z
		.object({
			system: z.number().min(0).max(1).optional(),
			context: z.number().min(0).max(1).optional(),
			user: z.number().min(0).max(1).optional(),
			response: z.number().min(0).max(1).optional(),
		})
		.optional()
		.describe("Custom ratios (must sum to 1.0)"),
	minimums: z
		.object({
			system: z.number().min(0).optional(),
			context: z.number().min(0).optional(),
			user: z.number().min(0).optional(),
			response: z.number().min(0).optional(),
		})
		.optional()
		.describe("Minimum tokens per category"),
	maximums: z
		.object({
			system: z.number().min(0).optional(),
			context: z.number().min(0).optional(),
			user: z.number().min(0).optional(),
			response: z.number().min(0).optional(),
		})
		.optional()
		.describe("Maximum tokens per category"),
});

export type AllocateBudgetInput = z.infer<typeof AllocateBudgetInputSchema>;

/**
 * Allocate token budget across categories
 */
export async function allocateBudget(
	input: AllocateBudgetInput,
): Promise<{
	allocation: BudgetAllocation;
	config: {
		totalBudget: number;
		ratios: Record<BudgetCategory, number>;
		preset: string;
	};
}> {
	// Determine total budget
	let totalBudget: number;
	if (input.modelName) {
		totalBudget = MODEL_CONTEXT_WINDOWS[input.modelName];
	} else if (input.totalBudget) {
		totalBudget = input.totalBudget;
	} else {
		throw new Error("Must provide either totalBudget or modelName");
	}

	// Determine ratios
	let ratios: Record<BudgetCategory, number>;
	if (input.customRatios) {
		// Validate custom ratios
		const sum =
			(input.customRatios.system || 0) +
			(input.customRatios.context || 0) +
			(input.customRatios.user || 0) +
			(input.customRatios.response || 0);

		if (Math.abs(sum - 1.0) > 0.001) {
			throw new Error(`Custom ratios must sum to 1.0, got ${sum.toFixed(3)}`);
		}

		ratios = {
			system: input.customRatios.system || 0,
			context: input.customRatios.context || 0,
			user: input.customRatios.user || 0,
			response: input.customRatios.response || 0,
		};
	} else {
		// Use preset
		switch (input.preset) {
			case "balanced":
				ratios = DEFAULT_RATIOS;
				break;
			case "contextHeavy":
				ratios = CONTEXT_HEAVY_RATIOS;
				break;
			case "conservative":
				ratios = CONSERVATIVE_RATIOS;
				break;
			case "chat":
				ratios = {
					system: 0.05,
					context: 0.4,
					user: 0.3,
					response: 0.25,
				};
				break;
			default:
				ratios = DEFAULT_RATIOS;
		}
	}

	// Create budget manager
	const manager = new TokenBudgetManager({
		totalBudget,
		ratios,
		minimums: input.minimums,
		maximums: input.maximums,
	});

	// Allocate budget
	const allocation = manager.allocate();

	return {
		allocation,
		config: {
			totalBudget,
			ratios,
			preset: input.preset,
		},
	};
}

/**
 * Get available model context windows
 */
export const GetModelWindowsInputSchema = z.object({});

export type GetModelWindowsInput = z.infer<typeof GetModelWindowsInputSchema>;

/**
 * Get available model context windows
 */
export async function getModelWindows(
	input: GetModelWindowsInput,
): Promise<{
	models: Array<{ name: string; contextWindow: number }>;
}> {
	const models = Object.entries(MODEL_CONTEXT_WINDOWS).map(([name, window]) => ({
		name,
		contextWindow: window,
	}));

	return { models };
}

/**
 * Get budget presets
 */
export const GetBudgetPresetsInputSchema = z.object({
	totalBudget: z.number().min(100).default(100000).describe("Total token budget"),
});

export type GetBudgetPresetsInput = z.infer<typeof GetBudgetPresetsInputSchema>;

/**
 * Get budget presets with allocations
 */
export async function getBudgetPresets(
	input: GetBudgetPresetsInput,
): Promise<{
	presets: Record<
		string,
		{
			ratios: Record<BudgetCategory, number>;
			allocation: BudgetAllocation;
		}
	>;
}> {
	const presets: Record<
		string,
		{
			ratios: Record<BudgetCategory, number>;
			allocation: BudgetAllocation;
		}
	> = {};

	// Balanced
	const balanced = BUDGET_PRESETS.balanced(input.totalBudget);
	presets.balanced = {
		ratios: DEFAULT_RATIOS,
		allocation: balanced.allocate(),
	};

	// Context-heavy
	const contextHeavy = BUDGET_PRESETS.contextHeavy(input.totalBudget);
	presets.contextHeavy = {
		ratios: CONTEXT_HEAVY_RATIOS,
		allocation: contextHeavy.allocate(),
	};

	// Conservative
	const conservative = BUDGET_PRESETS.conservative(input.totalBudget);
	presets.conservative = {
		ratios: CONSERVATIVE_RATIOS,
		allocation: conservative.allocate(),
	};

	// Chat
	const chat = BUDGET_PRESETS.chat(input.totalBudget);
	presets.chat = {
		ratios: {
			system: 0.05,
			context: 0.4,
			user: 0.3,
			response: 0.25,
		},
		allocation: chat.allocate(),
	};

	return { presets };
}