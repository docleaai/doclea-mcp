
> "Institutional memory for modern dev teams"

---

## The Problem

### Current Reality

Developers use AI assistants (Claude Code, Cursor, Windsurf) daily, but:

- **Every session starts from zero** — no continuity between conversations
- **Repeated decisions** — "why did we choose Prisma?" gets asked 10 times
- **Lost knowledge** — problem solutions are forgotten, mistakes repeat
- **Painful onboarding** — new devs must "read code and ask around"
- **Institutional knowledge lives in heads** — senior leaves, knowledge leaves
- **Git history is chaos** — inconsistent commits, no one reads PR descriptions
- **Docs are always stale** — written once, never updated
- **Token waste** — pasting the same files into AI over and over

### Why This Matters Now

- AI coding assistants are becoming mainstream
- Context window limits force constant repetition
- Teams are distributed, async communication is the norm
- Developer time is expensive ($150k+ salaries)

### The Pain in Numbers

```
Context repetition:     15 min/day   = 60+ hours/year wasted
Token waste:            ~88%         = $10+/month per dev burned
Onboarding time:        2-4 weeks    = $5,000+ per new hire
Knowledge loss:         Immeasurable = One senior leaves, years of context gone
```

---

## The Solution

### What It Is

**DevMemory** is the brain for your codebase — a persistent, structured memory layer that powers AI-assisted development, automates documentation, and keeps your git history clean.

```
Not a knowledge base. Not documentation.
It's CONTEXT that AI understands and uses automatically.
```

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     Developer Workflow                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Developer: "Why do we handle auth this way?"                │
│                         │                                    │
│                         ▼                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   DevMemory                          │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────┐   │    │
│  │  │ Decisions │  │ Solutions │  │   Patterns    │   │    │
│  │  │           │  │           │  │               │   │    │
│  │  │ Git Blame │  │ PR History│  │   Docs        │   │    │
│  │  └───────────┘  └───────────┘  └───────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
│                         │                                    │
│                         ▼                                    │
│  Claude: "Based on the team's decision from Jan 15,          │
│           you use JWT with refresh tokens because...         │
│           See src/auth/refresh.ts — @sarah is the expert"   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Differentiators

| Feature | Generic Memory Tools | DevMemory |
|---------|---------------------|-----------|
| Storage | Flat text blobs | Structured types (decision, solution, pattern) |
| Bootstrap | Empty, cold start | Scans codebase + git history |
| Context | None | File paths, git refs, expertise mapping |
| Retrieval | "Find similar text" | "Find decisions about auth module" |
| Git | None | Commit messages, PR descriptions, changelogs |
| Docs | None | Auto-generated, living documentation |
| Lifecycle | Forever (manual delete) | Auto-decay, confidence scoring |
| Relations | None | Decision A → caused → Bug B |
| Team | Single user | Shared knowledge, permissions |
| Token Usage | Wastes tokens | 88% reduction in context tokens |

---

## Core Features

### 1. Zero-Friction Bootstrap

No cold start. One command scans your codebase and git history:

```bash
npx devmemory init
```

```
📦 Analyzing Project...

Scanning:
├── Codebase structure... ✓
├── Git history (1,247 commits)... ✓
├── PR descriptions (89 PRs)... ✓
├── Existing docs... ✓
└── README and configs... ✓

Detected:
├── Framework: Next.js 14 (App Router)
├── Database: Prisma + PostgreSQL  
├── Auth: NextAuth with Google/GitHub
├── Styling: Tailwind + shadcn/ui
└── Testing: Vitest + Playwright

Generated 47 memories:
├── 12 decisions (from PRs and commits)
├── 18 patterns (extracted from code)
├── 9 solutions (from bug fix commits)
├── 5 architecture notes
└── 3 expertise mappings

[Accept all] [Review individually] [Customize]
```

**Import from what you have:**

```bash
devmemory import notion --url <workspace>
devmemory import markdown ./docs/**/*.md
devmemory import github-discussions
devmemory import adr ./docs/adr/
```

**Templates for common stacks:**

```bash
devmemory init --template nextjs
devmemory init --template rails
devmemory init --template fastapi
```

---

### 2. Structured Memory Types

```typescript
// Decision
{
  type: "decision",
  title: "Use Prisma for database layer",
  context: "Evaluating ORMs for new project",
  reasoning: "Type safety, great migrations, good docs",
  alternatives: ["Drizzle", "Kysely", "raw SQL"],
  decided_by: "team",
  date: "2025-01-15",
  source: "PR #142",
  related_files: ["src/db/*", "prisma/schema.prisma"],
  experts: ["@sarah"]
}

// Solution  
{
  type: "solution",
  problem: "N+1 query on user posts endpoint",
  symptoms: ["Slow API response", "High DB CPU"],
  root_cause: "Missing eager loading in Prisma query",
  fix: "Added include: { posts: true } to query",
  related_files: ["src/api/users.ts:47"],
  git_commit: "abc123",
  resolved_by: "@mike"
}

// Pattern
{
  type: "pattern",
  name: "API Error Handling",
  description: "Consistent error responses across all endpoints",
  example_code: "...",
  used_in: ["src/api/*"],
  anti_patterns: ["Throwing generic Error"],
  documented_in: "docs/patterns/errors.md"
}
```

