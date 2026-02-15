/**
 * Centralized file discovery patterns for code scanning.
 * Single source of truth for include/exclude patterns across all tools.
 */

export const DEFAULT_INCLUDE_PATTERNS = [
  "**/*.ts",
  "**/*.tsx",
  "**/*.js",
  "**/*.jsx",
  "**/*.sql",
  "**/*.py",
  "**/*.go",
  "**/*.rs",
] as const;

export const DEFAULT_EXCLUDE_PATTERNS = [
  // Package managers & version control
  "**/node_modules/**",
  "**/.git/**",
  "**/vendor/**",

  // Build output directories
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/output/**",
  "**/esm/**",
  "**/cjs/**",
  "**/umd/**",
  "**/compiled/**",
  "**/_build/**",
  "**/.build/**",

  // Framework-specific output
  "**/.next/**",
  "**/.nuxt/**",
  "**/.svelte-kit/**",
  "**/.vercel/**",
  "**/.netlify/**",
  "**/.output/**",
  "**/.turbo/**",
  "**/.cache/**",
  "**/.parcel-cache/**",
  "**/.vite/**",
  "**/.rollup.cache/**",
  "**/.webpack/**",

  // Test/coverage output
  "**/coverage/**",
  "**/.nyc_output/**",
  "**/__pycache__/**",
  "**/.pytest_cache/**",
  "**/htmlcov/**",
  "**/.tox/**",

  // Language-specific build output
  "**/target/**", // Rust/Cargo
  "**/bin/**",
  "**/obj/**", // .NET

  // Generated/compiled files
  "**/*.min.js",
  "**/*.min.css",
  "**/*.d.ts",
  "**/*.js.map",
  "**/*.d.ts.map",
  "**/*.css.map",
  "**/*.bundle.js",
  "**/*.chunk.js",

  // Lock files (not code)
  "**/*.lock",
  "**/package-lock.json",
  "**/pnpm-lock.yaml",
  "**/yarn.lock",
  "**/bun.lock",
  "**/bun.lockb",
  "**/Cargo.lock",
  "**/poetry.lock",
  "**/Gemfile.lock",
  "**/composer.lock",

  // Tool directories
  "**/.doclea/**",
  "**/.beads/**",
  "**/.idea/**",
  "**/.vscode/**",
  "**/.vs/**",

  // Environment and secrets
  "**/.env",
  "**/.env.*",
  "**/.envrc",
  "**/secrets/**",

  // Credentials directories
  "**/.aws/**",
  "**/.ssh/**",
  "**/.kube/**",
  "**/.gnupg/**",

  // Crypto keys
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "**/*.pfx",
  "**/*.crt",
  "**/*.cer",

  // Compiled binaries
  "**/*.pyc",
  "**/*.pyo",
  "**/*.o",
  "**/*.a",
  "**/*.so",
  "**/*.dylib",
  "**/*.dll",
  "**/*.exe",

  // Additional VCS
  "**/.svn/**",
  "**/.hg/**",
] as const;

export type IncludePattern = (typeof DEFAULT_INCLUDE_PATTERNS)[number];
export type ExcludePattern = (typeof DEFAULT_EXCLUDE_PATTERNS)[number];
