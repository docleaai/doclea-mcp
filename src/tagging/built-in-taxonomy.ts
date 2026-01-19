/**
 * Built-in taxonomy of common developer tags
 * Organized by category with canonical names and aliases
 */

import type { TagDefinition } from "./types";

/**
 * Built-in tag definitions for common development concepts
 * All tags use source: "builtin" and follow lowercase-hyphenated naming
 */
export const BUILT_IN_TAXONOMY: TagDefinition[] = [
  // =========================================================================
  // TECHNOLOGY TAGS - Languages, frameworks, tools (~30 tags)
  // =========================================================================

  // Languages
  {
    canonical: "typescript",
    aliases: ["ts", "tsc"],
    category: "technology",
    description: "TypeScript programming language",
    source: "builtin",
  },
  {
    canonical: "javascript",
    aliases: ["js", "ecmascript", "es6", "es2015", "es2020"],
    category: "technology",
    description: "JavaScript programming language",
    source: "builtin",
  },
  {
    canonical: "python",
    aliases: ["py", "python3"],
    category: "technology",
    description: "Python programming language",
    source: "builtin",
  },
  {
    canonical: "rust",
    aliases: ["rs", "rustlang"],
    category: "technology",
    description: "Rust programming language",
    source: "builtin",
  },
  {
    canonical: "go",
    aliases: ["golang"],
    category: "technology",
    description: "Go programming language",
    source: "builtin",
  },
  {
    canonical: "java",
    aliases: ["jvm"],
    category: "technology",
    description: "Java programming language",
    source: "builtin",
  },
  {
    canonical: "csharp",
    aliases: ["c#", "dotnet", ".net"],
    category: "technology",
    description: "C# programming language and .NET platform",
    source: "builtin",
  },

  // Frontend Frameworks
  {
    canonical: "react",
    aliases: ["reactjs", "react-js", "react.js"],
    category: "technology",
    description: "React JavaScript library",
    source: "builtin",
  },
  {
    canonical: "nextjs",
    aliases: ["next", "next-js", "next.js"],
    category: "technology",
    parent: "react",
    description: "Next.js React framework",
    source: "builtin",
  },
  {
    canonical: "vue",
    aliases: ["vuejs", "vue-js", "vue.js"],
    category: "technology",
    description: "Vue.js JavaScript framework",
    source: "builtin",
  },
  {
    canonical: "angular",
    aliases: ["angularjs", "ng"],
    category: "technology",
    description: "Angular web framework",
    source: "builtin",
  },
  {
    canonical: "svelte",
    aliases: ["sveltejs", "sveltekit"],
    category: "technology",
    description: "Svelte JavaScript framework",
    source: "builtin",
  },
  {
    canonical: "tailwind",
    aliases: ["tailwindcss", "tailwind-css"],
    category: "technology",
    description: "Tailwind CSS framework",
    source: "builtin",
  },

  // Backend Frameworks
  {
    canonical: "nodejs",
    aliases: ["node", "node-js", "node.js"],
    category: "technology",
    description: "Node.js JavaScript runtime",
    source: "builtin",
  },
  {
    canonical: "express",
    aliases: ["expressjs", "express-js", "express.js"],
    category: "technology",
    parent: "nodejs",
    description: "Express.js web framework",
    source: "builtin",
  },
  {
    canonical: "fastify",
    aliases: ["fastify-js"],
    category: "technology",
    parent: "nodejs",
    description: "Fastify web framework",
    source: "builtin",
  },
  {
    canonical: "nestjs",
    aliases: ["nest", "nest-js"],
    category: "technology",
    parent: "nodejs",
    description: "NestJS framework",
    source: "builtin",
  },
  {
    canonical: "django",
    aliases: [],
    category: "technology",
    parent: "python",
    description: "Django web framework",
    source: "builtin",
  },
  {
    canonical: "flask",
    aliases: [],
    category: "technology",
    parent: "python",
    description: "Flask web framework",
    source: "builtin",
  },
  {
    canonical: "fastapi",
    aliases: ["fast-api"],
    category: "technology",
    parent: "python",
    description: "FastAPI web framework",
    source: "builtin",
  },

  // Databases
  {
    canonical: "postgresql",
    aliases: ["postgres", "pg", "psql"],
    category: "technology",
    description: "PostgreSQL database",
    source: "builtin",
  },
  {
    canonical: "mysql",
    aliases: ["mariadb"],
    category: "technology",
    description: "MySQL database",
    source: "builtin",
  },
  {
    canonical: "mongodb",
    aliases: ["mongo"],
    category: "technology",
    description: "MongoDB database",
    source: "builtin",
  },
  {
    canonical: "redis",
    aliases: [],
    category: "technology",
    description: "Redis in-memory data store",
    source: "builtin",
  },
  {
    canonical: "sqlite",
    aliases: ["sqlite3"],
    category: "technology",
    description: "SQLite database",
    source: "builtin",
  },
  {
    canonical: "elasticsearch",
    aliases: ["elastic", "es"],
    category: "technology",
    description: "Elasticsearch search engine",
    source: "builtin",
  },

  // Infrastructure & DevOps
  {
    canonical: "kubernetes",
    aliases: ["k8s", "kube"],
    category: "technology",
    description: "Kubernetes container orchestration",
    source: "builtin",
  },
  {
    canonical: "docker",
    aliases: ["containers", "containerization"],
    category: "technology",
    description: "Docker containerization",
    source: "builtin",
  },
  {
    canonical: "aws",
    aliases: ["amazon-web-services"],
    category: "technology",
    description: "Amazon Web Services",
    source: "builtin",
  },
  {
    canonical: "gcp",
    aliases: ["google-cloud", "google-cloud-platform"],
    category: "technology",
    description: "Google Cloud Platform",
    source: "builtin",
  },
  {
    canonical: "azure",
    aliases: ["microsoft-azure"],
    category: "technology",
    description: "Microsoft Azure",
    source: "builtin",
  },
  {
    canonical: "terraform",
    aliases: ["tf", "iac"],
    category: "technology",
    description: "Terraform infrastructure as code",
    source: "builtin",
  },

  // Tools & APIs
  {
    canonical: "git",
    aliases: ["github", "gitlab", "version-control", "vcs"],
    category: "technology",
    description: "Git version control",
    source: "builtin",
  },
  {
    canonical: "graphql",
    aliases: ["gql"],
    category: "technology",
    description: "GraphQL query language",
    source: "builtin",
  },
  {
    canonical: "rest-api",
    aliases: ["rest", "restful", "rest-api"],
    category: "technology",
    description: "REST API architecture",
    source: "builtin",
  },
  {
    canonical: "grpc",
    aliases: ["g-rpc"],
    category: "technology",
    description: "gRPC remote procedure call",
    source: "builtin",
  },

  // =========================================================================
  // CONCEPT TAGS - Patterns, principles, methodologies (~18 tags)
  // =========================================================================

  {
    canonical: "authentication",
    aliases: ["auth", "authn"],
    category: "concept",
    description: "User authentication",
    source: "builtin",
  },
  {
    canonical: "authorization",
    aliases: ["authz", "permissions", "rbac", "acl"],
    category: "concept",
    description: "Access control and permissions",
    source: "builtin",
  },
  {
    canonical: "caching",
    aliases: ["cache", "memoization"],
    category: "concept",
    description: "Data caching strategies",
    source: "builtin",
  },
  {
    canonical: "api-design",
    aliases: ["api-architecture"],
    category: "concept",
    description: "API design patterns",
    source: "builtin",
  },
  {
    canonical: "testing",
    aliases: ["tests", "unit-tests", "test", "tdd"],
    category: "concept",
    description: "Software testing",
    source: "builtin",
  },
  {
    canonical: "security",
    aliases: ["sec", "infosec", "cybersecurity"],
    category: "concept",
    description: "Security best practices",
    source: "builtin",
  },
  {
    canonical: "performance",
    aliases: ["perf", "optimization", "optimisation"],
    category: "concept",
    description: "Performance optimization",
    source: "builtin",
  },
  {
    canonical: "dependency-injection",
    aliases: ["di", "ioc", "inversion-of-control"],
    category: "concept",
    description: "Dependency injection pattern",
    source: "builtin",
  },
  {
    canonical: "error-handling",
    aliases: ["exceptions", "error-management", "errors"],
    category: "concept",
    description: "Error handling patterns",
    source: "builtin",
  },
  {
    canonical: "logging",
    aliases: ["logs", "observability"],
    category: "concept",
    description: "Logging and observability",
    source: "builtin",
  },
  {
    canonical: "monitoring",
    aliases: ["metrics", "alerting", "apm"],
    category: "concept",
    description: "System monitoring",
    source: "builtin",
  },
  {
    canonical: "database-design",
    aliases: ["schema-design", "data-modeling"],
    category: "concept",
    description: "Database schema design",
    source: "builtin",
  },
  {
    canonical: "event-driven",
    aliases: ["events", "event-sourcing", "cqrs", "pub-sub"],
    category: "concept",
    description: "Event-driven architecture",
    source: "builtin",
  },
  {
    canonical: "microservices",
    aliases: ["micro-services"],
    category: "concept",
    description: "Microservices architecture",
    source: "builtin",
  },
  {
    canonical: "solid-principles",
    aliases: ["solid", "design-principles"],
    category: "concept",
    description: "SOLID design principles",
    source: "builtin",
  },
  {
    canonical: "clean-code",
    aliases: ["code-quality", "clean-architecture"],
    category: "concept",
    description: "Clean code practices",
    source: "builtin",
  },
  {
    canonical: "type-safety",
    aliases: ["type-checking", "static-typing"],
    category: "concept",
    description: "Type safety and checking",
    source: "builtin",
  },
  {
    canonical: "concurrency",
    aliases: ["async", "parallelism", "multithreading"],
    category: "concept",
    description: "Concurrent programming",
    source: "builtin",
  },

  // =========================================================================
  // DOMAIN TAGS - Business areas, features (~12 tags)
  // =========================================================================

  {
    canonical: "payments",
    aliases: ["billing", "checkout", "stripe", "payment-processing"],
    category: "domain",
    description: "Payment processing",
    source: "builtin",
  },
  {
    canonical: "user-management",
    aliases: ["users", "accounts", "profiles"],
    category: "domain",
    description: "User management features",
    source: "builtin",
  },
  {
    canonical: "notifications",
    aliases: ["alerts", "push-notifications", "email-notifications"],
    category: "domain",
    description: "Notification systems",
    source: "builtin",
  },
  {
    canonical: "file-upload",
    aliases: ["uploads", "file-storage", "s3-upload"],
    category: "domain",
    description: "File upload and storage",
    source: "builtin",
  },
  {
    canonical: "search",
    aliases: ["full-text-search", "search-engine"],
    category: "domain",
    description: "Search functionality",
    source: "builtin",
  },
  {
    canonical: "analytics",
    aliases: ["tracking", "reporting", "dashboards"],
    category: "domain",
    description: "Analytics and reporting",
    source: "builtin",
  },
  {
    canonical: "messaging",
    aliases: ["chat", "real-time", "websockets"],
    category: "domain",
    description: "Real-time messaging",
    source: "builtin",
  },
  {
    canonical: "scheduling",
    aliases: ["cron", "jobs", "background-tasks", "queues"],
    category: "domain",
    description: "Task scheduling",
    source: "builtin",
  },
  {
    canonical: "internationalization",
    aliases: ["i18n", "localization", "l10n"],
    category: "domain",
    description: "Internationalization",
    source: "builtin",
  },
  {
    canonical: "e-commerce",
    aliases: ["ecommerce", "shopping-cart", "orders"],
    category: "domain",
    description: "E-commerce features",
    source: "builtin",
  },
  {
    canonical: "media",
    aliases: ["images", "video", "audio", "media-processing"],
    category: "domain",
    description: "Media handling",
    source: "builtin",
  },
  {
    canonical: "ai-ml",
    aliases: ["machine-learning", "artificial-intelligence", "llm"],
    category: "domain",
    description: "AI and machine learning",
    source: "builtin",
  },

  // =========================================================================
  // ACTION TAGS - What was done (~10 tags)
  // =========================================================================

  {
    canonical: "refactoring",
    aliases: ["refactor", "cleanup", "code-cleanup"],
    category: "action",
    description: "Code refactoring",
    source: "builtin",
  },
  {
    canonical: "migration",
    aliases: ["migrate", "upgrade", "data-migration"],
    category: "action",
    description: "Data or code migration",
    source: "builtin",
  },
  {
    canonical: "bugfix",
    aliases: ["fix", "bug", "hotfix", "patch"],
    category: "action",
    description: "Bug fixes",
    source: "builtin",
  },
  {
    canonical: "feature",
    aliases: ["new-feature", "enhancement"],
    category: "action",
    description: "New feature implementation",
    source: "builtin",
  },
  {
    canonical: "documentation",
    aliases: ["docs", "readme", "doc"],
    category: "action",
    description: "Documentation updates",
    source: "builtin",
  },
  {
    canonical: "deprecation",
    aliases: ["deprecated", "sunset"],
    category: "action",
    description: "Feature deprecation",
    source: "builtin",
  },
  {
    canonical: "debugging",
    aliases: ["debug", "troubleshooting"],
    category: "action",
    description: "Debugging sessions",
    source: "builtin",
  },
  {
    canonical: "configuration",
    aliases: ["config", "settings", "setup"],
    category: "action",
    description: "Configuration changes",
    source: "builtin",
  },
  {
    canonical: "deployment",
    aliases: ["deploy", "release", "ci-cd"],
    category: "action",
    description: "Deployment and releases",
    source: "builtin",
  },
  {
    canonical: "review",
    aliases: ["code-review", "pr-review"],
    category: "action",
    description: "Code review",
    source: "builtin",
  },
];

/**
 * Get the count of built-in tags by category
 */
export function getBuiltInTagStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const tag of BUILT_IN_TAXONOMY) {
    stats[tag.category] = (stats[tag.category] || 0) + 1;
  }
  return stats;
}
