---
sidebar_position: 1
title: Architecture Decisions
description: Recipes for recording and leveraging architectural decisions with Doclea.
keywords: [ADR, architecture, decisions, documentation, patterns]
---

# Architecture Decisions

Practical recipes for recording, organizing, and leveraging architectural decisions in your codebase.

---

## Why Track Architecture Decisions?

Architecture Decision Records (ADRs) capture the "why" behind technical choices:

- **Context preservation** - Remember why decisions were made
- **Onboarding** - Help new team members understand the codebase
- **Consistency** - Ensure future work aligns with established patterns
- **Review** - Enable periodic reassessment of past decisions

---

## Recipe: Record a New Decision

### The Pattern

```
"Store decision: [What you decided] because [why you decided it]"
```

### Example

```
"Store decision: We chose PostgreSQL over MongoDB for the user database
because we need ACID compliance for financial transactions and complex
relational queries. MongoDB was considered but rejected due to eventual
consistency concerns with money."
```

### Result

```json
{
  "id": "mem_abc123",
  "type": "decision",
  "title": "PostgreSQL for user database",
  "content": "We chose PostgreSQL over MongoDB...",
  "importance": 0.8,
  "tags": ["database", "architecture", "postgres"]
}
```

---

## Recipe: Decision with Alternatives

### The Pattern

Document what was considered and rejected:

```
"Store decision with title 'Authentication Strategy':
We chose JWT tokens for authentication.

Alternatives considered:
- Session cookies: Rejected due to scaling concerns with sticky sessions
- OAuth only: Rejected as we need internal auth for service-to-service

Decision rationale:
- Stateless verification across services
- Easy horizontal scaling
- Clear token expiry handling"
```

### When to Use

- Major architectural choices
- Decisions that will be questioned later
- Choices between popular alternatives

---

## Recipe: Technology Stack Decision

### The Pattern

Record your stack choices together:

```
"Store architecture: Project Stack for my-saas-app

Frontend: Next.js 14 with App Router
- Reason: Server components for performance, great DX

Backend: Node.js with Hono
- Reason: Fast, TypeScript-native, edge-ready

Database: PostgreSQL with Drizzle ORM
- Reason: Type-safe queries, great migration story

Auth: Better Auth
- Reason: Self-hosted, flexible, good Next.js integration

Hosting: Vercel (frontend) + Railway (backend)
- Reason: Serverless scaling, easy deployment"
```

### Benefits

- Single reference for stack overview
- Helps onboarding
- Context for all other decisions

---

## Recipe: Migration Decision

### The Pattern

Document before starting migrations:

```
"Store decision with importance 0.9: Migrate from REST to tRPC

Current state: REST API with manual type definitions
Target state: tRPC with end-to-end type safety

Migration plan:
1. Add tRPC alongside existing REST endpoints
2. Migrate endpoints one by one, starting with least critical
3. Update frontend to use tRPC client
4. Deprecate REST endpoints after 2 sprints
5. Remove REST endpoints in v2.0

Risks:
- Breaking changes for external API consumers
- Learning curve for team

Mitigation:
- Keep REST for external API, tRPC for internal only
- Pair programming sessions for knowledge transfer"
```

---

## Recipe: Link Related Decisions

### The Pattern

Connect decisions that affect each other:

```
# First, store the decisions
"Store decision: Use PostgreSQL for primary database"
"Store decision: Use Redis for caching layer"
"Store decision: Use Drizzle ORM for database access"

# Then link them
"Link the PostgreSQL decision to the Redis caching decision"
"Link the PostgreSQL decision to the Drizzle ORM decision"
```

### Result

Querying for database context returns all related decisions:

```
"Get context about our database architecture"
```

Returns PostgreSQL decision plus linked Redis and Drizzle decisions.

---

## Recipe: Supersede an Old Decision

### The Pattern

When replacing an old decision:

```
"Store decision: Migrate from Prisma to Drizzle ORM

The previous decision to use Prisma is superseded because:
- Build times became unacceptable (2+ minutes for schema changes)
- Type inference with complex queries was problematic
- Drizzle offers better performance and simpler mental model"

# Mark the relationship
"Mark the Drizzle decision as superseding the Prisma decision"
```

### Benefits

- Maintains history of decision evolution
- Old decision stays for context
- New decision clearly marked as current

---

## Recipe: Periodic Decision Review

### The Pattern

Quarterly review of architectural decisions:

```
# Find all decisions
"List all memories of type decision"

# Check which might be stale
"Show decisions older than 6 months that haven't been accessed"

# Review high-importance decisions
"Show all decisions with importance above 0.8"
```

