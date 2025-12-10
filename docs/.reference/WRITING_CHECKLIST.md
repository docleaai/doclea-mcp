# Doclea Documentation Writing Checklist

Quick reference for writers creating Doclea documentation.

---

## Before Writing

- [ ] Define your audience (beginner, working developer, power user)
- [ ] Identify your page tier (quick start, feature guide, reference)
- [ ] Determine your outcome (what will readers be able to do after?)
- [ ] Decide on page length (aim for one primary concept per page)

---

## Structure and Organization

- [ ] Page has a clear heading that answers "what is this?"
- [ ] Opening paragraph (1-2 sentences) states what readers will learn
- [ ] Table of contents or section navigation if page >1000 words
- [ ] Clear progression from simple to complex
- [ ] Related pages linked at the end

---

## Code Examples

Every code example must satisfy ALL of these:

- [ ] **Runnable:** Could someone copy-paste and execute it?
- [ ] **Complete:** No "assume you have X" or missing setup
- [ ] **Contextual:** Why would someone use this?
- [ ] **Commented:** Why does each line exist?
- [ ] **Output Shown:** What should they expect to see?
- [ ] **Explained:** 1-2 sentences after the code block

Checklist for a single example:

```
1. Context comment (why this exists)
   ✓ Explains the scenario

2. Complete code (copy-paste works)
   ✓ All imports included
   ✓ All variables defined
   ✓ No assumed setup

3. Expected output
   ✓ What they'll see if it works

4. What happened (explanation)
   ✓ 1-2 sentences, not a paragraph

5. Next step (where to go)
   ✓ Link or clear follow-up
```

---

## Explanations

- [ ] **What:** One sentence defining the concept
- [ ] **Why:** 1-2 sentences explaining why it matters
- [ ] **Example:** Real scenario showing it in action
- [ ] **Related:** Links to connected topics
- [ ] **Depth:** Matches the page tier (intro vs reference)

---

## Instructions

- [ ] Start with the outcome: "You'll have X running in Y minutes"
- [ ] Steps are numbered and clear (5-15 steps max)
- [ ] Each step has expected output shown
- [ ] Assumptions stated upfront (OS, tools, experience level)
- [ ] Troubleshooting section addresses common problems
- [ ] Success criteria clearly stated

---

## Tone and Voice

- [ ] Direct and confident (not wishy-washy)
- [ ] Active voice: "Doclea stores" not "Memories can be stored"
- [ ] Consistent terminology (same term for same concept)
- [ ] Avoids: "Perhaps", "might", "could potentially"
- [ ] Written for your audience (developers, not managers)

---

## Specific Content Patterns

### When Explaining a Feature

- [ ] What it does (one sentence)
- [ ] When you'd use it (concrete scenario)
- [ ] How it works (brief explanation)
- [ ] Code example (minimal then complete)
- [ ] Common mistakes (what people get wrong)

### When Explaining a Parameter

- [ ] Type and constraints (e.g., "string, max 100 chars")
- [ ] Default if optional
- [ ] What it affects
- [ ] Example value
- [ ] When you'd change it

### When Troubleshooting

- [ ] Error message or symptom clearly stated
- [ ] What's actually happening (explanation)
- [ ] Why it happened (root cause)
- [ ] How to fix it (step-by-step)
- [ ] How to verify the fix worked
- [ ] How to prevent it next time

---

## Testing Your Documentation

Before submitting:

- [ ] Could a beginner understand this?
- [ ] Do all commands work (tested end-to-end)?
- [ ] Are all file paths absolute?
- [ ] Do all code examples run without errors?
- [ ] Are all links valid?
- [ ] Would you skip any section as unnecessary?

---

## Visual Elements

### Diagrams (when to use)

- [ ] Showing data flow or process workflow
- [ ] Explaining architecture with connections
- [ ] Decision tree (which path to take)
- [ ] NOT for: Explaining code (code is clearer)
- [ ] NOT for: Lists (tables are better)

### Tables (when to use)

- [ ] Comparing options
- [ ] Parameter reference
- [ ] Feature matrix
- [ ] Error messages and solutions
- [ ] NOT for: Linear explanations (text is better)

### Callout Boxes

- [ ] WARNING: Things that break things (data loss, misconfiguration)
- [ ] INFO: Important context (first run is slow)
- [ ] TIP: Productivity advice (naming tips, best practices)
- [ ] ERROR: In troubleshooting sections

