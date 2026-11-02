import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";
import { authenticateRequest } from "@/lib/apiAuth";

const mockSql = vi.fn();
const mockAuth = vi.mocked(authenticateRequest);

vi.mock("@/lib/db", () => ({
  getDb: () => mockSql,
}));

vi.mock("@/lib/apiAuth", () => ({
  authenticateRequest: vi.fn(),
}));

const productRow = {
  sku: "DRS-1024",
  name: "Red Party Dress",
  size: "6",
  price: "2499.00",
  stock_qty: 2,
  low_stock_threshold: 3,
  updated_at: "2026-10-29T10:00:00.000Z",
};

describe("GET /api/inventory", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockAuth.mockReset();
    mockAuth.mockResolvedValue({ id: "user-1", email: "a@b.com" });
  });

  it("returns 401 without credentials", async () => {
    mockAuth.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/inventory?sku=DRS-1024"));
    expect(response.status).toBe(401);
  });

  it("returns 400 when sku is missing", async () => {
    const response = await GET(new Request("http://localhost/api/inventory"));
    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown SKU", async () => {
    mockSql.mockResolvedValue([]);
    const response = await GET(new Request("http://localhost/api/inventory?sku=NOPE"));
    expect(response.status).toBe(404);
  });

  it("returns the product with a low-stock flag", async () => {
    mockSql.mockResolvedValue([productRow]);

    const response = await GET(
      new Request("http://localhost/api/inventory?sku=%20drs-1024%20"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      sku: "DRS-1024",
      name: "Red Party Dress",
      size: "6",
      price: "2499.00",
      stockQty: 2,
      lowStockThreshold: 3,
      lowStock: true,
      updatedAt: "2026-10-29T10:00:00.000Z",
    });
  });
});

describe("POST /api/inventory", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockAuth.mockReset();
    mockAuth.mockResolvedValue({ id: "user-1", email: "a@b.com" });
  });

  it("returns 401 without credentials", async () => {
    mockAuth.mockResolvedValue(null);
    const response = await POST(
      new Request("http://localhost/api/inventory", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(401);
  });

  it("validates required fields", async () => {
    const response = await POST(
      new Request("http://localhost/api/inventory", {
        method: "POST",
        body: JSON.stringify({ sku: "DRS-1" }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("upserts a product and returns its stock", async () => {
    mockSql.mockResolvedValue([{ ...productRow, stock_qty: 10, low_stock_threshold: 3 }]);

    const response = await POST(
      new Request("http://localhost/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: "drs-1024",
          name: "Red Party Dress",
          stockQty: 10,
        }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.sku).toBe("DRS-1024");
    expect(data.stockQty).toBe(10);
    expect(data.lowStock).toBe(false);
  });
});
