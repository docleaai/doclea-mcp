---
sidebar_position: 4
title: Team Workflows
description: Recipes for using Doclea effectively in team environments.
keywords: [team, collaboration, workflow, onboarding, sharing]
---

# Team Workflows

Practical recipes for leveraging Doclea across your development team.

---

## Why Team Workflows?

- **Shared knowledge** - Everyone accesses the same context
- **Faster onboarding** - New members get up to speed quickly
- **Consistent decisions** - Team follows established patterns
- **Reduced bus factor** - Knowledge isn't siloed

---

## Recipe: Team Setup

### Shared Docker Instance

Run a shared Doclea server:

```yaml
# docker-compose.yml
version: '3.8'
services:
  doclea:
    image: ghcr.io/doclea/doclea-mcp:latest
    ports:
      - "3000:3000"
    environment:
      - DOCLEA_STORAGE_TYPE=postgres
      - DOCLEA_DATABASE_URL=postgres://doclea:secret@postgres/doclea
    volumes:
      - ./project:/app/project:ro

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: doclea
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: doclea
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
```

### Team Client Configuration

Each team member configures their client:

```json
{
  "mcpServers": {
    "doclea": {
      "transport": "http",
      "url": "http://doclea-server.internal:3000/mcp"
    }
  }
}
```

---

## Recipe: New Team Member Onboarding

### Step 1: Initialize Context

```
"Get overview context for this project"
```

Returns:
- Project stack and architecture
- Key decisions
- Coding patterns
- Team conventions

### Step 2: Explore by Area

```
"Get context for the authentication system"
"Show all decisions about the database"
"What patterns do we use for API development?"
```

### Step 3: Understand History

```
"Show major architectural decisions from the last 6 months"
"What bugs have we had with payments?"
"Who are the experts on the frontend?"
```

### Create Onboarding Checklist

```
"Store note: Onboarding checklist for new developers

Week 1:
- [ ] Set up development environment
- [ ] Read architecture decisions: 'List decisions with importance > 0.8'
- [ ] Understand patterns: 'Show all code patterns'
- [ ] Review recent solutions: 'Show solutions from last month'

Week 2:
- [ ] First PR with pairing
- [ ] Review code expertise: 'Who owns [area I'm working on]?'
- [ ] Store first memory documenting learning

Week 3:
- [ ] Solo PR with context
- [ ] Participate in decision documentation"
```

---

## Recipe: Decision Making Process

### Before Making Decisions

```
"Get context for [decision area]"
```

See what's already been decided to avoid conflicts.

### During Decision Meeting

Document as you discuss:

```
"Store decision with importance 0.8: [Decision title]

Context: [What prompted this decision]

Options considered:
1. [Option A]: [Pros/Cons]
2. [Option B]: [Pros/Cons]

Decision: [What we chose]

Rationale: [Why]

Attendees: [Who was involved]"
```

### After Decision

```
"Link this decision to related patterns"
"Update any affected patterns or notes"
```

---

## Recipe: Code Review with Context

### Before Reviewing

```
"Get context for reviewing changes to [file/area]"
```

Understand:
- Relevant patterns to check against
- Past decisions that apply
- Previous bugs in this area

### During Review

Check against team standards:

```
"Show error handling pattern"
"What's our API response format?"
"Show testing patterns"
```

### Suggesting Reviewers

```
"Who should review these files: [list]"
```

Get expertise-based suggestions.

---

## Recipe: Sprint Planning with Context

### Before Planning

```
# Understand the area we're working on
"Get context for the payment system"

# Check expertise
"Show expertise map for src/payments"

# Review past issues
"What bugs have we had in payments?"
```

### During Planning

When estimating complexity:

```
"Show related decisions for [feature]"
"What patterns apply to [feature]?"
"Have we solved similar problems before?"
```

### After Planning

```
"Store note: Sprint 23 focus areas - Payment refactoring

Key decisions to follow:
- Use existing transaction pattern
- Maintain backwards compatibility
- Add feature flag for gradual rollout

Assigned experts:
- Alice: Core payment logic
- Bob: API integration
- Charlie: Frontend updates"
```

---

## Recipe: Knowledge Transfer

### Identify Knowledge Gaps

```
"Show paths with bus factor of 1"
"Who are the sole experts on critical systems?"
```

### Plan Transfer Sessions

```
"Store note: Knowledge transfer plan Q2

Priority 1 (bus factor = 1):
- Auth system: Alice → Bob (2 sessions)
- Payment processing: Charlie → Dana (3 sessions)

Priority 2 (bus factor = 2):
- User management: Add Eve as third expert

Schedule: Bi-weekly pairing sessions"
```

