import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import simpleGit from "simple-git";
import { z } from "zod";
import type { EmbeddingClient } from "@/embeddings/provider";
import type { IStorageBackend } from "@/storage/interface";
import { storeMemory } from "@/tools/memory";
import type { MemoryType } from "@/types";
import { DEFAULT_CONFIG } from "@/types";
import type { VectorStore } from "@/vectors/interface";

export const InitInputSchema = z.object({
  projectPath: z
    .string()
    .optional()
    .describe("Project path. Defaults to current directory."),
  scanGit: z
    .boolean()
    .default(true)
    .describe("Scan git history for decisions/solutions"),
  scanDocs: z
    .boolean()
    .default(true)
    .describe("Scan markdown files for documentation"),
  scanCode: z
    .boolean()
    .default(true)
    .describe("Scan code for patterns and structure"),
  scanCommits: z
    .number()
    .min(10)
    .max(2000)
    .default(500)
    .describe("Number of commits to scan"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Preview what would be stored without storing"),
});

export type InitInput = z.infer<typeof InitInputSchema>;

export interface InitResult {
  configCreated: boolean;
  memoriesCreated: number;
  decisions: number;
  solutions: number;
  patterns: number;
  notes: number;
  architecture: number;
  scannedFiles: number;
  scannedCommits: number;
  detectedStack: {
    framework: string | null;
    database: string | null;
    auth: string | null;
    testing: string | null;
    runtime: string | null;
  };
  issuesFound: string[];
  breakingChanges: number;
}

export async function initProject(
  input: InitInput,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<InitResult> {
  const projectPath = input.projectPath ?? process.cwd();
  const scanCommits = input.scanCommits ?? 500;

  const result: InitResult = {
    configCreated: false,
    memoriesCreated: 0,
    decisions: 0,
    solutions: 0,
    patterns: 0,
    notes: 0,
    architecture: 0,
    scannedFiles: 0,
    scannedCommits: 0,
    detectedStack: {
      framework: null,
      database: null,
      auth: null,
      testing: null,
      runtime: null,
    },
    issuesFound: [],
    breakingChanges: 0,
  };

  // Create config file if not exists
  const configPath = join(projectPath, ".doclea", "config.json");
  if (!existsSync(configPath)) {
    if (!input.dryRun) {
      mkdirSync(join(projectPath, ".doclea"), { recursive: true });
      writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    }
    result.configCreated = true;
  }

  // Detect project stack first (needed for context)
  const stackResult = await detectProjectStack(
    projectPath,
    input.dryRun,
    storage,
    vectors,
    embeddings,
  );
  result.detectedStack = stackResult.stack;
  result.architecture += stackResult.memoriesCreated;
  result.memoriesCreated += stackResult.memoriesCreated;

  // Scan git history
  if (input.scanGit) {
    const gitResult = await scanGitHistory(
      projectPath,
      scanCommits,
      input.dryRun,
      storage,
      vectors,
      embeddings,
    );
    result.decisions += gitResult.decisions;
    result.solutions += gitResult.solutions;
    result.scannedCommits = gitResult.commits;
    result.issuesFound = gitResult.issuesFound;
    result.breakingChanges = gitResult.breakingChanges;
    result.memoriesCreated += gitResult.decisions + gitResult.solutions;
  }

  // Scan documentation
  if (input.scanDocs) {
    const docsResult = await scanDocumentation(
      projectPath,
      input.dryRun,
      storage,
      vectors,
      embeddings,
    );
    result.notes += docsResult.notes;
    result.scannedFiles += docsResult.files;
    result.memoriesCreated += docsResult.notes;
  }

  // Scan code for patterns
  if (input.scanCode) {
    const codeResult = await scanCodePatterns(
      projectPath,
      input.dryRun,
      storage,
      vectors,
      embeddings,
    );
    result.patterns += codeResult.patterns;
    result.scannedFiles += codeResult.files;
    result.memoriesCreated += codeResult.patterns;
  }

  return result;
}

interface StackDetectionResult {
  stack: {
    framework: string | null;
    database: string | null;
    auth: string | null;
    testing: string | null;
    runtime: string | null;
  };
  memoriesCreated: number;
}

async function detectProjectStack(
  projectPath: string,
  dryRun: boolean,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<StackDetectionResult> {
  const stack: StackDetectionResult["stack"] = {
    framework: null,
    database: null,
    auth: null,
    testing: null,
    runtime: null,
  };
  let memoriesCreated = 0;

  // Read package.json for dependency detection
  const packageJsonPath = join(projectPath, "package.json");
  let deps: string[] = [];
  let devDeps: string[] = [];
  let packageName = "unknown";

  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      packageName = pkg.name ?? "unknown";
      deps = Object.keys(pkg.dependencies ?? {});
      devDeps = Object.keys(pkg.devDependencies ?? {});
    } catch {
      // Invalid JSON
    }
  }

  const allDeps = [...deps, ...devDeps];

  // Detect runtime
  if (
    existsSync(join(projectPath, "bun.lockb")) ||
    existsSync(join(projectPath, "bun.lock"))
  ) {
    stack.runtime = "Bun";
  } else if (existsSync(join(projectPath, "pnpm-lock.yaml"))) {
    stack.runtime = "Node.js (pnpm)";
  } else if (existsSync(join(projectPath, "yarn.lock"))) {
    stack.runtime = "Node.js (yarn)";
  } else if (existsSync(join(projectPath, "package-lock.json"))) {
    stack.runtime = "Node.js (npm)";
  } else if (existsSync(join(projectPath, "deno.json"))) {
    stack.runtime = "Deno";
  }

  // Detect framework
  const frameworkDetection: Array<{
    deps: string[];
    name: string;
    variant?: () => string;
  }> = [
    {
      deps: ["next"],
      name: "Next.js",
      variant: () => {
        if (existsSync(join(projectPath, "app"))) return "Next.js (App Router)";
        if (existsSync(join(projectPath, "src", "app")))
          return "Next.js (App Router)";
        return "Next.js (Pages Router)";
      },
    },
    { deps: ["nuxt"], name: "Nuxt" },
    { deps: ["@remix-run/react", "@remix-run/node"], name: "Remix" },
    { deps: ["@sveltejs/kit"], name: "SvelteKit" },
    { deps: ["svelte"], name: "Svelte" },
    { deps: ["astro"], name: "Astro" },
    { deps: ["solid-js", "solid-start"], name: "SolidJS" },
    { deps: ["@angular/core"], name: "Angular" },
    { deps: ["vue"], name: "Vue" },
    { deps: ["react"], name: "React" },
    { deps: ["hono"], name: "Hono" },
    { deps: ["fastify"], name: "Fastify" },
    { deps: ["express"], name: "Express" },
    { deps: ["koa"], name: "Koa" },
    { deps: ["@nestjs/core"], name: "NestJS" },
    { deps: ["elysia"], name: "Elysia" },
  ];

  for (const fw of frameworkDetection) {
    if (fw.deps.some((d) => allDeps.includes(d))) {
      stack.framework = fw.variant ? fw.variant() : fw.name;
      break;
    }
  }

  // Detect database
  const dbDetection: Array<{ deps: string[]; name: string; config?: string }> =
    [
      {
        deps: ["prisma", "@prisma/client"],
        name: "Prisma",
        config: "prisma/schema.prisma",
      },
      {
        deps: ["drizzle-orm"],
        name: "Drizzle",
        config: "drizzle.config.ts",
      },
      { deps: ["typeorm"], name: "TypeORM" },
      { deps: ["sequelize"], name: "Sequelize" },
      { deps: ["mongoose"], name: "Mongoose (MongoDB)" },
      { deps: ["@libsql/client", "libsql"], name: "LibSQL/Turso" },
      { deps: ["better-sqlite3", "sql.js"], name: "SQLite" },
      { deps: ["pg", "postgres"], name: "PostgreSQL" },
      { deps: ["mysql2", "mysql"], name: "MySQL" },
      { deps: ["redis", "ioredis"], name: "Redis" },
      { deps: ["@supabase/supabase-js"], name: "Supabase" },
      { deps: ["firebase", "firebase-admin"], name: "Firebase" },
    ];

  for (const dbCheck of dbDetection) {
    if (dbCheck.deps.some((d) => allDeps.includes(d))) {
      stack.database = dbCheck.name;
      // Check for config file to add more detail
      if (dbCheck.config && existsSync(join(projectPath, dbCheck.config))) {
        stack.database = `${dbCheck.name} (configured)`;
      }
      break;
    }
  }

  // Detect auth
  const authDetection: Array<{ deps: string[]; name: string }> = [
    { deps: ["better-auth"], name: "Better Auth" },
    { deps: ["next-auth", "@auth/core"], name: "Auth.js (NextAuth)" },
    { deps: ["@clerk/nextjs", "@clerk/clerk-sdk-node"], name: "Clerk" },
    { deps: ["lucia"], name: "Lucia" },
    { deps: ["@supabase/auth-helpers-nextjs"], name: "Supabase Auth" },
    { deps: ["passport"], name: "Passport.js" },
    { deps: ["@kinde-oss/kinde-auth-nextjs"], name: "Kinde" },
    { deps: ["auth0"], name: "Auth0" },
  ];

  for (const authCheck of authDetection) {
    if (authCheck.deps.some((d) => allDeps.includes(d))) {
      stack.auth = authCheck.name;
      break;
    }
  }

  // Detect testing
  const testDetection: Array<{ deps: string[]; name: string }> = [
    { deps: ["vitest"], name: "Vitest" },
    { deps: ["jest"], name: "Jest" },
    { deps: ["@playwright/test"], name: "Playwright" },
    { deps: ["cypress"], name: "Cypress" },
    { deps: ["@testing-library/react"], name: "React Testing Library" },
    { deps: ["mocha"], name: "Mocha" },
    { deps: ["ava"], name: "AVA" },
  ];

  for (const testCheck of testDetection) {
    if (testCheck.deps.some((d) => allDeps.includes(d))) {
      stack.testing = testCheck.name;
      break;
    }
  }

  // Create architecture memory for detected stack
  const detectedParts = Object.entries(stack)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `- ${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`);

  if (detectedParts.length > 0 && !dryRun) {
    await storeMemory(
      {
        type: "architecture" as MemoryType,
        title: `Project Stack: ${packageName}`,
        content: `Detected technology stack:\n\n${detectedParts.join("\n")}\n\nDependencies: ${deps.slice(0, 20).join(", ")}${deps.length > 20 ? ` (and ${deps.length - 20} more)` : ""}`,
        summary: `${stack.framework ?? "Unknown framework"} with ${stack.database ?? "unknown database"}`,
        importance: 0.9,
        tags: ["stack", "architecture", "auto-detected"],
        relatedFiles: ["package.json"],
        experts: [],
      },
      storage,
      vectors,
      embeddings,
    );
    memoriesCreated++;
  }

  return { stack, memoriesCreated };
}

