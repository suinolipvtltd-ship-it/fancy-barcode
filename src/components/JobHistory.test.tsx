import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import JobHistory from "./JobHistory";
import type { JobRecord } from "@/lib/types";

const mockJobs: JobRecord[] = [
  {
    id: "abc-123",
    fileName: "products.xlsx",
    rowCount: 42,
    createdAt: "2024-06-15T10:30:00.000Z",
  },
  {
    id: "def-456",
    fileName: "inventory.csv",
    rowCount: 1,
    createdAt: "2024-06-14T08:00:00.000Z",
  },
];

describe("JobHistory", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading state initially", () => {
    // Never-resolving fetch to keep loading state
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {})
    );
    render(<JobHistory />);
    expect(screen.getByTestId("job-history-loading")).toBeDefined();
    expect(screen.getByText(/loading job history/i)).toBeDefined();
  });

  it("displays jobs after successful fetch", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => mockJobs,
    });

    render(<JobHistory />);

    await waitFor(() => {
      expect(screen.getByTestId("job-history-list")).toBeDefined();
    });

    const items = screen.getAllByTestId("job-history-item");
    expect(items).toHaveLength(2);

    expect(screen.getByText("products.xlsx")).toBeDefined();
    expect(screen.getByText(/42 rows/)).toBeDefined();

    expect(screen.getByText("inventory.csv")).toBeDefined();
    expect(screen.getByText(/1 row(?!s)/)).toBeDefined();
  });

  it("shows empty state when no jobs exist", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => [],
    });

    render(<JobHistory />);

    await waitFor(() => {
      expect(screen.getByTestId("job-history-empty")).toBeDefined();
    });

    expect(screen.getByText("No previous jobs")).toBeDefined();
  });

  it("shows error message when fetch throws", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error")
    );

    render(<JobHistory />);

    await waitFor(() => {
      expect(screen.getByTestId("job-history-error")).toBeDefined();
    });

    expect(screen.getByText("Unable to load job history")).toBeDefined();
  });

  it("shows error message from API response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({
        jobs: [],
        message: "Unable to load job history.",
      }),
    });

    render(<JobHistory />);

    await waitFor(() => {
      expect(screen.getByTestId("job-history-error")).toBeDefined();
    });

    expect(screen.getByText("Unable to load job history.")).toBeDefined();
  });

  it("calls GET /api/jobs on mount", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => [],
    });

    render(<JobHistory />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/jobs");
    });
  });
});