---

### 3. Intelligent Storage Modes

Three levels of control:

| Mode | Behavior | Use Case |
|------|----------|----------|
| **Manual** | Only stores when explicitly asked | Privacy-conscious, selective |
| **Suggested** | Detects insights, asks "Save this?" | Balanced control |
| **Automatic** | Background agent stores silently | Maximum capture, review later |

**Per-type granularity:**

```yaml
# .devmemory/config.yaml
storage:
  decisions: suggested    # Ask before storing
  solutions: automatic    # Always capture bug fixes
  patterns: manual        # Only when I say so
  
  exclude:
    - "*.env*"           # Never scan secrets
    - "node_modules/*"
    - ".git/*"
```

**In-conversation control:**

```
"Remember this decision" → Explicit save
"Don't store this" → Skip current insight
"Update the auth pattern" → Modify existing
```

---

### 4. Smart Commit Messages

DevMemory sees the diff + knows context = perfect commits:

```bash
$ git add .
$ devmemory commit

Analyzing changes against project context...

Suggested commit message:
────────────────────────────────────────
fix(auth): handle token refresh race condition

- Add mutex lock to refresh token flow
- Prevents duplicate refresh requests on concurrent API calls
- Resolves #234
────────────────────────────────────────

[Use this] [Edit] [Write my own]
```

**Why it's better:**
- Knows your commit conventions (conventional commits, gitmoji, etc.)
- Understands *why* you made the change, not just *what*
- Links to related issues/decisions automatically
- Consistent style across entire team

---

### 5. PR Description Generation

```bash
$ devmemory pr

Generating PR description from changes and context...

────────────────────────────────────────
## What

Implements refresh token rotation for improved security.

## Why

Based on team decision from Jan 15 (see #142), we're moving 
to rotating refresh tokens to limit exposure window.

## Changes

- `src/auth/refresh.ts`: New rotation logic
- `src/auth/types.ts`: Added RefreshTokenPayload type
- `src/middleware/auth.ts`: Updated to handle rotation

## Testing

- Added unit tests for rotation flow
- Manual testing: login → wait 14min → verify new token

## Related

- Decision: AUTH-001 (Token rotation strategy)
- Issue: #234 (Security audit findings)

## Reviewers

Suggested: @sarah (auth expert, 73% of auth commits)
────────────────────────────────────────

[Create PR] [Edit] [Copy to clipboard]
```

---

### 6. Expertise Mapping (Git Blame Intelligence)

```bash
$ devmemory expertise

Codebase Expertise Map
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

src/auth/*
  Primary:    @sarah (73% of commits, last: 2 days ago)
  Secondary:  @mike (20% of commits, last: 2 weeks ago)
  
src/api/payments/*
  Primary:    @alex (89% of commits, last: 1 week ago)
  ⚠️ Bus factor risk — no secondary expert
  
src/utils/*
  Distributed: @sarah, @mike, @alex, @jan (15-30% each)
  ✓ Good coverage
  
src/legacy/*
  ⚠️ No active experts (last commit: 8 months ago)
  Original author: @former-employee (left company)
  
Recommendations:
├── Pair @mike with @sarah on auth for knowledge transfer
├── Document src/legacy/* before it becomes archeology
└── Consider @alex mentoring someone on payments
```

**Automatic reviewer suggestions:**
```
PR touches: src/auth/*, src/api/users.ts

Suggested reviewers:
├── @sarah (auth expert) — required
└── @mike (API patterns) — optional
```

---

### 7. Living Documentation

**Auto-detect doc drift:**

```
⚠️ Documentation Drift Detected
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

README.md line 47 says:
  "Run `npm run dev` to start the server"

But package.json shows:
  "dev" renamed to "start:dev" (commit abc123, 3 days ago)

[Update README] [Ignore] [Mark as intentional]
```

**Generate documentation:**

```bash
$ devmemory docs generate

What to generate?
├── [x] API Reference (from route handlers)
├── [x] Component Library (from React components)  
├── [x] Architecture Overview (from memory + structure)
├── [x] Onboarding Guide (from setup patterns)
└── [x] Runbook (from solutions/incidents)

Generating...

Created:
├── docs/API.md (47 endpoints documented)
├── docs/COMPONENTS.md (23 components)
├── docs/ARCHITECTURE.md (system overview + diagrams)
├── docs/ONBOARDING.md (new dev guide)
└── docs/RUNBOOK.md (common issues + fixes)
```

**Changelog generation:**

