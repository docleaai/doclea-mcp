import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { CodeGraphStorage } from "../../database/code-graph";
import type { CodeEdge, CodeNode } from "../../tools/code/types";

describe("CodeGraphStorage", () => {
  let db: Database;
  let storage: CodeGraphStorage;

  beforeEach(() => {
    // Create in-memory database for testing
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

  describe("Node Operations", () => {
    const testNode: CodeNode = {
      id: "test/file.ts:function:testFn",
      type: "function",
      name: "testFn",
      filePath: "test/file.ts",
      startLine: 1,
      endLine: 10,
      signature: "function testFn(): void",
      metadata: { isExported: true },
    };

    it("should upsert and retrieve a node", async () => {
      await storage.upsertNode(testNode);
      const retrieved = await storage.getNode(testNode.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe(testNode.name);
      expect(retrieved?.type).toBe(testNode.type);
      expect(retrieved?.filePath).toBe(testNode.filePath);
    });

    it("should update existing node on upsert", async () => {
      await storage.upsertNode(testNode);

      const updatedNode: CodeNode = {
        ...testNode,
        summary: "Updated summary",
      };
      await storage.upsertNode(updatedNode);

      const retrieved = await storage.getNode(testNode.id);
      expect(retrieved?.summary).toBe("Updated summary");
    });

    it("should find node by name", async () => {
      await storage.upsertNode(testNode);
      const found = await storage.findNodeByName("testFn");

      expect(found).not.toBeNull();
      expect(found?.id).toBe(testNode.id);
    });

    it("should find node by name and type", async () => {
      await storage.upsertNode(testNode);
      const classNode: CodeNode = {
        ...testNode,
        id: "test/file.ts:class:testFn",
        type: "class",
      };
      await storage.upsertNode(classNode);

      const foundFunction = await storage.findNodeByName("testFn", "function");
      const foundClass = await storage.findNodeByName("testFn", "class");

      expect(foundFunction?.type).toBe("function");
      expect(foundClass?.type).toBe("class");
    });

    it("should get nodes by file path", async () => {
      await storage.upsertNode(testNode);
      const anotherNode: CodeNode = {
        ...testNode,
        id: "test/file.ts:function:anotherFn",
        name: "anotherFn",
      };
      await storage.upsertNode(anotherNode);

      const nodes = await storage.getNodesByPath("test/file.ts");
      expect(nodes.length).toBe(2);
    });

    it("should get nodes by type", async () => {
      await storage.upsertNode(testNode);
      const classNode: CodeNode = {
        ...testNode,
        id: "test/class.ts:class:TestClass",
        type: "class",
        name: "TestClass",
      };
      await storage.upsertNode(classNode);

      const functions = await storage.getNodesByType("function");
      const classes = await storage.getNodesByType("class");

      expect(functions.length).toBe(1);
      expect(classes.length).toBe(1);
    });

    it("should delete node", async () => {
      await storage.upsertNode(testNode);
      await storage.deleteNode(testNode.id);

      const retrieved = await storage.getNode(testNode.id);
      expect(retrieved).toBeNull();
    });

    it("should delete nodes by path", async () => {
      await storage.upsertNode(testNode);
      const deleted = await storage.deleteNodesByPath("test/file.ts");

      expect(deleted).toBe(1);
      const retrieved = await storage.getNode(testNode.id);
      expect(retrieved).toBeNull();
    });
  });

  describe("Edge Operations", () => {
    const testEdge: CodeEdge = {
      id: "test-edge-1",
      fromNode: "node1",
      toNode: "node2",
      edgeType: "calls",
      metadata: { line: 5 },
    };

    it("should upsert and retrieve an edge", async () => {
      await storage.upsertEdge(testEdge);
      const retrieved = await storage.getEdge(testEdge.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.fromNode).toBe(testEdge.fromNode);
      expect(retrieved?.toNode).toBe(testEdge.toNode);
      expect(retrieved?.edgeType).toBe(testEdge.edgeType);
    });

    it("should get edges from a node", async () => {
      await storage.upsertEdge(testEdge);
      const edges = await storage.getEdgesFrom("node1");

      expect(edges.length).toBe(1);
      expect(edges[0].toNode).toBe("node2");
    });

    it("should get edges to a node", async () => {
      await storage.upsertEdge(testEdge);
      const edges = await storage.getEdgesTo("node2");

      expect(edges.length).toBe(1);
      expect(edges[0].fromNode).toBe("node1");
    });

    it("should filter edges by type", async () => {
      await storage.upsertEdge(testEdge);
      const implementsEdge: CodeEdge = {
        id: "test-edge-2",
        fromNode: "node1",
        toNode: "node3",
        edgeType: "implements",
      };
      await storage.upsertEdge(implementsEdge);

      const callEdges = await storage.getEdgesFrom("node1", "calls");
      expect(callEdges.length).toBe(1);
      expect(callEdges[0].edgeType).toBe("calls");
    });

    it("should get all connected edges", async () => {
      const edge1: CodeEdge = {
        id: "edge1",
        fromNode: "center",
        toNode: "out1",
        edgeType: "calls",
      };
      const edge2: CodeEdge = {
        id: "edge2",
        fromNode: "in1",
        toNode: "center",
        edgeType: "calls",
      };

      await storage.upsertEdge(edge1);
      await storage.upsertEdge(edge2);

      const connected = await storage.getConnectedEdges("center");
      expect(connected.length).toBe(2);
    });

    it("should delete edge", async () => {
      await storage.upsertEdge(testEdge);
      await storage.deleteEdge(testEdge.id);

      const retrieved = await storage.getEdge(testEdge.id);
      expect(retrieved).toBeNull();
    });

    it("should delete edges by node", async () => {
      await storage.upsertEdge(testEdge);
      const deleted = await storage.deleteEdgesByNode("node1");

      expect(deleted).toBe(1);
    });
  });

  describe("getCallGraph", () => {
    beforeEach(async () => {
      // Set up a call chain: A -> B -> C
      const nodeA: CodeNode = {
        id: "nodeA",
        type: "function",
        name: "funcA",
        filePath: "test.ts",
        metadata: {},
      };
      const nodeB: CodeNode = {
        id: "nodeB",
        type: "function",
        name: "funcB",
        filePath: "test.ts",
        metadata: {},
      };
      const nodeC: CodeNode = {
        id: "nodeC",
        type: "function",
        name: "funcC",
        filePath: "test.ts",
        metadata: {},
      };

      await storage.upsertNode(nodeA);
      await storage.upsertNode(nodeB);
      await storage.upsertNode(nodeC);

      await storage.upsertEdge({
        id: "A-calls-B",
        fromNode: "nodeA",
        toNode: "nodeB",
        edgeType: "calls",
      });
      await storage.upsertEdge({
        id: "B-calls-C",
        fromNode: "nodeB",
        toNode: "nodeC",
        edgeType: "calls",
      });
    });

    it("should get outgoing call graph", async () => {
      const result = await storage.getCallGraph("nodeA", 2, "outgoing");

      expect(result.nodes.length).toBe(3);
      expect(result.edges.length).toBe(2);
    });

    it("should get incoming call graph", async () => {
      const result = await storage.getCallGraph("nodeC", 2, "incoming");

      expect(result.nodes.length).toBe(3);
      expect(result.edges.length).toBe(2);
    });

    it("should respect depth limit", async () => {
      const result = await storage.getCallGraph("nodeA", 1, "outgoing");

      expect(result.nodes.length).toBe(2); // A and B only
    });

    it("should get bidirectional call graph", async () => {
      const result = await storage.getCallGraph("nodeB", 2, "both");

      expect(result.nodes.length).toBe(3);
      expect(result.edges.length).toBe(2);
    });
  });

  describe("findImplementations", () => {
    beforeEach(async () => {
      const interfaceNode: CodeNode = {
        id: "interface:IService",
        type: "interface",
        name: "IService",
        filePath: "service.ts",
        metadata: {},
      };
      const implNode1: CodeNode = {
        id: "class:ServiceImpl1",
        type: "class",
        name: "ServiceImpl1",
        filePath: "impl1.ts",
        metadata: {},
      };
      const implNode2: CodeNode = {
        id: "class:ServiceImpl2",
        type: "class",
        name: "ServiceImpl2",
        filePath: "impl2.ts",
        metadata: {},
      };

      await storage.upsertNode(interfaceNode);
      await storage.upsertNode(implNode1);
      await storage.upsertNode(implNode2);

      await storage.upsertEdge({
        id: "impl1-implements-IService",
        fromNode: "class:ServiceImpl1",
        toNode: "interface:IService",
        edgeType: "implements",
      });
      await storage.upsertEdge({
        id: "impl2-implements-IService",
        fromNode: "class:ServiceImpl2",
        toNode: "interface:IService",
        edgeType: "implements",
      });
    });

    it("should find all implementations of an interface", async () => {
      const implementations =
        await storage.findImplementations("interface:IService");

      expect(implementations.length).toBe(2);
      expect(implementations.map((n) => n.name)).toContain("ServiceImpl1");
      expect(implementations.map((n) => n.name)).toContain("ServiceImpl2");
    });

    it("should find implementations by interface name", async () => {
      const implementations = await storage.findAllImplementers("IService");

      expect(implementations.length).toBe(2);
    });

    it("should return empty array for interface without implementations", async () => {
      const implementations = await storage.findImplementations(
        "nonexistent:Interface",
      );

      expect(implementations).toEqual([]);
    });
  });

  describe("getDependencyTree", () => {
    beforeEach(async () => {
      // Set up import chain: module A imports B, B imports C
      const moduleA: CodeNode = {
        id: "moduleA:module",
        type: "module",
        name: "moduleA.ts",
        filePath: "moduleA.ts",
        metadata: {},
      };
      const moduleB: CodeNode = {
        id: "moduleB:module",
        type: "module",
        name: "moduleB.ts",
        filePath: "moduleB.ts",
        metadata: {},
      };
      const moduleC: CodeNode = {
        id: "moduleC:module",
        type: "module",
        name: "moduleC.ts",
        filePath: "moduleC.ts",
        metadata: {},
      };

      await storage.upsertNode(moduleA);
      await storage.upsertNode(moduleB);
      await storage.upsertNode(moduleC);

      await storage.upsertEdge({
        id: "A-imports-B",
        fromNode: "moduleA:module",
        toNode: "moduleB:module",
        edgeType: "imports",
      });
      await storage.upsertEdge({
        id: "B-imports-C",
        fromNode: "moduleB:module",
        toNode: "moduleC:module",
        edgeType: "imports",
      });
    });

    it("should get imports tree (what this imports)", async () => {
      const result = await storage.getDependencyTree(
        "moduleA:module",
        3,
        "imports",
      );

      expect(result.nodes.length).toBe(3);
      expect(result.edges.length).toBe(2);
    });

    it("should get importedBy tree (what imports this)", async () => {
      const result = await storage.getDependencyTree(
        "moduleC:module",
        3,
        "importedBy",
      );

      expect(result.nodes.length).toBe(3);
      expect(result.edges.length).toBe(2);
    });

    it("should get bidirectional dependency tree", async () => {
      const result = await storage.getDependencyTree(
        "moduleB:module",
        3,
        "both",
      );

      expect(result.nodes.length).toBe(3);
      expect(result.edges.length).toBe(2);
    });
  });

  describe("whoImports", () => {
    beforeEach(async () => {
      const moduleA: CodeNode = {
        id: "moduleA:module",
        type: "module",
        name: "moduleA.ts",
        filePath: "moduleA.ts",
        metadata: {},
      };
      const moduleB: CodeNode = {
        id: "moduleB:module",
        type: "module",
        name: "moduleB.ts",
        filePath: "moduleB.ts",
        metadata: {},
      };

      await storage.upsertNode(moduleA);
      await storage.upsertNode(moduleB);

      await storage.upsertEdge({
        id: "A-imports-B",
        fromNode: "moduleA:module",
        toNode: "moduleB:module",
        edgeType: "imports",
      });
    });

    it("should find all modules that import a given module", async () => {
      const importers = await storage.whoImports("moduleB:module");

      expect(importers.length).toBe(1);
      expect(importers[0].name).toBe("moduleA.ts");
    });
  });

  describe("Package Operations", () => {
    beforeEach(async () => {
      const packageNode: CodeNode = {
        id: "npm:lodash",
        type: "package",
        name: "lodash",
        filePath: "package.json",
        metadata: { version: "^4.17.21" },
      };
      const moduleNode: CodeNode = {
        id: "src/utils.ts:module",
        type: "module",
        name: "utils.ts",
        filePath: "src/utils.ts",
        metadata: {},
      };

      await storage.upsertNode(packageNode);
      await storage.upsertNode(moduleNode);

      await storage.upsertEdge({
        id: "utils-depends-lodash",
        fromNode: "src/utils.ts:module",
        toNode: "npm:lodash",
        edgeType: "depends_on",
      });
    });

    it("should get all packages", async () => {
      const packages = await storage.getAllPackages();

      expect(packages.length).toBe(1);
      expect(packages[0].name).toBe("lodash");
    });

    it("should find modules that depend on a package", async () => {
      const dependents = await storage.getPackageDependents("lodash");

      expect(dependents.length).toBe(1);
      expect(dependents[0].name).toBe("utils.ts");
    });
  });

  describe("analyzeImpact", () => {
    beforeEach(async () => {
      // Set up: funcA is called by funcB, funcB is called by funcC
      const funcA: CodeNode = {
        id: "funcA",
        type: "function",
        name: "funcA",
        filePath: "test.ts",
        metadata: {},
      };
      const funcB: CodeNode = {
        id: "funcB",
        type: "function",
        name: "funcB",
        filePath: "test.ts",
        metadata: {},
      };
      const funcC: CodeNode = {
        id: "funcC",
        type: "function",
        name: "funcC",
        filePath: "test.ts",
        metadata: {},
      };

      await storage.upsertNode(funcA);
      await storage.upsertNode(funcB);
      await storage.upsertNode(funcC);

      await storage.upsertEdge({
        id: "B-calls-A",
        fromNode: "funcB",
        toNode: "funcA",
        edgeType: "calls",
      });
      await storage.upsertEdge({
        id: "C-calls-B",
        fromNode: "funcC",
        toNode: "funcB",
        edgeType: "calls",
      });
    });

    it("should analyze impact of changing a node", async () => {
      const result = await storage.analyzeImpact("funcA", 3);

      expect(result.affectedNodes.length).toBe(2);
      expect(result.affectedNodes.map((n) => n.name)).toContain("funcB");
      expect(result.affectedNodes.map((n) => n.name)).toContain("funcC");
    });

    it("should identify breaking changes with severity", async () => {
      const result = await storage.analyzeImpact("funcA", 3);

      expect(result.breakingChanges.length).toBe(2);

      // Direct callers should be high severity
      const funcBChange = result.breakingChanges.find(
        (c) => c.node.name === "funcB",
      );
      expect(funcBChange?.severity).toBe("high");

      // Indirect callers should be medium or low severity
      const funcCChange = result.breakingChanges.find(
        (c) => c.node.name === "funcC",
      );
      expect(funcCChange).toBeDefined();
      expect(["medium", "low"]).toContain(funcCChange?.severity ?? "");
    });

    it("should return empty result for node without dependents", async () => {
      const result = await storage.analyzeImpact("funcC", 3);

      expect(result.affectedNodes.length).toBe(0);
      expect(result.breakingChanges.length).toBe(0);
    });

    it("should handle nonexistent node gracefully", async () => {
      const result = await storage.analyzeImpact("nonexistent", 3);

      expect(result.affectedNodes).toEqual([]);
      expect(result.affectedEdges).toEqual([]);
    });
  });

  describe("File Hash Operations", () => {
    it("should upsert and retrieve file hash", async () => {
      const hash = {
        path: "test/file.ts",
        hash: "abc123",
        updatedAt: Date.now(),
      };

      await storage.upsertFileHash(hash);
      const retrieved = await storage.getFileHash("test/file.ts");

      expect(retrieved).not.toBeNull();
      expect(retrieved?.hash).toBe("abc123");
    });

    it("should get all file paths", async () => {
      await storage.upsertFileHash({
        path: "file1.ts",
        hash: "hash1",
        updatedAt: Date.now(),
      });
      await storage.upsertFileHash({
        path: "file2.ts",
        hash: "hash2",
        updatedAt: Date.now(),
      });

      const paths = await storage.getAllFilePaths();
      expect(paths).toContain("file1.ts");
      expect(paths).toContain("file2.ts");
    });

    it("should delete file hash", async () => {
      await storage.upsertFileHash({
        path: "delete-me.ts",
        hash: "hash",
        updatedAt: Date.now(),
      });

      await storage.deleteFileHash("delete-me.ts");
      const retrieved = await storage.getFileHash("delete-me.ts");

      expect(retrieved).toBeNull();
    });
  });

  describe("Statistics", () => {
    it("should return correct statistics", async () => {
      await storage.upsertNode({
        id: "func1",
        type: "function",
        name: "func1",
        filePath: "test.ts",
        metadata: {},
      });
      await storage.upsertNode({
        id: "func2",
        type: "function",
        name: "func2",
        filePath: "test.ts",
        metadata: {},
      });
      await storage.upsertNode({
        id: "class1",
        type: "class",
        name: "class1",
        filePath: "test.ts",
        metadata: {},
      });

      await storage.upsertEdge({
        id: "edge1",
        fromNode: "func1",
        toNode: "func2",
        edgeType: "calls",
      });

      const stats = await storage.getStats();

      expect(stats.totalNodes).toBe(3);
      expect(stats.totalEdges).toBe(1);
      expect(stats.nodesByType.function).toBe(2);
      expect(stats.nodesByType.class).toBe(1);
      expect(stats.edgesByType.calls).toBe(1);
    });
  });
});
