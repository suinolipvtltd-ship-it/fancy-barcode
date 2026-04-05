import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PrintReminder from "./PrintReminder";

describe("PrintReminder", () => {
  it("renders nothing when visible is false", () => {
    const { container } = render(<PrintReminder visible={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the print reminder banner when visible is true", () => {
    render(<PrintReminder visible={true} />);
    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.getByText(/Margins: None/)).toBeDefined();
    expect(screen.getByText(/Scale: 100%/)).toBeDefined();
  });

  it("includes instruction about accurate label dimensions", () => {
    render(<PrintReminder visible={true} />);
    expect(screen.getByText(/accurate label dimensions/)).toBeDefined();
  });
});
