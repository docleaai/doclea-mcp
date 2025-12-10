# Doclea Visual Style Guide

Standards for formatting, diagrams, and visual elements in documentation.

---

## Typography

### Headings

**Hierarchy (Markdown):**

```markdown
# Page Title (H1)
Usually one per page. Answers "what is this?"

## Major Section (H2)
Breaks content into digestible chunks.

### Subsection (H3)
Usually 2-4 per H2 section.

#### Details (H4)
Rare. Usually indicates over-detailed breakdown.
```

**Rules:**
- H1: One per page, exactly matches page title
- H2: Major concepts, usually 3-5 per page
- H3: Supporting details, 2-4 per H2
- H4+: Avoid (indicates page needs restructuring)

**Wording:**
- Action verbs when possible: "Storing a Memory" not "Memory Storage"
- Questions work: "When Should I Store This?"
- Avoid empty headers that need the next paragraph to make sense

---

## Inline Formatting

### Code and Technical Terms

```markdown
`code` or variable names    → Backticks
**bold** for emphasis       → Strong (not emphasis)
*italic* only for UI text   → Rare in technical docs
```

**Rules:**
- Use backticks for: commands, variable names, function names, config keys
- Use **bold** for: important terms on first mention, warnings
- Avoid: *italic* in technical writing (too subtle)

**Examples:**

Good:
```
Use `doclea.store()` to save memories. The `type` parameter
determines the **memory type** (decision, solution, pattern).
```

Avoid:
```
Use *doclea.store()* to save memories. The *type* parameter
determines the memory type (decision, solution, pattern).
```

---

## Code Blocks

### Format

```
[Language identifier]
[Code]
[Optional: Comment showing output]
```

**Example:**

```typescript
const memory = await doclea.store({
  type: 'decision',
  title: 'PostgreSQL for ACID compliance'
});

// Output: {id: 'mem_...', createdAt: '2025-12-10...'}
```

### Language Identifiers

Use these at the opening triple-backtick:

- `typescript` → TypeScript/JavaScript
- `bash` → Shell commands
- `json` → JSON configuration
- `sql` → SQL queries
- `yaml` → YAML (Docker Compose, etc.)
- `markdown` → Markdown syntax
- `text` → Plain text output/examples

**Rule:** If no language specified, use `text` to avoid syntax highlighting.

### Terminal Output Format

```bash
$ command you type
Expected output here
```