### Document During Sessions

```
"Store pattern: [Pattern learned in session]"
"Store note: [Key insight from expert]"
```

### Track Progress

```
"Re-run expertise analysis for auth system"
// Compare bus factor before and after
```

---

## Recipe: Incident Response

### During Incident

Quick context gathering:

```
"Get context for [affected system]"
"Show recent solutions for [error type]"
"Who are the experts on [affected area]?"
```

### After Resolution

Document immediately:

```
"Store solution with importance 0.9: Production incident [date]

Impact: [What was affected]
Duration: [How long]
Root cause: [What caused it]
Fix: [What we did]
Prevention: [What we'll do differently]"
```

### Post-Mortem

```
"Store decision: Post-incident improvements

Based on [incident], we're implementing:
1. [Improvement 1]
2. [Improvement 2]

Related solutions: [Link to incident memory]"
```

---

## Recipe: Documentation Sync

### Export for Documentation

```
# Export all decisions as ADRs
"Export architecture decisions to markdown"

# Export patterns as documentation
"Export all patterns to docs folder"
```

### Keep in Sync

```
# Find documentation that might be stale
"Show decisions updated in last month"
"Show patterns that changed recently"
```

### Documentation Review

```
"Store note: Documentation review Q1

Updated docs:
- Architecture overview (reflects new microservices)
- API reference (new endpoints added)
- Deployment guide (new k8s setup)

Pending:
- Auth docs need update after MFA addition"
```

---

## Recipe: Cross-Team Communication

### Sharing Context with Other Teams

```
"Export decisions tagged 'api-contract'"
"Export patterns for external API usage"
```

### Receiving Context

When another team shares memories:

```
"Import team-backend's API decisions"
```

### Interface Decisions

```
"Store decision: API contract between frontend and backend

Agreed format:
- REST with JSON
- Authentication via Bearer tokens
- Pagination: cursor-based
- Errors: RFC 7807

Frontend team contact: Alice
Backend team contact: Bob

Review schedule: Quarterly"
```

---

## Recipe: Meeting Notes to Memories

### During Technical Meetings

```
"Store note: Architecture meeting [date]

Attendees: [names]

Discussed:
1. [Topic 1]: [Outcome]
2. [Topic 2]: [Outcome]

Decisions made:
- [Decision 1]
- [Decision 2]

Action items:
- [ ] [Person]: [Task]"
```

### Extract Decisions

After meeting, formalize decisions:

```
"Store decision: [Formal decision from meeting]"
"Link this decision to the meeting notes"
```

---

## Recipe: Team Memory Hygiene

### Weekly Review

```
# Find potentially stale memories
"Show memories not accessed in 30 days"

# Find low-quality memories
"Show memories with importance below 0.3"
```

### Monthly Cleanup

```
# Archive superseded decisions
"Show decisions that have been superseded"
"Archive decision [id]"

# Consolidate duplicate patterns
"Show all patterns about error handling"
// Merge if redundant
```

### Quarterly Audit

```
# Full inventory
"Generate report of all memories by type"

# Check coverage
"What areas don't have documented decisions?"

# Review importance
"Recalibrate importance scores based on access patterns"
```

---

## Best Practices

### 1. Assign Memory Ownership

```
"Store note: Memory ownership assignments

Architecture decisions: Tech Lead reviews
Code patterns: Senior devs can add, lead approves
Solutions: Anyone can add
Notes: Anyone can add"
```

### 2. Use Consistent Tagging

```
"Store note: Team tagging conventions

Required tags by type:
- Decisions: domain (auth, payment, etc.)
- Patterns: language/framework, layer
- Solutions: bug, affected-system

Optional tags:
- team, sprint, priority"
```

### 3. Regular Context Sharing

```
# In standup
"What decisions were made yesterday?"

# In retro
"Store lessons learned from this sprint"
```

### 4. Integrate with Existing Tools

Link to external systems:

```
"Store decision: Use Jira for tickets

All Jira references use format: PROJ-123
Link in memories: 'Related ticket: PROJ-123'

All decisions should reference:
- Jira epic if applicable
- Confluence page if detailed
- GitHub PR if code-related"
```

---

## See Also

- [Architecture Decisions](./architecture-decisions) - Decision recording
- [Code Expertise](../guides/code-expertise) - Expertise tracking
- [Docker Setup](../installation/docker) - Team deployment
