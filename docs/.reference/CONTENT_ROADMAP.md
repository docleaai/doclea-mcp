# Doclea Documentation Content Roadmap

Complete content plan for world-class Doclea documentation, organized by tier and priority.

---

## Overview

This roadmap organizes all required documentation across three tiers:

1. **Tier 1 (Quick Start):** Activation pages - get people working in <15 minutes
2. **Tier 2 (Core Features):** Learning guides - use Doclea productively for real work
3. **Tier 3 (Advanced):** Reference and customization - extract maximum value

Each section includes:
- **Page name** and purpose
- **Estimated length** (lines of content)
- **Key content** (bullet points of what to cover)
- **Code examples** (count and scenarios)
- **Related pages** (dependencies and links)

---

## Tier 1: Quick Start (Activation - Days 1-2 of Documentation)

Users in this tier want to see something work before reading more.

### Priority 1A: Repository Landing (README.md)

**File:** `/README.md` (already exists, optimize)

**Purpose:** Answer "what is Doclea?" in one glance

**Current Status:** Good foundation, needs optimization for clarity

**Optimizations Needed:**
- Move screenshot/demo to top (people scan visually first)
- Simplify "Why Doclea?" to one sentence with one outcome
- Make feature list scannable (3-5 lines max)
- Link to "Get Started" not "Installation"

**Key Content:**
- What is Doclea (1 paragraph)
- Why you need it (one concrete benefit)
- What you'll see (screenshot or terminal output)
- How to start (one-click link to quick start)

---

### Priority 1B: Get Started in 5 Minutes

**File:** `/docs/getting-started/quick-start.md`

**Purpose:** Fastest path to seeing Doclea work

**Length:** ~800 words (very concentrated)

**Must Have:**
- What you'll accomplish (specific: "store a memory and search it")
- Prerequisites (Node 18+, nothing else)
- Single installation method (zero-config)
- First interesting action (store + search)
- Success screenshot/output
- "Next: Understanding Memory Types" link

**Code Examples:**
- Example 1: Store a memory (complete)
- Example 2: Search for it (complete)

**Structure:**

```
# Get Started in 5 Minutes

You'll have Doclea running and storing your first memory.

## What You Need
- Node 18+
- 5 minutes

## Step 1: Install [1 minute]
```bash
npx @doclea/mcp
```
[Expected output shown]

## Step 2: Initialize [1 minute]
[Ask Claude: "Initialize doclea for this project"]

## Step 3: Store Your First Memory [2 minutes]
[Full example]

## Step 4: Search It Back [1 minute]
[Full example]

## What Just Happened
[Brief explanation]

## You're Done!
Next: Understanding Memory Types
```

---

### Priority 1C: Understanding Memory Types

**File:** `/docs/getting-started/memory-types.md`

**Purpose:** Answer "what should I store?" with clear decision matrix

**Length:** ~1000 words

**Must Have:**
- Comparison table (type → when to use → example)
- Real scenario for each type
- Clear guidance ("I have a bug fix" → store as solution)
- Common mistakes (too vague titles, storing everything)

**Code Examples:**
- One example per memory type (5 examples total)

**Structure:**

```
# Understanding Memory Types

Five types of memories. Pick the one that matches your situation.

## The Quick Reference

| Type | Situation | Example |
[Table showing all 5 types]

## Decision
When: You make an architectural choice
Example: Store example code
Don't: Store vague architecture thoughts
Do: Store decisions with context

## Solution
When: You fix a bug or workaround
Example: Store example code
...

## Pattern
When: You discover a reusable approach
Example: Store example code
...

## Architecture
When: You describe system design
Example: Store example code
...

## Note
When: You capture general knowledge
Example: Store example code
...

## Decision Tree

Got a decision that affects multiple files?
→ Type: decision

Found a bug? Store the fix.
→ Type: solution

Writing a repeated code approach?
→ Type: pattern

Describing how parts connect?
→ Type: architecture

General knowledge?
→ Type: note

## Common Mistakes

Mistake 1: Vague titles
Mistake 2: Too much detail
Mistake 3: Wrong type
```

---

### Priority 1D: Installation Guide

**File:** `/docs/getting-started/installation.md`