```bash
$ devmemory changelog --since v1.2.0

# Changelog v1.3.0

## Features
- Implement refresh token rotation (#234)
- Add dark mode support (#241)

## Fixes  
- Fix race condition in auth flow (#238)
- Resolve memory leak in WebSocket handler (#240)

## Breaking Changes
- `npm run dev` renamed to `npm run start:dev`
- Removed deprecated `legacyAuth` endpoint

## Migration Guide
See docs/MIGRATION-1.3.md for upgrade instructions.

## Contributors
@sarah, @alex, @mike
```

**User-facing release notes:**

```bash
$ devmemory release-notes --audience users

# What's New in v1.3.0

🔒 **Improved Security**
Your sessions are now even more secure with automatic 
token rotation.

🌙 **Dark Mode**
Finally! Toggle dark mode in settings.

🐛 **Bug Fixes**
- Fixed occasional logout issues
- Improved performance on slower connections
```

**ADR (Architecture Decision Record) generation:**

```bash
$ devmemory adr create

Based on recent decisions, drafting ADR:

────────────────────────────────────────
# ADR-007: Use Rotating Refresh Tokens

## Status
Accepted

## Context
Security audit revealed long-lived refresh tokens as risk.
Team discussed options on Jan 15.

## Decision
Implement refresh token rotation. Each refresh issues 
new refresh token, old one invalidated.

## Consequences
- Improved security posture
- Slightly more complex token handling
- Requires database updates for token tracking

## Alternatives Considered
- Shorter token expiry (rejected: bad UX)
- Session-only auth (rejected: doesn't work for mobile)
────────────────────────────────────────

Save to docs/adr/007-rotating-refresh-tokens.md? [Y/n]
```

---

### 8. Token Usage Optimization

**The math:**

```
WITHOUT DevMemory:
─────────────────────────────────────
"How does our auth work?"

User pastes:
├── auth.ts (800 tokens)
├── middleware.ts (600 tokens)  
├── types.ts (400 tokens)
├── README section (300 tokens)
└── Previous conversation (500 tokens)

Total: ~2,600 tokens per question


WITH DevMemory:
────────────────
Same question, DevMemory injects:

├── Decision summary (80 tokens)
├── Pattern reference (120 tokens)
├── File pointers (30 tokens)
└── Related solution (70 tokens)

Total: ~300 tokens per question

SAVINGS: 88% reduction
```

**Dashboard:**

```
┌─────────────────────────────────────────────────────────┐
│              DevMemory Token Savings                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  This month:                                             │
│  ┌────────────────────────────────────┐                 │
│  │ Without DevMemory:  ████████████████████  4.2M       │
│  │ With DevMemory:     ███                    450K      │
│  └────────────────────────────────────┘                 │
│                                                          │
│  Estimated savings: $10.80/month                         │
│  Queries answered: 847                                   │
│  Avg tokens/query: 531 (was 4,960)                      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

### 9. Team & Git Integration

**Connect once, entire team benefits:**

```
┌─────────────────────────────────────────────────────────┐
│                   Git-Based Flow                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│   GitHub/GitLab Repo                                     │
│         │                                                │
│         ▼                                                │
│   ┌───────────────┐                                     │
│   │  DevMemory    │──▶ Extracts decisions from PRs      │
│   │  Cloud        │──▶ Maps expertise from blame        │
│   │               │──▶ Links issues to solutions        │
│   │               │──▶ Auto-updates on merge            │
│   └───────────────┘                                     │
│         │                                                │
│         ▼                                                │
│   All team members get same context automatically        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Webhook integration:**
- PR merged → Extract decisions automatically
- Bug fixed → Capture problem/solution pair
- Breaking change → Flag for migration guide

---

### 10. Security & Encryption

Three tiers:

| Layer | What | How |
|-------|------|-----|
| **In-transit** | Data moving | TLS 1.3 |
| **At-rest** | Stored data | AES-256 |
| **End-to-end** | Zero-knowledge | Customer holds keys |

**Zero-knowledge mode (Enterprise):**