interface GitScanResult {
  decisions: number;
  solutions: number;
  commits: number;
  issuesFound: string[];
  breakingChanges: number;
}

async function scanGitHistory(
  projectPath: string,
  maxCommits: number,
  dryRun: boolean,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<GitScanResult> {
  const git = simpleGit(projectPath);
  let decisions = 0;
  let solutions = 0;
  const issuesFound: string[] = [];
  let breakingChanges = 0;

  // Track processed hashes to avoid duplicates
  const processedHashes = new Set<string>();

  try {
    // Get commits with file stats
    const logResult = await git.log([
      `--max-count=${maxCommits}`,
      "--name-only",
    ]);

    for (const commit of logResult.all) {
      // Skip if already processed
      if (processedHashes.has(commit.hash)) continue;
      processedHashes.add(commit.hash);

      const message = commit.message;
      const messageLower = message.toLowerCase();

      // Extract issue references
      const issueMatches = message.matchAll(/#(\d+)|([A-Z]+-\d+)/g);
      for (const match of issueMatches) {
        const issue = match[1] ? `#${match[1]}` : match[2];
        if (issue && !issuesFound.includes(issue)) {
          issuesFound.push(issue);
        }
      }

      // Detect breaking changes
      const isBreaking =
        message.includes("!:") ||
        messageLower.includes("breaking change") ||
        messageLower.includes("breaking:");
      if (isBreaking) {
        breakingChanges++;
      }

      // Get related files from commit (if available in diff)
      const relatedFiles: string[] = [];
      if (commit.diff?.files) {
        for (const file of commit.diff.files) {
          if (typeof file === "object" && "file" in file) {
            relatedFiles.push(file.file);
          }
        }
      }

      // Categorize commit and create memory
      const commitType = categorizeCommit(message);

      if (commitType === "decision") {
        if (!dryRun) {
          await storeMemory(
            {
              type: "decision" as MemoryType,
              title: extractTitle(message),
              content: message,
              summary: extractSummary(message),
              gitCommit: commit.hash,
              experts: [commit.author_name],
              importance: isBreaking ? 0.9 : 0.7,
              tags: buildTags(message, "decision", isBreaking),
              relatedFiles: relatedFiles.slice(0, 10),
            },
            storage,
            vectors,
            embeddings,
          );
        }
        decisions++;
      } else if (commitType === "solution") {
        if (!dryRun) {
          await storeMemory(
            {
              type: "solution" as MemoryType,
              title: extractTitle(message),
              content: message,
              summary: extractSummary(message),
              gitCommit: commit.hash,
              experts: [commit.author_name],
              importance: 0.6,
              tags: buildTags(message, "solution", isBreaking),
              relatedFiles: relatedFiles.slice(0, 10),
            },
            storage,
            vectors,
            embeddings,
          );
        }
        solutions++;
      }
    }

    return {
      decisions,
      solutions,
      commits: logResult.all.length,
      issuesFound: issuesFound.slice(0, 50),
      breakingChanges,
    };
  } catch {
    return {
      decisions: 0,
      solutions: 0,
      commits: 0,
      issuesFound: [],
      breakingChanges: 0,
    };
  }
}

function categorizeCommit(message: string): "decision" | "solution" | null {
  const messageLower = message.toLowerCase();
  const firstLine = message.split("\n")[0] ?? "";

  // Decision indicators (architecture, migrations, major changes)
  const decisionKeywords = [
    "decision",
    "chose",
    "decided",
    "migrat",
    "refactor",
    "architect",
    "restructur",
    "redesign",
    "overhaul",
    "breaking",
    "deprecat",
    "upgrade",
    "downgrade",
    "switch to",
    "move to",
    "replace",
    "implement new",
  ];

  // Solution indicators (bug fixes, issue resolutions)
  const solutionKeywords = [
    "fix",
    "bug",
    "resolve",
    "issue",
    "error",
    "crash",
    "patch",
    "hotfix",
    "correct",
    "repair",
    "workaround",
  ];

  // Check conventional commit type first
  if (firstLine.match(/^(feat|feature)(\(.+\))?!?:/i)) {
    // Features with good descriptions are decisions
    if (message.length > 100 || messageLower.includes("implement")) {
      return "decision";
    }
  }

  if (firstLine.match(/^fix(\(.+\))?!?:/i)) {
    return "solution";
  }

  if (firstLine.match(/^refactor(\(.+\))?!?:/i)) {
    return "decision";
  }

  // Check for decision keywords
  for (const keyword of decisionKeywords) {
    if (messageLower.includes(keyword)) {
      return "decision";
    }
  }

  // Check for solution keywords
  for (const keyword of solutionKeywords) {
    if (messageLower.includes(keyword)) {
      return "solution";
    }
  }

  return null;
}

function buildTags(
  message: string,
  type: string,
  isBreaking: boolean,
): string[] {
  const tags = ["git-extracted", type];

  if (isBreaking) tags.push("breaking-change");

  // Extract scope from conventional commit
  const scopeMatch = message.match(/^\w+\(([^)]+)\):/);
  if (scopeMatch) {
    tags.push(scopeMatch[1]);
  }

  // Add common area tags
  const messageLower = message.toLowerCase();
  if (messageLower.includes("auth")) tags.push("auth");
  if (messageLower.includes("api")) tags.push("api");
  if (messageLower.includes("database") || messageLower.includes("db"))
    tags.push("database");
  if (messageLower.includes("ui") || messageLower.includes("frontend"))
    tags.push("ui");
  if (messageLower.includes("test")) tags.push("testing");
  if (messageLower.includes("security")) tags.push("security");
  if (messageLower.includes("performance") || messageLower.includes("perf"))
    tags.push("performance");

  return [...new Set(tags)];
}

function extractTitle(commitMessage: string): string {
  const firstLine = commitMessage.split("\n")[0] ?? "";
  // Remove conventional commit prefix
  return firstLine
    .replace(/^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?!?:\s*/i, "")
    .slice(0, 100);
}

function extractSummary(commitMessage: string): string | undefined {
  const lines = commitMessage.split("\n").filter((l) => l.trim());
  if (lines.length <= 1) return undefined;

  // Get the body (skip first line which is the title)
  const body = lines.slice(1).join(" ").trim();
  if (body.length < 20) return undefined;

  return body.slice(0, 200);
}

async function scanDocumentation(
  projectPath: string,
  dryRun: boolean,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<{ notes: number; files: number }> {
  let notes = 0;
  let files = 0;

  const docFiles = findFiles(
    projectPath,
    [".md", ".mdx", ".txt"],
    ["node_modules", ".git", "dist", "build", ".next", ".nuxt"],
  );

  for (const file of docFiles) {
    files++;
    try {
      const content = readFileSync(file, "utf-8");
      if (content.length < 100) continue; // Skip tiny files

      const relPath = relative(projectPath, file);
      const title = extractDocTitle(content, relPath);

      // Determine importance based on file location and name
      let importance = 0.5;
      const relPathLower = relPath.toLowerCase();
      if (relPathLower.includes("readme")) importance = 0.9;
      else if (relPathLower.includes("contributing")) importance = 0.8;
      else if (relPathLower.includes("architecture")) importance = 0.85;
      else if (relPathLower.includes("adr")) importance = 0.8;
      else if (relPathLower.includes("decision")) importance = 0.8;
      else if (relPathLower.includes("changelog")) importance = 0.6;

      if (!dryRun) {
        await storeMemory(
          {
            type: "note" as MemoryType,
            title,
            content: content.slice(0, 10000), // Limit content size
            importance,
            tags: buildDocTags(relPath),
            relatedFiles: [relPath],
            experts: [],
          },
          storage,
          vectors,
          embeddings,
        );
      }
      notes++;
    } catch {
      // Skip unreadable files
    }
  }

  return { notes, files };
}

function buildDocTags(filePath: string): string[] {
  const tags = ["documentation", "imported"];
  const pathLower = filePath.toLowerCase();

  if (pathLower.includes("readme")) tags.push("readme");
  if (pathLower.includes("contributing")) tags.push("contributing");
  if (pathLower.includes("architecture")) tags.push("architecture");
  if (pathLower.includes("adr") || pathLower.includes("decision"))
    tags.push("adr");
  if (pathLower.includes("changelog")) tags.push("changelog");
  if (pathLower.includes("api")) tags.push("api-docs");
  if (pathLower.includes("guide")) tags.push("guide");
  if (pathLower.includes("tutorial")) tags.push("tutorial");

  return tags;
}

async function scanCodePatterns(
  projectPath: string,
  dryRun: boolean,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<{ patterns: number; files: number }> {
  let patterns = 0;
  let files = 0;

  // Config files to analyze
  const configAnalyzers: Array<{
    files: string[];
    analyzer: (
      content: string,
      filename: string,
    ) => { title: string; content: string; tags: string[] } | null;
  }> = [
    {
      files: ["vite.config.ts", "vite.config.js", "vite.config.mts"],
      analyzer: analyzeViteConfig,
    },
    {
      files: ["next.config.js", "next.config.mjs", "next.config.ts"],
      analyzer: analyzeNextConfig,
    },
    {
      files: ["tsconfig.json"],
      analyzer: analyzeTsConfig,
    },
    {
      files: ["prisma/schema.prisma"],
      analyzer: analyzePrismaSchema,
    },
    {
      files: [
        "drizzle.config.ts",
        "drizzle.config.js",
        "drizzle/schema.ts",
        "src/db/schema.ts",
      ],
      analyzer: analyzeDrizzleConfig,
    },
    {
      files: ["vitest.config.ts", "vitest.config.js", "vitest.config.mts"],
      analyzer: analyzeVitestConfig,
    },
    {
      files: ["jest.config.js", "jest.config.ts", "jest.config.json"],
      analyzer: analyzeJestConfig,
    },
    {
      files: ["tailwind.config.js", "tailwind.config.ts"],
      analyzer: analyzeTailwindConfig,
    },
    {
      files: [".eslintrc.json", ".eslintrc.js", "eslint.config.js"],
      analyzer: analyzeEslintConfig,
    },
    {
      files: ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"],
      analyzer: analyzeDockerConfig,
    },
  ];

  for (const { files: configFiles, analyzer } of configAnalyzers) {
    for (const configFile of configFiles) {
      const filePath = join(projectPath, configFile);
      if (existsSync(filePath)) {
        files++;
        try {
          const content = readFileSync(filePath, "utf-8");
          const analysis = analyzer(content, configFile);

          if (analysis && !dryRun) {
            await storeMemory(
              {
                type: "pattern" as MemoryType,
                title: analysis.title,
                content: analysis.content,
                importance: 0.7,
                tags: ["config", "pattern", "auto-detected", ...analysis.tags],
                relatedFiles: [configFile],
                experts: [],
              },
              storage,
              vectors,
              embeddings,
            );
            patterns++;
          } else if (analysis) {
            patterns++;
          }
        } catch {
          // Skip unreadable files
        }
        break; // Only process first matching file
      }
    }
  }

  return { patterns, files };
}

function analyzeViteConfig(
  content: string,
  _filename: string,
): { title: string; content: string; tags: string[] } | null {
  const plugins: string[] = [];
  const tags: string[] = ["vite", "bundler"];

  // Detect common plugins
  if (content.includes("@vitejs/plugin-react")) plugins.push("React");
  if (content.includes("@vitejs/plugin-vue")) plugins.push("Vue");
  if (content.includes("vite-plugin-svelte")) plugins.push("Svelte");
  if (content.includes("vite-tsconfig-paths")) plugins.push("tsconfig-paths");
  if (content.includes("vite-plugin-pwa")) plugins.push("PWA");

  return {
    title: "Vite Build Configuration",
    content: `Vite is used as the build tool.\n\nPlugins detected: ${plugins.length > 0 ? plugins.join(", ") : "None detected"}\n\nConfiguration:\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\``,
    tags,
  };
}

function analyzeNextConfig(
  content: string,
  _filename: string,
): { title: string; content: string; tags: string[] } | null {
  const features: string[] = [];
  const tags: string[] = ["next.js", "framework"];

  if (content.includes("appDir") || content.includes("app:"))
    features.push("App Router");
  if (content.includes("experimental")) features.push("Experimental features");
  if (content.includes("images")) features.push("Image optimization");
  if (content.includes("i18n")) features.push("Internationalization");
  if (content.includes("rewrites") || content.includes("redirects"))
    features.push("URL rewrites/redirects");

  return {
    title: "Next.js Configuration",
    content: `Next.js framework configuration.\n\nFeatures: ${features.length > 0 ? features.join(", ") : "Default configuration"}\n\nConfiguration:\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\``,
    tags,
  };
}

function analyzeTsConfig(
  content: string,
  _filename: string,
): { title: string; content: string; tags: string[] } | null {
  try {
    const config = JSON.parse(content);
    const compiler = config.compilerOptions ?? {};

    const features: string[] = [];
    if (compiler.strict) features.push("Strict mode");
    if (compiler.paths) features.push("Path aliases");
    if (compiler.baseUrl) features.push("Base URL");
    if (compiler.jsx) features.push(`JSX: ${compiler.jsx}`);

    return {
      title: "TypeScript Configuration",
      content: `TypeScript compiler configuration.\n\n- Target: ${compiler.target ?? "not set"}\n- Module: ${compiler.module ?? "not set"}\n- Strict: ${compiler.strict ?? false}\n- Features: ${features.join(", ") || "Default"}`,
      tags: ["typescript", "compiler"],
    };
  } catch {
    return null;
  }
}

function analyzePrismaSchema(
  content: string,
  _filename: string,
): { title: string; content: string; tags: string[] } | null {
  const models: string[] = [];
  const modelMatches = content.matchAll(/model\s+(\w+)\s*\{/g);
  for (const match of modelMatches) {
    if (match[1]) models.push(match[1]);
  }

  // Detect database provider
  const providerMatch = content.match(/provider\s*=\s*"(\w+)"/);
  const provider = providerMatch ? providerMatch[1] : "unknown";

  return {
    title: "Prisma Database Schema",
    content: `Prisma ORM schema with ${provider} database.\n\nModels (${models.length}): ${models.join(", ")}\n\nSchema preview:\n\`\`\`prisma\n${content.slice(0, 3000)}\n\`\`\``,
    tags: ["prisma", "database", "orm", provider ?? "database"],
  };
}

function analyzeDrizzleConfig(
  content: string,
  filename: string,
): { title: string; content: string; tags: string[] } | null {
  const isSchema = filename.includes("schema");

  if (isSchema) {
    const tables: string[] = [];
    const tableMatches = content.matchAll(
      /(?:pgTable|sqliteTable|mysqlTable)\s*\(\s*['"](\w+)['"]/g,
    );
    for (const match of tableMatches) {
      if (match[1]) tables.push(match[1]);
    }

    return {
      title: "Drizzle Database Schema",
      content: `Drizzle ORM schema.\n\nTables (${tables.length}): ${tables.join(", ")}\n\nSchema preview:\n\`\`\`typescript\n${content.slice(0, 3000)}\n\`\`\``,
      tags: ["drizzle", "database", "orm"],
    };
  }

  return {
    title: "Drizzle Configuration",
    content: `Drizzle ORM configuration.\n\nConfiguration:\n\`\`\`typescript\n${content.slice(0, 2000)}\n\`\`\``,
    tags: ["drizzle", "database", "config"],
  };
}

function analyzeVitestConfig(
  content: string,
  _filename: string,
): { title: string; content: string; tags: string[] } | null {
  const features: string[] = [];

  if (content.includes("coverage")) features.push("Coverage enabled");
  if (content.includes("globals")) features.push("Global APIs");
  if (content.includes("environment")) features.push("Custom environment");
  if (content.includes("setupFiles")) features.push("Setup files");

  return {
    title: "Vitest Testing Configuration",
    content: `Vitest test runner configuration.\n\nFeatures: ${features.length > 0 ? features.join(", ") : "Default configuration"}\n\nConfiguration:\n\`\`\`typescript\n${content.slice(0, 2000)}\n\`\`\``,
    tags: ["vitest", "testing"],
  };
}

function analyzeJestConfig(
  content: string,
  _filename: string,
): { title: string; content: string; tags: string[] } | null {
  return {
    title: "Jest Testing Configuration",
    content: `Jest test runner configuration.\n\nConfiguration:\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\``,
    tags: ["jest", "testing"],
  };
}

function analyzeTailwindConfig(
  content: string,
  _filename: string,
): { title: string; content: string; tags: string[] } | null {
  const features: string[] = [];

  if (content.includes("darkMode")) features.push("Dark mode");
  if (content.includes("plugins")) features.push("Custom plugins");
  if (content.includes("extend")) features.push("Theme extensions");

  return {
    title: "Tailwind CSS Configuration",
    content: `Tailwind CSS styling configuration.\n\nFeatures: ${features.length > 0 ? features.join(", ") : "Default configuration"}\n\nConfiguration:\n\`\`\`javascript\n${content.slice(0, 2000)}\n\`\`\``,
    tags: ["tailwind", "css", "styling"],
  };
}

function analyzeEslintConfig(
  content: string,
  _filename: string,
): { title: string; content: string; tags: string[] } | null {
  return {
    title: "ESLint Configuration",
    content: `ESLint code quality configuration.\n\nConfiguration:\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\``,
    tags: ["eslint", "linting", "code-quality"],
  };
}

function analyzeDockerConfig(
  content: string,
  filename: string,
): { title: string; content: string; tags: string[] } | null {
  const isCompose = filename.includes("compose");

  if (isCompose) {
    const services: string[] = [];
    const serviceMatches = content.matchAll(/^\s{2}(\w+):\s*$/gm);
    for (const match of serviceMatches) {
      if (match[1] && match[1] !== "version" && match[1] !== "services") {
        services.push(match[1]);
      }
    }

    return {
      title: "Docker Compose Configuration",
      content: `Docker Compose multi-container setup.\n\nServices: ${services.join(", ") || "Unknown"}\n\nConfiguration:\n\`\`\`yaml\n${content.slice(0, 2000)}\n\`\`\``,
      tags: ["docker", "docker-compose", "containers", "devops"],
    };
  }

  return {
    title: "Dockerfile Configuration",
    content: `Docker container configuration.\n\nDockerfile:\n\`\`\`dockerfile\n${content.slice(0, 2000)}\n\`\`\``,
    tags: ["docker", "containers", "devops"],
  };
}

function findFiles(
  dir: string,
  extensions: string[],
  excludeDirs: string[],
): string[] {
  const results: string[] = [];

  function walk(currentDir: string, depth = 0) {
    if (depth > 5) return; // Limit depth to avoid deep traversal

    try {
      const entries = readdirSync(currentDir);
      for (const entry of entries) {
        const fullPath = join(currentDir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          if (!excludeDirs.includes(entry) && !entry.startsWith(".")) {
            walk(fullPath, depth + 1);
          }
        } else if (extensions.some((ext) => entry.endsWith(ext))) {
          results.push(fullPath);
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  walk(dir);
  return results;
}

function extractDocTitle(content: string, filename: string): string {
  // Try to find a markdown title
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) return titleMatch[1].slice(0, 100);

  // Fall back to filename
  return filename.replace(/\.(md|mdx|txt)$/, "").replace(/[-_]/g, " ");
}
