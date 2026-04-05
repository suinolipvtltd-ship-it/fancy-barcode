import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, GET } from "./route";

const mockSql = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: () => mockSql,
}));

describe("POST /api/jobs", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("creates a job and returns 201 with JobRecord", async () => {
    const now = new Date().toISOString();
    mockSql.mockResolvedValue([
      { id: "abc-123", file_name: "test.xlsx", row_count: 10, created_at: now },
    ]);

    const request = new Request("http://localhost/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: "test.xlsx", rowCount: 10 }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({
      id: "abc-123",
      fileName: "test.xlsx",
      rowCount: 10,
      createdAt: new Date(now).toISOString(),
    });
  });

  it("returns 400 for missing fileName", async () => {
    const request = new Request("http://localhost/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowCount: 5 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid rowCount", async () => {
    const request = new Request("http://localhost/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: "test.csv", rowCount: "not-a-number" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 500 with warning on database error", async () => {
    mockSql.mockRejectedValue(new Error("DB connection failed"));

    const request = new Request("http://localhost/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: "test.xlsx", rowCount: 5 }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.warning).toBe("Job history could not be saved.");
  });
});

describe("GET /api/jobs", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("returns jobs ordered by created_at DESC", async () => {
    const now = new Date().toISOString();
    const earlier = new Date(Date.now() - 60000).toISOString();
    mockSql.mockResolvedValue([
      { id: "id-1", file_name: "recent.xlsx", row_count: 20, created_at: now },
      { id: "id-2", file_name: "older.csv", row_count: 5, created_at: earlier },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data[0].fileName).toBe("recent.xlsx");
    expect(data[1].fileName).toBe("older.csv");
  });

  it("returns empty array with message on database error", async () => {
    mockSql.mockRejectedValue(new Error("DB connection failed"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.jobs).toEqual([]);
    expect(data.message).toBe("Unable to load job history.");
  });
});
