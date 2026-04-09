import { describe, it, expect } from "vitest";

describe("project setup", () => {
  it("vitest runs correctly", () => {
    expect(1 + 1).toBe(2);
  });

  it("path alias resolves", async () => {
    // Verify the @/ alias works by importing from it
    const mod = await import("@/lib/setup.test");
    expect(mod).toBeDefined();
  });
});