---

## Specific to Doclea

### When Documenting a Tool

- [ ] What the tool does (one sentence)
- [ ] When to use it (realistic scenario)
- [ ] Input schema (with types and constraints)
- [ ] Output format (with example)
- [ ] Complete working example
- [ ] Related tools (what else can I combine with this)
- [ ] Common errors (with solutions)

Example template:

```markdown
# Tool Name (doclea_xxx)

## What This Does
[One sentence + why it matters]

## Quick Example
[4-6 lines showing minimal usage]

## When to Use This
[Realistic scenarios]

## Input Parameters
[Table or formatted list with types]

## Output
```json
[Example with explanation]
```

## Complete Example
[15-30 lines showing real workflow]

## Common Errors
[Errors and solutions]

## Related Tools
[What else works with this]
```

### When Documenting Memory Types

- [ ] Name and brief description
- [ ] When you'd use it (real scenario)
- [ ] What Claude does with it
- [ ] Example memory
- [ ] Tagging strategy for this type
- [ ] Default importance score

### When Documenting Installation

- [ ] Decision tree: "What's your situation?"
- [ ] Prerequisites clearly stated
- [ ] Step-by-step instructions
- [ ] Expected output after each step
- [ ] How to verify it worked
- [ ] Troubleshooting for this method
- [ ] Where to go next

---

## Common Mistakes to Avoid

