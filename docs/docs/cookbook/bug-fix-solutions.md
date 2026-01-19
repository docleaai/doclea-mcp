---
sidebar_position: 2
title: Bug Fix Solutions
description: Recipes for recording bug fixes and solutions for future reference.
keywords: [bugs, solutions, fixes, debugging, troubleshooting]
---

# Bug Fix Solutions

Practical recipes for documenting bug fixes so you never solve the same problem twice.

---

## Why Record Bug Fixes?

- **Prevent re-solving** - Same bugs often recur in similar contexts
- **Speed up debugging** - Past solutions inform current problems
- **Team knowledge** - Share solutions across the team
- **Pattern recognition** - Identify systemic issues

---

## Recipe: Record a Bug Fix

### The Pattern

```
"Store solution: [What was the problem] - [How we fixed it]"
```

### Example

```
"Store solution: Users getting logged out randomly

Problem: JWT tokens expiring earlier than expected

Root cause: Server time was 5 minutes ahead of client time,
causing tokens to appear expired on the client side.

Fix:
1. Added NTP sync to all servers
2. Added 30-second clock skew tolerance to token validation
3. Added monitoring for server time drift

Related files: src/auth/validateToken.ts, src/middleware/auth.ts"
```

### Result

```json
{
  "id": "mem_fix123",
  "type": "solution",
  "title": "JWT token expiry - clock skew fix",
  "content": "Problem: JWT tokens expiring earlier...",
  "importance": 0.7,
  "tags": ["bug", "jwt", "auth", "time-sync"]
}
```

---

## Recipe: Solution with Code Snippet

### The Pattern

Include the actual fix:

```
"Store solution with importance 0.8: Race condition in user registration

Problem: Duplicate users created when double-clicking register button

Root cause: No idempotency check on registration endpoint

Fix: Added idempotency key based on email hash

Code change in src/api/register.ts:

async function register(email: string) {
  const idempotencyKey = hash(email + Date.now().toString().slice(0, -4));

  const existing = await redis.get(`register:${idempotencyKey}`);
  if (existing) {
    return { success: true, userId: existing };
  }

  await redis.set(`register:${idempotencyKey}`, 'pending', 'EX', 60);
  // ... rest of registration
}

Also added: Disable button on click in frontend"
```

---

## Recipe: Error Message Solution

### The Pattern

Document specific error messages:

```
"Store solution: Error 'ECONNREFUSED 127.0.0.1:5432'

Error: ECONNREFUSED 127.0.0.1:5432 when starting application

Cause: PostgreSQL not running or connection string incorrect

Solutions tried:
1. Check if postgres is running: 'docker ps | grep postgres'
2. Verify connection string in .env
3. Check if port 5432 is not blocked

Root cause in our case: DATABASE_URL was missing from .env.local
(was only in .env.example)

Fix: Copy DATABASE_URL from .env.example to .env.local"
```

### Benefits

Searching for the exact error message finds this solution:

```
"Get context for ECONNREFUSED 127.0.0.1:5432"
```

---

## Recipe: Performance Bug Fix

### The Pattern

```
"Store solution: API response time degraded to 5+ seconds

Problem: /api/users endpoint taking 5+ seconds for 100 users

Investigation:
- Database query was fast (50ms)
- N+1 query found: fetching user roles one by one

Root cause: Missing eager loading for user roles

Fix:
Before:
const users = await db.query.users.findMany();
// Then looping to get roles individually

After:
const users = await db.query.users.findMany({
  with: { roles: true }
});

Result: Response time reduced from 5s to 200ms

Prevention: Added query logging in dev to catch N+1 patterns early"
```

---

## Recipe: Link Related Bugs

### The Pattern

Connect bugs that share root causes:

```
# Store related bugs
"Store solution: Memory leak in image processing"
"Store solution: Memory leak in PDF generation"

# Link them
"Link the image processing memory leak to the PDF memory leak"

# Store the common root cause
"Store solution: General memory leak pattern in file processing

Root cause: Streams not being properly closed in error paths

Pattern for all file processing:
1. Always use try/finally for stream cleanup
2. Use 'using' keyword (Node 20+) for automatic cleanup
3. Set timeout on all stream operations"
```

---

## Recipe: Production Incident Solution

### The Pattern

Document production incidents:

```
"Store solution with importance 0.9: Production outage 2024-03-15

Incident: Complete API unavailability for 45 minutes

Timeline:
- 14:00: Alerts fired for 500 errors
- 14:05: Identified database connection pool exhaustion
- 14:15: Attempted restart, issue persisted
- 14:30: Found slow query holding connections
- 14:45: Killed slow queries, service recovered

Root cause:
New report query without timeout ran on production,
holding all connections for 30+ minutes.

Fix:
1. Added statement_timeout to PostgreSQL (30s)
2. Added connection pool timeout (10s)
3. Separated reporting database from main DB

Prevention:
- All queries must have timeout
- Reporting queries go to replica
- Added monitoring for connection pool usage"
```

