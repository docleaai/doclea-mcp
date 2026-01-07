# Retrieval Strategies for Large Codebases

## Overview

This document compares different retrieval-augmented generation strategies for doclea, specifically in the context of handling large codebases.

## Strategy Comparison

### RAG (Retrieval-Augmented Generation)

**How it works:** Retrieves relevant chunks from a vector store at query time based on semantic similarity.

**Pros:**
- Good for semantic/natural language queries
- Scales to large knowledge bases
- Well-understood, mature tooling

**Cons:**
- Retrieval latency at query time
- Can miss context if chunking isn't optimal
- Struggles with multi-hop reasoning ("what calls the function that calls X?")
- No understanding of code structure

**Best for:** "How does authentication work?", "Find similar implementations"

---

### CAG (Cache-Augmented Generation)

**How it works:** Preloads the entire knowledge base into the LLM's context window before generation.

**Pros:**
- No retrieval latency
- Simpler architecture
- Consistent responses

**Cons:**
- **Not viable for large codebases** - context windows are limited
- Even 200k tokens ≈ 150k lines of code
- Requires reloading when knowledge changes

**Best for:** Small, static knowledge bases (FAQs, product manuals) - **not suitable for doclea**

---

### KAG (Knowledge-Augmented Generation)

**How it works:** Integrates the LLM with a structured knowledge graph containing entities and relationships.

**Pros:**
- Enables multi-step logical reasoning
- Reduces hallucinations through verified relationships
- Perfect for inherently structured data (like code)
- Can answer "impact analysis" queries

**Cons:**
- Higher upfront cost to build the knowledge graph
- Requires maintenance as codebase evolves
- More complex architecture

**Best for:** "What functions are affected if I change this interface?", "Show the dependency chain"

---

## Code as a Graph

Codebases are inherently graph-structured, making KAG particularly appealing:

```
Relationships that can be modeled:
├── CALLS (function → function)
├── IMPORTS (module → module)
├── EXTENDS (class → class)
├── IMPLEMENTS (class → interface)
├── USES_TYPE (function → type)
├── DEFINED_IN (symbol → file)
└── DEPENDS_ON (package → package)
```

### Example Queries Enabled by KAG

| Query | Graph Operation |
|-------|-----------------|
| "What calls `processPayment`?" | Incoming edges where relation=CALLS |
| "What breaks if I change `UserInterface`?" | Transitive closure of IMPLEMENTS + USES_TYPE |
| "Show the import chain for this module" | Path traversal on IMPORTS |
| "Find all implementations of `Repository`" | Outgoing edges where relation=IMPLEMENTS |

---

## Recommendation: Hybrid Approach

For doclea, a hybrid strategy would leverage the strengths of both RAG and KAG:

```
┌─────────────────────────────────────────────────────────┐
│                    Query Router                         │
│  (Classifies query intent: semantic vs structural)      │
└─────────────────┬───────────────────┬───────────────────┘
                  │                   │
                  ▼                   ▼
        ┌─────────────────┐  ┌─────────────────┐
        │   RAG Pipeline  │  │   KAG Pipeline  │
        │                 │  │                 │
        │  - Embeddings   │  │  - Code Graph   │
        │  - Vector Store │  │  - Relationships│
        │  - Semantic     │  │  - Traversal    │
        │    Similarity   │  │                 │
        └────────┬────────┘  └────────┬────────┘
                 │                    │
                 ▼                    ▼
        ┌─────────────────────────────────────┐
        │         Response Generator          │
        │   (Combines context from both)      │
        └─────────────────────────────────────┘
```

### Query Type Routing

| Query Type | Route To | Example |
|------------|----------|---------|
| Semantic/conceptual | RAG | "How does error handling work?" |
| Structural/relational | KAG | "What calls this function?" |
| Impact analysis | KAG | "What breaks if I change X?" |
| Similar code | RAG | "Find similar implementations" |
| Definition lookup | KAG | "Where is UserService defined?" |
| Explanation | RAG + KAG | "Explain the payment flow" |

---

## Implementation Considerations

### Building the Code Graph

Tools for extracting code structure:

1. **Tree-sitter** - Fast, incremental parsing for 100+ languages
   - Extract function definitions, calls, imports
   - Language-agnostic AST traversal

2. **Language Server Protocol (LSP)** - Rich semantic analysis
   - "Go to definition", "Find references" data
   - Type information, symbol resolution

3. **Static analysis tools** - Language-specific
   - TypeScript: `ts-morph`, TypeScript compiler API
   - Python: `ast` module, `jedi`
   - Rust: `rust-analyzer`

### Storage Options for Code Graph

| Option | Pros | Cons |
|--------|------|------|
| SQLite with edge tables | Simple, embedded, fast for small graphs | Complex queries need multiple joins |
| Neo4j | Native graph queries (Cypher), visualization | External dependency, overhead |
| In-memory graph | Fastest queries | Memory limits, no persistence |
| DuckDB | SQL + good for analytics | Not optimized for graph traversal |

### Incremental Updates

The code graph must stay synchronized with the codebase:

```
On file change:
1. Parse changed file with tree-sitter
2. Extract new relationships
3. Delete old relationships for that file
4. Insert new relationships
5. Optionally: update affected embeddings
```

---

## Open Questions

- [ ] What's the acceptable latency for graph queries vs vector queries?
- [ ] Should we build the graph lazily (on first query) or eagerly (on index)?
- [ ] How to handle dynamic languages where relationships aren't statically knowable?
- [ ] What's the right granularity for graph nodes? (file, class, function, block?)
- [ ] How to combine RAG and KAG results in a single response?

---

## References

- [KAG: Boosting LLMs in Professional Domains](https://arxiv.org/abs/2409.13731)
- [Cache-Augmented Generation](https://arxiv.org/abs/2311.04934)
- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/)
- [GraphRAG by Microsoft](https://github.com/microsoft/graphrag)
