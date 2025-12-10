# Doclea Page Outlines - Ready to Build

Complete outlines for the most important pages. Copy and adapt these to start implementing immediately.

---

## 1. Getting Started - Enhanced Version

**Current State:** Basic, needs SEO optimization
**New Approach:** Step-by-step with setup variants
**Word Count Target:** 2000-2500 words
**Primary Keyword:** "how to install doclea", "setup claude code mcp"

### Structure

```
I. Introduction (150 words)
   - Hook: "Get Doclea running in 30 seconds"
   - What you'll learn
   - Which option is right for you
   - Expected time: 2 minutes

II. Prerequisites (200 words)
   A. System Requirements
      - Node.js 18+
      - npm/yarn/bun
      - OS compatibility table
   B. Claude Code Setup
      - Must have Claude Code installed
      - Location of .claude.json
      - Verification step
   C. Optional: Docker (for optimized setup)

III. Option 1: Zero-Config (Recommended) (600 words)
   A. Step 1: Add to Claude Code Config
      - Exact JSON to copy/paste
      - File location (.claude.json)
      - Screenshot of where to paste
   B. Step 2: Restart Claude Code
      - How to fully restart
      - Troubleshoot if it doesn't appear
   C. Step 3: Initialize Project
      - Command to run: "Initialize doclea"
      - What Doclea does automatically
      - Expected output
   D. Step 4: Verify It Works
      - Ask Claude Code: "Search memories for test"
      - Expected response
      - Common first-use issues
   E. Next Steps After Setup
      - Store your first memory
      - Link to tutorial blog post

IV. Option 2: Optimized (Docker) (500 words)
   A. Why Choose This Option
      - When to use (large codebases)
      - Performance improvements
      - System requirements
   B. One-Command Install
      - Copy/paste the curl command
      - What the script does
      - Progress indicators
   C. Verify Installation
      - Check Docker containers running
      - Verify Claude Code connection
      - Performance expectations
   D. Configuration
      - .doclea/config.json location
      - Quick tweaks
      - Link to configuration docs

V. Option 3: Manual Build (400 words)
   A. For Development & Customization
      - Who should do this
      - Prerequisites (Bun, git)
   B. Clone and Build
      - Git clone command
      - Bun install + build
      - Expected build time
   C. Configure Claude Code
      - Absolute path to dist/index.js
      - JSON configuration
      - Windows path handling note
   D. Verification
      - How to test locally
      - Common build issues

VI. Troubleshooting Installation (500 words)
   A. MCP Server Not Appearing
      - Issue 1: Path is not absolute
      - Issue 2: Build not completed
      - Issue 3: Claude Code restart needed
      - Issue 4: Config file location wrong
   B. Slow First Startup
      - Why: Embedding model download (90MB)
      - Cache location
      - How long it takes
      - Verification it's working
   C. SQLite Errors (macOS)
      - Apple SQLite limitation
      - Homebrew SQLite solution
      - Auto-detection explanation
   D. Permission Denied
      - Windows vs. Linux/macOS differences
      - Fix: chmod +x dist/index.js
      - File location verification
   E. Docker Issues
      - Container not starting
      - Port already in use
      - Docker not running
   F. Getting Help
      - Link to GitHub Issues
      - Link to GitHub Discussions
      - Discord community

VII. What's Next (250 words)
   A. Your First Memory
      - One-liner example: "Remember architectural decision about database choice"
      - Blog post to read next
   B. Explore Features
      - Git integration
      - Code expertise
      - Advanced memory search
   C. Configuration (if needed)
      - When to customize
      - Link to config docs
   D. Read the Guides
      - Link to memory management
      - Link to git integration
      - Link to code expertise

VIII. Quick Command Reference (150 words)
   - Command: Initialize doclea
   - Command: Store memory
   - Command: Search memories
   - Command: Generate commit message
   - Command: Suggest reviewers
   - Link to full API docs
```

---

## 2. Memory Management Guide

**Primary Keyword:** "semantic search for code", "code knowledge base"
**Word Count Target:** 2500 words
**Intent:** Learn how to effectively use Doclea's core feature

### Structure