- [ ] Assuming knowledge that beginners don't have
- [ ] Incomplete code examples (use copy-paste as test)
- [ ] Vague instructions ("the usual way")
- [ ] Outdated examples (test against latest version)
- [ ] Unexplained jargon (MCP, semantic search, embedding)
- [ ] Long paragraphs (break into 2-3 sentence chunks)
- [ ] No examples (always show, not just tell)
- [ ] Unclear outcome (what's the goal?)
- [ ] Dead links (check before publishing)
- [ ] Inconsistent terminology (use the same term always)

---

## Writing Tiers

### Quick Start Documentation

- Shortest possible
- One outcome: "You'll have X working"
- Biggest decisions made for users (no choices)
- Link to deeper guides
- Target: <15 minutes, zero questions

### Feature Guides

- Real-world workflows
- Combine features naturally
- Multiple examples (simple to complex)
- Explain the "why" of patterns
- Target: 30 minutes - 2 hours

### Reference Documentation

- Exhaustive (every option, every parameter)
- Code examples for clarity
- Index and cross-reference
- Troubleshooting deep dives
- Target: As-needed, not sequential

---

## Self-Review Checklist

Read your draft and ask:

1. **Clarity:** Could someone unfamiliar with Doclea understand this?
2. **Completeness:** Does every instruction have expected output?
3. **Accuracy:** Have I tested this end-to-end?
4. **Brevity:** Could I remove 25% and lose nothing?
5. **Examples:** Does every concept have a code example?
6. **Links:** Are all references valid?
7. **Tone:** Does it sound like me, consistently?
8. **Structure:** Can someone scan and find what they need?

---

## Collaboration

When reviewing someone else's documentation:

- [ ] Is it clear to you as written? (If not, it's unclear)
- [ ] Did you have to look up anything not explained?
- [ ] Did you try the examples (do they work)?
- [ ] Are there better examples?
- [ ] Would you add warnings/tips?
- [ ] Is tone consistent with other docs?
- [ ] Are there broken links?

---

## Maintenance

- [ ] Review quarterly (are examples still current?)
- [ ] Test examples against latest version
- [ ] Check links (at least yearly)
- [ ] Update based on user questions (what keeps coming up?)
- [ ] Gather feedback (what's confusing?)
- [ ] Fix typos and clarify unclear passages

---

## Before Publishing

Final checklist:

- [ ] Spell-checked
- [ ] Links tested (all valid?)
- [ ] Examples tested (all runnable?)
- [ ] Tone consistent
- [ ] Appropriate depth for audience
- [ ] Related pages linked
- [ ] No Lorem ipsum or placeholder text
- [ ] Reviewed by at least one other person
- [ ] Optimized for scannability (headings, short paragraphs)

---

## Helpful Templates

### Feature Documentation Template

```markdown
# Feature Name

## What This Does

[One sentence definition. Why it matters: one sentence.]

## Quick Example

[4-6 lines, simplest useful code]

## Common Use Cases

- Use case 1
- Use case 2

## How It Works

[2-3 paragraphs explaining the concept]

## Input/Parameters

[Table or detailed list]

## Output

```json
[Example output]
```

## Complete Example

[15-30 lines, realistic scenario]

## Advanced Options

[Less common but important variations]

## Common Mistakes

Don't: [Easy mistake]
Do: [Correct approach]

## Troubleshooting

### Problem: [Common issue]
[Solution with verification]

## Related Features

[Links to complementary tools/guides]
```

### Troubleshooting Page Template

```markdown
# Troubleshooting [Topic]

## Quick Diagnostic

[3-5 questions to identify the problem]

## By Error Message

### Error: [Exact error message]
- **Cause:** [Why this happens]
- **Fix:** [Steps to resolve]
- **Verification:** [How to confirm it's fixed]

### Error: [Another error]
[Same structure]

## By Symptom

### Symptom: [What the user observes]
- **Possible causes:** [1, 2, 3]
- **Diagnostic steps:** [How to narrow down]
- **Solutions:** [By likely cause]

## Platform-Specific

### On macOS
[Issues and solutions specific to macOS]

### On Linux
[Linux-specific issues]

### On Windows
[Windows-specific issues]

## Getting Help

[Links to support, GitHub issues, discussions]
```

---

## Quick Reference: Good vs Bad Examples

### Bad: Too Vague

```
Store a decision when it's important.
```

Good: Specific Scenario

```
Store a decision when your choice affects multiple files
or could be questioned later. Example: "PostgreSQL for
ACID compliance" because it constrains database tooling
across the codebase.
```

---

### Bad: Missing Context

```typescript
const result = await doclea.store({...});
```

Good: Full Example

```typescript
// You discovered a bug and the fix. Store it so Claude
// learns about this pattern.

const memory = await doclea.store({
  type: 'solution',
  title: 'Fixed race condition in payment processing',
  content: 'Problem: Concurrent requests could duplicate charges. Solution: Added transaction serialization.',
  importance: 0.85
});

// Claude will now suggest this pattern when similar
// issues appear in your codebase
```

---

### Bad: No Expected Output

```
Run this command to initialize.
```

Good: Shows What Happens

```
Run this command to initialize Doclea:

```bash
doclea init
```

You'll see:
```
Initializing Doclea...
  ✓ Scanning git history (234 commits)
  ✓ Reading documentation (8 files)
  ✓ Analyzing code (1,245 files)
Done! Doclea is ready.
```

Doclea has now scanned your project and stored initial memories.
```

---

### Bad: Unexplained Jargon

```
Uses semantic search with vector embeddings for similarity matching.
```

Good: Explained Then Used

```
Doclea converts your query and stored memories into numerical
vectors (a technique called "embeddings"). It finds memories
with similar vectors. This matters because "authentication"
and "identity verification" have similar meaning despite
different words.

Later, you can use semantic search to find all
authentication-related decisions.
```

---

## Common Doclea-Specific Terminology

| Term | Explanation | First Use |
|------|-------------|-----------|
| Memory | A fact, decision, pattern, or observation you want Claude to know | "Store a memory to capture knowledge..." |
| Semantic search | Finding by meaning, not keywords | "Search finds memories by meaning..." |
| Embedding | Converting text to numbers for comparison | "Embeddings let us find similar memories..." |
| Relevance | How closely a result matches your search (0-1) | "Results show relevance scores..." |
| Importance | How critical a memory is to the codebase (0-1) | "Set importance to 0.9 for critical decisions..." |
| Tag | A label for organizing memories | "Use tags to categorize memories..." |
| MCP | Model Context Protocol (standard for AI assistant tools) | "Doclea is an MCP server..." |
| Vector store | Database for storing numerical representations | "Qdrant is a vector store..." |

---

## Editor Notes

- **For clarity:** Read aloud. If you stumble, readers will too.
- **For flow:** Check transitions between sections.
- **For completeness:** Could someone follow without external help?
- **For tone:** Consistent? Too formal? Too casual?
- **For length:** Would you skip any section? If yes, remove it.

---

## Key Success Metrics

After publishing, track:

- **Completion:** Did beginners complete "Get Started"?
- **Confusion:** What questions did people ask?
- **Accuracy:** Did examples work as written?
- **Depth:** Was the right level of detail?
- **Links:** Were navigating between pages smooth?

Use feedback to iterate. Good documentation gets better with reader input.

