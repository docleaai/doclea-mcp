---
sidebar_position: 3
title: doclea_get_code_node
description: Get code nodes by ID, name, or file path from the knowledge graph.
keywords: [doclea_get_code_node, code query, function lookup, class lookup]
---

# doclea_get_code_node

Get code nodes (functions, classes, interfaces) by ID, name, or file path.

**Category:** Code Scanning
**Status:** Stable

---

## Quick Example

```
"Get the processPayment function"
```

**Response:**

```json
{
  "message": "Found 1 node",
  "nodes": [{
    "id": "src/payments.ts:function:processPayment",
    "type": "function",
    "name": "processPayment",
    "signature": "(amount: number, currency: string) => Promise<Receipt>",
    "summary": "Process a payment transaction",
    "exported": true,
    "location": {
      "file": "src/payments.ts",
      "line": 15,
      "column": 0
    }
  }]
}
```

---

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `nodeId` | `string` | Exact node ID (e.g., `src/api.ts:function:getData`) |
| `name` | `string` | Search by name (e.g., `getData`) |
| `filePath` | `string` | Get all nodes from a file |

**Note:** Provide exactly one parameter.

---

## Usage Examples

### By Node ID

```
"Get node src/api.ts:function:getUserData"
```

```json
{
  "nodeId": "src/api.ts:function:getUserData"
}
```

**Response:** Single node with exact match.

### By Name

```
"Find the UserService class"
```

```json
{
  "name": "UserService"
}
```

**Response:** All nodes named `UserService` (may include multiple if same name in different files).

### By File Path

```
"Show all code in src/auth/jwt.ts"
```

```json
{
  "filePath": "src/auth/jwt.ts"
}
```

**Response:** All functions, classes, interfaces in that file.

---

## Response Schema

```typescript
interface GetCodeNodeResult {
  message: string;
  nodes: CodeNode[];
}

interface CodeNode {
  id: string;                    // Unique identifier
  type: "function" | "class" | "interface" | "type" | "module";
  name: string;
  signature?: string;            // For functions
  summary?: string;              // Extracted or AI-generated
  summaryConfidence?: number;    // 0-1, confidence in summary
  exported: boolean;
  async?: boolean;               // For functions
  implements?: string[];         // For classes
  extends?: string;              // For classes/interfaces
  methods?: string[];            // For classes/interfaces
  properties?: string[];         // For classes/interfaces
  location: {
    file: string;
    line: number;
    column: number;
    endLine?: number;
  };
  code?: string;                 // Source code (if requested)
}
```

---

## Node ID Format

Node IDs follow the pattern:

```
{filePath}:{nodeType}:{nodeName}
```

**Examples:**

| Node ID | Description |
|---------|-------------|
| `src/api.ts:function:getData` | Function `getData` in `src/api.ts` |
| `src/models/user.ts:class:User` | Class `User` in `src/models/user.ts` |
| `src/types.ts:interface:IConfig` | Interface `IConfig` in `src/types.ts` |
| `src/index.ts:module:` | Module node for `src/index.ts` |

---

## Search by Name

When searching by name:

1. **Exact match** on function/class/interface name
2. **Case-sensitive** matching
3. **Returns all matches** across files

```
"Find all functions named handleError"
```

```json
{
  "name": "handleError"
}
```

May return:
```json
{
  "nodes": [
    { "id": "src/api/errors.ts:function:handleError", ... },
    { "id": "src/utils/logging.ts:function:handleError", ... }
  ]
}
```

---

## Get All Nodes in File

Useful for understanding file structure:

```json
{
  "filePath": "src/services/auth.ts"
}
```

Returns all nodes extracted from that file:
- Functions
- Classes
- Interfaces
- Type aliases
- Exported constants

---

## Use Cases

### Before Modifying Code

```
"Get the UserService class before I refactor it"
```

See full signature, methods, what it implements.

### Understanding Dependencies

```
"Show me what's in the database module"
```

```json
{
  "filePath": "src/database/index.ts"
}
```

### Verifying Extraction

```
"Did the scanner pick up my new function?"
```

```json
{
  "name": "myNewFunction"
}
```

---

## Error Cases

| Error | Cause | Resolution |
|-------|-------|------------|
| `No nodes found` | ID/name doesn't exist | Verify ID, run scan |
| `File not scanned` | File not in patterns | Check scan patterns |

---

## Related Tools

| Tool | Use After |
|------|-----------|
| `doclea_call_graph` | See what calls this node |
| `doclea_impact_analysis` | What breaks if changed |
| `doclea_update_code_summary` | Update the summary |

---

## See Also

- [doclea_scan_code](./scan-code)
- [doclea_call_graph](./call-graph)
- [doclea_find_implementations](./find-implementations)
