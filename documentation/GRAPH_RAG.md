# GraphRAG: Complete Implementation Guide for LLM-Based Systems

## Table of Contents
1. [Core Concepts](#core-concepts)
2. [Architecture Overview](#architecture-overview)
3. [Indexing Pipeline](#indexing-pipeline)
4. [Query Methods](#query-methods)
5. [Implementation Details](#implementation-details)
6. [Prompts & Templates](#prompts--templates)
7. [Data Structures](#data-structures)
8. [Comparison: Traditional RAG vs GraphRAG](#comparison-traditional-rag-vs-graphrag)
9. [When to Use What](#when-to-use-what)
10. [Production Considerations](#production-considerations)

---

## Core Concepts

### What is GraphRAG?

GraphRAG combines **knowledge graphs** with **retrieval-augmented generation** to create a structured, relationship-aware retrieval system. Instead of treating documents as flat text chunks, GraphRAG:

1. Extracts **entities** (people, concepts, objects, events)
2. Identifies **relationships** between entities
3. Groups related entities into **communities** (hierarchical clusters)
4. Uses graph traversal for context retrieval

### The Three Pillars

#### 1. Entities (Nodes)
- Distinct objects, persons, places, events, or concepts
- Extracted from text chunks via LLM analysis
- Form the nodes of the knowledge graph
- Each entity has: `name`, `type`, `description`

#### 2. Relationships (Edges)
- Connections between two entities
- Extracted alongside entities via LLM
- Each relationship has: `source`, `target`, `description`, `strength` (1-10)

#### 3. Communities
- Clusters of related entities and relationships
- Created via hierarchical community detection (Leiden algorithm)
- Organized in levels: Level 0 (most granular) → Level N (most broad)
- Each community gets a **Community Report** (LLM-generated summary)

### Why GraphRAG Over Traditional RAG?

| Problem with Traditional RAG | GraphRAG Solution |
|------------------------------|-------------------|
| Loses structural information when chunking | Preserves relationships in graph format |
| Can break related content during chunking | Entities linked regardless of chunk boundaries |
| Limited ability to capture relationships | Explicit relationship extraction and storage |
| Struggles with multi-hop reasoning | Graph traversal enables connection of disparate facts |
| Cannot answer "global" questions about themes | Community reports capture broad themes |
| Incomplete/fragmented answers | Complete context via relationship traversal |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          INDEXING PIPELINE                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ Document │───▶│  Chunk   │───▶│   Extract    │───▶│    Merge      │  │
│  │  Input   │    │  Text    │    │   Entities   │    │   Subgraphs   │  │
│  └──────────┘    └──────────┘    │ Relationships│    └───────────────┘  │
│                                  └──────────────┘            │          │
│                                                              ▼          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │  Community   │◀───│   Detect     │◀───│     Embed Nodes          │  │
│  │   Reports    │    │ Communities  │    │     (Node2Vec)           │  │
│  └──────────────┘    └──────────────┘    └──────────────────────────┘  │
│         │                                                               │
│         ▼                                                               │
│  ┌──────────────┐                                                       │
│  │    Embed     │                                                       │
│  │   Reports    │                                                       │
│  └──────────────┘                                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                          RETRIEVAL METHODS                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │  LOCAL SEARCH   │  │  GLOBAL SEARCH  │  │     DRIFT SEARCH        │  │
│  │                 │  │                 │  │                         │  │
│  │ • Entity-based  │  │ • Community     │  │ • Hybrid approach       │  │
│  │ • Graph         │  │   reports       │  │ • Global → Local        │  │
│  │   traversal     │  │ • Map-reduce    │  │ • Follow-up questions   │  │
│  │ • Specific      │  │   aggregation   │  │ • Iterative refinement  │  │
│  │   queries       │  │ • Broad themes  │  │ • Best of both          │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Indexing Pipeline

### Step 1: Document Chunking

Split documents into processable text chunks.

**Default Configuration:**
- Chunk size: 1,200 tokens
- Overlap: 100 tokens
- Splitter: Token-based (not character-based)

```python
from langchain.text_splitter import TokenTextSplitter

def chunk_documents(text: str, chunk_size: int = 1200, overlap: int = 100) -> list[str]:
    """
    Split document into overlapping chunks.
    
    Args:
        text: Raw document text
        chunk_size: Maximum tokens per chunk
        overlap: Token overlap between chunks
    
    Returns:
        List of text chunks
    """
    splitter = TokenTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap
    )
    chunks = splitter.split_text(text)
    return chunks
```

**Why overlap?**
- Prevents entities/relationships from being cut at chunk boundaries
- Ensures context continuity for extraction

---

### Step 2: Entity & Relationship Extraction

Process each chunk with an LLM to extract entities and relationships.

**Input:** Text chunk
**Output:**
- List of entities: `(name, type, description)`
- List of relationships: `(source, target, description, strength)`

**Entity Types to Extract (customizable):**
- PERSON
- ORGANIZATION
- LOCATION
- EVENT
- CONCEPT
- TECHNOLOGY
- PRODUCT
- DATE/TIME

**Extraction Output Format:**
```
("entity"<|>ENTITY_NAME<|>ENTITY_TYPE<|>ENTITY_DESCRIPTION)
##
("relationship"<|>SOURCE_ENTITY<|>TARGET_ENTITY<|>RELATIONSHIP_DESCRIPTION<|>STRENGTH)
```

**Per-Chunk Processing:**
```python
def extract_entities_and_relationships(chunk: str, llm) -> dict:
    """
    Extract entities and relationships from a text chunk.
    
    Returns:
        {
            "entities": [
                {"name": str, "type": str, "description": str},
                ...
            ],
            "relationships": [
                {"source": str, "target": str, "description": str, "strength": int},
                ...
            ]
        }
    """
    prompt = ENTITY_EXTRACTION_PROMPT.format(text=chunk)
    response = llm.invoke(prompt)
    return parse_extraction_response(response)
```

---

### Step 3: Subgraph Merging

After extracting from all chunks, merge per-chunk subgraphs into a unified graph.

**Merging Rules:**

1. **Entity Merging:**
    - Entities with same `name` AND `type` are merged
    - Descriptions are collected into an array
    - Array is summarized by LLM into single description

2. **Relationship Merging:**
    - Relationships with same `source` AND `target` are merged
    - Descriptions are collected into an array
    - Strengths are averaged or max-pooled
    - Array is summarized by LLM into single description

```python
def merge_subgraphs(subgraphs: list[dict]) -> dict:
    """
    Merge per-chunk subgraphs into unified graph.
    
    Args:
        subgraphs: List of {entities: [...], relationships: [...]}
    
    Returns:
        Unified graph with merged entities and relationships
    """
    entity_map = {}  # key: (name, type) -> list of descriptions
    relationship_map = {}  # key: (source, target) -> list of (description, strength)
    
    for subgraph in subgraphs:
        for entity in subgraph["entities"]:
            key = (entity["name"].lower(), entity["type"])
            if key not in entity_map:
                entity_map[key] = []
            entity_map[key].append(entity["description"])
        
        for rel in subgraph["relationships"]:
            key = (rel["source"].lower(), rel["target"].lower())
            if key not in relationship_map:
                relationship_map[key] = []
            relationship_map[key].append({
                "description": rel["description"],
                "strength": rel["strength"]
            })
    
    # Summarize merged entities
    final_entities = []
    for (name, type_), descriptions in entity_map.items():
        if len(descriptions) > 1:
            summary = llm_summarize_descriptions(descriptions)
        else:
            summary = descriptions[0]
        final_entities.append({
            "name": name,
            "type": type_,
            "description": summary
        })
    
    # Summarize merged relationships
    final_relationships = []
    for (source, target), items in relationship_map.items():
        descriptions = [item["description"] for item in items]
        strengths = [item["strength"] for item in items]
        
        if len(descriptions) > 1:
            summary = llm_summarize_descriptions(descriptions)
        else:
            summary = descriptions[0]
        
        final_relationships.append({
            "source": source,
            "target": target,
            "description": summary,
            "strength": max(strengths)  # or mean
        })
    
    return {
        "entities": final_entities,
        "relationships": final_relationships
    }
```

---

### Step 4: Node Embedding

Embed all entity nodes for semantic retrieval.

**Method:** Node2Vec algorithm
- Creates embeddings that capture graph structure
- Nodes close in graph = similar embeddings
- Enables semantic search over entities

```python
from node2vec import Node2Vec
import networkx as nx

def embed_nodes(entities: list, relationships: list, dimensions: int = 128) -> dict:
    """
    Create embeddings for all entity nodes using Node2Vec.
    
    Returns:
        {entity_name: embedding_vector}
    """
    # Build NetworkX graph
    G = nx.Graph()
    
    for entity in entities:
        G.add_node(entity["name"], **entity)
    
    for rel in relationships:
        G.add_edge(
            rel["source"], 
            rel["target"], 
            weight=rel["strength"],
            description=rel["description"]
        )
    
    # Generate embeddings
    node2vec = Node2Vec(
        G, 
        dimensions=dimensions,
        walk_length=30,
        num_walks=200,
        workers=4
    )
    model = node2vec.fit(window=10, min_count=1)
    
    embeddings = {}
    for node in G.nodes():
        embeddings[node] = model.wv[node]
    
    return embeddings
```

---

### Step 5: Community Detection

Group nodes into hierarchical communities using the Leiden algorithm.

**Leiden Algorithm Properties:**
- Detects communities at multiple resolution levels
- Creates hierarchy: granular (level 0) → broad (level N)
- Optimizes modularity (nodes in community more connected to each other than outside)

```python
import igraph as ig
import leidenalg

def detect_communities(entities: list, relationships: list, max_levels: int = 3) -> dict:
    """
    Detect hierarchical communities in the graph.
    
    Returns:
        {
            "level_0": [{"community_id": 0, "members": [entity_names]}, ...],
            "level_1": [...],
            ...
        }
    """
    # Build igraph
    G = ig.Graph()
    node_ids = {e["name"]: i for i, e in enumerate(entities)}
    G.add_vertices(len(entities))
    
    edges = [(node_ids[r["source"]], node_ids[r["target"]]) for r in relationships]
    G.add_edges(edges)
    
    communities_by_level = {}
    
    for level in range(max_levels):
        resolution = 1.0 / (level + 1)  # Higher level = lower resolution = broader communities
        
        partition = leidenalg.find_partition(
            G,
            leidenalg.RBConfigurationVertexPartition,
            resolution_parameter=resolution
        )
        
        level_communities = []
        for comm_id, members in enumerate(partition):
            member_names = [entities[m]["name"] for m in members]
            level_communities.append({
                "community_id": comm_id,
                "level": level,
                "members": member_names
            })
        
        communities_by_level[f"level_{level}"] = level_communities
    
    return communities_by_level
```

---

### Step 6: Community Report Generation

Generate LLM summaries for each community capturing themes and insights.

**Community Report Structure:**
```json
{
    "community_id": 61,
    "level": 2,
    "title": "Amazon Bedrock and AI Model Providers",
    "summary": "This community centers around Amazon Bedrock, a service by AWS...",
    "full_content": "## Amazon Bedrock as a Central Service\n...\n## Anthropic's Role...",
    "key_entities": ["Amazon Bedrock", "Anthropic", "Cohere", "AI21 Labs"],
    "key_findings": [
        "Amazon Bedrock provides unified access to multiple foundation models",
        "Multiple AI providers integrate with Bedrock ecosystem"
    ],
    "importance_score": 8.5
}
```

```python
def generate_community_reports(
    communities: dict, 
    entities: list, 
    relationships: list,
    llm
) -> list[dict]:
    """
    Generate summary reports for each community.
    
    Returns:
        List of community report objects
    """
    reports = []
    
    for level_key, level_communities in communities.items():
        for community in level_communities:
            # Gather all entities in this community
            community_entities = [
                e for e in entities 
                if e["name"] in community["members"]
            ]
            
            # Gather all relationships within community
            member_set = set(community["members"])
            community_relationships = [
                r for r in relationships
                if r["source"] in member_set and r["target"] in member_set
            ]
            
            # Generate report via LLM
            report = llm_generate_community_report(
                community_entities,
                community_relationships,
                community["level"]
            )
            
            reports.append({
                "community_id": community["community_id"],
                "level": community["level"],
                **report
            })
    
    return reports
```

---

### Step 7: Embed Community Reports

Embed community reports for semantic retrieval during Global Search.

```python
def embed_community_reports(reports: list, embedding_model) -> dict:
    """
    Create embeddings for community reports.
    
    Returns:
        {community_id: embedding_vector}
    """
    embeddings = {}
    
    for report in reports:
        # Embed title + summary for retrieval
        text = f"{report['title']}\n\n{report['summary']}"
        embedding = embedding_model.embed(text)
        embeddings[report["community_id"]] = {
            "embedding": embedding,
            "level": report["level"],
            "report": report
        }
    
    return embeddings
```

---

## Query Methods

### 1. Local Search

**Purpose:** Specific, granular queries requiring detailed information.

**Best For:**
- "What are the tools for model initialization?"
- "How does LoRA work?"
- "What is the relationship between X and Y?"

**Process:**

```
Query → Embed Query → Find Similar Entities → Traverse Graph → 
Gather Context (chunks, relationships, communities) → Filter & Rank → Generate
```

**Detailed Flow:**

1. **Entity Retrieval:**
    - Embed the query
    - Semantic search against node embeddings
    - Retrieve top-K most similar entities

2. **Graph Traversal:**
    - For each retrieved entity, traverse to:
        - Connected entities (1-2 hops)
        - Related relationships
        - Associated text chunks
        - Containing communities

3. **Context Assembly:**
    - Collect all traversed information
    - Filter by relevance score
    - Rank and truncate to fit context window

4. **Generation:**
    - Pass assembled context + query to LLM
    - Generate response

```python
def local_search(
    query: str,
    node_embeddings: dict,
    graph: nx.Graph,
    chunk_map: dict,  # entity -> source chunks
    community_map: dict,  # entity -> communities
    llm,
    embedding_model,
    top_k_entities: int = 10,
    max_hops: int = 2
) -> str:
    """
    Perform local search for specific queries.
    """
    # 1. Embed query and find similar entities
    query_embedding = embedding_model.embed(query)
    
    similarities = []
    for entity_name, entity_embedding in node_embeddings.items():
        sim = cosine_similarity(query_embedding, entity_embedding)
        similarities.append((entity_name, sim))
    
    similarities.sort(key=lambda x: x[1], reverse=True)
    seed_entities = [name for name, _ in similarities[:top_k_entities]]
    
    # 2. Traverse graph from seed entities
    context_entities = set(seed_entities)
    context_relationships = []
    context_chunks = set()
    context_communities = set()
    
    for entity in seed_entities:
        # Get neighbors up to max_hops
        for neighbor in nx.single_source_shortest_path_length(graph, entity, cutoff=max_hops):
            context_entities.add(neighbor)
            
            # Get edge data (relationships)
            if graph.has_edge(entity, neighbor):
                edge_data = graph.get_edge_data(entity, neighbor)
                context_relationships.append({
                    "source": entity,
                    "target": neighbor,
                    **edge_data
                })
        
        # Get source chunks
        if entity in chunk_map:
            context_chunks.update(chunk_map[entity])
        
        # Get communities
        if entity in community_map:
            context_communities.update(community_map[entity])
    
    # 3. Assemble context
    context = assemble_local_context(
        entities=list(context_entities),
        relationships=context_relationships,
        chunks=list(context_chunks),
        communities=list(context_communities)
    )
    
    # 4. Generate response
    prompt = LOCAL_SEARCH_PROMPT.format(
        context=context,
        query=query
    )
    
    return llm.invoke(prompt)
```

---

### 2. Global Search

**Purpose:** Broad, thematic queries requiring understanding across entire knowledge base.

**Best For:**
- "What are the main themes in this document?"
- "How does a company choose between RAG and fine-tuning?"
- "Summarize the key concepts discussed"

**Process:**

```
Query → Embed Query → Retrieve Similar Community Reports → 
Extract Key Points (per report) → Map-Reduce Aggregation → Generate
```

**Detailed Flow:**

1. **Community Report Retrieval:**
    - Embed the query
    - Semantic search against community report embeddings
    - Retrieve top-K most similar reports (at specified level)

2. **Key Point Extraction (Map Phase):**
    - For each retrieved report:
        - Extract numbered list of key points
        - Assign relevance score to each point

3. **Aggregation (Reduce Phase):**
    - Collect all key points across reports
    - Rank by relevance score
    - Filter least relevant points
    - Aggregate into final context

4. **Generation:**
    - Pass aggregated key points + query to LLM
    - Generate comprehensive response

```python
def global_search(
    query: str,
    community_reports: list,
    report_embeddings: dict,
    llm,
    embedding_model,
    target_level: int = 1,
    top_k_reports: int = 10
) -> str:
    """
    Perform global search for broad thematic queries.
    """
    # 1. Filter reports by level and retrieve similar ones
    level_reports = [r for r in community_reports if r["level"] == target_level]
    
    query_embedding = embedding_model.embed(query)
    
    similarities = []
    for report in level_reports:
        report_emb = report_embeddings[report["community_id"]]["embedding"]
        sim = cosine_similarity(query_embedding, report_emb)
        similarities.append((report, sim))
    
    similarities.sort(key=lambda x: x[1], reverse=True)
    retrieved_reports = [r for r, _ in similarities[:top_k_reports]]
    
    # 2. Map Phase: Extract key points from each report
    all_key_points = []
    
    for report in retrieved_reports:
        points = extract_key_points(report, query, llm)
        # points = [{"text": str, "relevance": float}, ...]
        all_key_points.extend(points)
    
    # 3. Reduce Phase: Rank and filter
    all_key_points.sort(key=lambda x: x["relevance"], reverse=True)
    
    # Keep top points that fit context window
    filtered_points = filter_to_context_window(all_key_points, max_tokens=8000)
    
    # 4. Generate response
    context = "\n".join([f"- {p['text']}" for p in filtered_points])
    
    prompt = GLOBAL_SEARCH_PROMPT.format(
        context=context,
        query=query
    )
    
    return llm.invoke(prompt)


def extract_key_points(report: dict, query: str, llm) -> list[dict]:
    """
    Extract key points from a community report relevant to query.
    """
    prompt = f"""
    Given the following community report and user query, extract the key points 
    that are relevant to answering the query.
    
    Report Title: {report['title']}
    Report Content: {report['full_content']}
    
    Query: {query}
    
    For each key point, provide:
    1. The point itself (1-2 sentences)
    2. A relevance score from 0-10
    
    Format as JSON array.
    """
    
    response = llm.invoke(prompt)
    return parse_key_points(response)
```

---

### 3. Drift Search (Dynamic Reasoning and Inference with Flexible Traversal)

**Purpose:** Complex queries benefiting from both global context and local specificity.

**Best For:**
- Multi-faceted questions requiring both breadth and depth
- Queries where follow-up exploration improves answers
- Complex reasoning across different parts of knowledge base

**Process:**

```
Query → HyDE (Hypothetical Document) → Retrieve Community Reports → 
Generate Initial Answer + Follow-up Questions → 
Local Search for Each Follow-up → Generate More Follow-ups → 
Aggregate All Intermediate Answers → Final Response
```

**Detailed Flow:**

1. **Hypothetical Document Embedding (HyDE):**
    - Given query, generate hypothetical document that would answer it
    - Embed hypothetical document (not raw query)
    - Retrieve similar community reports

2. **Initial Global Phase:**
    - Generate initial answer from community reports
    - Generate follow-up questions with relevance scores

3. **Local Exploration Phase:**
    - For each high-relevance follow-up question:
        - Perform local search
        - Generate intermediate answer
        - Generate new follow-up questions
    - Repeat for N iterations or until convergence

4. **Aggregation:**
    - Collect all intermediate answers
    - Rank by relevance to original query
    - Map-reduce into final aggregated context

5. **Final Generation:**
    - Pass aggregated context + original query to LLM
    - Generate comprehensive response

```python
def drift_search(
    query: str,
    community_reports: list,
    report_embeddings: dict,
    node_embeddings: dict,
    graph: nx.Graph,
    chunk_map: dict,
    community_map: dict,
    llm,
    embedding_model,
    max_iterations: int = 3,
    top_follow_ups: int = 3
) -> str:
    """
    Perform DRIFT search combining global and local approaches.
    """
    # 1. HyDE: Generate hypothetical document
    hyde_doc = generate_hypothetical_document(query, llm)
    hyde_embedding = embedding_model.embed(hyde_doc)
    
    # 2. Retrieve community reports using HyDE embedding
    similarities = []
    for report in community_reports:
        report_emb = report_embeddings[report["community_id"]]["embedding"]
        sim = cosine_similarity(hyde_embedding, report_emb)
        similarities.append((report, sim))
    
    similarities.sort(key=lambda x: x[1], reverse=True)
    initial_reports = [r for r, _ in similarities[:5]]
    
    # 3. Generate initial answer and follow-up questions
    initial_context = "\n\n".join([r["full_content"] for r in initial_reports])
    
    initial_result = generate_answer_with_followups(
        context=initial_context,
        query=query,
        llm=llm
    )
    # initial_result = {"answer": str, "follow_ups": [{"question": str, "relevance": float}]}
    
    all_answers = [{"text": initial_result["answer"], "relevance": 1.0}]
    
    # 4. Iterative local exploration
    follow_up_queue = sorted(
        initial_result["follow_ups"],
        key=lambda x: x["relevance"],
        reverse=True
    )[:top_follow_ups]
    
    for iteration in range(max_iterations):
        if not follow_up_queue:
            break
        
        current_question = follow_up_queue.pop(0)
        
        # Perform local search for follow-up
        local_answer = local_search(
            query=current_question["question"],
            node_embeddings=node_embeddings,
            graph=graph,
            chunk_map=chunk_map,
            community_map=community_map,
            llm=llm,
            embedding_model=embedding_model
        )
        
        # Generate new follow-ups from local answer
        new_follow_ups = generate_follow_up_questions(
            answer=local_answer,
            original_query=query,
            llm=llm
        )
        
        all_answers.append({
            "text": local_answer,
            "relevance": current_question["relevance"] * 0.9  # Decay
        })
        
        # Add new follow-ups to queue
        for fu in new_follow_ups:
            fu["relevance"] *= 0.8  # Decay for deeper iterations
        follow_up_queue.extend(new_follow_ups)
        follow_up_queue.sort(key=lambda x: x["relevance"], reverse=True)
        follow_up_queue = follow_up_queue[:top_follow_ups]
    
    # 5. Aggregate all answers
    all_answers.sort(key=lambda x: x["relevance"], reverse=True)
    aggregated_context = "\n\n---\n\n".join([a["text"] for a in all_answers])
    
    # 6. Final generation
    prompt = DRIFT_FINAL_PROMPT.format(
        context=aggregated_context,
        query=query
    )
    
    return llm.invoke(prompt)


def generate_hypothetical_document(query: str, llm) -> str:
    """
    Generate a hypothetical document that would answer the query.
    Used for HyDE (Hypothetical Document Embedding).
    """
    prompt = f"""
    Given the following question, write a detailed paragraph that would 
    be found in a document that answers this question. Write as if you 
    are quoting from an authoritative source.
    
    Question: {query}
    
    Hypothetical document excerpt:
    """
    return llm.invoke(prompt)
```

---

## Prompts & Templates

### Entity Extraction Prompt

```python
ENTITY_EXTRACTION_PROMPT = """
-Goal-
Given a text document that is potentially relevant to this activity and a list of entity types, 
identify all entities of those types from the text and all relationships among the identified entities.

-Steps-
1. Identify all entities. For each identified entity, extract the following information:
- entity_name: Name of the entity, capitalized
- entity_type: One of the following types: [{entity_types}]
- entity_description: Comprehensive description of the entity's attributes and activities

Format each entity as:
("entity"<|><entity_name><|><entity_type><|><entity_description>)

2. From the entities identified in step 1, identify all pairs of (source_entity, target_entity) 
that are *clearly related* to each other.
For each pair of related entities, extract the following information:
- source_entity: name of the source entity
- target_entity: name of the target entity
- relationship_description: explanation of why the source and target entities are related
- relationship_strength: an integer score between 1 to 10, indicating strength of the relationship

Format each relationship as:
("relationship"<|><source_entity><|><target_entity><|><relationship_description><|><relationship_strength>)

3. Return output as a single list of all the entities and relationships identified in steps 1 and 2.
Use **##** as the delimiter between entries.

-Entity Types-
{entity_types}

-Text-
{text}

-Output-
"""
```

### Community Report Generation Prompt

```python
COMMUNITY_REPORT_PROMPT = """
You are an AI assistant that generates comprehensive reports about communities of related entities.

Given the following entities and relationships from a community in a knowledge graph, 
generate a detailed report.

Community Entities:
{entities}

Community Relationships:
{relationships}

Generate a report with the following structure:
1. Title: A descriptive title for this community (5-10 words)
2. Summary: A 2-3 sentence overview of what this community represents
3. Full Content: A detailed analysis including:
   - Main themes and concepts
   - Key entities and their significance
   - Important relationships and patterns
   - Insights and implications
4. Key Findings: A bullet list of 3-5 most important findings

Output as JSON:
{{
    "title": "...",
    "summary": "...",
    "full_content": "...",
    "key_findings": ["...", "..."]
}}
"""
```

### Local Search Prompt

```python
LOCAL_SEARCH_PROMPT = """
You are a helpful assistant responding to questions about data in the tables provided.

---Target response length and format---
{response_type}

---Data tables---
{context_data}

Generate a response of the target length and format that responds to the user's question, 
summarizing all information in the data tables appropriate for the response length and format.

If you don't know the answer, just say so. Do not make anything up.
Do not include information where the supporting evidence for it is not provided.

Query: {query}
"""
```

### Global Search Prompt

```python
GLOBAL_SEARCH_PROMPT = """
You are a helpful assistant responding to questions by synthesizing information from 
multiple community reports about related topics.

---Target response length and format---
{response_type}

---Key Points from Community Reports---
{context}

Based on the key points above, generate a comprehensive response that:
1. Addresses the user's question directly
2. Synthesizes information across multiple communities
3. Provides a coherent narrative connecting the main themes
4. Highlights important relationships and patterns

If you don't know the answer, just say so. Do not make anything up.

Query: {query}
"""
```

### Drift Search Follow-up Prompt

```python
DRIFT_FOLLOWUP_PROMPT = """
Based on the following answer to a question, generate follow-up questions 
that would help provide a more complete understanding of the topic.

Original Query: {original_query}
Current Answer: {answer}

Generate 3-5 follow-up questions that:
1. Explore aspects not fully covered in the current answer
2. Dig deeper into specific details mentioned
3. Connect to related concepts

For each question, provide a relevance score (0-10) indicating how important 
this question is for fully answering the original query.

Output as JSON array:
[
    {{"question": "...", "relevance": 8}},
    ...
]
"""
```

---

## Data Structures

### Graph Storage Schema

```python
# Entities Table
entities_schema = {
    "id": "UUID PRIMARY KEY",
    "name": "TEXT NOT NULL",
    "type": "TEXT NOT NULL",
    "description": "TEXT",
    "embedding": "VECTOR(128)",  # Node2Vec embedding
    "source_chunks": "TEXT[]",  # References to source chunk IDs
    "created_at": "TIMESTAMP",
    "updated_at": "TIMESTAMP"
}

# Relationships Table
relationships_schema = {
    "id": "UUID PRIMARY KEY",
    "source_id": "UUID REFERENCES entities(id)",
    "target_id": "UUID REFERENCES entities(id)",
    "description": "TEXT",
    "strength": "INTEGER CHECK (strength >= 1 AND strength <= 10)",
    "source_chunks": "TEXT[]",
    "created_at": "TIMESTAMP"
}

# Communities Table
communities_schema = {
    "id": "UUID PRIMARY KEY",
    "level": "INTEGER NOT NULL",
    "title": "TEXT",
    "summary": "TEXT",
    "full_content": "TEXT",
    "key_findings": "TEXT[]",
    "member_entity_ids": "UUID[]",
    "embedding": "VECTOR(1536)",  # Report embedding
    "importance_score": "FLOAT",
    "created_at": "TIMESTAMP"
}

# Text Chunks Table
chunks_schema = {
    "id": "UUID PRIMARY KEY",
    "document_id": "UUID",
    "content": "TEXT NOT NULL",
    "chunk_index": "INTEGER",
    "embedding": "VECTOR(1536)",
    "entity_ids": "UUID[]",  # Entities extracted from this chunk
    "created_at": "TIMESTAMP"
}
```

### In-Memory Representation

```python
from dataclasses import dataclass, field
from typing import Optional
import numpy as np

@dataclass
class Entity:
    id: str
    name: str
    type: str
    description: str
    embedding: Optional[np.ndarray] = None
    source_chunk_ids: list[str] = field(default_factory=list)
    community_ids: list[str] = field(default_factory=list)

@dataclass
class Relationship:
    id: str
    source_id: str
    target_id: str
    description: str
    strength: int
    source_chunk_ids: list[str] = field(default_factory=list)

@dataclass
class Community:
    id: str
    level: int
    title: str
    summary: str
    full_content: str
    key_findings: list[str]
    member_entity_ids: list[str]
    embedding: Optional[np.ndarray] = None
    importance_score: float = 0.0

@dataclass
class TextChunk:
    id: str
    document_id: str
    content: str
    chunk_index: int
    embedding: Optional[np.ndarray] = None
    entity_ids: list[str] = field(default_factory=list)

@dataclass
class KnowledgeGraph:
    entities: dict[str, Entity] = field(default_factory=dict)
    relationships: dict[str, Relationship] = field(default_factory=dict)
    communities: dict[str, Community] = field(default_factory=dict)
    chunks: dict[str, TextChunk] = field(default_factory=dict)
    
    # Index structures
    entity_name_index: dict[str, str] = field(default_factory=dict)  # name -> id
    entity_embeddings: Optional[np.ndarray] = None
    community_embeddings: Optional[np.ndarray] = None
```

---

## Comparison: Traditional RAG vs GraphRAG

| Aspect | Traditional RAG | GraphRAG |
|--------|-----------------|----------|
| **Data Representation** | Flat text chunks | Structured graph (entities + relationships) |
| **Indexing** | Embed chunks → vector DB | Extract entities/relationships → build graph → embed nodes + reports |
| **Retrieval** | Semantic similarity on chunks | Graph traversal + semantic search on nodes |
| **Context Assembly** | Top-K similar chunks | Traversed entities + relationships + chunks + communities |
| **Multi-hop Reasoning** | Limited (relies on LLM) | Native via graph traversal |
| **Global Questions** | Poor (chunks too specific) | Excellent (community reports) |
| **Implementation Complexity** | Low | High |
| **Indexing Cost** | Low | High (multiple LLM calls) |
| **Query Latency** | Fast | Slower (especially drift search) |
| **Storage Requirements** | Moderate | Higher (graph + embeddings + reports) |
| **Update Complexity** | Simple (re-embed) | Complex (re-extract, re-merge, re-detect communities) |

### Performance Characteristics

```
Query Type                    | Traditional RAG | Local Search | Global Search | Drift Search
------------------------------|-----------------|--------------|---------------|-------------
Simple factual lookup         | Good            | Excellent    | Overkill      | Overkill
Specific technical question   | Good            | Excellent    | Fair          | Good
Multi-hop reasoning           | Poor            | Good         | Fair          | Excellent
Broad thematic question       | Poor            | Fair         | Excellent     | Excellent
Complex multi-faceted query   | Fair            | Good         | Good          | Excellent
Latency                       | Fast            | Moderate     | Moderate      | Slow
```

---

## When to Use What

### Use Traditional RAG When:
- Simple Q&A over documents
- Low latency requirements
- Limited computational budget
- Frequently changing documents
- Straightforward information retrieval
- Proof of concept / MVP stage

### Use GraphRAG When:
- Documents have complex interconnections
- Multi-hop reasoning is required
- Users ask broad thematic questions
- Relationships between concepts matter
- High accuracy is worth the cost
- Knowledge base is relatively stable

### Search Method Selection

```python
def select_search_method(query: str, query_classifier) -> str:
    """
    Automatically select the best search method based on query characteristics.
    """
    # Classify query
    classification = query_classifier.classify(query)
    
    # Decision logic
    if classification["specificity"] == "high" and classification["scope"] == "narrow":
        # Specific questions about particular entities/concepts
        return "local"
    
    elif classification["specificity"] == "low" and classification["scope"] == "broad":
        # Broad thematic questions
        return "global"
    
    elif classification["complexity"] == "high" or classification["requires_synthesis"]:
        # Complex queries requiring both breadth and depth
        return "drift"
    
    else:
        # Default to local for most queries
        return "local"
```

### Query Characteristics for Each Method

**Local Search Indicators:**
- Questions about specific entities ("What is X?", "How does Y work?")
- Questions with clear topic focus
- Queries mentioning specific terms/names
- "What", "How", "Why" questions about particular concepts

**Global Search Indicators:**
- Questions about themes ("What are the main topics?")
- Comparative questions across entire knowledge base
- Summary requests ("Give me an overview of...")
- Questions without specific entity mentions

**Drift Search Indicators:**
- Complex questions requiring multiple perspectives
- Questions with "choose between", "compare and contrast"
- Multi-faceted questions ("How does X relate to Y in the context of Z?")
- Questions requiring both specific details and broad context

---

## Production Considerations

### Indexing Optimization

```python
# Batch processing for large document sets
def index_documents_batch(
    documents: list[str],
    batch_size: int = 10,
    parallel_workers: int = 4
) -> KnowledgeGraph:
    """
    Index documents in batches with parallel processing.
    """
    from concurrent.futures import ThreadPoolExecutor
    
    all_subgraphs = []
    
    for i in range(0, len(documents), batch_size):
        batch = documents[i:i + batch_size]
        
        # Process batch in parallel
        with ThreadPoolExecutor(max_workers=parallel_workers) as executor:
            subgraphs = list(executor.map(process_document, batch))
        
        all_subgraphs.extend(subgraphs)
    
    # Merge all subgraphs
    return merge_all_subgraphs(all_subgraphs)
```

### Caching Strategy

```python
# Cache expensive computations
CACHE_CONFIG = {
    "entity_extraction": {
        "enabled": True,
        "ttl": 86400 * 7,  # 7 days
        "key_format": "entity_extract:{chunk_hash}"
    },
    "community_reports": {
        "enabled": True,
        "ttl": 86400 * 30,  # 30 days
        "key_format": "comm_report:{community_id}:{level}"
    },
    "embeddings": {
        "enabled": True,
        "ttl": 86400 * 30,
        "key_format": "embedding:{type}:{id}"
    }
}
```

### Incremental Updates

```python
def update_knowledge_graph(
    existing_graph: KnowledgeGraph,
    new_documents: list[str],
    changed_documents: list[tuple[str, str]],  # (doc_id, new_content)
    deleted_document_ids: list[str]
) -> KnowledgeGraph:
    """
    Incrementally update knowledge graph without full reindex.
    """
    # 1. Remove entities/relationships from deleted documents
    for doc_id in deleted_document_ids:
        remove_document_from_graph(existing_graph, doc_id)
    
    # 2. Update changed documents
    for doc_id, new_content in changed_documents:
        # Remove old entities/relationships
        remove_document_from_graph(existing_graph, doc_id)
        # Re-process document
        subgraph = process_document(new_content, doc_id)
        merge_subgraph_into_graph(existing_graph, subgraph)
    
    # 3. Add new documents
    for doc in new_documents:
        subgraph = process_document(doc)
        merge_subgraph_into_graph(existing_graph, subgraph)
    
    # 4. Re-run community detection (necessary after changes)
    existing_graph.communities = detect_communities(
        existing_graph.entities,
        existing_graph.relationships
    )
    
    # 5. Regenerate affected community reports
    regenerate_community_reports(existing_graph)
    
    return existing_graph
```

### Cost Estimation

```python
def estimate_indexing_cost(
    num_chunks: int,
    avg_chunk_tokens: int = 1200,
    model: str = "gpt-4o"
) -> dict:
    """
    Estimate cost for indexing pipeline.
    """
    # Pricing (example, update with current rates)
    PRICING = {
        "gpt-4o": {"input": 0.005 / 1000, "output": 0.015 / 1000},
        "gpt-4o-mini": {"input": 0.00015 / 1000, "output": 0.0006 / 1000}
    }
    
    price = PRICING[model]
    
    # Entity extraction: ~2000 token prompt + chunk
    extraction_input = num_chunks * (2000 + avg_chunk_tokens)
    extraction_output = num_chunks * 500  # Estimated output
    
    # Description summarization: ~20% of entities need summarization
    summarization_calls = int(num_chunks * 0.2)
    summarization_input = summarization_calls * 1000
    summarization_output = summarization_calls * 200
    
    # Community reports: estimate ~10% of entities become communities
    num_communities = int(num_chunks * 0.1)
    report_input = num_communities * 2000
    report_output = num_communities * 1000
    
    total_input = extraction_input + summarization_input + report_input
    total_output = extraction_output + summarization_output + report_output
    
    cost = (total_input * price["input"]) + (total_output * price["output"])
    
    return {
        "estimated_cost_usd": round(cost, 2),
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "breakdown": {
            "entity_extraction": round(
                (extraction_input * price["input"]) + 
                (extraction_output * price["output"]), 2
            ),
            "summarization": round(
                (summarization_input * price["input"]) + 
                (summarization_output * price["output"]), 2
            ),
            "community_reports": round(
                (report_input * price["input"]) + 
                (report_output * price["output"]), 2
            )
        }
    }
```

### Monitoring & Observability

```python
# Key metrics to track
GRAPHRAG_METRICS = {
    "indexing": [
        "documents_processed",
        "chunks_created",
        "entities_extracted",
        "relationships_extracted",
        "communities_detected",
        "indexing_duration_seconds",
        "indexing_cost_usd"
    ],
    "retrieval": [
        "queries_processed",
        "search_method_used",
        "entities_retrieved",
        "context_tokens_used",
        "retrieval_latency_ms",
        "generation_latency_ms"
    ],
    "quality": [
        "answer_relevance_score",
        "context_precision",
        "context_recall",
        "faithfulness_score"
    ]
}
```

---

## Quick Reference: Implementation Checklist

### Indexing Pipeline
- [ ] Document chunking (1200 tokens, 100 overlap)
- [ ] Entity extraction per chunk
- [ ] Relationship extraction per chunk
- [ ] Subgraph merging
- [ ] Description summarization
- [ ] Node embedding (Node2Vec)
- [ ] Community detection (Leiden)
- [ ] Community report generation
- [ ] Community report embedding
- [ ] Store all artifacts (graph DB + vector DB)

### Query Pipeline
- [ ] Query classification (local/global/drift)
- [ ] Query embedding
- [ ] Relevant context retrieval
- [ ] Context assembly and ranking
- [ ] Response generation
- [ ] Source attribution

### Production Readiness
- [ ] Batch processing for large document sets
- [ ] Caching for expensive operations
- [ ] Incremental update support
- [ ] Cost monitoring
- [ ] Quality metrics tracking
- [ ] Error handling and retry logic

---

## Libraries & Tools

| Purpose | Recommended Libraries |
|---------|----------------------|
| Graph Storage | Neo4j, NetworkX, igraph |
| Vector Storage | Chroma, Pinecone, Weaviate, pgvector |
| Community Detection | python-louvain, leidenalg, igraph |
| Node Embedding | node2vec, PyTorch Geometric |
| LLM Integration | LangChain, LlamaIndex, direct API |
| Text Chunking | LangChain, tiktoken |
| Full GraphRAG | Microsoft GraphRAG, LlamaIndex PropertyGraph |

---

*This guide provides a comprehensive foundation for implementing GraphRAG systems. Adapt the configurations, prompts, and parameters based on your specific use case and domain requirements.*