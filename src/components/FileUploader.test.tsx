import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FileUploader, { isAcceptedFile } from "./FileUploader";

// Helper to create a mock File
function createMockFile(name: string): File {
  return new File(["content"], name, { type: "application/octet-stream" });
}

describe("FileUploader", () => {
  it("displays instructional text when no file is uploaded", () => {
    render(<FileUploader onFileAccepted={vi.fn()} onError={vi.fn()} />);
    expect(
      screen.getByText(/drag and drop an \.xlsx or \.csv file here/i)
    ).toBeDefined();
  });

  it("accepts a .xlsx file and shows file name with success indicator", () => {
    const onFileAccepted = vi.fn();
    const onError = vi.fn();
    render(
      <FileUploader onFileAccepted={onFileAccepted} onError={onError} />
    );

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("products.xlsx");
    fireEvent.change(input, { target: { files: [file] } });

    expect(onFileAccepted).toHaveBeenCalledWith(file);
    expect(onError).not.toHaveBeenCalled();
    expect(screen.getByText("products.xlsx")).toBeDefined();
    expect(screen.getByText("✓")).toBeDefined();
  });

  it("accepts a .csv file and shows file name with success indicator", () => {
    const onFileAccepted = vi.fn();
    render(
      <FileUploader onFileAccepted={onFileAccepted} onError={vi.fn()} />
    );

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("data.csv");
    fireEvent.change(input, { target: { files: [file] } });

    expect(onFileAccepted).toHaveBeenCalledWith(file);
    expect(screen.getByText("data.csv")).toBeDefined();
  });

  it("rejects unsupported file types and calls onError", () => {
    const onFileAccepted = vi.fn();
    const onError = vi.fn();
    render(
      <FileUploader onFileAccepted={onFileAccepted} onError={onError} />
    );

    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const file = createMockFile("readme.pdf");
    fireEvent.change(input, { target: { files: [file] } });

    expect(onFileAccepted).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      "Unsupported file type. Please upload a .xlsx or .csv file."
    );
  });

  it("handles drag and drop of a valid file", () => {
    const onFileAccepted = vi.fn();
    render(
      <FileUploader onFileAccepted={onFileAccepted} onError={vi.fn()} />
    );

    const dropZone = screen.getByTestId("file-uploader");
    const file = createMockFile("test.csv");

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    expect(onFileAccepted).toHaveBeenCalledWith(file);
    expect(screen.getByText("test.csv")).toBeDefined();
  });

  it("handles drag and drop of an invalid file", () => {
    const onError = vi.fn();
    render(
      <FileUploader onFileAccepted={vi.fn()} onError={onError} />
    );

    const dropZone = screen.getByTestId("file-uploader");
    const file = createMockFile("image.png");

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    expect(onError).toHaveBeenCalledWith(
      "Unsupported file type. Please upload a .xlsx or .csv file."
    );
  });
});

describe("isAcceptedFile", () => {
  it("returns true for .xlsx", () => {
    expect(isAcceptedFile("file.xlsx")).toBe(true);
  });

  it("returns true for .csv", () => {
    expect(isAcceptedFile("file.csv")).toBe(true);
  });

  it("returns true for uppercase extensions", () => {
    expect(isAcceptedFile("FILE.XLSX")).toBe(true);
    expect(isAcceptedFile("DATA.CSV")).toBe(true);
  });

  it("returns false for unsupported extensions", () => {
    expect(isAcceptedFile("file.pdf")).toBe(false);
    expect(isAcceptedFile("file.txt")).toBe(false);
    expect(isAcceptedFile("file.xls")).toBe(false);
  });

  it("returns false for files with no extension", () => {
    expect(isAcceptedFile("noextension")).toBe(false);
  });
});
