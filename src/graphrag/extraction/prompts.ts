/**
 * LLM prompts for entity and relationship extraction
 *
 * These prompts guide the LLM in extracting structured knowledge from memory content.
 */

export const ENTITY_EXTRACTION_SYSTEM = `You are an expert at extracting named entities from text.
Extract all significant entities including: people, organizations, technologies, concepts, locations, events, products.

For each entity provide:
1. canonical_name: The normalized, full name (e.g., "Elon Musk" not "Musk")
2. entity_type: One of PERSON, ORGANIZATION, TECHNOLOGY, CONCEPT, LOCATION, EVENT, PRODUCT, OTHER
3. description: A brief description based on context (1-2 sentences)
4. confidence: Your confidence in this extraction (0.0-1.0)
5. mention_text: The exact text that mentions this entity

IMPORTANT:
- Use canonical names (full, official names)
- Resolve coreferences ("he" -> actual name)
- Don't extract generic terms like "system" or "user" unless specifically named
- Extract relationships between entities you find
- Focus on entities that are specific and identifiable`;

export function createEntityExtractionUserPrompt(content: string): string {
  // Truncate content if too long (approximately 4000 tokens)
  const maxLength = 12000;
  const truncatedContent =
    content.length > maxLength
      ? `${content.slice(0, maxLength)}...[truncated]`
      : content;

  return `Extract all named entities from the following text.

TEXT:
${truncatedContent}

Respond with JSON only (no markdown, no explanation):
{
  "entities": [
    {
      "canonical_name": "string",
      "entity_type": "PERSON|ORGANIZATION|TECHNOLOGY|CONCEPT|LOCATION|EVENT|PRODUCT|OTHER",
      "description": "string",
      "confidence": 0.0-1.0,
      "mention_text": "string"
    }
  ],
  "relationships": [
    {
      "source_entity": "canonical_name of source",
      "target_entity": "canonical_name of target",
      "relationship_type": "string (e.g., WORKS_FOR, CREATED, USES, RELATED_TO, DEPENDS_ON, IMPLEMENTS)",
      "description": "string describing the relationship",
      "strength": 1-10,
      "confidence": 0.0-1.0
    }
  ]
}`;
}

export const COMMUNITY_REPORT_SYSTEM = `You are an expert at summarizing groups of related entities.
Given a community of entities and their relationships, create a comprehensive report that:
1. Identifies the main theme or topic binding these entities
2. Highlights key relationships and dependencies
3. Provides actionable insights

Keep the summary concise but informative.`;

export function createCommunityReportUserPrompt(
  entities: string[],
  relationships: string[],
): string {
  return `Create a summary report for this community of related entities.

ENTITIES:
${entities.join("\n")}

RELATIONSHIPS:
${relationships.join("\n")}

Respond with JSON only (no markdown, no explanation):
{
  "title": "A descriptive title for this community (5-10 words)",
  "summary": "2-3 sentence summary of what this community represents",
  "full_content": "Detailed explanation (2-4 paragraphs) covering:\n- Main theme/topic\n- Key entities and their roles\n- Important relationships\n- Implications or insights",
  "key_findings": ["finding 1", "finding 2", "finding 3"],
  "rating": 1-10,
  "rating_explanation": "Brief explanation of the importance/relevance rating"
}`;
}

export const HYPOTHESIS_GENERATION_SYSTEM = `You are an expert at generating hypothetical answers for knowledge graph search.
Given a query and optional context, generate a detailed hypothetical answer that would help find relevant entities in a knowledge graph.`;

export function createHypothesisPrompt(
  query: string,
  previousFindings?: string,
  previousHypotheses?: string[],
): string {
  const contextPart = previousFindings
    ? `\nPrevious findings: ${previousFindings}`
    : "";

  const hypothesesPart =
    previousHypotheses && previousHypotheses.length > 0
      ? `\nPrevious hypotheses that were explored: ${previousHypotheses.join("; ")}`
      : "";

  return `Generate a hypothetical answer to this query. Be specific and include entity names that might exist in a knowledge graph.

QUERY: ${query}
${contextPart}
${hypothesesPart}

Generate a detailed hypothetical answer (1-2 paragraphs) that:
1. Directly addresses the query
2. Mentions specific entities (people, technologies, organizations, concepts)
3. Describes relationships between entities
4. Provides concrete details that could be verified

Your response should be a natural language answer, not JSON.`;
}

export const RELEVANCE_EXTRACTION_SYSTEM = `You are an expert at extracting relevant information from community reports.
Given a query and a community report, extract only the information that is directly relevant to answering the query.`;

export function createRelevanceExtractionPrompt(
  query: string,
  reportTitle: string,
  reportSummary: string,
  reportContent: string,
): string {
  return `Given this community report, extract information relevant to the query.

QUERY: ${query}

REPORT:
Title: ${reportTitle}
Summary: ${reportSummary}
Content: ${reportContent}

Extract only the relevant parts that help answer the query. Be concise (2-4 sentences). If nothing is relevant, respond with "No relevant information found."`;
}

export const SYNTHESIS_SYSTEM = `You are an expert at synthesizing information from multiple sources.
Combine insights from community reports to provide a comprehensive, well-structured answer.`;

export function createSynthesisPrompt(
  query: string,
  extractedInfos: string[],
): string {
  return `Synthesize a comprehensive answer to the query based on these community insights.

QUERY: ${query}

COMMUNITY INSIGHTS:
${extractedInfos.map((info, i) => `[${i + 1}] ${info}`).join("\n\n")}

Provide a comprehensive answer that:
1. Directly addresses the query
2. Synthesizes all relevant information from the insights
3. Is well-structured and easy to read
4. Acknowledges any gaps or uncertainties

If the insights don't contain relevant information, say so clearly.`;
}