---

## Recipe: Browser/Environment-Specific Bug

### The Pattern

```
"Store solution: Safari not sending cookies

Problem: Authentication failing on Safari but working on Chrome

Investigation:
- Cookies not being sent with requests
- SameSite=Strict was blocking cross-site cookies

Root cause: Safari's stricter cookie handling with SameSite

Fix:
Changed cookie settings:
{
  sameSite: 'lax',  // was 'strict'
  secure: true,
  httpOnly: true
}

Note: For fully cross-site cookies, need sameSite: 'none'
but this requires secure: true and HTTPS"
```

---

## Recipe: Search for Similar Bugs

### Find by Error Type

```
"Get context for null pointer errors"
"Show all solutions related to memory leaks"
"What bugs have we had with authentication?"
```

### Find by Component

```
"Show solutions for the payment system"
"What bugs have we fixed in the API layer?"
```

### Find by Symptoms

```
"Get context for slow database queries"
"Show solutions for timeout errors"
```

---

## Recipe: Bug Pattern Recognition

### The Pattern

After fixing several similar bugs:

```
"Store pattern: Preventing race conditions

We've had multiple race condition bugs. Common pattern for prevention:

1. Database-level: Use transactions with SELECT FOR UPDATE
2. Application-level: Use Redis locks for distributed locking
3. UI-level: Disable buttons during async operations

Example lock helper:
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const lock = await redis.set(key, '1', 'NX', 'EX', 30);
  if (!lock) throw new Error('Operation in progress');
  try {
    return await fn();
  } finally {
    await redis.del(key);
  }
}

Related bugs:
- Duplicate user registration
- Double payment processing
- Concurrent inventory updates"
```

---

## Recipe: Debugging Checklist

### Create a Debugging Checklist

```
"Store note: Debugging checklist for API issues

1. Check logs: 'docker logs api-container --tail 100'

2. Verify environment:
   - DATABASE_URL is set
   - All required env vars present
   - Node version matches .nvmrc

3. Database connectivity:
   - Can connect with psql?
   - Are migrations up to date?

4. Common issues:
   - Port already in use: 'lsof -i :3000'
   - Node modules outdated: 'rm -rf node_modules && bun install'
   - TypeScript errors: 'bun run typecheck'

5. If still stuck:
   - Search existing solutions: 'What solutions do we have for [error]?'
   - Check recent changes: 'git log --oneline -20'"
```

---

## Recipe: Test Case from Bug

### The Pattern

Document the test that prevents regression:

```
"Store solution: Date parsing bug in user birthdays

Problem: Users born on the 1st of the month showed wrong date

Root cause: Off-by-one error in date parsing (0-indexed months)

Fix: Changed 'month - 1' to 'month' (was already 0-indexed)

Regression test added:
describe('birthday parsing', () => {
  it('handles first of month correctly', () => {
    const result = parseBirthday('1990-01-01');
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(1);
  });

  it('handles last of month correctly', () => {
    const result = parseBirthday('1990-01-31');
    expect(result.getDate()).toBe(31);
  });
});

Test file: src/__tests__/utils/date.test.ts"
```

---

## Recipe: Fix Categorization

### Tag Consistently for Discovery

| Tag | Use For |
|-----|---------|
| `bug` | All bug fixes |
| `performance` | Slow code fixes |
| `memory-leak` | Memory issues |
| `security` | Security fixes |
| `regression` | Bugs from previous fixes |
| `edge-case` | Unusual input handling |
| `race-condition` | Concurrency bugs |
| `browser-compat` | Browser-specific issues |

### Example with Tags

```json
{
  "title": "Safari cookie bug",
  "tags": ["bug", "browser-compat", "auth", "cookies", "safari"]
}
```

---

## Best Practices

### 1. Record While Fresh

Document immediately after fixing:

```
"Store solution: Just fixed - users seeing stale data after update.
Cache invalidation wasn't happening on PUT requests. Added cache.del()
call in update handler."
```

### 2. Include Search Terms

Use error messages and symptoms:

```
"Store solution: 'TypeError: Cannot read property of undefined'
in user profile component..."
```

### 3. Document What Didn't Work

Failed attempts save future time:

```
"Tried:
1. Clearing cache - didn't help
2. Restarting service - temporary fix
3. Increasing timeout - didn't help

Actual fix: Connection pool was exhausted"
```

### 4. Link to Issues/PRs

```
"Store solution: Fix for memory leak in image processing

GitHub issue: #234
PR: #235
Related Slack thread: [link]"
```

---

## See Also

- [Memory Management](../guides/memory-management) - General memory operations
- [Context Building](../guides/context-building) - Using solutions as context
- [Code Patterns](./code-patterns) - Preventing bugs with patterns