```
┌──────────────────────────────────────────────────────────┐
│                  Zero-Knowledge Mode                      │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Customer environment          DevMemory Cloud            │
│  ┌─────────────────┐          ┌─────────────────┐        │
│  │ Code + Context  │          │ Encrypted blobs │        │
│  │       │         │          │ (we can't read) │        │
│  │       ▼         │          └─────────────────┘        │
│  │ Encrypt locally │────────────────▶ Sync               │
│  │ (your keys)     │                                     │
│  └─────────────────┘                                     │
│                                                           │
│  We never see your code. Ever.                           │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      DevMemory Stack                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────┐ │
│  │  MCP Server  │────▶│  Core Logic  │────▶│  Storage    │ │
│  │  (TS + Bun)  │     │              │     │ Qdrant +    │ │
│  └──────────────┘     └──────────────┘     │ SQLite      │ │
│         │                    │              └─────────────┘ │
│         │                    │                              │
│  ┌──────▼──────┐      ┌──────▼──────┐     ┌─────────────┐ │
│  │  Claude Code │      │  Embedder   │     │ Git         │ │
│  │  / Cursor    │      │  (Nomic)    │     │ Integration │ │
│  └──────────────┘      └─────────────┘     └─────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

| Component | Choice | Reasoning |
|-----------|--------|-----------|
| MCP Server | TypeScript + Bun | MCP ecosystem is TS-first, single-file deploy, contributor-friendly |
| Vector DB | Qdrant | Best performance, official MCP support |
| Metadata DB | SQLite (Turso) | Simple local, scales to cloud |
| Embeddings | Nomic v1.5 | Best open source, long context, runs local |
| CLI | TypeScript + Commander | Consistent stack |
| Git | simple-git | Well-maintained, full feature set |

**Why TypeScript + Bun over Go:**
- MCP SDK is TypeScript-native — swimming with the current
- Target users are JS/TS devs — they can contribute and extend
- Share code with VS Code extension, web dashboard, GitHub bot
- Bun gives near-Go performance with simpler deployment
- npm ecosystem for integrations

---

## Adoption Strategy

### Friction Killers

| Friction Point | Solution |
|----------------|----------|
| "Is this worth setting up?" | One command: `npx devmemory` |
| "Does it work with my tools?" | MCP works with Claude, Cursor, Windsurf, etc. |
| "Cold start, empty memory" | Auto-bootstrap from codebase + git |
| "Another account to create" | Local-first, no account needed |
| "Learning curve" | Works silently in background, progressive disclosure |
| "My existing docs are wasted" | Import from Notion, markdown, ADRs |
| "Will my team use it?" | Git integration = team gets it automatically |

### Progressive Disclosure

```
Day 1:   Just works, stores memories automatically
Week 1:  Discover search and retrieval
Week 2:  Learn about memory types and editing
Week 3:  Start using commit message generation
Month 1: Explore team features, docs generation
Month 2: Full workflow integration
```

### Viral Mechanics

- **Shareable memories**: Export a decision as a gist/link
- **Team invites**: "Join my project's memory"
- **Public templates**: "Here's how Stripe structures their memories"
- **Screenshot-worthy CLI**: Beautiful terminal output
- **"Saved X tokens this month"**: Bragging rights

---

## Target Market

### Primary: Small Dev Teams (2-10 developers)

- Already using AI coding tools
- Moving fast, decisions made quickly
- Knowledge loss when people leave
- Can't afford dedicated docs team

**Pain level:** HIGH  
**Willingness to pay:** $50-200/month

### Secondary: Solo Developers / Freelancers

- Work on multiple projects
- Context switching is expensive
- Need to remember decisions across projects

**Pain level:** MEDIUM  
**Willingness to pay:** $10-20/month

### Future: Enterprise Teams (10-100+ developers)

- Complex codebases
- Compliance/audit requirements
- On-prem deployment needs

**Pain level:** EXTREME  
**Willingness to pay:** $500-2000+/month

---

## Business Model

### Pricing Tiers

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | 1 project, 1000 memories, local only, basic git |
| **Pro** | $19/dev/month | Unlimited projects, cloud sync, full git integration, commit/PR generation |
| **Team** | $49/dev/month | + Shared memories, expertise mapping, docs generation, analytics |
| **Enterprise** | Custom | + SSO, audit logs, zero-knowledge encryption, on-prem, SLA |

### Revenue Model: Open Core

**Open Source (Free):**
- Core MCP server
- Local storage (Qdrant + SQLite)
- Basic memory types
- Simple git integration

**Paid Cloud:**
- Cloud sync & backup
- Team collaboration
- Advanced git integration (webhooks, auto-extract)
- Docs generation
- Token analytics
- Priority support
- Enterprise security

### Alternative Pricing Model

**Token Savings Plan:**
```
$0.10 per 100K tokens saved
(We track what would have been used vs actual)

"Pay us 10% of what we save you"
```

Aligns incentives — we only profit when we provide value.

---

## Future Product: DevMemory Embed

### The Opportunity

Most customer-facing chatbots know **what** your product does.
None know **why** it works that way.

```
Typical support bot:
User: "Why doesn't the webhook retry on 500 errors?"
Bot: "I don't see that in the documentation."

DevMemory-powered bot:
User: "Why doesn't the webhook retry on 500 errors?"
Bot: "By design. 500s indicate server issues on your end, 
     so retrying would hammer a broken endpoint. Use 503 
     for transient errors — those retry with exponential 
     backoff. See docs/webhooks.md for retry logic."