```
I. Introduction (150 words)
   - Problem: Developers forget code decisions between sessions
   - Solution: Persistent, searchable memory
   - What you'll learn in this guide
   - Time to read: 12 minutes

II. Memory Fundamentals (400 words)
   A. What is Persistent Memory?
      - Traditional approach (comments, README)
      - Why that fails
      - Persistent memory approach
      - Doclea's advantage (semantic search)
   B. The Five Memory Types
      1. Decision
         - When to use
         - Real example (database choice)
         - Query that would find it
      2. Solution
         - When to use
         - Real example (authentication bug fix)
         - Query that would find it
      3. Pattern
         - When to use
         - Real example (error handling pattern)
         - Query that would find it
      4. Architecture
         - When to use
         - Real example (system design)
         - Query that would find it
      5. Note
         - When to use
         - Real example (deployment checklist)
         - Query that would find it
   C. Why Semantic Search Works for Code
      - Keyword search limitation
      - Semantic search explanation
      - Embeddings for code
      - Real example: 3 different ways to ask = 1 memory found

III. Storing Your First Memory (600 words)
   A. Memory Storage in Action
      - Ask Claude Code: "Store this as a decision: [your decision]"
      - What Doclea does in background
      - Embedding process explained
      - Storage in both SQLite and vector DB
   B. Step 1: Identify What to Store
      - Checklist: Is this worth storing?
      - Examples of good memories
      - Examples of not-worth-storing
      - Tag strategy
   C. Step 2: Write Clear Memory
      - Write for your future self
      - Include context
      - Include decision rationale (for decisions)
      - Include solution (for solutions)
      - Format template for each type
   D. Step 3: Store in Doclea
      - Exact command syntax
      - Tags (best practices)
      - Metadata (optional)
      - Screenshot of successful store
   E. Verification
      - Ask Claude: "Show me recent memories"
      - Expected output
      - Checking if it's searchable (search test)

IV. Searching Your Memory (700 words)
   A. Why Semantic Search is Powerful
      - Example: Search for "database choice" finds memory tagged "postgres" + "financial-transactions"
      - Example: Search for "authentication" finds 5 different memories about auth patterns
      - Why keyword search would fail
   B. Crafting Effective Searches
      - Natural language queries work best
      - Ask like a human: "How do we handle auth in this project?"
      - Avoid: "auth authentication password"
      - Example queries and results
   C. Searching in Claude Code
      - Command: "Search memories for [topic]"
      - Results format
      - Filtering by type
      - Multiple results handling
   D. API Search Method (for advanced users)
      - API endpoint
      - Query parameter
      - Response format
      - Integration in custom workflows
   E. Search Tips & Tricks
      - Context matters ("in web service" vs "in CLI tool")
      - More specific = better results
      - Tag filtering
      - Date-based filtering
      - Combining searches
   F. Search Result Interpretation
      - Relevance scoring
      - When to use top result
      - When to review multiple results
      - Refining if results aren't helpful

V. Memory Management Best Practices (500 words)
   A. Organization Strategy
      - Flat structure: Keep all memories in one place
      - Use tags for categorization
      - Tag naming conventions
      - Example: ["database", "production", "financial"]
   B. Tagging Strategy
      - Good tag: technical area ("auth", "database", "api")
      - Good tag: team/component ("payments", "frontend")
      - Good tag: decision category ("infrastructure", "security")
      - Avoid: overly specific tags
      - Avoid: redundant tags
      - Consistency (use "authentication" vs "auth")
   C. When to Update Memories
      - Decision updated? Update memory
      - Solution improved? Update memory
      - Found better pattern? Store new + deprecate old
      - Timeline: quarterly review
   D. Removing Old Memories
      - When to delete
      - Archiving vs deletion
      - Deprecation strategy
   E. Privacy Considerations
      - Where memories are stored (local by default)
      - Cloud sync option (coming soon)
      - Sensitive info handling
      - Team guidelines

VI. Common Mistakes & How to Avoid Them (400 words)
   A. Mistake 1: Storing Everything
      - Problem: Noise in results
      - Solution: Only store important decisions/patterns
      - Guideline: "Would I search for this in 6 months?"
   B. Mistake 2: Vague Memory Descriptions
      - Problem: Hard to find later
      - Problem: Unclear why it matters
      - Solution: Write for your future self
      - Example: Bad vs. Good
   C. Mistake 3: Inconsistent Tags
      - Problem: Fragmented results
      - Solution: Tag strategy document
      - Solution: Regular tag review
   D. Mistake 4: Never Updating Memories
      - Problem: Stale information
      - Solution: Quarterly memory review
      - Solution: Update when code changes
   E. Mistake 5: Misusing Memory Types
      - Problem: Hard to find right memory
      - Solution: Clear type definitions (reference section)
      - Solution: Examples for each type
   F. Mistake 6: Searching Too Broadly
      - Problem: Too many results
      - Solution: Specific search terms
      - Solution: Use tags to narrow

VII. Building Your Memory System (400 words)
   A. First Week
      - Bootstrap from git history
      - Store 5-10 key architectural decisions
      - Document main code patterns
      - Establish team tagging standard
   B. Month 1
      - Store solutions as you find them
      - Document infrastructure decisions
      - Build 50+ core memories
      - Search 3-5x daily (builds habit)
   C. Ongoing
      - New decisions → store immediately
      - Bug fixes → store solutions
      - Code reviews → capture patterns
      - Regular search habit
      - Monthly memory cleanup

VIII. Next Steps
   - Blog post: "Building a Code Knowledge Base"
   - API docs: doclea_search endpoint
   - Guide: Git integration
   - Advanced: Custom memory workflows
```

