---
sidebar_position: 3
title: Code Patterns
description: Recipes for documenting and applying reusable code patterns.
keywords: [patterns, code, templates, best practices, reusable]
---

# Code Patterns

Practical recipes for documenting and leveraging reusable code patterns across your codebase.

---

## Why Document Code Patterns?

- **Consistency** - Same approach across the codebase
- **Onboarding** - New developers learn patterns quickly
- **Quality** - Proven patterns prevent bugs
- **Speed** - No need to reinvent solutions

---

## Recipe: Store a Code Pattern

### The Pattern

```
"Store pattern: [Pattern name] - [What it's for]

[Code example]

When to use: [Conditions]
When NOT to use: [Anti-patterns]"
```

### Example

```
"Store pattern: Repository pattern for data access

All database operations go through repository classes that abstract
the underlying storage.

Example:
class UserRepository {
  constructor(private db: Database) {}

  async findById(id: string): Promise<User | null> {
    return this.db.query.users.findFirst({
      where: eq(users.id, id)
    });
  }

  async create(data: CreateUserInput): Promise<User> {
    const [user] = await this.db.insert(users).values(data).returning();
    return user;
  }
}

When to use:
- Any database operation
- Want to swap databases later
- Need to add caching/logging uniformly

When NOT to use:
- Simple scripts
- One-off queries in migrations"
```

---

## Recipe: Error Handling Pattern

### The Pattern

```
"Store pattern: Standardized error handling with RFC 7807

All API errors follow RFC 7807 Problem Details format.

Error class:
class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }

  toJSON() {
    return {
      type: `https://api.example.com/errors/${this.code}`,
      title: this.code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      status: this.status,
      detail: this.message,
      ...(this.details && { errors: this.details })
    };
  }
}

Usage:
throw new AppError(400, 'validation_error', 'Email is invalid', {
  field: 'email',
  constraint: 'format'
});

Response:
{
  \"type\": \"https://api.example.com/errors/validation_error\",
  \"title\": \"Validation Error\",
  \"status\": 400,
  \"detail\": \"Email is invalid\",
  \"errors\": { \"field\": \"email\", \"constraint\": \"format\" }
}"
```

---

## Recipe: API Endpoint Pattern

### The Pattern

```
"Store pattern: REST API endpoint structure

Every API endpoint follows this structure:

1. Input validation (Zod schema)
2. Authentication check
3. Authorization check
4. Business logic
5. Response formatting

Example:
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2)
});

app.post('/users', async (c) => {
  // 1. Validate input
  const input = createUserSchema.parse(await c.req.json());

  // 2. Auth check (middleware handles this)
  const user = c.get('user');

  // 3. Authorization
  if (!user.permissions.includes('users:create')) {
    throw new AppError(403, 'forbidden', 'Cannot create users');
  }

  // 4. Business logic
  const newUser = await userService.create(input);

  // 5. Response
  return c.json({ data: newUser }, 201);
});

File structure:
src/api/
  users/
    create.ts    # Handler
    schema.ts    # Zod schemas
    index.ts     # Route registration"
```

---

## Recipe: React Component Pattern

### The Pattern

```
"Store pattern: React component structure

All components follow this structure:

// 1. Types at the top
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

// 2. Constants
const variants = {
  primary: 'bg-blue-500 text-white',
  secondary: 'bg-gray-200 text-gray-800'
};

const sizes = {
  sm: 'px-2 py-1 text-sm',
  md: 'px-4 py-2',
  lg: 'px-6 py-3 text-lg'
};

