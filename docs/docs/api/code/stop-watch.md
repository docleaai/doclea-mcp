---
sidebar_position: 9
title: doclea_stop_watch
description: Stop the file watcher started by doclea_scan_code.
keywords: [doclea_stop_watch, stop, watch, file, watcher]
---

# doclea_stop_watch

Stop the file watcher that was started by `doclea_scan_code` with `watch: true`.

**Category:** Code Scanning (KAG)
**Status:** Stable

---

## Quick Example

```
"Stop watching for file changes"
```

**Response:**

```json
{
  "message": "File watcher stopped"
}
```

---

## Parameters

This tool takes no parameters.

```json
{}
```

---

## Response Schema

```typescript
interface StopWatchResult {
  message: string;
}
```

### Watcher Running

```json
{
  "message": "File watcher stopped"
}
```

### No Watcher Active

```json
{
  "message": "No file watcher active"
}
```

---

## When to Use

Stop the watcher when:

- You're done with development and want to reduce resource usage
- You want to manually control when scans happen
- The watcher is causing too many rescans

---

## Workflow

```typescript
// 1. Start scanning with watch mode
await doclea_scan_code({
  directory: "src/",
  watch: true
});
// Watcher now running...

// 2. Make changes, watcher rescans automatically...

// 3. When done, stop the watcher
await doclea_stop_watch({});
```

---

## See Also

- [doclea_scan_code](./scan-code) - Start scanning with watch mode
- [Code Scanning Overview](./overview)