**Purpose:** Help users choose installation method and verify success

**Length:** ~2000 words (comprehensive but scannable)

**Must Have:**
- Decision tree (what's your situation?)
- Three methods with explicit trade-offs
- Prerequisites for each method
- Step-by-step for each
- Verification steps (how to check it worked)
- Troubleshooting specific to each method
- Upgrade path (zero-config → optimized)

**Code Examples:**
- Install command for each method (3 total)
- Verification steps with output (3 total)

**Structure:**

```
# Installation Guide

Choose your installation method based on your situation.

## Quick Decision Tree

Just want to start?
→ Zero-Config Installation

Using Docker already?
→ Optimized Installation

Building Doclea locally?
→ Manual Installation

## Zero-Config [No Docker Required]

**Best for:** Quick start, small projects, testing

**Takes:** <30 seconds

**What you get:**
- Works immediately
- Downloads embedding model on first run (~90MB, cached)
- Sufficient for projects up to 50,000 memories

### Steps

1. Add to Claude Config
2. Restart Claude Code
3. Ask Claude to initialize

### Verify

```bash
# Check that Doclea is running
doclea --version
```

### Troubleshooting

Problem 1: [Error message]
Solution: [Steps]

## Optimized [Docker Required]

**Best for:** Large codebases, better performance, production

**Takes:** 3-5 minutes

**What you get:**
- Qdrant vector database
- TEI embeddings service
- Better performance for large codebases

### Prerequisites

- Docker installed and running
- 2GB disk space

### Steps

[Curl command]
[What happens]

### Verify

[Verification steps]

### Troubleshooting

[Common issues]

## Manual Installation [Development]

**Best for:** Contributing to Doclea, custom builds

**Takes:** 5-10 minutes

### Prerequisites

- Node 18+ or Bun 1.0+
- Git
- Bun (recommended)

### Steps

[Clone, install, build]

### Verify

[Verification steps]

## Upgrading from Zero-Config to Optimized

If you started with zero-config and want better performance:

[Upgrade path]

## Troubleshooting All Methods

### First startup is slow

[Explanation and why]

### MCP server not appearing

[Steps to diagnose and fix]

### Port already in use

[If using Docker]

### Permission denied

[Likely causes and fixes]

## Next Steps

- Run "doclea init" to scan your project
- Store your first memory
- Ask Claude about your codebase
```

---

## Tier 2: Core Features (Learning Guides - Days 3-7 of Documentation)

Users in this tier have seen Doclea work and want to use it productively.

### Priority 2A: Memory Management (Deep Guide)

**File:** `/docs/features/memory-management.md`

**Purpose:** Master storing, organizing, and searching memories

**Length:** ~3000 words

**Must Have:**
- Complete reference for memory storage
- Tagging strategies
- Semantic search explained
- Updating and deleting
- Bulk operations (import)
- Real workflows

**Code Examples:**
- Store memory (minimal) 1
- Store memory (complete with all fields) 1
- Tag strategies (code examples) 3
- Search examples (basic, filtered, advanced) 3
- Update and delete 2
- Bulk import 2

**Total examples:** 12

**This page should answer:**
- How do I store a complete memory?
- What fields do I need?
- How do I name tags?
- How do I find memories?
- What does relevance mean?
- How do I update memories?
- Can I import from existing docs?

**Structure:** See full example in DOCUMENTATION_STRATEGY.md

---

### Priority 2B: Git Tools (Integration Guide)

**File:** `/docs/features/git-tools.md`

**Purpose:** Use memories to generate commits, PRs, changelogs

**Length:** ~2500 words

**Must Have:**
- Generate commit messages
- Create PR descriptions
- Generate changelogs
- How memories inform each
- Conventional commits reference
- Real workflow examples

**Code Examples:**
- Generate commit (minimal) 1
- Generate commit (complete output shown) 1
- Generate PR description (minimal) 1
- Generate PR description (complete) 1
- Generate changelog 1
- Real workflow combining memory + commit + PR 1

**Total examples:** 6

**This page should answer:**
- How do I generate a commit message?
- How do memories help my commits?
- Can it create PR descriptions?
- What information does it use?
- Can I customize the output?
- What about changelogs?

---

### Priority 2C: Code Expertise Mapping

**File:** `/docs/features/expertise.md`

**Purpose:** Understand code ownership and find reviewers

**Length:** ~1500 words

**Must Have:**
- Map expertise (what "expertise" means)
- Understand output format
- Suggest reviewers
- Identify bus factors
- Act on expertise gaps

**Code Examples:**
- Map expertise (minimal) 1
- Map expertise (complete output) 1
- Suggest reviewers 1
- Real scenario (understanding output) 1

**Total examples:** 4

**This page should answer:**
- How is "expertise" calculated?
- What's a "bus factor"?
- How do I find code reviewers?
- What does the output mean?
- How do I use this information?

---

### Priority 2D: Bootstrap and Initialization

**File:** `/docs/features/bootstrap.md`

**Purpose:** Automatically discover project context

**Length:** ~1500 words

**Must Have:**
- How initialization works
- What gets discovered
- Customizing discovery
- Importing from markdown files
- Importing ADRs
- Understanding initial memories

**Code Examples:**
- Initialize project (minimal) 1
- Initialize project (full output) 1
- Import from markdown 1
- Import from ADRs 1
- Customize discovery 1

**Total examples:** 5

**This page should answer:**
- What happens when I initialize?
- What gets stored?
- Can I import existing docs?
- How does it find decisions?
- Can I skip initialization?

---

### Priority 2E: Complete Workflows

**File:** `/docs/features/workflows.md`

**Purpose:** See features working together in real scenarios

**Length:** ~2500 words

**Must Have:**
- First day with Doclea (walkthrough)
- Adding a feature (with memories)
- Fixing a bug (with memories)
- Reviewing code (using expertise)
- Onboarding a new team member
- Each workflow: start state → actions → outcome

**Code Examples:**
- One complete workflow example (15-20 lines) per scenario
- 5 workflows total = 5 examples

**Total examples:** 5

**This page should answer:**
- How do I use Doclea in my daily work?
- What does a complete workflow look like?
- How do memories help across tasks?
- What's the ROI?

---

## Tier 3: Advanced/Reference (Days 8+)

Users in this tier want to customize, extend, or deeply understand Doclea.

### Priority 3A: API Reference (Complete Tool Documentation)

**File:** `/docs/reference/api.md`

**Purpose:** Exhaustive reference for all tools

**Length:** ~4000 words

**Structure per tool:**
```
## Tool Name: doclea_xxx

### What This Does
[One sentence definition]

### When to Use
[Realistic scenarios]

### Input Schema
```typescript
{
  field: type,
  description
}
```

### Input Parameters [Table]
| Name | Type | Required | Default | Description |
...

### Output Format
```json
{
  response object example
}
```

### Output Fields [Detailed explanation]

### Complete Example
[15-20 lines showing real usage]

### Common Errors
- Error 1: [message] → [cause] → [fix]
- Error 2: ...

### Related Tools
[Links to complementary tools]

### Performance Notes (if relevant)
```

**Memory Tools (5 tools × 500-700 words each):**
- doclea_store
- doclea_search / doclea_get
- doclea_update
- doclea_delete
- doclea_import

**Git Tools (3 tools × 400-500 words each):**
- doclea_commit_message
- doclea_pr_description
- doclea_changelog

**Expertise Tools (2 tools × 300-400 words each):**
- doclea_expertise
- doclea_suggest_reviewers

**Bootstrap Tools (2 tools × 300-400 words each):**
- doclea_init
- (doclea_import covered in memory tools)

**Total length:** ~4000 words covering 12 tools comprehensively

---

### Priority 3B: Configuration Reference

**File:** `/docs/reference/configuration.md`

**Purpose:** Every configuration option with defaults and behavior

**Length:** ~2500 words

**Structure:**

```
# Configuration Reference

Create `.doclea/config.json` in your project root.

## Default Configuration
[Show complete default config]

## Configuration Sections

### Embedding Provider

All options for embedding model:
- transformers (default)
- local (TEI/Docker)
- openai
- ollama

For each:
- Description
- Prerequisites
- Performance notes
- Example config
- When to use

### Vector Store

All options for vector database:
- sqlite-vec (default)
- qdrant

For each:
- Description
- Prerequisites
- Performance notes
- Example config
- When to use

### Storage Options

SQLite database location, options

### Memory Limits (if any)

### Advanced Options

Performance tuning, caching, etc.

## Complete Example Configs

- Minimal (zero-config default)
- Optimized (Docker, production)
- Custom embeddings
- Multiple vector providers
- Development setup

## Performance Tuning

- For small projects (<10k memories)
- For large projects (>100k memories)
- For production use

## Environment Variables

Any configuration via environment

## Troubleshooting Config Issues

- Config not found
- Invalid configuration
- Service not found
- Performance problems

## Migration Guide (if versions differ)
```

---

### Priority 3C: Development Setup

**File:** `/docs/reference/development.md`

**Purpose:** Build and extend Doclea

**Length:** ~2000 words

**Must Have:**
- Local development environment
- Running tests (unit, integration, e2e)
- Building from source
- Understanding the architecture
- Extension points
- Contributing guidelines reference

**Code Examples:**
- Development commands (bash) 4-5
- Writing a test 1
- Building custom backend 1

---

### Priority 3D: Troubleshooting Deep Dive

**File:** `/docs/reference/troubleshooting.md`

**Purpose:** Resolve non-obvious issues

**Length:** ~2500 words

**Sections:**

```
# Troubleshooting

## Quick Diagnostic Checklist
[5-7 yes/no questions to narrow down the issue]

## By Error Message

### Error: "specific message"
- What's happening: [Explanation]
- Why: [Root cause]
- How to fix: [Step-by-step]
- Verify: [How to check it worked]
- Prevent: [Best practice]

[Include most common errors first]

## By Symptom

### Symptom: [What you observe]
- Check: [Diagnostic steps]
- Likely causes: [Multiple possibilities]
- Solutions: [Organized by likelihood]

[Include: slow, crashes, not appearing, etc.]

## By Platform

### macOS
- SQLite extension issues
- Path issues
- Homebrew vs system SQLite
- Model caching location

### Linux
- Docker issues
- Port conflicts
- Permissions

### Windows
- Path handling
- WSL issues
- Container runtime

## By Installation Method

### After Zero-Config
[Common issues]

### After Optimized Installation
[Common issues]

### After Manual Installation
[Common issues]

## Performance Issues

- First run slow: [Explanation]
- Searches slow: [Diagnosis]
- Memory usage high: [Solutions]
- CPU usage high: [Diagnosis]

## Upgrade and Migration

- Upgrading from older version
- Migrating between backends
- Data recovery

## Getting Help

- Check logs
- Collect diagnostics
- Create a GitHub issue
- Ask on discussions
```

---

### Priority 3E: Architecture Documentation

**File:** `/docs/reference/architecture.md`

**Purpose:** Understand how Doclea works internally

**Length:** ~2000 words

**Sections:**

```
# Architecture

## System Overview

[ASCII diagram showing components]

## Core Components

### Memory Storage (SQLite)
- What: Metadata storage
- How: SQLite database with schema
- Why: Fast local storage for text data

### Vector Store
- What: Semantic search index
- How: Embeddings converted to vectors
- Why: Enable semantic similarity search
- Providers: sqlite-vec (local), Qdrant (distributed)

### Embedding Service
- What: Converts text to numerical vectors
- How: Using transformer models
- Why: Enables semantic understanding
- Providers: Transformers.js, TEI, OpenAI, Ollama

### Tool Interface
- What: MCP protocol implementation
- How: Exposes tools to Claude
- Why: Standard interface for AI assistants

## Data Flow

[ASCII diagram showing: Input → Processing → Storage]

### Example: Storing a Memory

1. User calls doclea.store()
2. Input validated against schema
3. Embedding service converts title+content → vector
4. Vector stored in vector DB (with metadata)
5. Metadata stored in SQLite
6. Memory ID returned to user

### Example: Searching

1. User calls doclea.search()
2. Query converted to vector (same embedding model)
3. Vector store searches for similar vectors
4. Results ranked by relevance + importance
5. Metadata retrieved from SQLite
6. Results returned to user

## Provider Architecture

Why multiple providers?

- Flexibility: Choose what works for you
- Scalability: Embedded for small, distributed for large
- Cost: Open-source for local, API for advanced

### Embedding Provider
- Transformers.js: Local, no API keys, ~500ms per embedding
- TEI: Docker, faster, 100ms per embedding
- OpenAI: Cloud-based, most capable
- Ollama: Open-source, local LLM

### Vector Provider
- sqlite-vec: Local, simple, O(n) search
- Qdrant: Distributed, fast, O(log n) search

## Tool Architecture

How tools work:

1. Tool defined with Zod schema
2. Registered with MCP server
3. Claude calls tool with input
4. Input validated
5. Function executed
6. Output returned to Claude

## Performance Characteristics

- Memory storage: O(1) insert
- Vector search: O(n) for sqlite-vec, O(log n) for Qdrant
- Embedding: 100-500ms per memory
- Search: <100ms for small collections

## Security Considerations

- No network services (except optional Docker)
- No authentication (local files only)
- No data sent to cloud (unless using OpenAI provider)
- No tracking or analytics

## Extensibility Points

- Custom embedding providers
- Custom vector stores
- Custom storage backends
- Tool additions via MCP

## Future Architecture

Planned changes and scalability
```

---

## Priority 3F: Frequently Asked Questions

**File:** `/docs/reference/faq.md`

**Purpose:** Answer common questions from users

**Length:** ~1500 words

**Structure:**

```
# Frequently Asked Questions

## Getting Started
- What's the difference between zero-config and optimized?
- Do I need Docker?
- How long does first run take?
- Will it slow down Claude Code?

## Using Doclea
- How do I know what to store?
- Should I store everything?
- How specific should memories be?
- Can I edit memories?
- Can I organize memories in folders?

## Architecture & Data
- Where are my memories stored?
- Is my data private?
- Can I back up my memories?
- Can I export memories?
- What happens if I delete a memory?

## Performance & Scale
- How many memories can Doclea handle?
- Will it get slower as I store more?
- Which backend should I use?
- How much disk space do I need?

## Customization & Integration
- Can I use OpenAI embeddings?
- Can I use a different vector store?
- Can I integrate with my CI/CD?
- Can I host Doclea on a server?

## Troubleshooting
- Why is my first run slow?
- Why aren't my memories showing up?
- Why is the embedding model so large?
- Can I speed up searches?

## Team & Collaboration
- Can my team share memories?
- What about privacy on a team?
- Do memories sync between computers?
```

---

## Navigation and Cross-Links

### Suggested Information Architecture

```
/docs
├── README.md (overview)
├── DOCUMENTATION_STRATEGY.md (for doc maintainers)
├── WRITING_CHECKLIST.md (for doc maintainers)
├── VISUAL_STYLE_GUIDE.md (for doc maintainers)
├── CONTENT_ROADMAP.md (this file)
│
├── /getting-started           [Tier 1: 5-15 minutes]
│   ├── quick-start.md         [Must read first]
│   ├── memory-types.md        [After quick-start]
│   └── installation.md        [Reference]
│
├── /features                  [Tier 2: 30 min - 2 hours]
│   ├── memory-management.md
│   ├── git-tools.md
│   ├── expertise.md
│   ├── bootstrap.md
│   └── workflows.md
│
├── /reference                 [Tier 3: As-needed]
│   ├── api.md
│   ├── configuration.md
│   ├── development.md
│   ├── architecture.md
│   ├── troubleshooting.md
│   └── faq.md
│
└── /images
    └── [diagrams, screenshots]
```

### Suggested Link Flow

**New Users:**
1. README.md
2. Quick Start (5 min)
3. Memory Types (understand what to store)
4. First feature guide (memory-management or git-tools)
5. Workflows (see it all together)

**Working Developers:**
1. Feature guide (based on what they want to do)
2. Complete examples in that guide
3. Workflows (see patterns)
4. API reference (when they need details)

**Customizers:**
1. Configuration Reference (what can I change)
2. Development (how do I extend)
3. Architecture (how does it work)

---

## Content Status Tracking

### Tier 1: Quick Start (MVP - Publish First)
- [ ] quick-start.md
- [ ] memory-types.md
- [ ] installation.md
- [ ] README.md optimized

### Tier 2: Core Features (Publish Second)
- [ ] memory-management.md
- [ ] git-tools.md
- [ ] expertise.md
- [ ] bootstrap.md
- [ ] workflows.md

### Tier 3: Advanced (Publish Third)
- [ ] api.md
- [ ] configuration.md
- [ ] architecture.md
- [ ] troubleshooting.md
- [ ] development.md (lower priority)
- [ ] faq.md (gather from user questions)

---

## Estimated Effort

### Content Creation

| Tier | Page | Estimated Hours | Notes |
|------|------|-----------------|-------|
| 1 | Quick Start | 3-4 | Heavy review + testing |
| 1 | Memory Types | 2-3 | Examples + decision tree |
| 1 | Installation | 4-5 | All three methods + troubleshooting |
| 2 | Memory Management | 4-5 | Complex feature, many examples |
| 2 | Git Tools | 3-4 | Shows feature integration |
| 2 | Expertise | 2-3 | Smaller scope |
| 2 | Bootstrap | 2-3 | Specific feature |
| 2 | Workflows | 3-4 | Combines multiple features |
| 3 | API Reference | 6-8 | Many tools, comprehensive |
| 3 | Configuration | 3-4 | Reference style |
| 3 | Architecture | 3-4 | Technical explanation |
| 3 | Troubleshooting | 3-4 | Gather from issues, users |
| 3 | Development | 2-3 | Lower priority |
| 3 | FAQ | 2 | Gather from user questions |

**Tier 1 Total:** 9-12 hours
**Tier 2 Total:** 14-19 hours
**Tier 3 Total:** 24-32 hours

**Grand Total:** 47-63 hours (6-8 weeks at 1-2 hours/day)

### Recommended Timeline

**Week 1:** Tier 1 (Quick Start) - get people activated
**Weeks 2-3:** Tier 2 (Features) - help them use productively
**Weeks 4+:** Tier 3 (Advanced) - optimization and depth

---

## Success Metrics

Track these metrics to ensure documentation effectiveness:

### Activation Metrics (Tier 1)
- % of new users who complete "Get Started" without help
- Time to first stored memory
- % who succeed on first try vs need troubleshooting

### Usage Metrics (Tier 2)
- Which features are actually used
- Common workflows in documentation vs real usage
- User questions on features that are documented

### Reference Metrics (Tier 3)
- % of questions answered by documentation
- Time to find answers in docs vs asking support
- User-reported clarity of API/configuration docs

### Overall Health
- Documentation freshness (how quickly docs lag behind code)
- Broken links (should be zero)
- Outdated examples (should be tested in CI)
- User feedback (collect from issues, discussions)

---

## Maintenance Schedule

### Daily
- Fix typos and broken links as reported

### Weekly
- Review GitHub issues for undocumented problems
- Update FAQ based on common questions

### Monthly
- Test all code examples against latest version
- Review analytics (what docs are most viewed)
- Check for outdated content

### Quarterly
- Major review of Tier 1 (ensure still accurate)
- Update troubleshooting with new issues
- Review for clarity based on user feedback

### Per Release
- Update docs for new features
- Mark deprecated features
- Test all examples
- Publish release notes

---

## Next Steps

1. **Start with Tier 1** (Quick Start pages)
   - These unblock everyone else
   - Get feedback from real users
   - Use feedback to improve Tier 2

2. **Build Tier 2** (Feature guides)
   - Use real workflows from your team
   - Test with non-expert users
   - Iterate based on feedback

3. **Add Tier 3** (Reference)
   - Once core docs are solid
   - Reference can lag slightly behind
   - Gather content from issues and user questions

4. **Establish maintenance**
   - Set up process for keeping docs fresh
   - Link docs from code (comments referencing docs)
   - Celebrate good documentation (share it)

---

## Templates to Copy

All of these are explained in detail in `DOCUMENTATION_STRATEGY.md`:

- Feature Page Template
- Configuration Page Template
- Troubleshooting Page Template
- Tool Reference Template

Use these as starting points for consistency.