```

### Target Segments

| Segment | Why DevMemory Embed Wins |
|---------|-------------------------|
| **Developer tools** (APIs, SDKs) | Technical accuracy matters |
| **B2B SaaS** | Complex products, docs always stale |
| **Open source projects** | Community needs deep answers |
| **Internal tools** | No docs team, code is the truth |

### Pricing (Future)

```
DevMemory Embed
├── Starter: $99/mo  — 1,000 conversations
├── Growth:  $299/mo — 10,000 conversations  
└── Scale:   Custom  — Unlimited, SLA
```

### Strategy

**Don't build now. Design for it.**

- Architecture supports both use cases
- Core memory system is the foundation
- Launch after dev tool has traction
- The dev tool is the wedge, embed is the expansion

---

## Go-to-Market Strategy

### Phase 1: Community Building (Months 0-6)

**Goals:**
- 1,000 GitHub stars
- 500 active users
- 50 Discord community members
- Validate core value prop

**Actions:**
- Launch open source MCP server
- Blog post: "How I gave Claude permanent memory"
- Demo video: 2-minute "zero to working"
- Posts on r/ClaudeAI, r/cursor, HackerNews
- Engage in AI coding tool communities
- Collect feedback, iterate fast

### Phase 2: Monetization (Months 6-12)

**Goals:**
- 100 paying customers
- $5,000 MRR
- 3 case studies

**Actions:**
- Launch cloud sync (Pro tier)
- Add team features
- GitHub webhook integration
- Docs generation features
- Case studies from early users
- Content marketing: "How X team uses DevMemory"

### Phase 3: Scale (Months 12-24)

**Goals:**
- $50,000+ MRR
- Enterprise customers
- Partnerships with Cursor, Windsurf

**Actions:**
- Enterprise features (SSO, audit, on-prem)
- Partner integrations
- DevMemory Embed beta
- Potential seed round or stay indie

---

## Competitive Landscape

| Competitor | What They Do | Weakness |
|------------|--------------|----------|
| **Mem0** | Generic AI memory | Not dev-focused, no git |
| **Pieces.app** | Code snippets | Not AI-native, not MCP |
| **Notion AI** | Docs + AI | Not for code, no git |
| **Official MCP memory** | Basic k/v store | Unstructured, no features |
| **Intercom/Mendable** | Support chatbots | Surface-level, no code understanding |

**Competitive Advantages:**
1. **Dev-specific** — Built for code, not generic text
2. **MCP-native** — Works with Claude, Cursor, any MCP client
3. **Git-integrated** — Commits, PRs, expertise, changelogs
4. **Docs-generating** — Living documentation, not static
5. **Open source core** — Trust, transparency, community
6. **Token-efficient** — Measurable cost savings

---

## Financial Projections

### Year 1
```
Months 1-6:  $0 (building community, validating)
Months 7-12: $5,000 MRR target

- 150 Pro users × $19 = $2,850
- 50 Team users × $49 = $2,450
```

### Year 2
```
Target: $30,000 MRR ($360k ARR)

- 500 Pro users × $19 = $9,500
- 200 Team users × $49 = $9,800  
- 5 Enterprise × $2,000 = $10,000
```

### Year 3
```
Target: $100,000+ MRR ($1.2M ARR)

- Core product mature
- Embed product launched
- Options: stay indie, raise seed, acquisition
```

---

## MVP Scope (4-6 weeks)

### Week 1-2: Core
- [ ] MCP server in TypeScript + Bun
- [ ] Structured memory types (decision, solution, pattern)
- [ ] SQLite for metadata and relations
- [ ] Qdrant for vector search
- [ ] Basic retrieval with filtering

### Week 3-4: Bootstrap & Git
- [ ] Codebase scanning (init command)
- [ ] Git history extraction
- [ ] Commit message generation
- [ ] PR description generation
- [ ] Storage modes (manual/suggested/automatic)

### Week 5: Polish
- [ ] Expertise mapping (blame analysis)
- [ ] Config file support
- [ ] Import from markdown/ADRs
- [ ] Documentation
- [ ] Landing page

### Week 6: Launch
- [ ] GitHub repo public
- [ ] npm package published
- [ ] HackerNews / Reddit posts
- [ ] Demo video
- [ ] Collect feedback

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Native memory in Claude/Cursor | Dev-specific features they won't build (git, docs, expertise) |
| Low adoption | Zero-friction install, instant value demo |
| Hard to monetize | Focus on teams, not individuals; token savings ROI |
| Competition from big players | Speed, niche focus, community, open source trust |
| Privacy concerns | Local-first, zero-knowledge option, open source transparency |

---

## Success Metrics

| Metric | Target (6 months) |
|--------|-------------------|
| GitHub stars | 1,000 |
| npm downloads/week | 500 |
| Active users | 500 |
| Discord members | 100 |
| Paying customers | 50 |
| MRR | $2,500 |

| Metric | Target (12 months) |
|--------|-------------------|
| GitHub stars | 5,000 |
| npm downloads/week | 2,000 |
| Active users | 2,000 |
| Paying customers | 200 |
| MRR | $10,000 |

---

## Open Questions

- How to handle multi-repo/monorepo setups?
- Pricing: per-seat vs per-project vs usage-based?
- Self-hosted embeddings vs API for cloud tier?
- What's the killer feature that drives word-of-mouth?
- When to start DevMemory Embed development?

---

## Appendix: MCP Tool Interface

```typescript
// Memory Tools
devmemory_store(type, content, metadata)
devmemory_search(query, filters, limit)
devmemory_get(id)
devmemory_update(id, updates)
devmemory_delete(id)

