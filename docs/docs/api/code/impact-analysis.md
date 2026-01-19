---
sidebar_position: 5
title: doclea_impact_analysis
description: Analyze what would break if you change a function, class, or interface.
keywords: [doclea_impact_analysis, impact analysis, breaking changes, refactoring]
---

# doclea_impact_analysis

Analyze what would break if a function, class, or interface is changed. Essential for safe refactoring.

**Category:** Code Scanning
**Status:** Stable

---

## Quick Example

```
"What would break if I change the UserService class?"
```

**Response:**

```json
{
  "message": "Impact analysis for UserService: 8 dependents, 3 potential breaking changes",
  "result": {
    "target": {
      "id": "src/services/user.ts:class:UserService",
      "name": "UserService",
      "type": "class"
    },
    "totalDependents": 8,
    "breakingChanges": [
      {
        "node": { "id": "src/api/users.ts:function:getUser", "name": "getUser" },
        "severity": "high",
        "reason": "Directly calls UserService.findById()"
      },
      {
        "node": { "id": "src/api/auth.ts:function:login", "name": "login" },
        "severity": "high",
        "reason": "Directly calls UserService.authenticate()"
      },
      {
        "node": { "id": "src/tests/user.test.ts:function:testUser", "name": "testUser" },
        "severity": "medium",
        "reason": "Test file may need updates"
      }
    ],
    "affectedFiles": [
      "src/api/users.ts",
      "src/api/auth.ts",
      "src/controllers/admin.ts",
      "src/tests/user.test.ts"
    ]
  }
}
```

---

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `nodeId` | `string` | - | Node ID to analyze |
| `functionName` | `string` | - | Function/class name to search |
| `depth` | `number` | `3` | How deep to analyze (1-5) |

**Note:** Provide either `nodeId` or `functionName`.

---

## Usage Examples

### Analyze a Function

```
"What would break if I change processPayment?"
```

```json
{
  "functionName": "processPayment",
  "depth": 3
}
```

### Analyze an Interface

```
"Impact of changing the IUserRepository interface"
```

```json
{
  "nodeId": "src/types.ts:interface:IUserRepository",
  "depth": 4
}
```

### Quick Surface Analysis

```
"Quick impact check for validateInput"
```

```json
{
  "functionName": "validateInput",
  "depth": 1
}
```

---

## Response Schema

```typescript
interface ImpactAnalysisResult {
  message: string;
  result: {
    target: {
      id: string;
      name: string;
      type: string;
    };
    totalDependents: number;
    breakingChanges: BreakingChange[];
    affectedFiles: string[];
    dependencyChain: DependencyNode[];
  };
}

interface BreakingChange {
  node: {
    id: string;
    name: string;
    type: string;
    file: string;
  };
  severity: "high" | "medium" | "low";
  reason: string;
  distance: number;  // Hops from target
}

interface DependencyNode {
  node: { id: string; name: string };
  dependents: DependencyNode[];
}
```

---

## Severity Levels

| Severity | Meaning | Action |
|----------|---------|--------|
| **High** | Direct caller/implementer | Will definitely break |
| **Medium** | Indirect dependency, test file | Likely needs updates |
| **Low** | Distant dependency, comments | Might need review |

### High Severity Examples

- Function directly calls the target
- Class implements the target interface
- Class extends the target class
- Module re-exports the target

### Medium Severity Examples

- Test files that test the target
- Indirect callers (2+ hops away)
- Type references in generics

### Low Severity Examples

- Documentation references
- Comments mentioning the target
- Very distant dependencies (4+ hops)

---

## Change Scenarios

### Renaming a Function

```
"Impact of renaming getUserById to findUserById"
```

All direct callers are HIGH severity.

### Changing Parameters

```
"Impact of adding required parameter to authenticate()"
```

All callers must update their calls.

### Changing Return Type

```
"Impact of changing createUser to return Promise instead of User"
```

All callers handling the return value affected.

### Removing a Method

```
"Impact of removing the deprecated validate() method"
```

Shows all code still using the method.

---

## Visualization

```
UserService (target)
├── [HIGH] getUser (src/api/users.ts)
│   └── [MEDIUM] userRouter (src/routes/users.ts)
├── [HIGH] login (src/api/auth.ts)
│   ├── [MEDIUM] authRouter (src/routes/auth.ts)
│   └── [LOW] authMiddleware (src/middleware.ts)
├── [HIGH] AdminController (src/controllers/admin.ts)
└── [MEDIUM] UserService.test.ts (src/tests/)
```

---

## Use Cases

### Pre-Refactoring Assessment

```
"Before I refactor the PaymentService, what's the blast radius?"
```

```json
{
  "functionName": "PaymentService",
  "depth": 4
}
```

### Deprecation Planning

```
"I want to deprecate the old API. What depends on it?"
```

```json
{
  "nodeId": "src/api/v1/index.ts:module:",
  "depth": 3
}
```

### Safe Change Verification

```
"Is it safe to change this internal helper function?"
```

If no high-severity dependents, likely safe.

### Test Coverage Check

```
"Are there tests that would catch if I break this?"
```

Look for test files in affected files list.

---

## Best Practices

### Before Major Changes

1. Run impact analysis with depth 3-4
2. Review all HIGH severity items
3. Check if tests cover affected code
4. Plan migration for dependents

### For Interface Changes

```json
{
  "nodeId": "src/types.ts:interface:IService",
  "depth": 4
}
```

Interface changes affect all implementers.

### For Shared Utilities

Utility functions often have wide impact:

```json
{
  "functionName": "formatDate",
  "depth": 2
}
```

---

## Comparison with Call Graph

| Tool | Purpose |
|------|---------|
| `doclea_call_graph` | See relationships |
| `doclea_impact_analysis` | Assess breaking changes |

Impact analysis adds:
- Severity classification
- Breaking change identification
- Actionable recommendations

---

## Performance

| Depth | Typical Time |
|-------|--------------|
| 1 | ~20ms |
| 2 | ~50ms |
| 3 | ~150ms |
| 4 | ~500ms |
| 5 | ~1-2s |

---

## See Also

- [doclea_call_graph](./call-graph)
- [doclea_dependency_tree](./dependency-tree)
- [Code Scanning Overview](./overview)