---

## 3. Git Integration Guide

**Primary Keyword:** "auto generate commit messages", "ai generated changelog"
**Word Count Target:** 2000 words
**Intent:** Learn to automate git workflows

### Structure

```
I. Introduction (150 words)
   - Problem: Writing commit messages and PR descriptions takes time
   - Solution: AI-generated context-aware git messages
   - What you'll learn
   - Expected time: 10 minutes to read, 5 minutes to try

II. Why Git Integration Matters (300 words)
   A. Current Developer Pain
      - Writing commit messages every few minutes
      - Thinking about what changed (code context)
      - Maintaining consistency across team
      - Writing PR descriptions from scratch
   B. How Doclea Helps
      - Uses stored memories for context
      - Generates conventional commits
      - Adds architectural context
      - Suggests reviewers based on code expertise
   C. Real Impact
      - 2-3 minutes saved per commit (adds up!)
      - Better commit messages (searchable, contextual)
      - Faster PR reviews (better descriptions)
      - Team knowledge capture

III. Generating Commit Messages (600 words)
   A. How It Works
      - Claude Code analyzes staged changes
      - Consults Doclea memories for context
      - Generates conventional commit format
      - You review and accept/edit
   B. Step-by-Step
      1. Make code changes
      2. Stage your changes: git add .
      3. Ask Claude: "Generate a commit message"
      4. Claude asks Doclea for context
      5. Doclea provides relevant memories
      6. Claude generates message
      7. You review and refine if needed
      8. Copy message and commit
   C. Generated Message Format
      - Conventional Commit format
      - Example: "feat(auth): add OAuth2 provider integration"
      - Example: "fix(database): handle null timestamps in migrations"
      - Example: "docs(api): document memory search filtering"
   D. Understanding the Generated Message
      - Type: feat, fix, docs, style, test, chore
      - Scope: what part of codebase
      - Subject: what was changed
      - Body (if applicable): why it changed
   E. Customizing the Message
      - When to edit the generated message
      - Common improvements
      - Maintaining team conventions
      - Link to git branching strategy docs

IV. Generating PR Descriptions (500 words)
   A. Better PRs with Context
      - Problem: Generic PR descriptions
      - Solution: Context from memories
      - Impact: Faster reviews, better feedback
   B. The Process
      - After pushing branch, ask Claude: "Create a PR description"
      - References related architectural decisions
      - Explains why changes matter
      - Links to related issues/memories
   C. Generated PR Template
      - Summary of changes
      - Context/why this matters
      - Relevant architectural decisions
      - Testing checklist
      - Known issues or concerns
   D. Example PR Description
      - Before (generic)
      - After (with Doclea context)
      - Reviewer feedback improvement
   E. Integration with GitHub
      - Copy generated description to GitHub PR
      - Format preservation
      - Tips for reviewers

V. Generating Changelogs (400 words)
   A. Automatic Release Notes
      - Problem: Manual changelog maintenance
      - Solution: Generate from commits
      - Advantage: Always up-to-date, comprehensive
   B. Command
      - Ask Claude: "Generate changelog from v1.0.0 to HEAD"
      - Includes all commits in range
      - Groups by type (features, fixes, docs)
   C. Output Format
      - Version heading
      - Features section
      - Bug fixes section
      - Breaking changes section
      - Contributor credits
   D. Customizing Changelog
      - Rewriting entries for clarity
      - Adding release notes
      - Including migration guides for breaking changes
   E. Publishing
      - Copy to CHANGELOG.md
      - Pin to release notes
      - Publish to GitHub releases

VI. Code Expertise: Suggesting Reviewers (500 words)
   A. Why Reviewer Assignment Matters
      - Fast code review turnaround
      - Knowledge distribution in team
      - Reducing bottlenecks
      - Teaching opportunities
   B. How Doclea Identifies Expertise
      - Analyzes git blame data
      - Tracks who touched which code
      - Identifies recent changes
      - Respects review load
   C. Suggesting Reviewers
      - Ask Claude: "Who should review changes to src/auth/?"
      - Returns list of suggestions
      - Reasoning for each suggestion
      - Example:
         "Jane (50% of auth commits, recent activity)"
         "John (35% of auth commits, 2 active PRs)"
         "Sarah (20% of auth commits, fresh perspective)"
   D. Using in GitHub
      - Add reviewers from suggestion list
      - Adds context comment in PR
      - Teaches new developers (fresh perspectives)
   E. Team Patterns
      - Always assign primary maintainer
      - Add fresh eyes for learning
      - Balance expertise across team
      - Rotate reviewers to build knowledge

VII. Workflow Integration (400 words)
   A. Local Development Workflow
      - Edit code locally
      - Ask Claude for commit message
      - Stage and commit
      - Ask Claude for PR description
      - Push branch
      - Create PR with provided description
      - Claude suggests reviewers
   B. GitHub Actions Integration (Optional)
      - Auto-generate changelogs on release
      - Format commit messages on push
      - Tag commits with context labels
   C. Team Practices
      - Consistency: everyone uses same system
      - Feedback loop: review messages, learn patterns
      - Documentation: store architectural decisions
      - Improvement: refine memory tags based on usage

VIII. Best Practices (300 words)
   A. Making It Effective
      - Keep architectural decisions updated
      - Build comprehensive memory system
      - Tag memories consistently
      - Regular memory cleanup
   B. Avoid Common Pitfalls
      - Don't ignore generated messages (review them!)
      - Don't skip memories (context = better messages)
      - Don't use for trivial changes (low value)
   C. Measuring Impact
      - Time saved per commit
      - Commit message consistency
      - PR review speed
      - Team knowledge distribution

IX. Next Steps
   - Code Expertise guide
   - Blog: Advanced git workflows
   - API docs: git tools reference
```

