# Doclea MCP - Library Replacement Plan

## Status

**Completed:**
- P0: SCIP code analysis (interfaces/types now detected)
- P2: lru-cache (293 LOC → 163 LOC)
- P3: string-similarity (151 LOC → 94 LOC)

**Skipped:**
- Drizzle ORM (not needed - raw SQL works fine)
- LangChain embeddings (not needed now)

---

## New Opportunities (Deep Sweep Results)

### Tier 1: Quick Wins (< 1 hour each)

| Item | Current | Replace With | Savings | Effort |
|------|---------|--------------|---------|--------|
| Token counting | 264 LOC custom | `js-tiktoken` | ~200 LOC | 30 min |
| Percentile calc | Hand-rolled | `simple-statistics` | ~50 LOC | 15 min |
| Stop words | Hardcoded array | `stopword` | ~20 LOC | 10 min |
| Tag slugs | Manual normalize | `slugify` | ~30 LOC | 10 min |
| Date operations | Manual Date math | `date-fns` | Cleaner code | 20 min |
| ID generation | crypto.randomUUID | `nanoid` | Smaller, faster | 10 min |

### Tier 2: Medium Effort (1-3 hours)

| Item | Current | Replace With | Savings | Effort |
|------|---------|--------------|---------|--------|
| Qdrant client | 185 LOC custom | `@langchain/qdrant` | ~100 LOC | 1 hour |
| Config loading | Manual JSON parse | `cosmiconfig` | Better UX | 2 hours |
| Deep merge | Manual recursion | `deepmerge` | ~40 LOC | 30 min |
| Decay functions | Hand-rolled math | `d3-scale` | Cleaner code | 1 hour |

### Tier 3: Optional / Future

| Item | Current | Replace With | Notes |
|------|---------|--------------|-------|
| NLP processing | None | `natural.js` | For better keyword extraction |
| Graph analysis | Manual arrays | `graph-data-structure` | If relation analysis grows |
| Feature flags | Custom A/B | `growthbook` | If experiments scale |
| Logging | console.log | `pino` | If observability needed |

---

## Recommended Implementation: Tier 1 Only

Focus on quick wins with highest ROI:

### 1. Token Counting → js-tiktoken

**Current:** `src/utils/tokens.ts` (264 LOC)
- Custom tokenizer caching
- Manual model fallback logic
- HuggingFace transformers overhead

**After:**
```bash
bun add js-tiktoken
```

```typescript
import { getEncoding } from "js-tiktoken";
const enc = getEncoding("cl100k_base"); // GPT-4/3.5 tokenizer
const tokens = enc.encode(text);
```

**Files Changed:**
- REWRITE `src/utils/tokens.ts` (264 → ~60 LOC)

---

### 2. Percentile Calculations → simple-statistics

**Current:** `src/ab-testing/metrics-collector.ts` lines 310-324
- Hand-rolled p50, p95, p99 calculation

**After:**
```bash
bun add simple-statistics
```

```typescript
import { quantile } from "simple-statistics";
const p50 = quantile(values, 0.5);
const p95 = quantile(values, 0.95);
```

**Files Changed:**
- MODIFY `src/ab-testing/metrics-collector.ts` (~15 LOC removed)

---

### 3. Stop Words → stopword

**Current:** `src/tagging/taxonomy.ts` - hardcoded STOP_WORDS array

**After:**
```bash
bun add stopword
```

```typescript
import { removeStopwords } from "stopword";
const keywords = removeStopwords(words);
```

**Files Changed:**
- MODIFY `src/tagging/taxonomy.ts` (~20 LOC removed)

---

### 4. Tag Normalization → slugify

**Current:** Manual lowercase + replace logic in taxonomy

**After:**
```bash
bun add slugify
```

```typescript
import slugify from "slugify";
const normalizedTag = slugify(tag, { lower: true, strict: true });
```

**Files Changed:**
- MODIFY `src/tagging/taxonomy.ts` (~30 LOC simplified)

---

### 5. Date Operations → date-fns

**Current:** Manual Date arithmetic in staleness/scoring

**After:**
```bash
bun add date-fns
```

```typescript
import { differenceInDays, subDays, isAfter } from "date-fns";
const daysSince = differenceInDays(new Date(), createdAt);
```

**Files Changed:**
- MODIFY `src/staleness/*.ts` (cleaner code)
- MODIFY `src/scoring/*.ts` (cleaner code)

---

### 6. ID Generation → nanoid

**Current:** `crypto.randomUUID()` or SHA-256 hashing

**After:**
```bash
bun add nanoid
```

```typescript
import { nanoid } from "nanoid";
const id = nanoid(); // 21 chars, URL-safe
const shortId = nanoid(10); // custom length
```

**Benefits:**
- 2x faster than UUID
- Smaller (21 chars vs 36)
- URL-safe by default

**Files Changed:**
- MODIFY ID generation across codebase

---

## What NOT to Replace (Core IP)

These are well-designed and provide competitive advantage:

| Module | LOC | Reason to Keep |
|--------|-----|----------------|
| Code chunking | 1,321 | Tree-sitter integration, semantic splitting |
| Markdown chunking | 545 | Header-aware, metadata tracking |
| Staleness detection | 577 | Multi-strategy, domain-specific |
| Scoring system | 779 | Multi-factor, explainable |
| Relation detection | 2,457 | Cross-layer, LLM-augmented |
| Vector abstraction | 645 | Multi-backend (sqlite-vec, libSQL) |
| Database layer | 2,217 | Clean SQL, no ORM needed |

---

## External Tools (Other Languages)

Analyzed but NOT recommended:

| Tool | Language | Why Skip |
|------|----------|----------|
| ripgrep | Rust | Bun glob already fast enough |
| tree-sitter-cli | Rust | Already using JS binding |
| scip-python | Python | Only if Python projects needed |
| sentence-transformers | Python | HF transformers.js sufficient |

---

## Install Commands

```bash
# Tier 1 (Quick Wins)
bun add js-tiktoken simple-statistics stopword slugify date-fns nanoid

# Tier 2 (Optional)
bun add @langchain/qdrant cosmiconfig deepmerge d3-scale
```

---

## Verification

After Tier 1:
```bash
# Build should pass
bun build src/index.ts --outdir=dist --target=bun

# Tests should pass
bun test

# Token counting should work
bun run -e "import { getEncoding } from 'js-tiktoken'; console.log(getEncoding('cl100k_base').encode('hello').length)"
```

---

## Summary

| Tier | Items | LOC Saved | Effort |
|------|-------|-----------|--------|
| Tier 1 | 6 packages | ~300 LOC | 2 hours |
| Tier 2 | 4 packages | ~150 LOC | 4 hours |
| **Total** | 10 packages | **~450 LOC** | 6 hours |

**Recommendation:** Do Tier 1 only. High ROI, low risk.