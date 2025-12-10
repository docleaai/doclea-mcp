# Doclea Documentation Strategy

A comprehensive guide for creating world-class developer documentation for Doclea MCP.

---

## Executive Summary

Doclea requires documentation that simultaneously serves **quick-win users** (15-minute setup) and **power users** (deep customization). This strategy balances progressive disclosure with practical depth, using Doclea's three distinct user personas to organize content.

**Key Principle:** Every concept introduced must be immediately actionable or clearly signposted to implementation.

---

## 1. Tone and Style Guide

### Core Principles

**Tone: Confident and Practical**
- Assume competence (developers understand git, MCP, and command line)
- Be direct: "Do this" rather than "You might consider trying..."
- Use active voice: "Doclea stores memories" not "Memories can be stored by Doclea"
- Show respect for time: avoid fluff, be scannable

**Language: Technical but Accessible**
- Explain MCP-specific terms once on first use, then use freely
- Use metaphors sparingly—code examples are better than analogies
- British English for consistency (consistent with many open-source projects)

**Voice Examples:**

Good:
```
Store a decision in Doclea when you make an architectural choice that affects
multiple areas of the codebase. Later, Claude will surface this decision when
working on related files.
```

Avoid:
```
You may want to consider potentially storing a decision in Doclea if you happen
to make architectural choices that could be relevant to multiple code areas,
which Claude might find useful later.
```

### Writing Patterns by Content Type

**Concept Explanations**
- Lead with "what it is" (1 sentence definition)
- Follow with "why it matters" (2-3 sentences)
- Example: "Semantic search finds memories based on meaning, not keywords. This matters because you might remember a decision about database transactions without remembering it was tagged 'ACID.'"

**Instructions**
- Start with end state: "You'll have Doclea running in 5 minutes"
- Use numbered steps with substeps only when essential
- Include screenshot or terminal output expectations
- Always test the steps yourself

**Warnings/Notes**
- Use structured callouts (see Visual Elements section)
- Reserve warnings for things that break things (data loss, misconfiguration)
- Use tips for productivity advice

### Real Examples from Doclea

**Pattern 1: Storing a Memory**
```
Store a memory to capture knowledge you want Claude to use later in the project.

Common memory types:
- decision: "We're using PostgreSQL for financial transactions"
- solution: "The race condition happens when X and Y occur together"
- pattern: "Always use request.user.id from middleware, not from params"

Store memories when you discover something useful, not at the end of a task.
```

**Pattern 2: Explaining Zero-Config vs Optimized**
```
Doclea works immediately with zero configuration. It auto-detects available
Docker backends and uses embedded alternatives if they're not available.

Use zero-config if: You want to start in <30 seconds, working on a small project
Use optimized if: You're on a large codebase (>100k files), need better performance

The difference? Zero-config uses sqlite-vec and Transformers.js (embedded).
Optimized uses Qdrant and TEI (Docker services) which are faster for large
codebases.
```

---

## 2. Must-Have Documentation Pages

### Tier 1: User Activation (0-30 minutes)

These pages **must exist** and must be flawless. They're what determines if someone tries Doclea at all.

#### Page 1: "Get Started in 5 Minutes"
- **Purpose:** Fastest path to experiencing value
- **Length:** 2-3 screens max (scrolling discouraged)
- **Content:**
  - What you'll have by the end (specific, visible outcome)
  - Single installation method (no choices)
  - First interesting action (store memory + search it)
  - Success criteria (screenshots of working tool)

**Template Structure:**
```
## Get Started in 5 Minutes

You'll have Doclea running and storing your first memory.

### Step 1: Install [2 minutes]
[Single copy-paste command]
[Expected output]

### Step 2: Initialize Your Project [1 minute]
[Ask Claude Code to initialize]
[What happens]

### Step 3: Store Your First Memory [2 minutes]
[Example memory to store]
[How to search it]

Done! Next: [Link to next logical step]
```

#### Page 2: "Understanding Memory Types"
- **Purpose:** Answer "what do I store and when?"
- **Length:** 1 screen with examples
- **Content:** Decision/Solution/Pattern/Architecture/Note with concrete examples
- **Format:** Comparison table + real examples

**Template:**
```
| Type | When to Use | Example |
|------|-------------|---------|
| decision | Architecture choice | "We're using PostgreSQL for ACID" |
| solution | Bug fix or workaround | "Fixed race condition by adding mutex" |
| pattern | Code convention | "Always extract form validation to helper" |
| architecture | System design | "Three-tier architecture with event queue" |
| note | General documentation | "Frontend build times increased in Dec" |
```