// Git Tools
devmemory_commit_message(staged_diff)
devmemory_pr_description(branch, base)
devmemory_changelog(from_ref, to_ref)

// Expertise Tools
devmemory_expertise(path?)
devmemory_suggest_reviewers(files)

// Docs Tools
devmemory_generate_docs(type, options)
devmemory_check_drift()
devmemory_adr_create(decision_id)
```

---
---

## Architecture Deep Dive

### Hybrid Data Model: Postgres + Qdrant

We use Better Auth for authentication, which requires PostgreSQL. But since we have Postgres anyway, we leverage it for everything it's good at — while keeping Qdrant focused on vector search.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Clean Separation                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  PostgreSQL                           Qdrant                         │
│  (Relational data)                    (Vector search)                │
│  ──────────────────                   ─────────────────              │
│  ├── users, sessions, accounts        ├── memories                   │
│  ├── teams, memberships               │   ├── vector embeddings      │
│  ├── projects, settings               │   ├── content payload        │
│  ├── api_keys, permissions            │   └── references → PG ids   │
│  ├── usage_logs, analytics            │                              │
│  ├── audit_events                     └── (search only)              │
│  ├── webhook_configs                                                 │
│  ├── billing_state                                                   │
│  └── feature_flags                                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Why Postgres (Beyond Auth)

| Feature | Why Postgres Helps |
|---------|-------------------|
| **Usage analytics** | Track queries, token savings, feature usage — aggregate queries |
| **Team management** | Roles, permissions, inheritance — relational by nature |
| **Project settings** | Configs, preferences, integrations per project |
| **API keys** | User-generated keys, scopes, rate limits, rotation |
| **Audit logs** | Queryable history with JOINs (who changed what, when) |
| **Billing state** | Usage caps, plan limits, overage tracking |
| **Webhook configs** | Per-team webhook URLs, secrets, retry state |
| **Activity feeds** | "Sarah added a decision" — relational joins |
| **Rate limiting** | Sliding window counters, abuse prevention |
| **Memory metadata** | Stats that Qdrant shouldn't compute (counts, aggregates) |

### PostgreSQL Schema

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL Schema                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  CORE (Better Auth)                                                  │
│  ──────────────────                                                  │
│  users ──────────┬──────────── sessions                             │
│    │             └──────────── accounts (oauth)                     │
│    │                                                                 │
│    ├── memberships ────────── teams                                 │
│    │                            │                                    │
│    │                            └──── projects                      │
│    │                                     │                           │
│    └── api_keys                          └──── memory_metadata      │
│                                                 (references Qdrant)  │
│                                                                      │
│  FEATURES                                                            │
│  ────────                                                            │
│  usage_logs ────── per query token tracking                         │
│  audit_events ──── who did what when                                │
│  webhook_configs ─ per-project webhook setup                        │
│  git_connections ─ github/gitlab oauth + repo links                 │
│  notifications ─── delivery queue + preferences                     │
│                                                                      │
│  BILLING                                                             │
│  ───────                                                             │
│  plans ─────────── feature limits, pricing                          │
│  subscriptions ─── stripe subscription state                        │
│  usage_snapshots ─ monthly rollups for invoicing                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Qdrant Schema

Qdrant stays focused on what it's best at — vector search with payload filtering:

```typescript
// Qdrant collection: memories
{
  id: "mem_abc123",
  vector: [0.123, 0.456, ...],
  payload: {
    // Content (searchable)
    type: "decision",
    title: "Use JWT with refresh tokens",
    content: "Full reasoning and context...",
    tags: ["auth", "security"],
    
    // References to Postgres (for joins/filtering)
    project_id: "proj_xyz",
    created_by: "user_123",
    team_id: "team_456",
    
    // Git context
    related_files: ["src/auth/*"],
    git_commit: "abc123",
    source_pr: "#142",
    experts: ["@sarah"],
    
    // Timestamps
    created_at: "2025-01-15T10:00:00Z",
    updated_at: "2025-01-15T10:00:00Z"
  }
}
```

### Query Flow

```
User searches "how do we handle auth?"
              │
              ▼
┌─────────────────────────────┐
│  1. Qdrant vector search    │
│     Returns memory IDs +    │
│     basic payload           │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  2. Postgres enrichment     │
│     - Creator name/avatar   │
│     - Team info             │
│     - Permission check      │
│     - Usage logging         │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  3. Return combined result  │
└─────────────────────────────┘
```

### What Postgres Enables

**1. Real Analytics Dashboard**

```sql
-- Token savings this month
SELECT 
  DATE_TRUNC('day', created_at) as day,
  SUM(tokens_saved) as saved,
  COUNT(*) as queries
FROM usage_logs
WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
GROUP BY 1;
```

**2. Team Permissions with Inheritance**

```sql
-- User's effective permissions across all teams
SELECT 
  t.name as team,
  p.name as project,
  m.role,
  array_agg(DISTINCT perm.name) as permissions