---

## 4. Code Expertise & Reviewer Suggestion Page

**Primary Keyword:** "pr reviewer suggestion", "code owner identification"
**Word Count Target:** 1800 words
**Intent:** Learn to optimize code reviews

### Structure

```
I. Introduction (150 words)
   - Problem: Code review bottlenecks, uneven knowledge
   - Solution: Data-driven reviewer suggestions
   - What you'll learn
   - Time to read: 8 minutes

II. The Code Review Challenge (300 words)
   A. Common Problems
      - Same people review everything (bottleneck)
      - New developers don't learn the codebase
      - Knowledge siloed to a few experts
      - Slow reviews due to load
      - Bus factor: what if key person leaves?
   B. Why It Matters
      - Faster feedback = faster features
      - Knowledge distribution = safer team
      - Mentorship opportunities
      - Business continuity
   C. How Doclea Helps
      - Maps expertise from git history
      - Suggests optimal reviewers
      - Balances expertise with teaching
      - Identifies knowledge gaps

III. How Code Expertise Mapping Works (400 words)
   A. The Data Source: Git Blame
      - Every commit has author
      - Every file has history
      - Doclea analyzes all commits
      - Identifies who touched what code
   B. What Doclea Learns
      - File ownership (who commits there most)
      - Time recency (recent changes = current knowledge)
      - Commit frequency (expertise depth)
      - Related files (interconnected code)
   C. Real Example
      - src/auth/oauth.ts: Jane (80%), John (15%), Sarah (5%)
      - src/auth/middleware.ts: John (70%), Jane (25%), Sarah (5%)
      - Doclea suggests: Jane (primary), John (secondary), Sarah (learning)
   D. Accuracy Notes
      - Works best with 3+ months of git history
      - Better with active codebase
      - Handles refactoring & renames
      - Respects team turnover

IV. Reviewing Expertise Mapping (500 words)
   A. Viewing the Expertise Map
      - Ask Claude: "Show me codebase expertise for src/"
      - Shows all files and expertise distribution
      - Visual breakdown by percentage
      - Time since last change
   B. Analyzing the Map
      - Green zones: Well-distributed expertise
      - Yellow zones: Some concentration
      - Red zones: Bus factor risk (1 person)
      - Opportunity zones: New developer areas for learning
   C. Understanding Bus Factor
      - Definition: minimum people needed to maintain code
      - Example: 1 person = bus factor 1 (high risk)
      - Example: 3+ people = bus factor 3 (safe)
      - Importance: business continuity
   D. Expertise Gaps
      - Identifying them
      - Implications for team
      - Addressing through mentorship
      - Using for hiring decisions

V. Suggesting Reviewers (600 words)
   A. The Review Suggestion Process
      1. Developer opens PR with changes to multiple files
      2. Asks Claude: "Suggest PR reviewers"
      3. Doclea analyzes changed files
      4. Ranks reviewers by expertise
      5. Suggests 2-4 reviewers with reasoning
   B. Review Suggestion Algorithm
      - Primary: High expertise + available
      - Secondary: Growing expertise + learning opportunity
      - Consideration: Current review load
      - Consideration: File importance
   C. Example Suggestion
      ```
      For PR changing:
      - src/auth/oauth.ts (Jane: 80%)
      - src/database/queries.ts (Alex: 75%)
      - docs/api.md (Sarah: 60%)

      Suggested Reviewers:
      1. Jane (primary auth expert, 2 active reviews)
      2. Alex (primary database expert, 1 active review)
      3. Tom (growing expertise in auth, 0 active reviews)
      ```
   D. Reasoning Behind Suggestions
      - Who to assign: Primary expert
      - Who else to add: Secondary area expert
      - Who to include for learning: Fresh perspective
      - Load balancing: Share review responsibility
   E. Customizing Suggestions
      - You're not required to follow suggestions
      - Use as starting point
      - Override for business reasons
      - Document reasoning for complex changes

VI. Building a Review Culture (400 words)
   A. Using Suggestions Effectively
      - Always include primary expert
      - Rotate secondary reviewers
      - Include junior developers regularly
      - Balance expertise with learning
   B. Teaching Through Reviews
      - Junior reviewers learn from experts
      - Pair new and experienced developers
      - Document decisions in PR
      - Mentorship opportunities
   C. Knowledge Distribution
      - No more than 50% of code owned by one person
      - Target: 3+ owners for critical systems
      - Regular rotation of responsibility
      - Cross-training on critical paths
   D. Team Metrics
      - Review turnaround time
      - Reviewer distribution (who reviews most?)
      - Knowledge coverage (is code documented?)
      - Bus factor by module

VII. Preventing Knowledge Silos (300 words)
   A. Identifying Silos
      - One person knows critical system
      - No backup for core functionality
      - Junior developers can't work there
      - Risk to project if person leaves
   B. Breaking Down Silos
      - Pair programming on critical code
      - Code reviews from non-experts
      - Documentation requirements
      - Shared code ownership goals
   C. Long-term Sustainability
      - Build redundancy
      - Rotate responsibilities
      - Continuous learning culture
      - Hiring to fill gaps

VIII. Integration with GitHub (300 words)
   A. Adding Suggested Reviewers to PR
      - Option 1: Manual (copy list)
      - Option 2: Auto-assign (GitHub automation)
      - Option 3: CODEOWNERS file (GitHub native)
   B. CODEOWNERS Sync (Future Feature)
      - Generate from Doclea expertise
      - Auto-assign based on changed files
      - Streamline review process
   C. GitHub Actions Workflow
      - Trigger on PR open
      - Query Doclea for expertise
      - Comment with suggestions
      - Auto-assign if configured

IX. Next Steps
   - Git integration guide
   - Blog: "Reducing Code Review Bottlenecks"
   - API docs: expertise tools reference
   - Configure team review standards
```

