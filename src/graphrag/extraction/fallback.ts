/**
 * Fallback entity extraction using regex patterns
 *
 * Used when no LLM API key is available or when LLM extraction fails.
 * Provides basic entity detection through pattern matching.
 */

import type { EntityType, ExtractedEntity } from "../types";

/**
 * Common words to filter out from entity detection
 */
const COMMON_WORDS = new Set([
  // Articles and pronouns
  "The",
  "This",
  "That",
  "These",
  "Those",
  "When",
  "Where",
  "What",
  "Which",
  "Who",
  "How",
  "Why",
  "Here",
  "There",
  "Some",
  "All",
  "Any",
  "Each",
  "Every",
  "Both",
  "Few",
  "More",
  "Most",
  "Other",
  "Such",
  // Common programming words that look like proper nouns
  "True",
  "False",
  "Null",
  "None",
  "Error",
  "Warning",
  "Info",
  "Debug",
  "Success",
  "Failed",
  "Todo",
  "Note",
  "Important",
  // Common verbs starting with capital
  "Create",
  "Update",
  "Delete",
  "Read",
  "Write",
  "Add",
  "Remove",
  "Get",
  "Set",
  "Check",
  "Test",
  "Run",
  "Start",
  "Stop",
  "Build",
  "Deploy",
  "Install",
  "Configure",
  "Setup",
  // Days and months
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]);

/**
 * Technology patterns (case-insensitive matches)
 */
const TECHNOLOGY_PATTERNS: Array<{ pattern: RegExp; type: EntityType }> = [
  // Languages
  {
    pattern:
      /\b(JavaScript|TypeScript|Python|Rust|Go|Java|Ruby|PHP|Swift|Kotlin|C\+\+|C#)\b/gi,
    type: "TECHNOLOGY",
  },
  // Frameworks
  {
    pattern:
      /\b(React|Vue|Angular|Next\.js|Nuxt|Svelte|Express|FastAPI|Django|Flask|Spring|Rails)\b/gi,
    type: "TECHNOLOGY",
  },
  // Databases
  {
    pattern:
      /\b(PostgreSQL|MySQL|MongoDB|Redis|SQLite|Elasticsearch|DynamoDB|Cassandra|Firebase)\b/gi,
    type: "TECHNOLOGY",
  },
  // Cloud/Infrastructure
  {
    pattern:
      /\b(AWS|Azure|GCP|Kubernetes|Docker|Terraform|Jenkins|GitHub Actions|Vercel|Netlify)\b/gi,
    type: "TECHNOLOGY",
  },
  // Tools
  {
    pattern: /\b(npm|yarn|pnpm|bun|pip|cargo|maven|gradle|webpack|vite)\b/gi,
    type: "TECHNOLOGY",
  },
];

/**
 * Organization patterns
 */
const ORG_PATTERNS = [
  // Common suffixes
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:Inc|Corp|LLC|Ltd|Company|Technologies|Software|Labs|Studios)\b/g,
  // Well-known companies
  /\b(Google|Microsoft|Amazon|Apple|Meta|Facebook|Netflix|Uber|Airbnb|Stripe|OpenAI|Anthropic|GitHub|GitLab|Atlassian|Slack|Notion)\b/g,
];

/**
 * Extract entities using regex patterns (fallback method)
 *
 * @param content - Text content to extract entities from
 * @returns Array of extracted entities with low confidence scores
 */
export function extractEntitiesFallback(content: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  // Extract technologies
  for (const { pattern, type } of TECHNOLOGY_PATTERNS) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1] || match[0];
      const normalizedName = normalizeName(name);

      if (!seen.has(normalizedName.toLowerCase())) {
        seen.add(normalizedName.toLowerCase());
        entities.push({
          canonicalName: normalizedName,
          entityType: type,
          confidence: 0.6, // Medium confidence for pattern matches
          mentionText: match[0],
        });
      }
    }
  }

  // Extract organizations
  for (const pattern of ORG_PATTERNS) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1] || match[0];
      const normalizedName = normalizeName(name);

      if (!seen.has(normalizedName.toLowerCase())) {
        seen.add(normalizedName.toLowerCase());
        entities.push({
          canonicalName: normalizedName,
          entityType: "ORGANIZATION",
          confidence: 0.5,
          mentionText: match[0],
        });
      }
    }
  }

  // Extract capitalized phrases (potential proper nouns)
  const capitalizedPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g;
  let match: RegExpExecArray | null;

  while ((match = capitalizedPattern.exec(content)) !== null) {
    const name = match[1];

    // Skip common words and already seen entities
    if (COMMON_WORDS.has(name) || seen.has(name.toLowerCase())) {
      continue;
    }

    // Skip if it's at the start of a sentence (likely not a proper noun)
    const beforeIndex = match.index - 2;
    if (beforeIndex >= 0) {
      const charBefore = content[beforeIndex];
      if (charBefore === "." || charBefore === "!" || charBefore === "?") {
        continue;
      }
    }

    // Skip very short names (likely false positives)
    if (name.length < 4) {
      continue;
    }

    seen.add(name.toLowerCase());
    entities.push({
      canonicalName: name,
      entityType: guessEntityType(name, content),
      confidence: 0.3, // Low confidence for generic pattern
      mentionText: name,
    });
  }

  return entities;
}

