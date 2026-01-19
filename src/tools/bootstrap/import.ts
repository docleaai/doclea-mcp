import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { z } from "zod";
import type { EmbeddingClient } from "@/embeddings/provider";
import type { IStorageBackend } from "@/storage/interface";
import { storeMemory } from "@/tools/memory";
import type { MemoryType } from "@/types";
import type { VectorStore } from "@/vectors/interface";

export const ImportInputSchema = z.object({
  source: z.enum(["markdown", "adr"]).describe("Import source type"),
  path: z.string().describe("Path to import from (file or directory)"),
  projectPath: z
    .string()
    .optional()
    .describe("Project path. Defaults to current directory."),
  recursive: z.boolean().default(true).describe("Recursively scan directories"),
  dryRun: z.boolean().default(false).describe("Preview without storing"),
});

export type ImportInput = z.infer<typeof ImportInputSchema>;

export interface ImportResult {
  imported: number;
  skipped: number;
  files: string[];
  errors: string[];
}

export async function importContent(
  input: ImportInput,
  storage: IStorageBackend,
  vectors: VectorStore,
  embeddings: EmbeddingClient,
): Promise<ImportResult> {
  const projectPath = input.projectPath ?? process.cwd();
  const targetPath = join(projectPath, input.path);

  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    files: [],
    errors: [],
  };

  if (!existsSync(targetPath)) {
    result.errors.push(`Path not found: ${input.path}`);
    return result;
  }

  const stat = statSync(targetPath);
  const files = stat.isDirectory()
    ? findMarkdownFiles(targetPath, input.recursive)
    : [targetPath];

  for (const file of files) {
    try {
      const content = readFileSync(file, "utf-8");
      const relPath = relative(projectPath, file);

      if (input.source === "adr") {
        const adr = parseADR(content, relPath);
        if (adr) {
          if (!input.dryRun) {
            await storeMemory(
              {
                type: "decision" as MemoryType,
                title: adr.title,
                content: adr.content,
                summary: adr.summary,
                importance: 0.9,
                tags: ["adr", "imported", ...adr.tags],
                relatedFiles: [relPath],
                experts: [],
              },
              storage,
              vectors,
              embeddings,
            );
          }
          result.imported++;
          result.files.push(relPath);
        } else {
          result.skipped++;
        }
      } else {
        // Generic markdown import
        const doc = parseMarkdown(content, relPath);
        if (doc.content.length > 100) {
          if (!input.dryRun) {
            await storeMemory(
              {
                type: "note" as MemoryType,
                title: doc.title,
                content: doc.content.slice(0, 10000),
                importance: 0.5,
                tags: ["markdown", "imported"],
                relatedFiles: [relPath],
                experts: [],
              },
              storage,
              vectors,
              embeddings,
            );
          }
          result.imported++;
          result.files.push(relPath);
        } else {
          result.skipped++;
        }
      }
    } catch (error) {
      result.errors.push(
        `Failed to process ${file}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  return result;
}

function findMarkdownFiles(dir: string, recursive: boolean): string[] {
  const results: string[] = [];

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory() && recursive) {
      results.push(...findMarkdownFiles(fullPath, recursive));
    } else if (entry.match(/\.(md|mdx)$/i)) {
      results.push(fullPath);
    }
  }

  return results;
}

interface ParsedADR {
  title: string;
  content: string;
  summary: string;
  status: string;
  tags: string[];
}

function parseADR(content: string, _filename: string): ParsedADR | null {
  // Try to parse ADR format (MADR or similar)
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const statusMatch = content.match(/##\s*Status\s*\n+(\w+)/i);
  const contextMatch = content.match(/##\s*Context\s*\n+([\s\S]*?)(?=\n##|$)/i);
  const decisionMatch = content.match(
    /##\s*Decision\s*\n+([\s\S]*?)(?=\n##|$)/i,
  );

  if (!titleMatch) {
    // Not a valid ADR
    return null;
  }

  const title = titleMatch[1].replace(/^ADR[-\s]*\d*:?\s*/i, "").trim();
  const status = statusMatch?.[1] ?? "unknown";
  const context = contextMatch?.[1]?.trim() ?? "";
  const decision = decisionMatch?.[1]?.trim() ?? "";

  const summary = context.split("\n")[0]?.slice(0, 200) ?? "";

  // Extract tags from content
  const tags: string[] = [];
  if (status.toLowerCase() === "accepted") tags.push("accepted");
  if (status.toLowerCase() === "deprecated") tags.push("deprecated");
  if (status.toLowerCase() === "superseded") tags.push("superseded");

  return {
    title,
    content: `## Context\n${context}\n\n## Decision\n${decision}`,
    summary,
    status,
    tags,
  };
}

interface ParsedMarkdown {
  title: string;
  content: string;
}

function parseMarkdown(content: string, filename: string): ParsedMarkdown {
  // Extract title from first heading or filename
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title =
    titleMatch?.[1] ?? basename(filename, ".md").replace(/[-_]/g, " ");

  return {
    title,
    content,
  };
}