**Rules:**
- Use `$` prefix for commands (shows it's terminal)
- No prefix for output
- Keep to ~10 lines (long outputs are overwhelming)
- Show both success and failure cases

**Example:**

```bash
$ doclea init
Initializing Doclea...
  ✓ Scanning git history (234 commits)
  ✓ Reading documentation (8 files)
  ✓ Analyzing code (1,245 files)
Done! Doclea is ready.
```

---

## Lists

### Unordered Lists

Use for:
- Options (no implied priority)
- Features
- Reminders

```markdown
- Item 1
- Item 2
- Item 3
```

**Rules:**
- 2-7 items (more = needs reorganizing)
- Consistent grammar (all starting with noun or verb)
- Consistent punctuation (all with period or none)

### Ordered Lists

Use for:
- Steps (has sequence)
- Numbered instructions
- Priority (implicit 1 > 2 > 3)

```markdown
1. First step
2. Second step
3. Third step
```

**Rules:**
- Use for actual sequences only
- Don't use for "here are 3 reasons" (use bullets)
- Can nest one level: steps can have sub-steps
- Keep sub-steps minimal (max 2-3)

### Nested Lists

```markdown
1. Major step
   - Substep A
   - Substep B
2. Next major step
```

**Rule:** One nesting level maximum (lists within lists are confusing)

---

## Tables

### Format

```markdown
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data | Data | Data |
| Data | Data | Data |
```

### When to Use Tables

- Comparing options (rows = options, columns = dimensions)
- Parameter reference (rows = parameters, columns = type, default, description)
- Feature matrix (rows = features, columns = products/versions)
- Error messages (rows = errors, columns = cause, solution)

### When NOT to Use Tables

- Explaining one concept (use text)
- Complex nested data (use code blocks)
- More than 5 columns (gets unreadable on mobile)

**Example: Good Table**

| Memory Type | When to Use | Example | Importance Default |
|-------------|-------------|---------|-------------------|
| decision | Architectural choices | "PostgreSQL for ACID" | 0.8 |
| solution | Bug fixes | "Fixed race condition" | 0.6 |
| pattern | Code conventions | "Extract validation helpers" | 0.5 |

**Example: Bad Table (too many columns)**

```markdown
| Type | Use | Example | Default | Tags | Related | Files | Experts | Revision |
[Gets unreadable on mobile]
```

---

## Callout Boxes

### HTML Block Quotes (Standard)

```markdown
> This is a note or tip that stands out
```

Renders as gray box in most markdown renderers.

### Styled Callouts (Recommended)

Use consistent formatting for different types:

**Warning (Red):**
```markdown
WARNING: Data loss is possible. This action cannot be undone.
```

**Important Info (Blue):**
```markdown
INFO: First run downloads the embedding model (~90MB). This is cached.
```

**Tip (Green):**
```markdown
TIP: Use concrete memory titles ("PostgreSQL for ACID") not vague ones ("database stuff").
```

**Error (Red text):**
```markdown
ERROR: "No staged changes found"
Run `git add` to stage changes before calling doclea_commit_message.
```

### Callout Usage Rules

| Type | When to Use | Example |
|------|-------------|---------|
| WARNING | Things that break things | Data loss, security issues, breaking changes |
| INFO | Important context | First run is slow, behavior note |
| TIP | Productivity advice | Naming conventions, best practices |
| ERROR | In troubleshooting sections | Error message + cause + fix |

---

## Links

### Formatting

```markdown
[Link text](URL)
```

**Rules:**
- Link text should indicate destination: [Memory Management](./memory.md)
- Avoid generic text: "click here", "see below"
- Test all links before publishing (check for dead links)

### Internal Links

Link between docs using relative paths:

```markdown
[Memory Management Guide](./memory-management.md)
[Installation](../installation.md)
[Quick Start](./quick-start.md)
```

### External Links

Full URLs for external sites:

```markdown
[Doclea Website](https://doclea.ai)
[GitHub Issues](https://github.com/docleaai/doclea-mcp/issues)
```

---

## Images and Diagrams

### ASCII Diagrams (Recommended for Technical Docs)

Good for showing flow, hierarchy, or architecture.

**Example: Data Flow**

```
Input: {title, content, tags}
  ↓
Embedding: Convert to vector
  ↓
Storage: Save to SQLite + Vector DB
  ↓
Searchable: Find by semantic similarity
```

**Example: Process**

```
1. Store Memory
   ↓
2. Claude retrieves during work
   ↓
3. Informs code suggestions
   ↓
4. Developer stays in context
```

**Example: Architecture**

```
┌──────────────────────────────────┐
│        Claude Code               │
└─────────────────┬────────────────┘
                  │ MCP
┌─────────────────▼────────────────┐
│     Doclea MCP Server            │
│  ┌──────────────────────────┐    │
│  │  Memory / Git / Expertise│    │
│  └──────┬───────────────────┘    │
│         │                         │
└─────────┼──────────────────────────┘
          │
      ┌───┴───┬────────┐
      ▼       ▼        ▼
    SQLite Vector   Config
```

### PNG/SVG Images

Use for:
- Screenshots (showing UI)
- Complex diagrams (mermaid, draw.io exports)
- Infographics

Avoid for:
- Simple text layouts (use ASCII)
- Single-purpose diagrams (too heavy)

**File placement:**

```
/docs
  /images
    /architecture-diagram.png
    /installation-flow.png
```

---

## Spacing and Layout

### Paragraph Structure

```markdown
One concept per paragraph. Aim for 2-4 sentences.

New idea = new paragraph.

Code example gets spacing:

```typescript
// Code here
```

More text after code example.
```

**Rules:**
- Max 4 sentences per paragraph (very digestible)
- Blank line between sections
- Blank line before and after code blocks

### Whitespace

Too dense:
```
This is all together and hard to scan because there are no visual breaks between ideas.
```

Better:
```
This is easier to read.

New thought here.

And another.
```

---

## Code Example Formatting

### Complete Example Structure

```markdown
### Scenario [Short description of when you'd do this]

Context: Brief explanation of the use case

```typescript
// Full, runnable code
const memory = await doclea.store({...});
```

Result: What the output looks like and what it means
```

### Minimal Example

```markdown
### Quick Example

```typescript
// Simplest useful code (4-6 lines max)
const result = await doclea.search('query');
```
```

### Side-by-Side Comparison

For showing wrong vs right:

```markdown
### Wrong

```typescript
const memory = await doclea.store({
  type: 'note',
  title: 'stuff'
});
```

Too vague. Claude has trouble understanding what to do with this.

### Right

```typescript
const memory = await doclea.store({
  type: 'decision',
  title: 'PostgreSQL for ACID compliance',
  content: 'We chose PostgreSQL because...'
});
```

Specific and informative. Claude can use this.
```

---

## Special Formatting

### Emphasis Levels

| Need | Format | Example |
|------|--------|---------|
| Highlight a term | `code` or **bold** | Use `doclea.store()` to **store memories** |
| Emphasize importance | **bold** | **Never** delete without backup |
| De-emphasize | (Just text) | This is optional |
| Question/Rhetorical | Italics | *Do you really need this?* |

### Abbreviations

**Rule:** Define once, then use

```markdown
Model Context Protocol (MCP) allows Claude to use custom tools.
You can add Doclea as an MCP server to your Claude configuration.
```

---

## Naming and Consistency

### Consistent Terms

| Concept | Use This | NOT This |
|---------|----------|----------|
| A thought stored in Doclea | memory | note, data, fact |
| Finding memories | search or retrieve | query, find, look up |
| Storing a memory | store | save, create, add |
| The MCP server | Doclea, the Doclea server | the application, the tool |
| Claude Code | Claude Code | Claude, the AI |
| Memory types | decision, solution, pattern, architecture, note | decision types, categories |
| The importance value | importance or importance score | weight, priority |
| The relevance value | relevance or relevance score | match, confidence |
| Related memories | related memories | connected memories |
| Tag | tag | label, category |

**Rule:** Pick one term and use it consistently throughout all documentation.

---

## Documentation Structure

### File Organization

```
/docs
  README.md                          ← Main entry point
  DOCUMENTATION_STRATEGY.md          ← This guide
  WRITING_CHECKLIST.md              ← Writer checklist
  VISUAL_STYLE_GUIDE.md             ← This file

  /getting-started
    quick-start.md
    installation.md
    memory-types.md

  /features
    memory-management.md
    git-tools.md
    expertise.md
    bootstrap.md

  /reference
    api.md
    configuration.md
    troubleshooting.md

  /images
    [images referenced in docs]
```

### Breadcrumbs (Optional but Recommended)

Add to pages (especially features and reference):

```markdown
# Memory Management

*Getting Started > Memory Management*

---

[Content here]
```

Shows where in the hierarchy this page lives.

---

## Accessibility

### For Screen Readers

- Use semantic HTML (headings in order: H1 > H2 > H3)
- Don't skip heading levels (H1 directly to H3)
- Use alt text for images
- Avoid color-only differentiation (use icon + color, or pattern)

### For Mobile

- Keep tables to <5 columns
- Don't rely on horizontal scrolling
- Keep paragraphs short (mobile screens are narrow)
- Link text should be clear (not "click here")

### For Dyslexic Readers

- Use simple, active voice
- Break up dense paragraphs
- Use sans-serif fonts (if designing custom site)
- Avoid walls of text

---

## Examples by Document Type

### Quick Start Page

```markdown
# Get Started in 5 Minutes

You'll have Doclea running and storing your first memory.

## What You'll Need

- Node 18+
- 5 minutes

## Step 1: Install

```bash
npx @doclea/mcp
```

Expected output:
```
Doclea installed successfully.
```

## Step 2: Initialize Your Project

[Instructions]

## You're Done!

Next: [link to next step]
```

### Feature Guide Page

```markdown
# Feature Name

## What This Does

[One sentence. Why it matters.]

## Quick Example

[Simplest working code]

## Common Use Cases

[2-3 real scenarios]

## How It Works

[Explanation with examples]

## Complete Example

[Real workflow with output]

## Tips and Patterns

- Pattern 1: [Use case]
- Pattern 2: [Use case]

## Troubleshooting

### Problem
Solution

## Related Features

[Links]
```

### Reference Page

```markdown
# Complete API Reference

## Tool 1: doclea_store

[Input schema, output, example, related tools, errors]

## Tool 2: doclea_search

[Same structure]

...

## Configuration Options

[All options with detailed explanation]

## Examples by Use Case

[Common patterns]
```

---

## Common Visual Patterns

### Information Hierarchy

```
Very important      → **Bold** at start of line
Important           → All caps: IMPORTANT
Helpful context     → INFO: callout
Nice to know        → Regular text
For reference later → TIP: callout
```

### Process Flows

```
Step 1: Store
  ↓
Step 2: Search
  ↓
Step 3: Use
  ↓
Done!
```

### Feature Comparison

Use a table:

| Feature | Zero-Config | Optimized |
|---------|------------|-----------|
| Setup time | <1 min | 5 min |
| Performance | Good | Excellent |
| Docker required | No | Yes |

### Error Format

```
ERROR: [Error message]
This happens when: [Condition]
Fix: [Step-by-step solution]
```

---

## Tools and Rendering

Doclea docs should render well with:

- **GitHub Markdown** (default, since repo is on GitHub)
- **MkDocs** (if hosting custom documentation site)
- **Notion/Confluence** (if using internal wiki)

**Rule:** Test rendered output, not just raw markdown.

---

## Color Usage (If Using Web Rendering)

### Recommended Palette

| Color | Use |
|-------|-----|
| Blue | Info, links, primary actions |
| Green | Success, tips, affirmation |
| Red | Warnings, errors, critical |
| Gray | Secondary, less important |
| Yellow | Caution, deprecation |

### Accessibility

- Don't use color alone to convey meaning
- Text on background must have sufficient contrast
- Test with color-blind simulator

---

## Summary Checklist

Before publishing any documentation:

- [ ] Headings are semantic (H1 > H2 > H3)
- [ ] Code blocks have language identifier
- [ ] Terminal output uses `$` prefix
- [ ] All links are tested and working
- [ ] Tables have <5 columns
- [ ] Paragraphs are <4 sentences
- [ ] Technical terms consistent throughout
- [ ] Callout boxes used correctly (warning, info, tip, error)
- [ ] Examples are runnable (tested)
- [ ] Related content linked
- [ ] No orphaned pages (all have previous/next links)