### Review Questions

For each decision, ask:

1. Is the original rationale still valid?
2. Have circumstances changed?
3. Are there better alternatives now?
4. Is the decision still being followed?

---

## Recipe: Decision Templates

### API Design Decision

```
"Store decision: REST API Design Standards

Versioning: URL-based (/api/v1/)
Errors: RFC 7807 Problem Details format
Pagination: Cursor-based with limit parameter
Authentication: Bearer tokens in Authorization header
Rate limiting: 100 requests/minute per API key

Example error response:
{
  \"type\": \"https://api.example.com/errors/validation\",
  \"title\": \"Validation Error\",
  \"status\": 400,
  \"detail\": \"Email format is invalid\"
}"
```

### Security Decision

```
"Store decision with importance 0.95: Authentication Security Standards

Password requirements:
- Minimum 12 characters
- bcrypt with cost factor 12
- No password in logs or error messages

Session management:
- JWT access tokens: 15 minute expiry
- Refresh tokens: 7 day expiry, rotated on use
- Tokens stored in httpOnly cookies

Rate limiting:
- Login: 5 attempts per minute
- Password reset: 3 per hour
- API: 100 per minute per user"
```

### Infrastructure Decision

```
"Store decision: Kubernetes Deployment Strategy

Cluster: GKE Autopilot (managed control plane)
Namespace strategy: One per environment (dev, staging, prod)

Deployments:
- Rolling updates with maxSurge=1, maxUnavailable=0
- Readiness probes required for all services
- Resource limits mandatory

Secrets:
- External Secrets Operator syncing from GCP Secret Manager
- No secrets in ConfigMaps or environment variables"
```

---

## Recipe: Decision Search Patterns

### Find Decisions by Domain

```
"Show all decisions related to authentication"
"List database-related architectural decisions"
"What decisions have we made about the payment system?"
```

### Find Decisions by Time

```
"Show decisions made in the last month"
"What architectural changes were made in Q4?"
```

### Find High-Impact Decisions

```
"Show all decisions with importance 0.9 or higher"
"List critical architectural decisions"
```

---

## Recipe: Decision-Driven Development

### Before Starting Work

```
# Get relevant context
"Get context for implementing user notifications"

# AI sees existing decisions
# - "We use PostgreSQL for data storage"
# - "We follow REST API standards with RFC 7807 errors"
# - "All async operations use a job queue"
```

### During Implementation

The AI automatically follows established patterns because it has context about:
- Database choices
- API standards
- Code patterns
- Security requirements

### After Implementation

```
# If new decisions were made, record them
"Store decision: Notifications use a separate events table
with a denormalized structure for read performance"
```

---

## Recipe: ADR File Generation

### Export Decisions to ADR Format

```
"Export all architecture decisions as ADR markdown files"
```

### Standard ADR Format

```markdown
# ADR-001: PostgreSQL for User Database

## Status

Accepted

## Context

We need a database for storing user data including profiles,
preferences, and transaction history.

## Decision

We will use PostgreSQL.

## Consequences

### Positive
- ACID compliance for financial data
- Rich query capabilities
- Mature ecosystem

### Negative
- Requires more ops knowledge than managed solutions
- Horizontal scaling is more complex

## Alternatives Considered

- MongoDB: Rejected due to eventual consistency
- DynamoDB: Rejected due to vendor lock-in
```

---

## Best Practices

### 1. Record Decisions When Made

Don't wait - context fades quickly:

```
"Store decision: Just decided to use Zod for validation because
TypeScript inference is excellent and runtime + compile-time
validation from single source of truth"
```

### 2. Include the "Why"

The rationale is more valuable than the choice:

```
❌ "We use Redis for caching"
✅ "We use Redis for caching because we need sub-millisecond
   response times for session lookups and Redis offers better
   pub/sub than Memcached for our real-time features"
```

### 3. Tag Consistently

Use predictable tags for discovery:

```json
{
  "tags": ["architecture", "database", "decision"]
}
```

### 4. Set Appropriate Importance

| Importance | Use For |
|------------|---------|
| 0.9-1.0 | Critical/irreversible decisions |
| 0.7-0.8 | Important architectural choices |
| 0.5-0.6 | Standard technical decisions |
| 0.3-0.4 | Minor preferences |

---

## See Also

- [Memory Management](../guides/memory-management) - General memory operations
- [Context Building](../guides/context-building) - Leveraging decisions as context
- [doclea_store](../api/memory/store) - API reference for storing memories