#### Page 3: "Installation Guide"
- **Purpose:** All installation paths in one place
- **Content:**
  - Decision tree (what's your situation?)
  - Three methods with explicit trade-offs
  - Troubleshooting for each method
  - Verification steps

---

### Tier 2: Core Features (30 minutes - 2 hours)

These enable users to extract full value from Doclea's main features.

#### Memory Management Guide
**Sections:**
- Storing memories (with input validation guidance)
- Searching semantically (how relevance scoring works)
- Organizing with tags (tag naming conventions)
- Updating and deleting (when and why)
- Bulk operations (importing from markdown, ADRs)

**Key Content:**
- Show input schema for each tool (what fields are required, optional, constraints)
- Explain "importance" score (0-1 scale, what it affects)
- Demonstrate tag strategies (flat vs hierarchical, when to split vs merge)

#### Git Tools Guide
**Sections:**
- Generating commit messages
- Creating PR descriptions
- Generating changelogs
- How memories inform these operations

**Key Content:**
- Show a before/after: basic commit message vs one with memory context
- Explain what information the tool uses (diff analysis, memory search, git history)
- Common patterns for commit messages (conventional commits reference)

#### Code Expertise Guide
**Sections:**
- Mapping expertise (what "expertise" means)
- Understanding bus factors
- Suggesting reviewers
- Interpreting expertise reports

**Key Content:**
- Show output format and how to interpret scores
- Explain how git blame is analyzed
- Show how to act on expertise gaps (pair programming, documentation)

#### Bootstrap Guide
**Sections:**
- Automatic initialization
- Importing from markdown files
- Importing from ADRs
- Custom import strategies

**Key Content:**
- Show what gets discovered (common patterns: architecture decisions in /docs, ADRs in /adr)
- Demonstrate bulk import from existing documentation

---

### Tier 3: Advanced Usage (2+ hours)

For developers wanting to customize or extend Doclea.

#### Configuration Reference
- **Purpose:** Exhaustive configuration options
- **Content:** Every config key with defaults, type, and behavior
- **Format:** Reference table + examples

**Structure:**
```
### Embedding Provider Configuration

#### provider: "transformers" (default)
- **Description:** Use local Hugging Face transformers
- **Performance:** Good for <50k memories
- **First run:** ~90MB download, cached after
- **Config example:**
  ```json
  {
    "embedding": {
      "provider": "transformers",
      "model": "Xenova/all-MiniLM-L6-v2"
    }
  }
  ```

#### provider: "qdrant"
- **Description:** Connect to Qdrant vector database
- **Prerequisites:** Docker with Qdrant service running
- **Performance:** Excellent for >100k memories
- **Config example:**
  ```json
  {
    "vector": {
      "provider": "qdrant",
      "url": "http://localhost:6333"
    }
  }
  ```
```

#### API Reference
- **Purpose:** What tools do, their inputs, outputs, and schemas
- **Format:** Tool by tool with Zod schema + examples

**For each tool:**
```
### doclea_store

Store a memory with semantic indexing.

**Input Schema:**
```typescript
{
  type: 'decision' | 'solution' | 'pattern' | 'architecture' | 'note',
  title: string,              // Required. 5-100 chars
  content: string,            // Required. Full content
  summary?: string,           // Optional. Brief summary
  importance: number,         // 0-1. Default 0.5
  tags: string[],            // Optional. Max 10 tags
  relatedFiles: string[],    // Optional. File paths
  gitCommit?: string,        // Optional. Related commit hash
  sourcePr?: string,         // Optional. PR reference
  experts: string[]          // Optional. Person names
}
```

**Output:**
```typescript
{
  id: 'mem_abcd1234',
  type: 'decision',
  title: 'Use PostgreSQL',
  createdAt: '2025-12-10T...',
  tags: ['database', 'infrastructure'],
  ...
}
```

**Example:**
```javascript
// Store an architectural decision
const memory = await doclea.store({
  type: 'decision',
  title: 'PostgreSQL for transactional consistency',
  content: 'We chose PostgreSQL because... (detailed reasoning)',
  importance: 0.9,
  tags: ['database', 'infrastructure'],
  relatedFiles: ['src/database/config.ts']
});
```

**Common Errors:**
- Input validation errors with fixes
- Example: "title too short" → show minimum length
```

#### Development Setup
- **Purpose:** Build Doclea plugins or custom backends
- **Content:** Local development, testing, building

#### Troubleshooting Deep Dive
- **Purpose:** Resolve non-obvious issues
- **Format:** Problem → diagnosis → solution
- **Topics:** Performance, memory issues, Docker-specific problems, platform-specific (macOS SQLite, Windows paths)

---

## 3. Code Examples: Structure and Patterns

### Principle: Completeness Over Brevity

Every code example must be **immediately runnable**. No "assume you have X" or incomplete snippets. This is Doclea's biggest advantage over written explanations.

### Example Categories

#### Type 1: Quick Demos (2-5 lines, shows one concept)

**When to use:** Introducing a simple feature

**Example:**
```typescript
// Store a decision that Claude will remember
const memory = await doclea.store({
  type: 'decision',
  title: 'PostgreSQL for ACID compliance',
  content: 'We need transactional consistency for payments.',
  tags: ['database']
});
```

#### Type 2: Realistic Scenarios (10-30 lines, real workflow)

**When to use:** Showing how to combine features

**Example:**
```typescript
// Workflow: Developer makes changes, asks Claude for commit message,
// Doclea suggests one informed by architectural decisions

// 1. Claude stages changes
await git.add([files]);

// 2. Doclea analyzes the diff
const suggestion = await doclea.generateCommitMessage({
  // No explicit diff - uses staged changes
});

// 3. Related memories inform the suggestion
console.log(suggestion.relatedMemories);
// Output:
// [
//   {
//     id: 'mem_xxx',
//     title: 'PostgreSQL for ACID compliance',
//     relevance: 0.92
//   }
// ]

// 4. Developer uses or customizes suggestion
console.log(suggestion.suggestedMessage);
// Output:
// "feat(payments): add transaction serialization
//
// Related decisions:
// - PostgreSQL for ACID compliance
//
// Implements proper locking for concurrent payments."
```

#### Type 3: Error Cases (15-20 lines, show problem and fix)

**When to use:** Teaching common mistakes

**Format:** Side-by-side "Don't / Do" or before/after

**Example:**
```typescript
// WRONG: Searching for something too vague
const results = await doclea.search('stuff');
// Returns: Everything with "stuff" nearby - noisy, useless

// RIGHT: Searching for specific concepts
const results = await doclea.search('PostgreSQL transaction isolation');
// Returns: Decisions about database consistency, implementations
// that reference transactions

// KEY: Search reflects how Claude would reason about your code
// If you'd explain it to a peer, that's a good search query
```

#### Type 4: Reference Tables (not code, but important)

**When to use:** Showing all variants of something

**Example:**
```typescript
// All memory type use cases at a glance:

type: 'decision'      // "Use PostgreSQL"
                      // Architectural choices affecting multiple files
                      // Searched when working on related components

type: 'solution'      // "Fix: Race condition when deleting + recreating"
                      // Bug fixes and workarounds
                      // Searched when similar patterns appear

type: 'pattern'       // "Extract form validation to helper functions"
                      // Code conventions and best practices
                      // Searched when starting new implementations

type: 'architecture'  // "Three-tier: API → Business → Data layer"
                      // System design and data flow
                      // Searched for structural decisions

type: 'note'          // "Heroku deploys take 3 minutes on staging"
                      // General facts and observations
                      // Searched for context and history
```

### Documentation Structure for Code Examples

**Every example should include:**

1. **Context comment** (why this exists)
   ```typescript
   // Store an architectural decision so Claude remembers it
   // when working on related code
   ```

2. **The code** (complete, runnable)

3. **Expected output** (what success looks like)
   ```
   // Output:
   // {
   //   id: 'mem_...',
   //   createdAt: '2025-12-10...',
   //   ...
   // }
   ```

4. **What just happened** (explanation for skimmers)
   ```
   // This stored a memory indexed by meaning. Later, searching
   // for "ACID compliance" or "transaction consistency" will
   // surface this decision.
   ```

5. **Next step** (where to go from here)
   ```
   // Next: Search for related memories to see how this informs
   // other architectural decisions
   ```

### Real Example from Doclea Codebase

**Showing the storeMemory function in docs:**

```typescript
// Your project uses PostgreSQL because you need ACID compliance
// Store this decision so Claude brings it up when suggesting
// database-related changes

import { doclea } from '@doclea/mcp';

const architectureDecision = await doclea.store({
  type: 'decision',
  title: 'PostgreSQL for transactional consistency',
  content: `
    We selected PostgreSQL over NoSQL options because:

    1. Financial transactions require ACID guarantees
    2. Data relationships are complex (proper normalization needed)
    3. Requires strong consistency over eventual consistency

    Trade-offs:
    - Less horizontal scalability than sharded NoSQL
    - Operational complexity higher than managed solutions

    Reconsidered when: If transaction throughput exceeds
    1,000/sec, revisit document databases.
  `,
  importance: 0.95,  // Critical architectural choice
  tags: ['database', 'infrastructure', 'financial'],
  relatedFiles: ['src/database/config.ts', 'src/database/migrations/']
});

console.log(architectureDecision);
// Output:
// {
//   id: 'mem_a1b2c3d4e5f6g7h8',
//   type: 'decision',
//   title: 'PostgreSQL for transactional consistency',
//   createdAt: '2025-12-10T14:30:00Z',
//   tags: ['database', 'infrastructure', 'financial'],
//   relatedFiles: ['src/database/config.ts', '...'],
// }

// Now when Claude works on database-related changes,
// this decision is retrieved and influences suggestions
```

---

## 4. What Makes Documentation "World-Class"

### Criteria 1: Discoverability Without Google

Users should find answers by exploring the documentation structure, not by external search.

**Implements:**
- Consistent naming (if you say "memory types" in one place, use it everywhere)
- Clear information architecture (three tiers, clear progression)
- Breadcrumb navigation (every page has context: you are in Getting Started > Memory Types)
- Quick navigation (table of contents, jump links)

### Criteria 2: Progressive Depth Without Repetition

Same information is at the right depth for three audience levels simultaneously.

**Example: "Semantic Search" explained at three depths**

**Depth 1 (Get Started):**
```
Search finds memories based on meaning, not keywords.
Ask "How do we handle authentication?" and it finds decisions
about auth even if they use the word "security."
```

**Depth 2 (Core Features):**
```
Semantic search converts your query and all memories into
numerical vectors (embeddings). It finds memories with similar
vectors. This matters because "authentication" and "identity
verification" have similar meaning despite different words.

Relevance: The similarity score (0-1) tells you how relevant
each result is. 0.95 means very relevant, 0.5 means somewhat,
0.3 is marginal.

Importance: Your memories have an importance score (0-1) which
affects ranking. A highly important memory ranks higher even if
relevance is slightly lower.
```

**Depth 3 (Configuration/Advanced):**
```
Embedding provider: Converts text to vectors using a model
- transformers: Xenova/all-MiniLM-L6-v2 (384-dimensional)
- openai: text-embedding-3-small (1536-dimensional)
- custom: Any model supporting Hugging Face inference

Vector store: Stores and searches vectors
- sqlite-vec: Runs locally, no Docker
- qdrant: Distributed, production-scale, requires Docker

Performance: Search time is O(n) for sqlite-vec, O(log n) for qdrant.
For <50k memories, sqlite-vec is sufficient. >100k, consider qdrant.

Configuration: See Configuration Reference for provider-specific options.
```

### Criteria 3: Unambiguous Installation

New users should never be confused about which installation method to use.

**Implements:**
- Decision tree: "Do you want to start now? → Yes → zero-config"
- Explicit trade-offs: "Zero-config: faster setup. Optimized: better performance"
- Clear switching path: "Started with zero-config? Upgrade to optimized with [command]"
- Verification steps: "How to check you installed correctly"

### Criteria 4: Every Tool Has an Example

Users should see a tool's output format before using it.

**Example for doclea_suggest_reviewers:**

```
Input:
```bash
suggest_reviewers src/auth/
```

Output:
```json
{
  "suggestions": [
    {
      "name": "alice",
      "files_modified": 42,
      "recent_activity": "High (modified in last 2 weeks)",
      "expertise_score": 0.94
    },
    {
      "name": "bob",
      "files_modified": 12,
      "recent_activity": "Medium",
      "expertise_score": 0.67
    }
  ],
  "bus_factor": "Critical risk: Only Alice knows auth code"
}
```

What this means: Alice is the primary expert. If she's unavailable, reviews should be very thorough. Consider pairing on future auth work.

### Criteria 5: Copy-Paste Commands Are Correct

Every command must be tested end-to-end.

**Implements:**
- All commands tested in CI
- Absolute paths in manual instructions
- Explicit environment setup if needed
- Expected terminal output shown

### Criteria 6: Error Messages Have Solutions

When users hit errors, documentation should help them fix it.

**Example:**
```
### Error: "No staged changes found"

This error occurs when running doclea_commit_message without
staging changes first.

Fix:
```bash
git add .                    # Stage your changes
doclea commit_message       # Now it works
```

Why: Doclea analyzes staged changes to generate messages.
If nothing is staged, it has nothing to analyze.
```

### Criteria 7: Real-World Workflows

Every feature documentation includes a real scenario from start to finish.

**Example: Complete workflow for a developer**

```
## Complete Workflow: Your First Day with Doclea

You just joined a project. You need to understand architectural decisions
and make your first contribution.

### 1. Initialize Doclea [5 minutes]

Initialize Doclea in the project:

```bash
# In your project directory
doclea init
```

Doclea scans:
- Git history (last 100 commits)
- Documentation files (*.md, *.txt)
- Configuration files
- Recent code changes

Output: Doclea stores initial memories about the project.

### 2. Ask Claude About Architecture [5 minutes]

In Claude Code, ask:

```
What are the key architectural decisions in this codebase?
```

Claude searches Doclea's memories and responds with:
- Database choice (PostgreSQL for ACID)
- API pattern (REST with conventional commits)
- Testing approach (Jest + integration tests)

### 3. Make Your First Change [15 minutes]

You fix a bug. Add your solution to Doclea:

```
Store this as a solution: We had a race condition in
the payment processor. The issue: concurrent requests
could create duplicate charges. The fix: Added
transaction serialization with a distributed lock.
```

### 4. Generate Your First Commit Message

Stage your changes and ask Claude:

```
Generate a commit message for my changes
```

Claude provides:

```
fix(payments): prevent duplicate charges with
distributed locks

Related decision:
- PostgreSQL for transactional consistency

Follows patterns:
- Always use transaction isolation level SERIALIZABLE
  for financial operations

Relates to: #432
```

### 5. Submit Your PR

Ask Claude to create a PR description:

```
Create a PR description for this branch
```

Claude drafts:

```
## Fix: Prevent Duplicate Payment Charges

### Problem
Concurrent payment requests could create duplicate charges.
Race condition when request 1 and 2 both check balance
before either completes.

### Solution
Added distributed lock serialization. All payment requests
acquire the same lock before checking balance and charging.

### Related Architectural Decisions
- PostgreSQL for ACID compliance ensures lock works correctly
- Distributed locking pattern matches our infrastructure design

### Testing
- Added integration tests for concurrent payments
- Verified under load with 1000 concurrent requests
```

Done! Your first PR is informed by architectural context.
```

---

## 5. Content Patterns: Standard Pages

Every page type should follow a consistent structure. This makes documentation predictable.

### Pattern: Feature Page

**Used for:** Any tool or feature (doclea_store, doclea_search, expertise mapping)

**Structure:**

```markdown
# Feature Name (Tool Name)

## What This Does [1 paragraph]
Clear explanation of what the feature does and when to use it.

## Quick Example [4-6 lines of code]
The smallest useful example showing the feature.

## Common Use Cases [2-3 bullet points with brief explanations]
When you'd actually use this.

## Input Parameters [Table or formatted list]
What goes into this tool, with types and constraints.

## Output Format [Code block with example]
What you get back, with explanation.

## Complete Example [15-30 lines]
Real scenario showing the feature in context.

## Related Features [Links]
What tools work with this one.

## Troubleshooting [Collapsible sections]
- Common error 1
- Common error 2
```

**Real example: doclea_search page**

```markdown
# Search Memories (doclea_search)

## What This Does

Search finds memories based on semantic meaning, not keywords.
Ask "How do we handle authentication?" and it finds decisions
about auth even if they use different terminology.

## Quick Example

```typescript
const results = await doclea.search(
  'PostgreSQL transaction isolation'
);
```

## Common Use Cases

- Finding relevant architectural decisions before making changes
- Understanding how a pattern applies to your code
- Discovering related work (who else touched this area)

## Input Parameters

```
query: string                    // Required. Your search question
                                // More specific = better results
                                // Example: "PostgreSQL transaction isolation"

filters?: SearchFilters         // Optional. Narrow results
  - type?: memory type          // Search only 'decision' types
  - tags?: string[]            // Limit to specific tags
  - importance?: number         // Only important decisions

limit?: number                  // Max results. Default 10.
```

## Output Format

```json
[
  {
    "id": "mem_a1b2c3d4...",
    "title": "PostgreSQL for transactional consistency",
    "type": "decision",
    "relevance": 0.94,           // How relevant (0-1)
    "importance": 0.9,           // How important (0-1)
    "snippet": "We selected PostgreSQL because..."
  },
  {
    "id": "mem_e5f6g7h8...",
    "title": "Never use eventual consistency for payments",
    "type": "pattern",
    "relevance": 0.87,
    "importance": 0.8,
    "snippet": "Financial operations require immediate consistency..."
  }
]
```

Relevance tells you how closely this memory matches your query.
A 0.95 is highly relevant. A 0.5 is somewhat related.

## Complete Example

```typescript
// Scenario: You're adding a new payment endpoint.
// You want to understand transaction handling decisions
// and patterns.

const query = 'how do we handle concurrent payments safely?';

const memories = await doclea.search(query, {
  type: 'decision',        // Only architectural decisions
  limit: 5
});

// Output:
[
  {
    id: 'mem_abc123',
    title: 'PostgreSQL for transactional consistency',
    relevance: 0.96,
    snippet: 'We selected PostgreSQL for ACID guarantees...'
  },
  {
    id: 'mem_def456',
    title: 'Distributed locking for serialization',
    relevance: 0.92,
    snippet: 'All financial operations use SERIALIZABLE...'
  }
]

// Now you understand the architectural context
// for your payment endpoint implementation
```

## Related Features

- doclea_store: Save your own discoveries back to memory
- doclea_update: Refine existing memories
- doclea_suggest_reviewers: Find experts on this topic

## Troubleshooting

### Getting too many irrelevant results
- Your query is too vague
- Specific queries work better: "PostgreSQL" vs "database"
- Example: Bad query: "stuff". Good query: "How do we
  handle payment processing?"

### Getting no results
- No memories stored yet (run doclea_init)
- Your query uses different terminology than stored memories
- Try searching with related concepts
- Example: Instead of "auth", try "authentication" or
  "user validation"

### Relevance scores seem off
- Importance score (0-1) combines with relevance for ranking
- A memory with high importance ranks high even if relevance
  is slightly lower
- Adjust filters to focus results
```

### Pattern: Configuration Page

**Used for:** Configuration options, settings

**Structure:**

```markdown
# Configuration Reference

## Overview
Quick table of all config options.

## Getting Started [link to quick config example]

## Detailed Reference [grouped by category]

### [Category Name]

#### option_name
- **Type:** value type
- **Default:** default value
- **Description:** What it does
- **Valid Values:** If limited, list them
- **Example:**
```json
{
  "option_name": value
}
```
- **When to Use:** When would you change this
- **Related Options:** What else might you configure together

## Complete Configuration File [full example]

## Troubleshooting

### Problem: [Common issue related to config]
Solution: ...

## Migration Guide [if upgrading]
```

### Pattern: Troubleshooting Page

**Structure:**

```markdown
# Troubleshooting

## Checklist [Quick diagnostic steps]

## By Error Message [Most common errors]

### Error: "specific error message"
- **What's happening:** Explanation
- **Why:** Root cause
- **Solution:** Step-by-step fix
- **Verification:** How to confirm it's fixed
- **Prevent next time:** Best practice

## By Symptom [When you don't have an error message]

### Symptom: Doclea is slow
- Check: [Steps to diagnose]
- Solution: [Likely fixes]

## Platform-Specific Issues

### macOS
[macOS-specific problems and solutions]

### Linux
[Linux-specific problems]

### Windows
[Windows-specific problems]

## Getting Help
[How to report bugs, where to find support]
```

---

## 6. Resolving the 5-Minute vs Deep Dive Tension

This is a real tension. The solution is **clean layering**, not attempting to serve both in one document.

### Architecture: Three-Tier Documentation

**Tier 1: Get Going (5-15 minutes)**
- "Get Started in 5 Minutes"
- "Installation Guide" (quick choice path)
- "Understanding Memory Types" (what to store)

User goal: See something work before investing time.

**Tier 2: Solve Real Problems (30 minutes - 2 hours)**
- Feature guides: "Memory Management", "Git Tools", "Expertise Mapping"
- Real workflows that combine features
- Tool API references with examples

User goal: Use Doclea effectively on real projects.

**Tier 3: Optimize and Extend (2+ hours)**
- Configuration reference
- Advanced patterns and tips
- Development setup
- Troubleshooting deep dive

User goal: Get maximum value, customize for specific needs.

### Navigation Between Tiers

**Clear pathways:**

```
Tier 1: Get Started
  ↓ (Next: "Now let me understand what I'm storing")
Tier 2: Understanding Memory Types
  ↓ (Next: "How do I actually use this?")
Tier 2: Memory Management Deep Dive
  ↓ (Next: "Can I configure this differently?")
Tier 3: Configuration Reference
```

**Reverse paths:**

```
User lands on API Reference (Tier 3)
  ↓ (New user? Try: "Get Started in 5 Minutes")
User lands on Troubleshooting (Tier 3)
  ↓ (Not sure if Doclea is for you? "Quick Example")
```

### In Markdown/Website Structure

```
/docs
  /getting-started          (Tier 1)
    /quick-start.md
    /installation.md
    /memory-types.md
  /features                 (Tier 2)
    /memory-management.md
    /git-tools.md
    /expertise.md
    /bootstrap.md
  /reference                (Tier 3)
    /api.md
    /configuration.md
    /architecture.md
    /development.md
  /help                     (All tiers)
    /troubleshooting.md
    /faq.md
```

---

## 7. Visual Elements Strategy

### Element 1: Diagrams (When to Use)

**Use diagrams for:**
- Data flow (memory → embedding → storage)
- Architecture (Claude → Doclea → backends)
- Decision trees (which installation method?)
- Process workflows (store → search → use)

**Not for:**
- Explaining code (code is clearer)
- Listing features (tables are clearer)

**Example: Data flow for storing a memory**

```
Input: {title, content, tags, ...}
  ↓
Embedding: "PostgreSQL for ACID"
  ↓ (converts to 384-dimensional vector)
Vector: [0.234, -0.156, 0.892, ...]
  ↓
Stored in:
├─ SQLite: Metadata (title, tags, full content)
└─ Vector DB: Embedding (for semantic search)
  ↓
Now searchable by meaning:
  Query: "ACID compliance"  → Found!
  Query: "acid transactions" → Found!
  Query: "food recipes"     → Not found
```

### Element 2: Tables (When to Use)

**Use tables for:**
- Comparing options (zero-config vs optimized)
- Feature matrix (which tool does what)
- Parameter reference (input schema)
- Troubleshooting (error → solution)

**Example: Memory Types Comparison**

| Type | Best For | Searched When | Importance Default |
|------|----------|---------------|--------------------|
| decision | Architecture choices | Working on related code | 0.8 |
| solution | Bug fixes, workarounds | Similar patterns appear | 0.6 |
| pattern | Code conventions | Starting implementations | 0.5 |
| architecture | System design | Major refactors | 0.9 |
| note | General facts | Context-dependent | 0.3 |

### Element 3: Callout Boxes

**Warning Box:** Things that break things
```
WARNING: `rm -rf .doclea` deletes all memories. This cannot
be undone.
```

**Info Box:** Important context
```
INFO: First run of Doclea downloads the embedding model
(~90MB). This is cached for future use.
```

**Tip Box:** Productivity advice
```
TIP: Name memories concretely ("PostgreSQL for ACID") not
vaguely ("database decision"). Concrete names search better.
```

**Error Box:** In troubleshooting
```
ERROR: "No staged changes found"
This happens when you run doclea_commit_message without
staging changes first.
```

### Element 4: Code Blocks

**Format:**
```
Language identifier
Code
Comment showing output (if relevant)
```

**Example:**
```typescript
const memory = await doclea.store({...});
// Output: {id: 'mem_...', createdAt: '2025-12-10...'}
```

### Element 5: Screenshots/Terminal Output

**Use when:**
- Showing UI elements (not applicable for CLI tool)
- Terminal output helps (expected vs unexpected)
- Demonstrating configuration success

**Example:**
```
$ doclea init
Initializing Doclea...
  ✓ Scanning git history (234 commits)
  ✓ Reading documentation (8 files)
  ✓ Analyzing code (1,245 files)
  ✓ Creating 47 initial memories
Done! Doclea is ready.
```

### Element 6: Progress Indicators

**Used in:**
- Multi-step guides (you are here: step 2 of 5)
- Learning paths (you've completed 3/7 lessons)

**Format:**
```
Getting Started
├─ Installation [you are here]
├─ Your First Memory
├─ Searching Memories
└─ Next: Advanced Patterns
```

---

## 8. Practical Implementation Checklist

### Before Publishing Any Documentation

- [ ] **Accuracy:** Read it with a test Doclea installation running
- [ ] **Completeness:** Every command is copy-pasteable
- [ ] **Clarity:** A developer unfamiliar with Doclea can follow
- [ ] **Examples:** Every feature has a code example
- [ ] **Searchability:** Could you find this information via table of contents?
- [ ] **Links:** Every reference has a working link
- [ ] **Tone:** Consistent voice throughout

### When Writing Instructions

- [ ] Expected output shown after each command
- [ ] Absolute paths used (no relative paths)
- [ ] Assumptions stated upfront
- [ ] Troubleshooting section included
- [ ] Time estimate provided
- [ ] Success criteria clearly stated

### When Writing Concepts

- [ ] Defined in one sentence
- [ ] Why it matters (one sentence)
- [ ] Example given
- [ ] Related concepts linked
- [ ] Depth appropriate to tier (intro vs reference)

### Regular Maintenance

- [ ] Documentation reflects latest version (don't lag behind)
- [ ] Dead links checked quarterly
- [ ] User feedback incorporated (what questions do people ask?)
- [ ] Examples kept current (test them regularly)

---

## 9. Tone Examples by Context

### Introducing a New Feature

**Bad:**
"This feature may potentially allow users to store information
that could be used at some point in the future."

**Good:**
"Store a decision now and Claude will use it in your next
related change. No need to explain the same decision twice."

### Explaining a Limitation

**Bad:**
"Unfortunately, the system is limited to a maximum of 100,000
memories due to performance constraints."

**Good:**
"Doclea handles up to 100,000 memories comfortably. If you
exceed that, consider archiving old memories or contacting
support for high-volume setups."

### Troubleshooting

**Bad:**
"This error suggests that perhaps the database might have
become corrupted, though it's not entirely certain."

**Good:**
"This error means Doclea can't access its memory database.
Check: 1) Is `.doclea/local.db` readable? 2) Do you have
disk space? If both are fine, try: `rm .doclea/local.db`
and reinitialize."

### Warning/Critical Info

**Bad:**
"Please note that this action is somewhat irreversible."

**Good:**
"Deleting a memory cannot be undone. Export backups if you
need recovery options."

---

## 10. Document Organization by Scenario

### Scenario 1: Developer Says "I Have 5 Minutes"

**Path:**
1. README.md (what is this?)
2. "Get Started in 5 Minutes" (show me something works)
3. "Understanding Memory Types" (what do I store?)
4. Done. They've experienced value.

### Scenario 2: Developer Says "I Want to Use This"

**Path:**
1. "Installation Guide" (which method for my situation?)
2. "Memory Management" (how do I actually store/search?)
3. "Git Tools" (can it help with commits/PRs?)
4. "Complete Workflows" (how does this all fit together?)
5. Uses Doclea productively.

### Scenario 3: Developer Says "How Do I Configure This?"

**Path:**
1. "Configuration Reference" (all options)
2. "Setting up [specific backend]" (detailed steps)
3. "Troubleshooting" (what went wrong)
4. Successfully configured.

### Scenario 4: Developer Says "Something's Broken"

**Path:**
1. "Troubleshooting" quick checklist
2. By error message or symptom
3. Specific solution
4. Verification steps
5. Back to using Doclea.

---

## 11. Quality Metrics

Track these to ensure documentation stays excellent:

- **Discovery Rate:** What % of users find answers in docs vs asking support?
  (Goal: >80%)

- **Completeness:** Does every tool have an example?
  (Goal: 100%)

- **Freshness:** Are examples tested against latest version?
  (Goal: All tested within 2 releases)

- **Clarity:** Can new developers complete "Get Started" without help?
  (Goal: >90% without external help)

- **Maintenance:** How long until docs lag behind code?
  (Goal: Same release, or document the difference)

- **User Feedback:** What questions do people ask that docs don't answer?
  (Review monthly, fix the top 3)

---

## 12. Real-World Example: Complete Memory Management Page

Here's what a complete "world-class" page looks like:

```markdown
# Memory Management

Store and organize knowledge that persists across your work sessions.

## What You'll Learn

- Storing different types of memories
- Organizing with tags and metadata
- Searching semantically (by meaning)
- Updating and removing memories
- Bulk operations

## Understanding Memory Types

| Type | Purpose | Example | Default Importance |
|------|---------|---------|-------------------|
| **decision** | Architectural choices affecting the codebase | "PostgreSQL for ACID compliance" | 0.8 |
| **solution** | Bug fixes and workarounds | "Fixed race condition with mutex" | 0.6 |
| **pattern** | Code conventions and best practices | "Extract form validation to helpers" | 0.5 |
| **architecture** | System design and data flows | "Event-driven microservices pattern" | 0.9 |
| **note** | General observations | "Build times increased in December" | 0.3 |

Choose the type that matches how you'd explain it to a new team member.

## Storing a Memory

### Minimal Example

```typescript
// Store an architectural decision
const memory = await doclea.store({
  type: 'decision',
  title: 'PostgreSQL for transactional consistency',
  content: 'We chose PostgreSQL because financial transactions need ACID guarantees.'
});
```

### Complete Example

```typescript
import { doclea } from '@doclea/mcp';

// Store a detailed architectural decision
const memory = await doclea.store({
  // Required fields
  type: 'decision',
  title: 'PostgreSQL for transactional consistency',

  // Content with reasoning
  content: `
    We selected PostgreSQL over NoSQL options because:

    1. Financial transactions require ACID guarantees
    2. Data relationships are complex (proper normalization needed)
    3. Requires strong consistency over eventual consistency

    Trade-offs:
    - Less horizontal scalability than sharded NoSQL
    - Operational complexity higher than managed solutions

    Revisit when: If transaction throughput exceeds 1,000/sec
  `,

  // Brief summary (optional)
  summary: 'ACID transactions needed for financial operations',

  // Importance affects search ranking (0-1)
  importance: 0.95,  // Critical architectural choice

  // Tags for categorization (no limit, but 5-10 is typical)
  tags: ['database', 'infrastructure', 'financial'],

  // Files this relates to (helps context-aware retrieval)
  relatedFiles: [
    'src/database/config.ts',
    'src/database/migrations/'
  ],

  // Optional: Link to related git commit
  gitCommit: 'abc123def456',

  // Optional: Link to PR that made this decision
  sourcePr: '#421',

  // Optional: Who should know about this?
  experts: ['alice', 'bob']
});

// Output:
// {
//   id: 'mem_a1b2c3d4e5f6g7h8',
//   type: 'decision',
//   title: 'PostgreSQL for transactional consistency',
//   createdAt: '2025-12-10T14:30:00Z',
//   tags: ['database', 'infrastructure', 'financial'],
//   relatedFiles: ['src/database/config.ts', '...'],
//   importance: 0.95
// }
```

## Organizing with Tags

### Tag Naming Strategy

Use lowercase, descriptive tags that reflect how you think:

```typescript
// Good: Specific, searchable
tags: ['payment-processing', 'concurrency', 'database']

// Avoid: Too vague
tags: ['important', 'stuff', 'misc']

// Avoid: Too specific/inconsistent
tags: ['PostgreSQL-thing', 'postgres-decision', 'pg-choice']
```

### Common Tag Patterns

```typescript
// By domain
['auth', 'payments', 'analytics', 'api']

// By abstraction level
['architecture', 'system-design', 'module-pattern', 'function-signature']

// By concern
['performance', 'security', 'accessibility', 'testing']

// By tech stack (when decision-relevant)
['database', 'frontend', 'infrastructure', 'deployment']
```

### Tag Guidelines

- Use 5-10 tags per memory (sweet spot for discoverability)
- Consistency matters (use 'auth' not 'authentication')
- Document your tag scheme in a team README

## Searching Memories

### Quick Search

Ask about something specific:

```typescript
const results = await doclea.search(
  'How do we handle payment failures?'
);

// Returns memories most relevant to that question
// Sorted by relevance (0-1) and importance
```

### Filtered Search

Narrow by type or tags:

```typescript
const decisions = await doclea.search(
  'database',
  {
    type: 'decision',        // Only architectural decisions
    tags: ['infrastructure'], // Only infrastructure-related
    limit: 5                  // Top 5 results
  }
);
```

### Understanding Relevance Scores

```
Relevance 0.9-1.0    → Exactly what you asked for
Relevance 0.7-0.9    → Very related, probably useful
Relevance 0.5-0.7    → Somewhat related, might be context
Relevance 0.3-0.5    → Tangentially related
Relevance <0.3       → Probably not what you need
```

## Updating a Memory

When your understanding evolves:

```typescript
const updated = await doclea.update('mem_a1b2c3d4e5f6g7h8', {
  content: 'Updated reasoning based on 6 months of experience...',
  importance: 0.9,
  tags: ['database', 'infrastructure', 'financial', 'performance']
});
```

What to update:
- **content:** Your understanding evolved
- **tags:** New context emerged
- **importance:** Realized it's more/less critical
- **experts:** New people became knowledgeable

What not to update:
- **type:** If type is wrong, delete and recreate
- **title:** If outdated, usually means delete and recreate

## Removing Memories

Delete when:
- Documented an experimental approach that didn't pan out
- Captured a decision that's being reversed
- Duplicate memory

```typescript
await doclea.delete('mem_a1b2c3d4e5f6g7h8');
```

WARNING: Deletion is permanent. Export backups before
bulk deletions.

## Bulk Operations

### Importing from Markdown Files

Convert existing documentation to memories:

```typescript
await doclea.import({
  type: 'markdown',
  path: './docs/architecture',
  options: {
    tagsFromPath: true,      // Use folder as tag
    autoDetectType: true      // Guess memory type from content
  }
});
```

Doclea detects:
- # Headers → memory titles
- File path → auto-tags
- Content → memory type (heuristics)

### Importing ADRs (Architecture Decision Records)

```typescript
await doclea.import({
  type: 'adr',
  path: './docs/adr',
  options: {
    statusAsTag: true        // "accepted" → tag
  }
});
```

Converts ADR format to decisions automatically.

## Common Patterns

### Pattern 1: Capture Solutions Immediately

When you solve a hard problem, store it:

```typescript
// Don't: Store it later (you'll forget details)
// Do: Store it when you discover it

const solution = await doclea.store({
  type: 'solution',
  title: 'Fixed race condition in payment processing',
  content: 'Problem: Concurrent requests could duplicate charges.
           Solution: Serializable transaction isolation level.',
  importance: 0.85,
  gitCommit: 'abc123'  // Link to the commit that fixed it
});
```

### Pattern 2: Link Decisions to Implementations

After storing a decision, link it to related code:

```typescript
const decision = await doclea.store({
  type: 'decision',
  title: 'PostgreSQL for ACID compliance',
  relatedFiles: [
    'src/database/config.ts',
    'src/database/schema.sql',
    'src/transactions/'
  ]
});

// Claude will retrieve this when working on those files
```

### Pattern 3: Tag for Future Discovery

Tag based on how you'll search for it:

```typescript
const memory = await doclea.store({
  type: 'pattern',
  title: 'Extract validation to helpers',
  tags: [
    'forms',           // What domain?
    'react',           // What framework?
    'refactoring',     // What activity?
    'maintainability'  // What goal?
  ]
});

// Later searches might be: "form validation",
// "React patterns", "maintainability", etc.
// All will find this memory
```

## Troubleshooting

### Question: When should I store a memory vs. just commenting code?

**Answer:** Store a memory when:
- Multiple files need to know this
- It's a decision (not just code explanation)
- You want Claude to use it proactively
- It might be questioned later (decisions, trade-offs)

Just comment when:
- It's specific to one function
- It's temporary/experimental
- It's explaining complex syntax (comments are better)

### Question: My searches return too many irrelevant results

**Answer:** Improve your query:

Bad queries (too vague):
```
"stuff"
"things"
"database"
```

Good queries (specific):
```
"PostgreSQL ACID compliance"
"transaction isolation for payments"
"distributed locking pattern"
```

### Question: What importance score should I use?

**Guidelines:**
- 0.9-1.0: Critical architectural choices (database, auth, payments)
- 0.7-0.9: Important patterns (how requests flow, error handling)
- 0.5-0.7: Useful conventions (naming, folder structure)
- 0.3-0.5: Nice-to-know observations (historical context)

When unsure, use 0.6 (neutral). You can adjust later.

### Question: How often should I update memories?

**Answer:**
- Update when understanding evolves (first month after storing)
- Update when decisions change (rare but important)
- Don't obsess over perfection (rough notes are useful)
- Delete rarely (usually only clear duplicates)

## Next Steps

- Try storing a decision about your current project
- Ask Claude to search for memories
- Watch how it informs code suggestions

## Related Documentation

- [Git Tools Guide](./git-tools.md) - Use memories to generate commits/PRs
- [Expertise Mapping](./expertise.md) - Find experts on stored topics
- [Configuration Reference](./configuration.md) - Customize storage

```

---

## Summary

This strategy enables you to build documentation that serves all user needs simultaneously:

1. **New users** find the 5-minute path and experience immediate value
2. **Working developers** find deep, practical guides with real examples
3. **Advanced users** access complete configuration and extensibility information
4. **Everyone** benefits from consistent structure, clear examples, and unambiguous instructions

The key is clean layering: get people working quickly, then deepen as needed, with clear pathways between tiers.