FROM memberships m
JOIN teams t ON t.id = m.team_id
JOIN projects p ON p.team_id = t.id
JOIN role_permissions rp ON rp.role = m.role
JOIN permissions perm ON perm.id = rp.permission_id
WHERE m.user_id = $1
GROUP BY t.name, p.name, m.role;
```

**3. Activity Feed**

```sql
-- Recent team activity
SELECT 
  u.name as actor,
  ae.action,
  ae.resource_type,
  ae.metadata,
  ae.created_at
FROM audit_events ae
JOIN users u ON u.id = ae.user_id
WHERE ae.team_id = $1
ORDER BY ae.created_at DESC
LIMIT 50;
```

**4. Stale Memory Detection**

```sql
-- Find memories that might be outdated
SELECT 
  m.id,
  m.title,
  m.updated_at,
  COUNT(fc.id) as file_changes_since
FROM memory_metadata m
JOIN file_changes fc ON fc.file_path = ANY(m.related_files)
  AND fc.created_at > m.updated_at
WHERE m.project_id = $1
GROUP BY m.id, m.title, m.updated_at
HAVING COUNT(fc.id) > 3;
```

---

## Local vs Cloud Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Deployment Modes                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  FREE (Local)                         PAID (Cloud)                       │
│  ────────────────                     ─────────────────                  │
│                                                                          │
│  User's Machine                       DevMemory Cloud                    │
│  ┌─────────────────┐                 ┌─────────────────────────────┐   │
│  │  MCP Server     │                 │  API Server (Bun)           │   │
│  │  (Bun)          │                 ├─────────────────────────────┤   │
│  ├─────────────────┤                 │  Better Auth                │   │
│  │  SQLite         │                 │  PostgreSQL (Neon)          │   │
│  │  (config only)  │                 ├─────────────────────────────┤   │
│  ├─────────────────┤                 │  Qdrant Cloud               │   │
│  │  Qdrant         │                 │  (namespaced by team)       │   │
│  │  (embedded)     │                 └─────────────────────────────┘   │
│  └─────────────────┘                                                    │
│                                                                          │
│  Single user                          Multi-user, teams                  │
│  No account needed                    Full auth + permissions            │
│  Data stays local                     Cloud sync + backup                │
│                                                                          │
│  Cost: $0                             Cost: $19-49/user/month            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

| Component | Local (Free) | Cloud (Paid) |
|-----------|--------------|--------------|
| Auth | None (single user) | Better Auth + Postgres |
| Metadata | SQLite | PostgreSQL (Neon) |
| Vectors | Qdrant (embedded) | Qdrant Cloud |
| Analytics | None | Full dashboard |
| Teams | None | Full support |
| API Keys | None | Yes |
| Webhooks | None | GitHub/GitLab integration |

**No sync between local and cloud.** Free = local only. Paid = cloud only. Clean separation, no complexity.

---

## Revised Infrastructure Costs

### Cloud Tier

| Service | Provider | Cost/month |
|---------|----------|------------|
| API Server | Railway | $5-20 |
| PostgreSQL | Neon | $0-25 |
| Qdrant | Qdrant Cloud | $25-95 |
| Redis (queues) | Upstash | $0-10 |
| Blob storage | Cloudflare R2 | $0 |
| **Total** | | **$30-150** |

### Cost by Stage

| Stage | Users | Infrastructure | Revenue | Margin |
|-------|-------|----------------|---------|--------|
| Early | 0-100 | ~$50/mo | ~$1,500 | 97% |
| Growth | 100-500 | ~$150/mo | ~$10,000 | 98% |
| Scale | 500-2000 | ~$400/mo | ~$40,000 | 99% |

---

## Additional Features to Drive Adoption

### 1. "Ask Your Codebase" Mode

Natural language queries with deep context:

```
User: "How do we handle failed payments?"

DevMemory: "Based on your codebase:

1. Webhook receives Stripe event (src/webhooks/stripe.ts:47)
2. Failed payments trigger retry logic (max 3 attempts)
3. After 3 failures, user email sent via sendPaymentFailedEmail()
4. Decision from March: Don't auto-cancel, just restrict access

@alex wrote most of this code. Want me to find related patterns?"
```

### 2. Onboarding Mode

New dev joins → DevMemory becomes their guide:

```bash
devmemory onboard

Welcome to Acme Corp codebase!

📁 Project Structure
├── Next.js 14 app with App Router
├── Database: Prisma + PostgreSQL
├── Key decision: We don't use Redux (see AUTH-001)

🎯 Start Here
├── Read: src/lib/README.md
├── Setup: Run `pnpm setup` (not npm!)
├── First task: Good first issues in GitHub

👥 Who to Ask
├── Auth → @sarah
├── Payments → @alex  
├── Infra → @mike

Want a guided tour of any area?
```

### 3. Code Review Assistant

PR opened → DevMemory adds context automatically:

```markdown
## 🧠 DevMemory Context

