import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { authenticateRequest } from "@/lib/apiAuth";

const mockSql = vi.fn();
const mockAuth = vi.mocked(authenticateRequest);

vi.mock("@/lib/db", () => ({
  getDb: () => mockSql,
}));

vi.mock("@/lib/apiAuth", () => ({
  authenticateRequest: vi.fn(),
}));

const saleBody = {
  source: "swipe",
  externalId: "INV-1001",
  soldAt: "2026-10-29T10:00:00.000Z",
  customer: { name: "Asha Rao", phone: "9876543210" },
  items: [{ sku: "drs-1024", name: "Red Party Dress", qty: 2, unitPrice: 1200 }],
  totalAmount: 2400,
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sales", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockAuth.mockReset();
    mockAuth.mockResolvedValue({ id: "user-1", email: "a@b.com" });
  });

  it("returns 401 without credentials", async () => {
    mockAuth.mockResolvedValue(null);
    const response = await POST(jsonRequest(saleBody));
    expect(response.status).toBe(401);
  });

  it("rejects a sale without items", async () => {
    const response = await POST(jsonRequest({ externalId: "INV-2", items: [] }));
    expect(response.status).toBe(400);
  });

  it("rejects a sale without an external id", async () => {
    const response = await POST(jsonRequest({ items: [{ name: "Dress" }] }));
    expect(response.status).toBe(400);
  });

  it("records the sale, decrements stock and returns the reminder", async () => {
    mockSql
      .mockResolvedValueOnce([]) // existing sale lookup
      .mockResolvedValueOnce([{ id: "cust-1" }]) // customer upsert
      .mockResolvedValueOnce([{ id: "sale-1" }]) // sale insert
      .mockResolvedValueOnce([]) // sale_items insert
      .mockResolvedValueOnce([{ stock_qty: 3, low_stock_threshold: 3 }]) // stock decrement
      .mockResolvedValueOnce([]); // inventory movement

    const response = await POST(jsonRequest(saleBody));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.saleId).toBe("sale-1");
    expect(data.duplicate).toBe(false);
    expect(data.items).toEqual([
      {
        sku: "DRS-1024",
        name: "Red Party Dress",
        qty: 2,
        stockQty: 3,
        lowStockThreshold: 3,
        lowStock: true,
        known: true,
      },
    ]);
    expect(data.reminder.date).toBe("2027-10-29");
    expect(data.reminder.title).toContain("Asha Rao");
    expect(mockSql).toHaveBeenCalledTimes(6);
  });

  it("is idempotent for an already-recorded invoice", async () => {
    mockSql
      .mockResolvedValueOnce([{ id: "sale-1" }]) // existing sale
      .mockResolvedValueOnce([{ stock_qty: 5 }]) // loadStock
      .mockResolvedValueOnce([{ low_stock_threshold: 3 }]); // loadThreshold

    const response = await POST(jsonRequest(saleBody));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.duplicate).toBe(true);
    expect(data.items[0].stockQty).toBe(5);
    expect(data.warnings[0]).toMatch(/already recorded/i);
  });

  it("warns when a SKU is not in the inventory", async () => {
    mockSql
      .mockResolvedValueOnce([]) // existing sale lookup
      .mockResolvedValueOnce([{ id: "sale-2" }]) // sale insert (no customer name/phone)
      .mockResolvedValueOnce([]) // sale_items insert
      .mockResolvedValueOnce([]); // product update matched nothing

    const response = await POST(
      jsonRequest({
        externalId: "INV-1002",
        items: [{ sku: "UNKNOWN-1", name: "Mystery Dress", qty: 1 }],
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.items[0].known).toBe(false);
    expect(data.warnings[0]).toContain("UNKNOWN-1");
  });
});
