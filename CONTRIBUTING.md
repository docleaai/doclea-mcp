# Contributing to Doclea MCP

Thank you for your interest in contributing to Doclea MCP!

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Docker](https://docs.docker.com/get-docker/) (for integration tests)
- Git

### Getting Started

```bash
# Clone the repository
git clone https://github.com/docleaai/doclea-mcp.git
cd doclea-mcp

# Install dependencies
bun install

# Run in development mode
bun run dev
```

### Running Tests

```bash
# Run all unit tests
bun run test:unit

# Run integration tests (requires Docker)
bun run test:integration

# Run all tests
bun test
```

### Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
# Check for issues
bun run lint

# Auto-fix issues
bun run lint:fix
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`bun test`)
5. Run linting (`bun run lint`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

## Reporting Issues

Please use GitHub Issues to report bugs or request features. Include:

- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Bun version, etc.)

## Code of Conduct

Be respectful and inclusive. We're all here to build something great together.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.