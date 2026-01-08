import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { CodeGraphStorage } from "../../database/code-graph";
import { getCallGraph } from "../../tools/code/call-graph";
import { getDependencyTree } from "../../tools/code/dependency-tree";
import { findImplementations } from "../../tools/code/find-implementations";
import { analyzeImpact } from "../../tools/code/impact-analysis";
import type { CodeNode } from "../../tools/code/types";

describe("MCP Tools", () => {
  let db: Database;
  let storage: CodeGraphStorage;

  beforeEach(() => {
    db = new Database(":memory:");

    // Create schema
    db.run(`
			CREATE TABLE IF NOT EXISTS code_nodes (
				id TEXT PRIMARY KEY,
				type TEXT NOT NULL,
				name TEXT NOT NULL,
				file_path TEXT NOT NULL,
				start_line INTEGER,
				end_line INTEGER,
				signature TEXT,
				summary TEXT,
				metadata TEXT DEFAULT '{}',
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			)
		`);

    db.run(`
			CREATE TABLE IF NOT EXISTS code_edges (
				id TEXT PRIMARY KEY,
				from_node TEXT NOT NULL,
				to_node TEXT NOT NULL,
				edge_type TEXT NOT NULL,
				metadata TEXT,
				created_at INTEGER NOT NULL,
				UNIQUE(from_node, to_node, edge_type)
			)
		`);

    db.run(`
			CREATE TABLE IF NOT EXISTS file_hashes (
				path TEXT PRIMARY KEY,
				hash TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			)
		`);

    storage = new CodeGraphStorage(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("getCallGraph", () => {
    beforeEach(async () => {
      const funcA: CodeNode = {
        id: "src/utils.ts:function:processData",
        type: "function",
        name: "processData",
        filePath: "src/utils.ts",
        metadata: {},
      };
      const funcB: CodeNode = {
        id: "src/utils.ts:function:validateInput",
        type: "function",
        name: "validateInput",
        filePath: "src/utils.ts",
        metadata: {},
      };
      const funcC: CodeNode = {
        id: "src/handlers.ts:function:handleRequest",
        type: "function",
        name: "handleRequest",
        filePath: "src/handlers.ts",
        metadata: {},
      };

      await storage.upsertNode(funcA);
      await storage.upsertNode(funcB);
      await storage.upsertNode(funcC);

      await storage.upsertEdge({
        id: "processData-calls-validateInput",
        fromNode: "src/utils.ts:function:processData",
        toNode: "src/utils.ts:function:validateInput",
        edgeType: "calls",
      });
      await storage.upsertEdge({
        id: "handleRequest-calls-processData",
        fromNode: "src/handlers.ts:function:handleRequest",
        toNode: "src/utils.ts:function:processData",
        edgeType: "calls",
      });
    });

    it("should get call graph by node ID", async () => {
      const result = await getCallGraph(
        {
          nodeId: "src/utils.ts:function:processData",
          depth: 2,
          direction: "both",
        },
        db,
      );

      expect(result.graph.nodes.length).toBeGreaterThan(0);
      expect(result.message).toContain("nodes");
    });

    it("should get call graph by function name", async () => {
      const result = await getCallGraph(
        {
          functionName: "processData",
          depth: 2,
          direction: "both",
        },
        db,
      );

      expect(result.graph.nodes.length).toBeGreaterThan(0);
    });

    it("should respect direction parameter - outgoing", async () => {
      const result = await getCallGraph(
        {
          functionName: "processData",
          depth: 2,
          direction: "outgoing",
        },
        db,
      );

      // Should include validateInput but not handleRequest
      const nodeNames = result.graph.nodes.map((n) => n.name);
      expect(nodeNames).toContain("validateInput");
    });

    it("should respect direction parameter - incoming", async () => {
      const result = await getCallGraph(
        {
          functionName: "processData",
          depth: 2,
          direction: "incoming",
        },
        db,
      );

      // Should include handleRequest
      const nodeNames = result.graph.nodes.map((n) => n.name);
      expect(nodeNames).toContain("handleRequest");
    });

    it("should return empty graph for nonexistent function", async () => {
      const result = await getCallGraph(
        {
          functionName: "nonExistentFunction",
          depth: 2,
          direction: "both",
        },
        db,
      );

      expect(result.graph.nodes.length).toBe(0);
      expect(result.message).toContain("not found");
    });

    it("should require either nodeId or functionName", async () => {
      const result = await getCallGraph(
        {
          depth: 2,
          direction: "both",
        },
        db,
      );

      expect(result.message).toContain("Must provide");
    });
  });

  describe("findImplementations", () => {
    beforeEach(async () => {
      const interfaceNode: CodeNode = {
        id: "src/interfaces.ts:interface:IRepository",
        type: "interface",
        name: "IRepository",
        filePath: "src/interfaces.ts",
        signature: "interface IRepository",
        metadata: {},
      };
      const impl1: CodeNode = {
        id: "src/repos/user.ts:class:UserRepository",
        type: "class",
        name: "UserRepository",
        filePath: "src/repos/user.ts",
        metadata: {},
      };
      const impl2: CodeNode = {
        id: "src/repos/product.ts:class:ProductRepository",
        type: "class",
        name: "ProductRepository",
        filePath: "src/repos/product.ts",
        metadata: {},
      };

      await storage.upsertNode(interfaceNode);
      await storage.upsertNode(impl1);
      await storage.upsertNode(impl2);

      await storage.upsertEdge({
        id: "UserRepository-implements-IRepository",
        fromNode: "src/repos/user.ts:class:UserRepository",
        toNode: "src/interfaces.ts:interface:IRepository",
        edgeType: "implements",
      });
      await storage.upsertEdge({
        id: "ProductRepository-implements-IRepository",
        fromNode: "src/repos/product.ts:class:ProductRepository",
        toNode: "src/interfaces.ts:interface:IRepository",
        edgeType: "implements",
      });
    });

    it("should find implementations by interface name", async () => {
      const result = await findImplementations(
        {
          interfaceName: "IRepository",
        },
        db,
      );

      expect(result.implementations.length).toBe(2);
      expect(result.implementations.map((n) => n.name)).toContain(
        "UserRepository",
      );
      expect(result.implementations.map((n) => n.name)).toContain(
        "ProductRepository",
      );
    });

    it("should find implementations by interface ID", async () => {
      const result = await findImplementations(
        {
          interfaceName: "IRepository",
          interfaceId: "src/interfaces.ts:interface:IRepository",
        },
        db,
      );

      expect(result.implementations.length).toBe(2);
    });

    it("should return empty for nonexistent interface", async () => {
      const result = await findImplementations(
        {
          interfaceName: "IDoesNotExist",
        },
        db,
      );

      expect(result.implementations.length).toBe(0);
      expect(result.message).toContain("not found");
    });

    it("should include helpful message", async () => {
      const result = await findImplementations(
        {
          interfaceName: "IRepository",
        },
        db,
      );

      expect(result.message).toContain("2");
      expect(result.message).toContain("implementing");
    });
  });

  describe("getDependencyTree", () => {
    beforeEach(async () => {
      const moduleApp: CodeNode = {
        id: "src/app.ts:module",
        type: "module",
        name: "app.ts",
        filePath: "src/app.ts",
        metadata: {},
      };
      const moduleUtils: CodeNode = {
        id: "src/utils.ts:module",
        type: "module",
        name: "utils.ts",
        filePath: "src/utils.ts",
        metadata: {},
      };
      const moduleConfig: CodeNode = {
        id: "src/config.ts:module",
        type: "module",
        name: "config.ts",
        filePath: "src/config.ts",
        metadata: {},
      };

      await storage.upsertNode(moduleApp);
      await storage.upsertNode(moduleUtils);
      await storage.upsertNode(moduleConfig);

      // app imports utils, utils imports config
      await storage.upsertEdge({
        id: "app-imports-utils",
        fromNode: "src/app.ts:module",
        toNode: "src/utils.ts:module",
        edgeType: "imports",
      });
      await storage.upsertEdge({
        id: "utils-imports-config",
        fromNode: "src/utils.ts:module",
        toNode: "src/config.ts:module",
        edgeType: "imports",
      });
    });

    it("should get dependency tree by module path", async () => {
      const result = await getDependencyTree(
        {
          modulePath: "src/app.ts",
          depth: 3,
          direction: "imports",
        },
        db,
      );

      expect(result.tree.nodes.length).toBe(3);
      expect(result.message).toContain("modules");
    });

    it("should get dependency tree by module ID", async () => {
      const result = await getDependencyTree(
        {
          moduleId: "src/app.ts:module",
          depth: 3,
          direction: "both",
        },
        db,
      );

      expect(result.tree.nodes.length).toBe(3);
    });

    it("should respect direction - imports", async () => {
      const result = await getDependencyTree(
        {
          modulePath: "src/app.ts",
          depth: 3,
          direction: "imports",
        },
        db,
      );

      // Starting from app.ts, should find utils and config
      const nodeNames = result.tree.nodes.map((n) => n.name);
      expect(nodeNames).toContain("utils.ts");
      expect(nodeNames).toContain("config.ts");
    });

    it("should respect direction - importedBy", async () => {
      const result = await getDependencyTree(
        {
          modulePath: "src/config.ts",
          depth: 3,
          direction: "importedBy",
        },
        db,
      );

      // Starting from config.ts, should find utils and app
      const nodeNames = result.tree.nodes.map((n) => n.name);
      expect(nodeNames).toContain("utils.ts");
      expect(nodeNames).toContain("app.ts");
    });

    it("should return empty for nonexistent module", async () => {
      const result = await getDependencyTree(
        {
          modulePath: "nonexistent.ts",
          depth: 3,
          direction: "both",
        },
        db,
      );

      expect(result.tree.nodes.length).toBe(0);
      expect(result.message).toContain("not found");
    });

    it("should require either modulePath or moduleId", async () => {
      const result = await getDependencyTree(
        {
          depth: 3,
          direction: "both",
        },
        db,
      );

      expect(result.message).toContain("Must provide");
    });
  });

  describe("analyzeImpact", () => {
    beforeEach(async () => {
      // Core function that others depend on
      const coreFunc: CodeNode = {
        id: "src/core.ts:function:parseInput",
        type: "function",
        name: "parseInput",
        filePath: "src/core.ts",
        metadata: {},
      };
      const handler: CodeNode = {
        id: "src/handlers.ts:function:handleRequest",
        type: "function",
        name: "handleRequest",
        filePath: "src/handlers.ts",
        metadata: {},
      };
      const validator: CodeNode = {
        id: "src/validators.ts:function:validate",
        type: "function",
        name: "validate",
        filePath: "src/validators.ts",
        metadata: {},
      };
      const endpoint: CodeNode = {
        id: "src/routes.ts:function:apiEndpoint",
        type: "function",
        name: "apiEndpoint",
        filePath: "src/routes.ts",
        metadata: {},
      };

      await storage.upsertNode(coreFunc);
      await storage.upsertNode(handler);
      await storage.upsertNode(validator);
      await storage.upsertNode(endpoint);

      // handler and validator both call parseInput
      await storage.upsertEdge({
        id: "handler-calls-parseInput",
        fromNode: "src/handlers.ts:function:handleRequest",
        toNode: "src/core.ts:function:parseInput",
        edgeType: "calls",
      });
      await storage.upsertEdge({
        id: "validator-calls-parseInput",
        fromNode: "src/validators.ts:function:validate",
        toNode: "src/core.ts:function:parseInput",
        edgeType: "calls",
      });
      // endpoint calls handler
      await storage.upsertEdge({
        id: "endpoint-calls-handler",
        fromNode: "src/routes.ts:function:apiEndpoint",
        toNode: "src/handlers.ts:function:handleRequest",
        edgeType: "calls",
      });
    });

    it("should analyze impact by node ID", async () => {
      const result = await analyzeImpact(
        {
          nodeId: "src/core.ts:function:parseInput",
          depth: 3,
        },
        db,
      );

      expect(result.result.affectedNodes.length).toBeGreaterThan(0);
      expect(result.message).toContain("affected nodes");
    });

    it("should analyze impact by function name", async () => {
      const result = await analyzeImpact(
        {
          functionName: "parseInput",
          depth: 3,
        },
        db,
      );

      expect(result.result.affectedNodes.length).toBeGreaterThan(0);
    });

    it("should find all affected nodes at specified depth", async () => {
      const result = await analyzeImpact(
        {
          functionName: "parseInput",
          depth: 3,
        },
        db,
      );

      const affectedNames = result.result.affectedNodes.map((n) => n.name);
      expect(affectedNames).toContain("handleRequest");
      expect(affectedNames).toContain("validate");
      // apiEndpoint is 2 levels deep from parseInput
      expect(affectedNames).toContain("apiEndpoint");
    });

    it("should include breaking change information", async () => {
      const result = await analyzeImpact(
        {
          functionName: "parseInput",
          depth: 3,
        },
        db,
      );

      expect(result.result.breakingChanges.length).toBeGreaterThan(0);

      // Each breaking change should have node, reason, and severity
      for (const change of result.result.breakingChanges) {
        expect(change.node).toBeDefined();
        expect(change.reason).toBeDefined();
        expect(["high", "medium", "low"]).toContain(change.severity);
      }
    });

    it("should report correct severity levels", async () => {
      const result = await analyzeImpact(
        {
          functionName: "parseInput",
          depth: 3,
        },
        db,
      );

      // Direct callers should be high severity
      const directCallers = result.result.breakingChanges.filter(
        (c) => c.node.name === "handleRequest" || c.node.name === "validate",
      );

      for (const caller of directCallers) {
        expect(caller.severity).toBe("high");
      }
    });

    it("should return no impact for leaf nodes", async () => {
      const result = await analyzeImpact(
        {
          functionName: "apiEndpoint",
          depth: 3,
        },
        db,
      );

      expect(result.result.affectedNodes.length).toBe(0);
      expect(result.message).toContain("leaf");
    });

    it("should return error message for nonexistent function", async () => {
      const result = await analyzeImpact(
        {
          functionName: "doesNotExist",
          depth: 3,
        },
        db,
      );

      expect(result.message).toContain("not found");
    });

    it("should require either nodeId or functionName", async () => {
      const result = await analyzeImpact(
        {
          depth: 3,
        },
        db,
      );

      expect(result.message).toContain("Must provide");
    });
  });

  describe("Interface and Class Relationships", () => {
    beforeEach(async () => {
      // Interface
      const interfaceNode: CodeNode = {
        id: "src/types.ts:interface:ILogger",
        type: "interface",
        name: "ILogger",
        filePath: "src/types.ts",
        metadata: {},
      };
      // Implementation
      const classNode: CodeNode = {
        id: "src/logger.ts:class:ConsoleLogger",
        type: "class",
        name: "ConsoleLogger",
        filePath: "src/logger.ts",
        metadata: {},
      };
      // Consumer
      const consumer: CodeNode = {
        id: "src/app.ts:function:initApp",
        type: "function",
        name: "initApp",
        filePath: "src/app.ts",
        metadata: {},
      };

      await storage.upsertNode(interfaceNode);
      await storage.upsertNode(classNode);
      await storage.upsertNode(consumer);

      await storage.upsertEdge({
        id: "ConsoleLogger-implements-ILogger",
        fromNode: "src/logger.ts:class:ConsoleLogger",
        toNode: "src/types.ts:interface:ILogger",
        edgeType: "implements",
      });
      await storage.upsertEdge({
        id: "initApp-references-ILogger",
        fromNode: "src/app.ts:function:initApp",
        toNode: "src/types.ts:interface:ILogger",
        edgeType: "references",
      });
    });

    it("should find implementations when analyzing interface impact", async () => {
      const result = await analyzeImpact(
        {
          functionName: "ILogger",
          depth: 3,
        },
        db,
      );

      const affectedNames = result.result.affectedNodes.map((n) => n.name);
      expect(affectedNames).toContain("ConsoleLogger");
    });

    it("should track reference relationships in impact analysis", async () => {
      const result = await analyzeImpact(
        {
          functionName: "ILogger",
          depth: 3,
        },
        db,
      );

      const affectedNames = result.result.affectedNodes.map((n) => n.name);
      expect(affectedNames).toContain("initApp");
    });
  });
});
