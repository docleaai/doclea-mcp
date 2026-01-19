---
sidebar_position: 6
title: doclea_find_implementations
description: Find all classes that implement a given interface.
keywords: [doclea_find_implementations, interface, implements, polymorphism]
---

# doclea_find_implementations

Find all classes that implement a given interface. Essential for understanding polymorphism and dependency injection patterns.

**Category:** Code Scanning
**Status:** Stable

---

## Quick Example

```
"Find all implementations of IUserRepository"
```

**Response:**

```json
{
  "message": "Found 3 implementations of IUserRepository",
  "implementations": [
    {
      "id": "src/repositories/postgres-user.ts:class:PostgresUserRepository",
      "name": "PostgresUserRepository",
      "file": "src/repositories/postgres-user.ts",
      "methods": ["findById", "findByEmail", "create", "update", "delete"]
    },
    {
      "id": "src/repositories/memory-user.ts:class:InMemoryUserRepository",
      "name": "InMemoryUserRepository",
      "file": "src/repositories/memory-user.ts",
      "methods": ["findById", "findByEmail", "create", "update", "delete"]
    },
    {
      "id": "src/repositories/cached-user.ts:class:CachedUserRepository",
      "name": "CachedUserRepository",
      "file": "src/repositories/cached-user.ts",
      "methods": ["findById", "findByEmail", "create", "update", "delete"]
    }
  ]
}
```

---

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `interfaceName` | `string` | Name of the interface to find implementations for |
| `interfaceId` | `string` | Direct interface node ID (optional) |

---

## Usage Examples

### By Interface Name

```
"Find implementations of IPaymentProcessor"
```

```json
{
  "interfaceName": "IPaymentProcessor"
}
```

### By Interface ID

```json
{
  "interfaceId": "src/types.ts:interface:IPaymentProcessor"
}
```

Useful when multiple interfaces have the same name in different files.

---

## Response Schema

```typescript
interface FindImplementationsResult {
  message: string;
  interface: {
    id: string;
    name: string;
    file: string;
    methods: string[];
    properties: string[];
  };
  implementations: Implementation[];
}

interface Implementation {
  id: string;
  name: string;
  file: string;
  line: number;
  methods: string[];           // Implemented methods
  additionalMethods?: string[]; // Methods beyond interface
  exported: boolean;
}
```

---

## Use Cases

### Understanding Dependency Injection

```
"What classes can be injected as ILogger?"
```

```json
{
  "interfaceName": "ILogger"
}
```

Results show all swappable implementations.

### Before Interface Changes

```
"Find implementations before I add a method to IRepository"
```

All returned classes need the new method.

### Code Coverage

```
"Are there test doubles for IEmailService?"
```

Look for `Mock*` or `Fake*` implementations.

### Architecture Review

```
"How many storage backends do we support?"
```

```json
{
  "interfaceName": "IStorageBackend"
}
```

---

## Pattern Recognition

### Repository Pattern

```
"Find IUserRepository implementations"
```

Typically finds:
- `PostgresUserRepository`
- `MongoUserRepository`
- `InMemoryUserRepository` (for tests)

### Strategy Pattern

```
"Find IPricingStrategy implementations"
```

Shows all pricing strategies:
- `StandardPricing`
- `DiscountPricing`
- `SubscriptionPricing`

### Adapter Pattern

```
"Find IPaymentGateway implementations"
```

Shows adapters:
- `StripeAdapter`
- `PayPalAdapter`
- `MockPaymentAdapter`

---

## Comparison

| Tool | Purpose |
|------|---------|
| `doclea_find_implementations` | Interface → Classes |
| `doclea_call_graph` | Function → Callers |
| `doclea_impact_analysis` | Any → All dependents |

---

## Error Cases

| Error | Cause | Resolution |
|-------|-------|------------|
| `Interface not found` | Name doesn't exist | Check spelling, run scan |
| `Multiple interfaces found` | Same name, different files | Use `interfaceId` |
| `No implementations found` | Interface unused | May be new or dead code |

---

## See Also

- [doclea_impact_analysis](./impact-analysis)
- [doclea_get_code_node](./get-node)
- [Code Scanning Overview](./overview)
