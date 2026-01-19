---
sidebar_position: 9
title: Contributing
description: How to contribute to Doclea development.
keywords: [contributing, development, open source, pull request, issues]
---

# Contributing

Thank you for your interest in contributing to Doclea! This guide will help you get started.

---

## Ways to Contribute

### Report Bugs

Found a bug? [Open an issue](https://github.com/doclea/doclea-mcp/issues/new) with:

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Doclea version (`doclea --version`)
- Operating system and version
- Relevant logs or error messages

### Suggest Features

Have an idea? [Open a feature request](https://github.com/doclea/doclea-mcp/issues/new) with:

- Use case description
- Proposed solution
- Alternative solutions considered
- Impact on existing functionality

### Improve Documentation

Documentation improvements are always welcome:

- Fix typos or unclear explanations
- Add examples
- Improve guides
- Translate documentation

### Contribute Code

Ready to code? See the development guide below.

---

## Development Setup

### Prerequisites

- Bun 1.1+ (recommended) or Node.js 20+
- Git
- SQLite3 (for testing)
- PostgreSQL (optional, for full testing)

### Clone and Install

```bash
# Clone the repository
git clone https://github.com/doclea/doclea-mcp.git
cd doclea-mcp

# Install dependencies
bun install

# Run tests to verify setup
bun test
```

### Project Structure

```
doclea-mcp/
├── src/
│   ├── index.ts          # Entry point, MCP server setup
│   ├── types/            # TypeScript type definitions
│   ├── storage/          # Database backends (SQLite, Postgres)
│   ├── scoring/          # Relevance scoring system
│   ├── tagging/          # LLM-based tagging
│   ├── tools/            # MCP tool implementations
│   │   ├── memory/       # Memory CRUD operations
│   │   ├── context/      # Context retrieval
│   │   ├── search/       # Search functionality
│   │   ├── git/          # Git integration
│   │   ├── expertise/    # Code ownership
│   │   └── bootstrap/    # Project initialization
│   ├── database/         # Database utilities
│   ├── migrations/       # Database migrations
│   └── utils/            # Shared utilities
├── docs/                 # Documentation (Docusaurus)
├── tests/                # Test files
└── scripts/              # Build and utility scripts
```

### Development Commands

```bash
# Run in development mode with hot reload
bun run dev

# Run tests
bun test

# Run specific test file
bun test src/__tests__/scoring/scorer.test.ts

# Type checking
bun run typecheck

# Linting
bun run lint

# Build for production
bun run build
```

---

## Code Guidelines

### TypeScript

- Use strict TypeScript
- Prefer `interface` over `type` for objects
- Use Zod for runtime validation
- Document public APIs with JSDoc

```typescript
/**
 * Stores a memory in the database with embedding generation.
 * @param memory - The memory to store
 * @returns The stored memory with generated ID
 */
export async function storeMemory(memory: CreateMemoryInput): Promise<Memory> {
  // Implementation
}
```

### Code Style

- Use ESLint and Prettier configuration
- Prefer explicit types over inference for public APIs
- Use descriptive variable names
- Keep functions focused and small

```typescript
// Good
async function calculateRelevanceScore(
  memory: Memory,
  query: string,
  weights: ScoringWeights
): Promise<number> {
  const similarity = await computeSimilarity(memory.embedding, query);
  const recency = computeRecencyScore(memory.accessedAt);
  const importance = memory.importance;

  return (
    similarity * weights.relevance +
    recency * weights.recency +
    importance * weights.importance
  );
}

// Avoid
async function score(m: any, q: string, w: any) {
  return await x(m.e, q) * w.r + y(m.a) * w.t + m.i * w.i;
}
```

### Testing

- Write tests for new functionality
- Maintain existing test coverage
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

```typescript
describe('storeMemory', () => {
  it('generates embedding for new memory', async () => {
    // Arrange
    const input = {
      title: 'Test memory',
      content: 'Test content',
      type: 'note' as const,
    };

    // Act
    const result = await storeMemory(input);

    // Assert
    expect(result.id).toBeDefined();
    expect(result.embedding).toHaveLength(384);
  });

  it('throws on invalid memory type', async () => {
    // Arrange
    const input = {
      title: 'Test',
      content: 'Test',
      type: 'invalid',
    };

    // Act & Assert
    await expect(storeMemory(input as any)).rejects.toThrow('Invalid type');
  });
});
```

---

## Pull Request Process

### Before Submitting

1. **Create an issue first** for significant changes
2. **Fork the repository**
3. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Make your changes**
5. **Run tests:**
   ```bash
   bun test
   bun run typecheck
   bun run lint
   ```
6. **Commit with conventional commits:**
   ```bash
   git commit -m "feat(memory): add batch update support"
   ```

### Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, etc.)
- `refactor`: Code change that neither fixes nor adds
- `perf`: Performance improvement
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(search): add tag-based filtering
fix(storage): handle concurrent writes correctly
docs(api): add examples for context tool
refactor(scoring): simplify weight calculation
```

### PR Description

Include in your PR:

```markdown
## Summary
Brief description of the changes.

## Related Issue
Fixes #123

## Changes
- Change 1
- Change 2

## Testing
How you tested the changes.

## Checklist
- [ ] Tests pass
- [ ] Types check
- [ ] Lint passes
- [ ] Documentation updated (if needed)
```

### Review Process

1. A maintainer will review your PR
2. Address any feedback
3. Once approved, a maintainer will merge

---

## Documentation

### Adding Documentation

Documentation uses [Docusaurus](https://docusaurus.io/).

```bash
cd docs

# Install dependencies
bun install

# Start dev server
bun run start

# Build
bun run build
```

### Documentation Structure

```
docs/
├── docs/
│   ├── quick-start.md
│   ├── installation/
│   ├── guides/
│   ├── api/
│   ├── cookbook/
│   └── architecture/
├── blog/
└── docusaurus.config.js
```

### Writing Guidelines

- Use clear, concise language
- Include code examples
- Add frontmatter for SEO
- Link to related pages

```markdown
---
sidebar_position: 1
title: Feature Name
description: Clear description for SEO.
keywords: [keyword1, keyword2]
---

# Feature Name

Brief introduction.

## Usage

```typescript
// Code example
```

## See Also

- [Related Page](./related)
```

---

## Architecture Decisions

Major changes should include an ADR (Architecture Decision Record):

```markdown
# ADR-XXX: Title

## Status

Proposed | Accepted | Deprecated | Superseded

## Context

What prompted this decision?

## Decision

What we decided.

## Consequences

### Positive
- Benefit 1
- Benefit 2

### Negative
- Trade-off 1
- Trade-off 2

## Alternatives Considered

- Alternative 1: Why rejected
- Alternative 2: Why rejected
```

---

## Release Process

Releases are managed by maintainers:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create release commit
4. Tag release: `git tag v1.2.3`
5. Push: `git push && git push --tags`
6. GitHub Actions builds and publishes

---

## Getting Help

- **Questions:** Open a [Discussion](https://github.com/doclea/doclea-mcp/discussions)
- **Bugs:** Open an [Issue](https://github.com/doclea/doclea-mcp/issues)
- **Chat:** Join our [Discord](https://discord.gg/doclea)

---

## Code of Conduct

We follow the [Contributor Covenant](https://www.contributor-covenant.org/).

**TL;DR:** Be respectful, welcoming, and constructive.

---

## License

Doclea is licensed under the [MIT License](https://github.com/doclea/doclea-mcp/blob/main/LICENSE).

By contributing, you agree that your contributions will be licensed under the same license.

---

## Thank You!

Every contribution makes Doclea better. Whether it's a bug report, documentation fix, or major feature - we appreciate your help!