// 3. Component with default exports
export function Button({
  variant = 'primary',
  size = 'md',
  children,
  onClick,
  disabled = false
}: ButtonProps) {
  return (
    <button
      className={cn(variants[variant], sizes[size])}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// 4. Display name for dev tools
Button.displayName = 'Button';"
```

---

## Recipe: Testing Pattern

### The Pattern

```
"Store pattern: Test file structure

All test files follow AAA pattern: Arrange, Act, Assert

describe('UserService', () => {
  // Setup shared fixtures
  let db: TestDatabase;
  let service: UserService;

  beforeEach(async () => {
    db = await createTestDatabase();
    service = new UserService(db);
  });

  afterEach(async () => {
    await db.cleanup();
  });

  describe('create', () => {
    it('creates a user with valid input', async () => {
      // Arrange
      const input = { email: 'test@example.com', name: 'Test' };

      // Act
      const result = await service.create(input);

      // Assert
      expect(result.email).toBe(input.email);
      expect(result.id).toBeDefined();
    });

    it('throws on duplicate email', async () => {
      // Arrange
      const input = { email: 'test@example.com', name: 'Test' };
      await service.create(input);

      // Act & Assert
      await expect(service.create(input))
        .rejects.toThrow('Email already exists');
    });
  });
});"
```

---

## Recipe: Async Operation Pattern

### The Pattern

```
"Store pattern: Async operation with proper error handling

All async operations follow this pattern:

async function fetchUserData(userId: string): Promise<Result<User, Error>> {
  try {
    // Timeout for all external calls
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`/api/users/${userId}`, {
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return err(new Error(`HTTP ${response.status}`));
    }

    const data = await response.json();
    return ok(data);

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return err(new Error('Request timeout'));
    }
    return err(error instanceof Error ? error : new Error('Unknown error'));
  }
}

Usage:
const result = await fetchUserData('123');
if (result.isErr()) {
  console.error('Failed:', result.error);
  return;
}
const user = result.value;"
```

---

## Recipe: Database Transaction Pattern

### The Pattern

```
"Store pattern: Database transaction with rollback

All multi-step database operations use transactions:

async function transferMoney(
  fromId: string,
  toId: string,
  amount: number
): Promise<void> {
  await db.transaction(async (tx) => {
    // Get accounts with row-level locking
    const [from, to] = await Promise.all([
      tx.query.accounts.findFirst({
        where: eq(accounts.id, fromId),
        for: 'update'
      }),
      tx.query.accounts.findFirst({
        where: eq(accounts.id, toId),
        for: 'update'
      })
    ]);

    if (!from || !to) {
      throw new Error('Account not found');
    }

    if (from.balance < amount) {
      throw new Error('Insufficient funds');
    }

    // Debit and credit
    await tx.update(accounts)
      .set({ balance: from.balance - amount })
      .where(eq(accounts.id, fromId));

    await tx.update(accounts)
      .set({ balance: to.balance + amount })
      .where(eq(accounts.id, toId));

    // Log the transfer
    await tx.insert(transfers).values({
      fromId, toId, amount, timestamp: new Date()
    });
  });

  // Transaction commits on success, rolls back on error
}"
```

---

## Recipe: Configuration Pattern

### The Pattern

```
"Store pattern: Type-safe configuration loading

Configuration is validated at startup with Zod:

// config.ts
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3000)
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid configuration:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();

// Usage elsewhere:
import { config } from './config';
const port = config.PORT; // Type-safe, validated"
```

---

## Recipe: Search for Patterns

### Find by Use Case

```
"Show patterns for database access"
"What patterns do we use for error handling?"
"Get the authentication pattern"
```

### Find by Language/Framework

```
"Show React component patterns"
"What patterns do we use with TypeScript?"
```

### Find All Patterns

```
"List all code patterns"
```

---

## Recipe: Pattern from Existing Code

### Extract Pattern from Code

When you notice a repeated approach:

```
"Store pattern: Extracted from our codebase -
Pagination pattern for API endpoints

All list endpoints support cursor-based pagination:

const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20)
});

async function listUsers(params: Pagination) {
  const items = await db.query.users.findMany({
    where: params.cursor
      ? gt(users.id, params.cursor)
      : undefined,
    limit: params.limit + 1,  // Fetch one extra to check hasMore
    orderBy: asc(users.id)
  });

  const hasMore = items.length > params.limit;
  if (hasMore) items.pop();

  return {
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
    hasMore
  };
}"
```

---

## Recipe: Pattern Evolution

### When Patterns Change

```
"Store pattern: Updated API validation pattern (v2)

Previous pattern used manual validation. New pattern uses Zod with
TypeScript inference.

Old way (deprecated):
function validateUser(data: unknown): User {
  if (!data || typeof data !== 'object') throw new Error('Invalid');
  // ... manual checks
}

New way:
const userSchema = z.object({
  email: z.string().email(),
  name: z.string()
});
type User = z.infer<typeof userSchema>;

const user = userSchema.parse(data);

Note: Mark old pattern as superseded"
```

---

## Best Practices

### 1. Include Real Code

Patterns should be copy-pasteable:

```
✅ Include working code examples
❌ Don't just describe conceptually
```

### 2. Document When to Use

Clear guidance prevents misuse:

```json
{
  "whenToUse": [
    "Database operations",
    "External service calls"
  ],
  "whenNotToUse": [
    "Simple scripts",
    "One-off migrations"
  ]
}
```

### 3. Keep Patterns Updated

Review patterns when upgrading dependencies:

```
"Show patterns that mention React 17"
// Update for React 18 changes
```

### 4. Link Related Patterns

```
"Link the API endpoint pattern to the error handling pattern"
"Link the database pattern to the transaction pattern"
```

---

## See Also

- [Architecture Decisions](./architecture-decisions) - Why patterns exist
- [Bug Fix Solutions](./bug-fix-solutions) - Patterns that prevent bugs
- [Memory Management](../guides/memory-management) - Storing patterns
