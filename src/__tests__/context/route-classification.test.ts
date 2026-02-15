import { describe, expect, test } from "bun:test";
import { classifyContextRoute } from "@/tools/context";

describe("context route classification", () => {
  test("returns memory route when code graph is disabled", () => {
    const route = classifyContextRoute("What calls validateToken?", false);
    expect(route).toBe("memory");
  });

  test("routes structural query to code", () => {
    const route = classifyContextRoute(
      "What calls validateToken and what depends on AuthService?",
      true,
    );
    expect(route).toBe("code");
  });

  test("routes semantic/history query to memory", () => {
    const route = classifyContextRoute(
      "Why did we choose PostgreSQL and what was the tradeoff?",
      true,
    );
    expect(route).toBe("memory");
  });

  test("routes mixed intent query to hybrid", () => {
    const route = classifyContextRoute(
      "What calls PaymentService and why did we choose this design?",
      true,
    );
    expect(route).toBe("hybrid");
  });
});