---

## 5. Configuration Page

**Primary Keyword:** "configure embedding model", "vector database setup"
**Word Count Target:** 2500 words
**Intent:** Help users customize Doclea for their needs

### Structure

```
I. Introduction (150 words)
   - Doclea works out of the box
   - Some may want customization
   - When to configure
   - What this guide covers

II. Configuration Basics (300 words)
   A. Configuration File Location
      - .doclea/config.json in project root
      - Alternative: .doclea/config.ts for development
      - Environment variables (coming soon)
   B. Minimal Configuration
      - Copy/paste basic config
      - All defaults explained
      - What each option does
   C. Configuration Priority
      - Command line args (highest)
      - Environment variables (middle)
      - .doclea/config.json (medium)
      - .claude.json global config (lowest)
   D. Validation
      - How to verify config is correct
      - Error messages explained
      - Troubleshooting invalid config

III. Embedding Providers (700 words)
   A. Overview of Options
      - What embeddings do (1-paragraph recap)
      - Trade-offs: cost, privacy, quality, speed
      - Selection matrix (which to choose)
   B. Option 1: Transformers (Default)
      - Config:
        ```json
        "embedding": {
          "provider": "transformers",
          "model": "Xenova/all-MiniLM-L6-v2"
        }
        ```
      - Pros:
        - Zero setup required
        - Privacy-first (runs locally)
        - No API keys
        - Fast after first download
      - Cons:
        - First startup slow (90MB download)
        - Smaller model (good for code though)
        - CPU-intensive
      - Best for: Quick start, privacy, small/medium teams
      - Cost: Free
      - Setup time: Automatic (downloads on first run)
   C. Option 2: OpenAI Embeddings
      - Config:
        ```json
        "embedding": {
          "provider": "openai",
          "apiKey": "sk-...",
          "model": "text-embedding-3-small"
        }
        ```
      - Pros:
        - Highest quality embeddings
        - Best for code understanding
        - No local computation
        - Scales to any size
      - Cons:
        - API cost ($0.00002 per 1K tokens)
        - Requires API key
        - Network calls for every embed
        - Privacy consideration
      - Cost calculation: Example project 1M tokens/year = ~$20
      - Best for: Large projects, production, highest quality
      - Setup time: 5 minutes (get API key)
   D. Option 3: Local TEI (Docker)
      - Config:
        ```json
        "embedding": {
          "provider": "local",
          "endpoint": "http://localhost:8080"
        }
        ```
      - Pros:
        - Very high quality
        - Privacy-first
        - No per-token cost
        - Fast (local inference)
      - Cons:
        - Requires Docker
        - GPU recommended
        - Higher setup complexity
        - Server maintenance
      - Best for: Large teams, on-premise, GPU available
      - Setup time: 15-30 minutes (Docker + models)
   E. Option 4: Ollama (Local)
      - Config:
        ```json
        "embedding": {
          "provider": "ollama",
          "model": "nomic-embed-text",
          "endpoint": "http://localhost:11434"
        }
        ```
      - Pros:
        - Simple local setup
        - No Docker required
        - Good embedding quality
        - Privacy-first
      - Cons:
        - Requires Ollama installation
        - CPU-heavy
        - Smaller model library
      - Best for: Local development, testing
      - Setup time: 10 minutes (install Ollama)

IV. Vector Store Providers (400 words)
   A. Overview
      - Where embeddings are stored
      - Query performance trade-offs
      - Scalability considerations
   B. Option 1: SQLite-Vec (Default)
      - Config:
        ```json
        "vector": {
          "provider": "sqlite-vec",
          "dbPath": ".doclea/vectors.db"
        }
        ```
      - Pros:
        - No external service
        - Single file
        - Works on any system
        - Backup-friendly
      - Cons:
        - Not scalable to millions
        - Slower at high volume
        - Single-threaded
      - Best for: Individual developers, small teams
      - Performance: < 100ms query on 100K vectors
   C. Option 2: Qdrant (Docker)
      - Config:
        ```json
        "vector": {
          "provider": "qdrant",
          "url": "http://localhost:6333"
        }
        ```
      - Pros:
        - Excellent performance
        - Scales to millions of vectors
        - Advanced filtering
        - Production-ready
      - Cons:
        - Requires Docker
        - Server setup/maintenance
        - More complex operations
      - Best for: Teams, production, large codebases
      - Performance: < 10ms query on 1M vectors
   D. Comparison Table
      | Provider | Scalability | Speed | Setup | Cost |
      |----------|------------|-------|-------|------|
      | SQLite-Vec | Small | Medium | Instant | Free |
      | Qdrant | Large | Fast | 10min | Free (self-hosted) |

V. Storage Configuration (300 words)
   A. Metadata Storage
      - Where memory metadata lives (SQLite)
      - Configuration:
        ```json
        "storage": {
          "dbPath": ".doclea/local.db"
        }
        ```
      - Backup strategy
      - Migration between locations
   B. Backup & Restore
      - Backup: Copy .doclea/ directory
      - Restore: Replace .doclea/ directory
      - No special tools required
   C. Cloud Storage (Coming Soon)
      - Plans for team sync
      - Preview configuration
      - Timeline

VI. Advanced Configuration (400 words)
   A. Performance Tuning
      - Batch size for embeddings
      - Vector search parameters
      - Database indexing
      - Memory limits
   B. Privacy & Security
      - Local-only configuration
      - API key management (environment variables)
      - Network isolation options
   C. Multi-Provider Setup (Advanced)
      - Using different providers per project
      - Testing new embeddings
      - Gradual migration
   D. Custom Embeddings (Experimental)
      - For specialized use cases
      - Example: domain-specific models
      - Discussion: when to use

VII. Configuration Examples (400 words)
   A. Small Team Setup
      - Everything local
      - SQLite + Transformers
      - Fast setup
      - JSON example
   B. Large Team Setup
      - Qdrant for scale
      - OpenAI for quality
      - JSON example
      - Infrastructure notes
   C. Privacy-First Setup
      - Everything local
      - Transformers + SQLite
      - Off-network
      - JSON example
   D. Development Setup
      - Local Ollama
      - SQLite for simplicity
      - Easy iteration
      - JSON example

VIII. Migration Between Providers (300 words)
   A. Changing Embeddings
      - Why you might (better quality, cost savings)
      - How to do it safely
      - Re-embedding old memories
      - Timeline considerations
   B. Changing Vector Store
      - Export from SQLite
      - Import to Qdrant
      - Verification steps
      - Rollback plan
   C. Disaster Recovery
      - Backup strategy
      - Regular testing
      - Restore procedure

IX. Next Steps
   - Getting Started guide
   - Architecture: Embeddings deep dive
   - Blog: "Choosing Your Embedding Provider"
```

