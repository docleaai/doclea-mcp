import { describe, expect, it, beforeEach, mock } from "bun:test";
import { LLMTagger, tagMemoriesBatch } from "@/tagging";
import { STOP_WORDS, TaggingResultSchema } from "@/tagging/types";

describe("LLMTagger", () => {
	describe("constructor", () => {
		it("should create tagger without API key", () => {
			// Ensure no env var is set
			const originalKey = process.env.ANTHROPIC_API_KEY;
			delete process.env.ANTHROPIC_API_KEY;

			const tagger = new LLMTagger();
			expect(tagger.hasLLM).toBe(false);

			// Restore
			if (originalKey) {
				process.env.ANTHROPIC_API_KEY = originalKey;
			}
		});

		it("should create tagger with API key option", () => {
			const tagger = new LLMTagger({ apiKey: "test-key" });
			expect(tagger.hasLLM).toBe(true);
		});
	});

	describe("fallback extraction", () => {
		let tagger: LLMTagger;

		beforeEach(() => {
			// Create tagger without API key to force fallback
			const originalKey = process.env.ANTHROPIC_API_KEY;
			delete process.env.ANTHROPIC_API_KEY;
			tagger = new LLMTagger();
			if (originalKey) {
				process.env.ANTHROPIC_API_KEY = originalKey;
			}
		});

		it("should extract tags from memory content", async () => {
			const result = await tagger.extractTags({
				title: "React Authentication Implementation",
				type: "solution",
				content:
					"We implemented authentication using JWT tokens and refresh tokens. The React components handle login and logout flows.",
			});

			expect(result.tags.length).toBeGreaterThan(0);
			expect(result.tags.length).toBeLessThanOrEqual(5);
			expect(result.reasoning).toContain("keyword frequency");
		});

		it("should assign custom category to fallback tags", async () => {
			const result = await tagger.extractTags({
				title: "Test Memory",
				type: "note",
				content: "Testing the tagging system with some keywords.",
			});

			for (const tag of result.tags) {
				expect(tag.category).toBe("custom");
			}
		});

		it("should normalize tags to lowercase hyphenated format", async () => {
			const result = await tagger.extractTags({
				title: "Test Memory",
				type: "note",
				content: "Testing testing testing testing testing",
			});

			for (const tag of result.tags) {
				expect(tag.name).toMatch(/^[a-z0-9-]+$/);
			}
		});

		it("should filter out stop words", async () => {
			const result = await tagger.extractTags({
				title: "Test",
				type: "note",
				content:
					"This is a test with many common words that should be filtered",
			});

			for (const tag of result.tags) {
				expect(STOP_WORDS.has(tag.name)).toBe(false);
			}
		});

		it("should handle empty content", async () => {
			const result = await tagger.extractTags({
				title: "",
				type: "note",
				content: "",
			});

			expect(result.tags).toEqual([]);
			expect(result.reasoning).toContain("keyword frequency");
		});

		it("should assign confidence based on frequency", async () => {
			const result = await tagger.extractTags({
				title: "React",
				type: "note",
				content:
					"React React React React React React React React React React",
			});

			// Most frequent word should have higher confidence
			if (result.tags.length > 0) {
				expect(result.tags[0].confidence).toBeGreaterThan(0);
				expect(result.tags[0].confidence).toBeLessThanOrEqual(0.8);
			}
		});
	});

	describe("tag normalization", () => {
		let tagger: LLMTagger;

		beforeEach(() => {
			const originalKey = process.env.ANTHROPIC_API_KEY;
			delete process.env.ANTHROPIC_API_KEY;
			tagger = new LLMTagger();
			if (originalKey) {
				process.env.ANTHROPIC_API_KEY = originalKey;
			}
		});

		it("should handle words with special characters", async () => {
			const result = await tagger.extractTags({
				title: "Test",
				type: "note",
				content: "node.js node.js node.js node.js node.js",
			});

			// Check that normalized tags don't have problematic characters
			for (const tag of result.tags) {
				expect(tag.name).not.toContain(".");
				expect(tag.name).not.toMatch(/^-|-$/);
			}
		});
	});

	describe("Zod schema validation", () => {
		it("should validate correct tagging result", () => {
			const result = {
				tags: [
					{ name: "react", confidence: 0.9, category: "technology" as const },
					{
						name: "authentication",
						confidence: 0.85,
						category: "domain" as const,
					},
				],
				reasoning: "Tags extracted from content",
			};

			const parsed = TaggingResultSchema.parse(result);
			expect(parsed.tags).toHaveLength(2);
		});

		it("should reject invalid confidence", () => {
			const result = {
				tags: [
					{ name: "react", confidence: 1.5, category: "technology" as const },
				],
				reasoning: "Test",
			};

			expect(() => TaggingResultSchema.parse(result)).toThrow();
		});

		it("should reject invalid category", () => {
			const result = {
				tags: [{ name: "react", confidence: 0.9, category: "invalid" }],
				reasoning: "Test",
			};

			expect(() => TaggingResultSchema.parse(result)).toThrow();
		});
	});
});

describe("tagMemoriesBatch", () => {
	it("should process multiple memories", async () => {
		const originalKey = process.env.ANTHROPIC_API_KEY;
		delete process.env.ANTHROPIC_API_KEY;

		const tagger = new LLMTagger();
		const memories = [
			{
				id: "mem_1",
				title: "First Memory",
				type: "note",
				content: "Content one with keywords",
			},
			{
				id: "mem_2",
				title: "Second Memory",
				type: "note",
				content: "Content two with different keywords",
			},
		];

		const results = await tagMemoriesBatch(memories, tagger);

		expect(results.size).toBe(2);
		expect(results.has("mem_1")).toBe(true);
		expect(results.has("mem_2")).toBe(true);

		if (originalKey) {
			process.env.ANTHROPIC_API_KEY = originalKey;
		}
	});

	it("should handle empty array", async () => {
		const tagger = new LLMTagger();
		const results = await tagMemoriesBatch([], tagger);
		expect(results.size).toBe(0);
	});
});

describe("STOP_WORDS", () => {
	it("should include common English stop words", () => {
		expect(STOP_WORDS.has("this")).toBe(true);
		expect(STOP_WORDS.has("that")).toBe(true);
		expect(STOP_WORDS.has("with")).toBe(true);
	});

	it("should include programming keywords", () => {
		expect(STOP_WORDS.has("const")).toBe(true);
		expect(STOP_WORDS.has("function")).toBe(true);
		expect(STOP_WORDS.has("return")).toBe(true);
		expect(STOP_WORDS.has("async")).toBe(true);
		expect(STOP_WORDS.has("await")).toBe(true);
	});

	it("should not include useful technical terms", () => {
		expect(STOP_WORDS.has("react")).toBe(false);
		expect(STOP_WORDS.has("typescript")).toBe(false);
		expect(STOP_WORDS.has("authentication")).toBe(false);
	});
});