/**
 * Normalize entity name
 */
function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^the\s+/i, "");
}

/**
 * Guess entity type based on context
 */
function guessEntityType(name: string, context: string): EntityType {
  const lowerName = name.toLowerCase();
  const lowerContext = context.toLowerCase();

  // Check for person indicators
  const personIndicators = [
    "said",
    "wrote",
    "created",
    "developed",
    "founded",
    "led",
    "managed",
    "designed",
  ];
  const nameIndex = lowerContext.indexOf(lowerName);
  if (nameIndex !== -1) {
    const nearby = lowerContext.slice(
      Math.max(0, nameIndex - 50),
      nameIndex + lowerName.length + 50,
    );
    for (const indicator of personIndicators) {
      if (nearby.includes(indicator)) {
        return "PERSON";
      }
    }
  }

  // Check for concept indicators
  const conceptIndicators = [
    "pattern",
    "principle",
    "approach",
    "method",
    "strategy",
    "architecture",
    "design",
  ];
  for (const indicator of conceptIndicators) {
    if (lowerName.includes(indicator)) {
      return "CONCEPT";
    }
  }

  // Default to OTHER
  return "OTHER";
}

/**
 * Extract simple relationships from fallback entities
 * (Very limited - just co-occurrence based)
 */
export function extractRelationshipsFallback(
  entities: ExtractedEntity[],
  content: string,
): Array<{
  sourceEntity: string;
  targetEntity: string;
  relationshipType: string;
  description?: string;
  strength: number;
  confidence: number;
}> {
  const relationships: Array<{
    sourceEntity: string;
    targetEntity: string;
    relationshipType: string;
    description?: string;
    strength: number;
    confidence: number;
  }> = [];
  const pairCounts = new Map<
    string,
    { sourceEntity: string; targetEntity: string; count: number }
  >();
  const MAX_ENTITIES_PER_SENTENCE = 8;
  const MAX_RELATIONSHIPS = 64;

  // Simple co-occurrence: if two entities appear in the same sentence, they might be related
  const sentences = content.split(/[.!?]+/);

  for (const sentence of sentences) {
    const normalizedSentence = sentence.toLowerCase();
    const sentenceEntities = entities.filter((e) => {
      const mention = e.mentionText.toLowerCase();
      const canonical = e.canonicalName.toLowerCase();
      return (
        mention.length > 1 &&
        canonical.length > 1 &&
        (normalizedSentence.includes(mention) ||
          normalizedSentence.includes(canonical))
      );
    });
    const uniqueEntities = Array.from(
      new Map(
        sentenceEntities.map((entity) => [
          entity.canonicalName.toLowerCase(),
          entity,
        ]),
      ).values(),
    );
    if (
      uniqueEntities.length < 2 ||
      uniqueEntities.length > MAX_ENTITIES_PER_SENTENCE
    ) {
      continue;
    }

    // Create relationships between entities in the same sentence
    for (let i = 0; i < uniqueEntities.length; i++) {
      for (let j = i + 1; j < uniqueEntities.length; j++) {
        const left = uniqueEntities[i].canonicalName;
        const right = uniqueEntities[j].canonicalName;
        const [sourceEntity, targetEntity] =
          left.localeCompare(right) <= 0 ? [left, right] : [right, left];
        const key = `${sourceEntity}::${targetEntity}`;
        const existing = pairCounts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          pairCounts.set(key, { sourceEntity, targetEntity, count: 1 });
        }
      }
    }
  }

  const sortedPairs = Array.from(pairCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_RELATIONSHIPS);

  for (const pair of sortedPairs) {
    relationships.push({
      sourceEntity: pair.sourceEntity,
      targetEntity: pair.targetEntity,
      relationshipType: "CO_OCCURS_WITH",
      description: "Entities frequently co-mentioned in the same text context.",
      strength: Math.min(10, 2 + pair.count),
      confidence: Math.min(0.9, 0.5 + pair.count * 0.1),
    });
  }

  return relationships;
}