---

## 6. FAQ Page

**Primary Keyword:** "doclea faq"
**Word Count Target:** 2500 words
**Intent:** Answer all common questions

### Structure

```
I. Getting Started Questions (30% of content)

Q1: What is Doclea? (150 words)
- Brief explanation
- Use cases
- Compared to other tools
- Link to full docs

Q2: How do I install Doclea? (150 words)
- Quick answer: 30 seconds
- Three options overview
- Link to Getting Started guide
- Expected time

Q3: What are the system requirements? (100 words)
- Node.js version
- OS compatibility
- RAM/disk recommendations
- Claude Code version

Q4: Can I use Doclea without Claude Code? (100 words)
- Short answer: Not currently
- Future possibilities
- Alternative approaches
- Timeline

Q5: Does Doclea work with other AI coding assistants? (150 words)
- Current: Claude Code only
- Planned: VS Code Copilot, others
- Why MCP-native
- Timeline for expansions

II. Usage Questions (25% of content)

Q6: What should I store in Doclea? (150 words)
- Architectural decisions
- Solutions to problems
- Code patterns
- What NOT to store
- Examples

Q7: How many memories should I store? (100 words)
- Quality over quantity
- Guidance: 50-500 for starting teams
- Scaling with team
- Search performance

Q8: Can I search memories by tag? (100 words)
- Current: Natural language search
- Coming: Tag filtering
- Workaround: Include tags in query
- API filtering available

Q9: How long does first startup take? (100 words)
- Why: 90MB embedding download
- Speed: ~2-3 minutes on decent connection
- Caching: Only happens once
- Verification: Check cache directory

Q10: Can I export my memories? (150 words)
- Format: JSON
- Use cases: Backup, migration, analysis
- Command: doclea export
- Import to other tools

III. Privacy & Security (20% of content)

Q11: Where are my memories stored? (150 words)
- Default: Local .doclea/ directory
- Not uploaded anywhere
- Backup responsibility on you
- Cloud sync coming

Q12: Is my code private? (150 words)
- Code is never sent anywhere
- Embeddings generated locally (by default)
- Only metadata + embeddings stored
- No external API calls (unless configured)

Q13: What about API keys for OpenAI? (100 words)
- Store in environment variables
- Never in config file
- Use .env.local or secrets manager
- Security best practices

Q14: Can I use Doclea in regulated industries? (150 words)
- HIPAA/PCI/SOC2 compliant setup possible
- Local-only configuration
- No external APIs
- Recommendation: Deploy Qdrant/TEI on-premise
- Audit trail (coming feature)

Q15: How is the embedding model licensed? (100 words)
- Transformers.js: MIT + Apache 2.0
- Models: HF license (usually MIT)
- OpenAI: Per their terms
- All: Production-use friendly

IV. Configuration & Technical (20% of content)

Q16: Should I use OpenAI embeddings or local? (200 words)
- Local: Free, private, slower
- OpenAI: Better quality, $$ cost, fast
- Comparison table
- Recommendation by use case
- Cost calculator

Q17: What embedding model should I use? (150 words)
- Default (all-MiniLM): Good general purpose
- For code: Specialized models (coming)
- Large models: OpenAI text-embedding-3-large
- Recommendation: Start with default

Q18: What's the difference between SQLite-Vec and Qdrant? (150 words)
- SQLite-Vec: Local, simple, good for <100K
- Qdrant: Production, scalable, requires Docker
- Comparison table
- Recommendation: SQLite for start, Qdrant for scale

Q19: Can I host Doclea in the cloud? (150 words)
- Current: MCP server runs locally on your machine
- Server: Doclea server could theoretically run in cloud
- Current design: Not cloud-first
- Coming: Cloud sync for team sharing

Q20: How do I upgrade Doclea? (100 words)
- npm: npm install -g @doclea/mcp@latest
- Bun: bun install @doclea/mcp@latest
- Zero downtime: No migrations needed
- Backward compatible: Memories are safe

V. Performance & Scaling (15% of content)

Q21: How many memories can Doclea handle? (150 words)
- SQLite-Vec: 100K+ (tested with 500K)
- Qdrant: Millions
- Practical: Team of 10 = 1000+ memories
- Search speed: < 100ms on SQLite
- Recommendation: Switch to Qdrant at 100K+

Q22: Is Doclea slow for large codebases? (150 words)
- Initial setup: Yes (minutes to scan)
- Ongoing: No (searches are fast)
- Caching: Results cached
- Optimization: Index on tags
- Scaling: Use Qdrant + OpenAI

Q23: What happens if I have thousands of memories? (100 words)
- Search still fast (vector indexing)
- Storage: ~1KB per memory on disk
- RAM: Depends on provider
- Recommendation: Organization strategy

Q24: Can I use Doclea offline? (100 words)
- Yes: Default setup works offline
- No: If using OpenAI embeddings (API needed)
- Yes: With local Ollama/TEI
- Recommendation: Transformers for offline

VI. Integration & Workflow (15% of content)

Q25: Can I integrate Doclea with my CI/CD? (150 words)
- Currently: No official integration
- Possible: Call Doclea API from scripts
- Coming: GitHub Actions integration
- Use case: Auto-tag commits, publish changelogs

Q26: Does Doclea work with GitHub Actions? (100 words)
- Currently: Manual integration possible
- Coming: Official GitHub Actions
- Timeline: Q1 2025
- Workaround: Shell scripts calling Doclea

Q27: Can I share memories across my team? (150 words)
- Currently: Memories are local
- Coming: Cloud sync for team sharing
- Timeline: Q1 2025
- Workaround: Git-committed .doclea/ directory

Q28: How do I backup my memories? (100 words)
- Simple: Back up .doclea/ directory
- Frequency: Daily or after important additions
- Tools: Standard backup tools (rsync, zip, git)
- Recovery: Restore .doclea/ directory

VII. Support & Development (10% of content)

Q29: What's the roadmap? (200 words)
- Q4 2024: Current release
- Q1 2025: Cloud sync, GitHub Actions
- Q2 2025: VS Code extension, team features
- Q3 2025: Analytics dashboard
- Full roadmap: Link to GitHub

Q30: How do I report a bug? (100 words)
- GitHub Issues: github.com/docleaai/doclea-mcp/issues
- Include: System info, steps to reproduce, logs
- Discord: Quick questions, feature discussions
- Response time: 24-48 hours

Q31: Can I contribute to Doclea? (100 words)
- Yes! It's open source (MIT)
- How: GitHub PR workflow
- Areas: Features, bug fixes, documentation
- Link to CONTRIBUTING.md

Q32: Is there a free version? (100 words)
- Yes, fully free
- MIT open source license
- No paid tiers planned
- Open source forever commitment
```

---

## Implementation Priority

**Week 1 (Highest Impact):**
1. Getting Started (enhanced) - 2000+ words, major revision
2. FAQ Page - 2500 words, answer all questions
3. Memory Management - 2500 words, detailed guide

**Week 2:**
4. Git Integration - 2000 words, popular feature
5. Code Expertise - 1800 words, advanced feature

**Week 3:**
6. Configuration - 2500 words, needed for customization

**Then:** Create supporting pages (architecture, comparisons) and blog posts

---

## Copy-Paste Quick Start

For each page above:

1. Create file in `/docs/docs/[category]/[page-name].md`
2. Add front matter from template
3. Copy structure outline
4. Fill in content sections
5. Add internal links
6. Add code examples
7. Test locally: `yarn start`
8. Commit and push

Each page should be ready to publish within 1-2 hours once outline is followed.
