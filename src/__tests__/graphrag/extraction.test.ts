/**
 * Tests for entity extraction
 */

import { describe, expect, test } from "bun:test";
import {
  extractEntitiesFallback,
  extractRelationshipsFallback,
} from "@/graphrag/extraction/fallback";
import {
  createCommunityReportUserPrompt,
  createEntityExtractionUserPrompt,
  createHypothesisPrompt,
  ENTITY_EXTRACTION_SYSTEM,
} from "@/graphrag/extraction/prompts";

describe("Fallback Entity Extraction", () => {
  describe("extractEntitiesFallback", () => {
    test("extracts capitalized proper nouns", () => {
      const content =
        "John Smith works at Microsoft and uses TypeScript for development.";
      const entities = extractEntitiesFallback(content);

      const names = entities.map((e) => e.canonicalName);
      expect(names).toContain("John Smith");
      expect(names).toContain("Microsoft");
      expect(names).toContain("TypeScript");
    });

    test("filters common words", () => {
      const content = "The system was When implemented This way.";
      const entities = extractEntitiesFallback(content);

      const names = entities.map((e) => e.canonicalName);
      expect(names).not.toContain("The");
      expect(names).not.toContain("When");
      expect(names).not.toContain("This");
    });

    test("extracts technology patterns", () => {
      const content =
        "We use React and PostgreSQL with Docker for our infrastructure.";
      const entities = extractEntitiesFallback(content);

      const names = entities.map((e) => e.canonicalName.toLowerCase());
      expect(names).toContain("react");
      expect(names).toContain("postgresql");
      expect(names).toContain("docker");
    });

    test("extracts organization patterns", () => {
      const content =
        "Google and Amazon are tech giants. Acme Corp is a startup.";
      const entities = extractEntitiesFallback(content);

      const names = entities.map((e) => e.canonicalName);
      expect(names).toContain("Google");
      expect(names).toContain("Amazon");
    });

    test("assigns low confidence to fallback extractions", () => {
      const content = "Microsoft uses Azure for cloud computing.";
      const entities = extractEntitiesFallback(content);

      for (const entity of entities) {
        expect(entity.confidence).toBeLessThanOrEqual(0.7);
      }
    });

    test("handles empty content", () => {
      const entities = extractEntitiesFallback("");
      expect(entities.length).toBe(0);
    });

    test("handles content with no entities", () => {
      const content = "this is all lowercase with no proper nouns";
      const entities = extractEntitiesFallback(content);
      // May have some false positives from technology patterns
      expect(entities.length).toBeLessThan(5);
    });
  });

  describe("extractRelationshipsFallback", () => {
    test("creates relationships for co-occurring entities", () => {
      const entities = [
        {
          canonicalName: "React",
          entityType: "TECHNOLOGY" as const,
          confidence: 0.6,
          mentionText: "React",
        },
        {
          canonicalName: "TypeScript",
          entityType: "TECHNOLOGY" as const,
          confidence: 0.6,
          mentionText: "TypeScript",
        },
      ];
      const content = "We use React and TypeScript together.";

      const relationships = extractRelationshipsFallback(entities, content);

      expect(relationships.length).toBeGreaterThan(0);
      expect(relationships[0].relationshipType).toBe("RELATED_TO");
    });

    test("assigns low confidence to co-occurrence relationships", () => {
      const entities = [
        {
          canonicalName: "A",
          entityType: "CONCEPT" as const,
          confidence: 0.5,
          mentionText: "A",
        },
        {
          canonicalName: "B",
          entityType: "CONCEPT" as const,
          confidence: 0.5,
          mentionText: "B",
        },
      ];
      const content = "A and B are mentioned together.";

      const relationships = extractRelationshipsFallback(entities, content);

      for (const rel of relationships) {
        expect(rel.confidence).toBeLessThanOrEqual(0.5);
      }
    });

    test("handles entities in different sentences", () => {
      const entities = [
        {
          canonicalName: "First",
          entityType: "CONCEPT" as const,
          confidence: 0.5,
          mentionText: "First",
        },
        {
          canonicalName: "Second",
          entityType: "CONCEPT" as const,
          confidence: 0.5,
          mentionText: "Second",
        },
      ];
      const content = "First is mentioned here. Second is mentioned elsewhere.";

      const relationships = extractRelationshipsFallback(entities, content);

      // No relationships since they're in different sentences
      expect(relationships.length).toBe(0);
    });
  });
});

describe("Extraction Prompts", () => {
  describe("Entity Extraction Prompts", () => {
    test("system prompt contains required instructions", () => {
      expect(ENTITY_EXTRACTION_SYSTEM).toContain("entity");
      expect(ENTITY_EXTRACTION_SYSTEM).toContain("canonical_name");
      expect(ENTITY_EXTRACTION_SYSTEM).toContain("confidence");
    });

    test("user prompt includes content", () => {
      const content = "Test content for extraction";
      const prompt = createEntityExtractionUserPrompt(content);

      expect(prompt).toContain(content);
      expect(prompt).toContain("entities");
      expect(prompt).toContain("relationships");
    });

    test("user prompt truncates long content", () => {
      const longContent = "A".repeat(15000);
      const prompt = createEntityExtractionUserPrompt(longContent);

      // Should be truncated with indicator
      expect(prompt).toContain("truncated");
      expect(prompt.length).toBeLessThan(longContent.length);
    });
  });

  describe("Community Report Prompts", () => {
    test("creates prompt with entities and relationships", () => {
      const entities = ["Entity A (TECHNOLOGY)", "Entity B (CONCEPT)"];
      const relationships = ["A --> B"];

      const prompt = createCommunityReportUserPrompt(entities, relationships);

      expect(prompt).toContain("Entity A");
      expect(prompt).toContain("Entity B");
      expect(prompt).toContain("A --> B");
    });

    test("prompt requests structured output", () => {
      const prompt = createCommunityReportUserPrompt(["Test"], []);

      expect(prompt).toContain("title");
      expect(prompt).toContain("summary");
      expect(prompt).toContain("full_content");
      expect(prompt).toContain("key_findings");
      expect(prompt).toContain("rating");
    });
  });

  describe("Hypothesis Prompts", () => {
    test("creates prompt without context", () => {
      const prompt = createHypothesisPrompt("What is TypeScript?");

      expect(prompt).toContain("TypeScript");
      expect(prompt).toContain("hypothetical");
    });

    test("includes previous findings when provided", () => {
      const prompt = createHypothesisPrompt(
        "What is TypeScript?",
        "Found: JavaScript, Microsoft",
        ["TypeScript is a language"],
      );

      expect(prompt).toContain("JavaScript");
      expect(prompt).toContain("Microsoft");
      expect(prompt).toContain("TypeScript is a language");
    });
  });
});