This PR touches authentication code.

**Relevant decisions:**
- AUTH-001: Use rotating refresh tokens (Jan 15)
- AUTH-003: Never store tokens in localStorage (Feb 2)

**Patterns to follow:**
- All auth errors should use `AuthError` class
- Token refresh through `refreshToken()` helper

**Suggested reviewers:**
- @sarah (73% of auth commits)

**⚠️ Potential issues:**
- Line 47: Using localStorage for token — violates AUTH-003
```

### 4. Slack/Discord Bot

Query memories from team chat:

```
@devmemory why do we use Prisma?

DevMemory: Team decided on Prisma (Jan 15) because:
• Type safety with TypeScript
• Great migration system  
• Better DX than Drizzle at the time

Alternatives considered: Drizzle, Kysely, raw SQL
Decision by: @sarah, @mike

🔗 View full context
```

### 5. Weekly Digest

Automated team email/Slack:

```
📊 Acme Corp — Week of Dec 2-8

Knowledge Changes:
├── 4 new decisions recorded
├── 7 solutions captured
├── 2 patterns identified

Code Health:
├── src/payments/* — ⚠️ No documentation
├── src/auth/* — ✅ Well documented
├── src/legacy/* — 🔴 No active experts

Token Savings: 127,000 tokens (~$3.80 saved)

Suggestions:
├── Document webhook retry logic (@alex)
├── 3 memories are stale (>6 months old)
```

### 6. Knowledge Gaps Report

```bash
devmemory health

Codebase Knowledge Health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Coverage by area:
├── src/auth/*       ████████████████████ 95%
├── src/api/*        ████████████░░░░░░░░ 60%
├── src/payments/*   ████████░░░░░░░░░░░░ 40%
├── src/legacy/*     ██░░░░░░░░░░░░░░░░░░ 10%

Missing:
├── No decisions for payment retry logic
├── src/utils/crypto.ts has 0 context (500 lines!)
├── Redis session usage not documented

Stale (>6 months, code changed since):
├── "API rate limiting approach"
└── "Database indexing strategy"

Score: 67/100
```

### 7. IDE Extension (VS Code Sidebar)

```
┌─────────────────────────────────┐
│ 🧠 DevMemory                    │
├─────────────────────────────────┤
│ File: src/auth/login.ts         │
│                                 │
│ Related:                        │
│ ├── Decision: JWT + refresh     │
│ ├── Pattern: Error handling     │
│ ├── Solution: Race condition    │
│                                 │
│ Expert: @sarah (73%)            │
│ Last changed: 2 days ago        │
│                                 │
│ [Ask about this file]           │
└─────────────────────────────────┘
```

### 8. Meeting Notes → Memories

```bash
devmemory import meeting --from notion

Analyzing "Backend Sync - Dec 5"...

Found 3 potential decisions:
├── "Switch to Upstash for Redis" — Save?
├── "Deprecate v1 API by March" — Save?  
├── "Alex owns payments refactor" — Save?

[Save all] [Review each] [Skip]
```

### 9. Dependency Intelligence

```
⚠️ DevMemory Alert

lodash has new CVE: CVE-2025-1234
Used in 47 files, added by @mike (2 years ago)

Your usage:
├── debounce (23 files)
├── throttle (12 files)
├── cloneDeep (12 files)

Suggestion: 
├── debounce/throttle → es-toolkit or native
├── cloneDeep → structuredClone (native)

Want me to create a migration plan?
```

### 10. Interview Prep Generator

```bash
devmemory interview-prep

Generated codebase questions:

Junior:
├── "Walk through how a user logs in"
├── "What database do we use and why?"

Senior:
├── "Why rotating refresh tokens over long-lived?"
├── "How would you improve payment retry logic?"
├── "What's the tradeoff in our caching strategy?"

[Export for interviewers]
```

---

## Feature Priority Matrix

| Feature | Adoption Impact | Effort | Priority |
|---------|-----------------|--------|----------|
| Ask your codebase | 🔥🔥🔥 | Medium | MVP |
| Onboarding mode | 🔥🔥🔥 | Medium | MVP |
| Smart commits/PRs | 🔥🔥🔥 | Low | MVP |
| Slack/Discord bot | 🔥🔥 | Low | V1.1 |
| Weekly digest | 🔥🔥 | Low | V1.1 |
| Code review bot | 🔥🔥🔥 | Medium | V1.1 |
| Knowledge gaps | 🔥🔥 | Low | V1.1 |
| VS Code extension | 🔥🔥 | High | V1.2 |
| Meeting import | 🔥 | Medium | V1.2 |
| Interview prep | 🔥 | Low | V1.2 |
| Dependency intel | 🔥 | Medium | V1.3 |

---

## Updated Value Proposition

```
Before: "Memory layer for AI coding"
After:  "Your codebase's brain — answers questions, onboards devs, 
         writes commits, reviews code, and keeps your team aligned"
```

Not passive storage. Active intelligence that works for you.

---

