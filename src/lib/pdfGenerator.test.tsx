import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import type { ProductRecord, LabelConfig } from "@/lib/types";

// Mock barcodeUtils to avoid canvas dependency
vi.mock("@/lib/barcodeUtils", () => ({
  generateBarcodeDataUrl: vi.fn(() => "data:image/png;base64,mockBarcode"),
  validateBarcodeValue: vi.fn(() => true),
}));

import { validateBarcodeValue } from "@/lib/barcodeUtils";

// Track what gets passed to pdf()
let capturedDoc: React.ReactElement | undefined;
const mockToBlob = vi.fn();

vi.mock("@react-pdf/renderer", () => ({
  Document: "Document",
  Page: "Page",
  View: "View",
  Text: "Text",
  Image: "Image",
  StyleSheet: { create: (s: any) => s },
  pdf: (doc: React.ReactElement) => {
    capturedDoc = doc;
    return { toBlob: mockToBlob };
  },
}));

import { generatePdf, PdfGenerationError } from "./pdfGenerator";
import type { PdfGeneratorResult } from "./pdfGenerator";
import { PAGE_WIDTH, LABEL_WIDTH, LABEL_HEIGHT, COLUMN_GAP, LEFT_MARGIN, DEFAULT_LAYOUT } from "./constants";

function makeRecord(index: number): ProductRecord {
  return {
    productName: `Product ${index}`,
    sku: `SKU-${index}`,
    mrp: `${100 + index}`,
    barcodeValue: `BC${index}`,
    rowNumber: index,
  };
}

const baseConfig: LabelConfig = {
  includeProductName: true,
  includeSku: true,
  outputMode: "pdf",
  dpi: 203,
  layout: DEFAULT_LAYOUT,
};

/** Recursively find all elements matching a type string */
function findByType(node: any, type: string): any[] {
  const found: any[] = [];
  if (!node || typeof node !== "object") return found;
  if (node.type === type) found.push(node);
  const children = node.props?.children;
  if (!children) return found;
  const arr = Array.isArray(children) ? children : [children];
  for (const child of arr) {
    found.push(...findByType(child, type));
  }
  return found;
}

describe("pdfGenerator", () => {
  beforeEach(() => {
    capturedDoc = undefined;
    mockToBlob.mockReset();
    mockToBlob.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
  });

  it("returns a Blob on success", async () => {
    const result = await generatePdf({ records: [makeRecord(1)], config: baseConfig });
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.warnings).toEqual([]);
  });

  it("creates a Document with a Page of correct width and computed height", async () => {
    await generatePdf({ records: [makeRecord(1)], config: baseConfig });
    expect(capturedDoc).toBeDefined();

    const pages = findByType(capturedDoc, "Page");
    expect(pages).toHaveLength(1);

    const page = pages[0];
    // 1 record → 1 row → height = 1 * LABEL_HEIGHT
    expect(page.props.size).toEqual({ width: PAGE_WIDTH, height: LABEL_HEIGHT });
  });

  it("arranges 2 labels in a single row", async () => {
    await generatePdf({
      records: [makeRecord(1), makeRecord(2)],
      config: baseConfig,
    });

    const pages = findByType(capturedDoc, "Page");
    // The page's direct children are row Views
    const pageChildren = pages[0].props.children;
    const rows = Array.isArray(pageChildren) ? pageChildren : [pageChildren];
    expect(rows).toHaveLength(1);
  });

  it("arranges 3 labels in 2 rows (odd count handling)", async () => {
    await generatePdf({
      records: [makeRecord(1), makeRecord(2), makeRecord(3)],
      config: baseConfig,
    });

    const pages = findByType(capturedDoc, "Page");
    const pageChildren = pages[0].props.children;
    const rows = Array.isArray(pageChildren) ? pageChildren : [pageChildren];
    expect(rows).toHaveLength(2);
  });

  it("last row with odd count has only one label (left column)", async () => {
    await generatePdf({
      records: [makeRecord(1), makeRecord(2), makeRecord(3)],
      config: baseConfig,
    });

    const pages = findByType(capturedDoc, "Page");
    const rows = pages[0].props.children;
    const lastRow = rows[rows.length - 1];

    // Last row children: LabelCanvas + false (conditional not rendered)
    const children = Array.isArray(lastRow.props.children)
      ? lastRow.props.children.filter(Boolean)
      : [lastRow.props.children].filter(Boolean);
    // Should have exactly 1 rendered child (the left label)
    expect(children).toHaveLength(1);
  });

  it("applies LEFT_MARGIN to each row", async () => {
    await generatePdf({ records: [makeRecord(1)], config: baseConfig });

    const pages = findByType(capturedDoc, "Page");
    const rows = Array.isArray(pages[0].props.children)
      ? pages[0].props.children
      : [pages[0].props.children];

    for (const row of rows) {
      const style = row.props.style;
      expect(style.marginLeft).toBe(LEFT_MARGIN);
    }
  });

  it("applies COLUMN_GAP between left and right labels", async () => {
    await generatePdf({
      records: [makeRecord(1), makeRecord(2)],
      config: baseConfig,
    });

    const pages = findByType(capturedDoc, "Page");
    const rows = Array.isArray(pages[0].props.children)
      ? pages[0].props.children
      : [pages[0].props.children];

    // The second label is wrapped in a View with marginLeft = COLUMN_GAP
    const row = rows[0];
    const children = Array.isArray(row.props.children)
      ? row.props.children.filter(Boolean)
      : [row.props.children].filter(Boolean);

    // Second child is the gap wrapper View
    const gapWrapper = children[1];
    expect(gapWrapper.props.style.marginLeft).toBe(COLUMN_GAP);
  });

  it("throws PdfGenerationError when pdf().toBlob() fails", async () => {
    mockToBlob.mockRejectedValue(new Error("render boom"));

    await expect(
      generatePdf({ records: [makeRecord(1)], config: baseConfig }),
    ).rejects.toThrow(PdfGenerationError);

    await expect(
      generatePdf({ records: [makeRecord(1)], config: baseConfig }),
    ).rejects.toThrow("PDF generation failed: render boom");
  });

  it("handles a single label (odd count = 1)", async () => {
    const result = await generatePdf({ records: [makeRecord(1)], config: baseConfig });
    expect(result.blob).toBeInstanceOf(Blob);

    const pages = findByType(capturedDoc, "Page");
    const rows = Array.isArray(pages[0].props.children)
      ? pages[0].props.children
      : [pages[0].props.children];
    expect(rows).toHaveLength(1);
  });

  it("skips records with invalid barcodes and returns warnings", async () => {
    const mockedValidate = vi.mocked(validateBarcodeValue);
    // First record valid, second invalid, third valid
    mockedValidate
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const records = [makeRecord(1), makeRecord(2), makeRecord(3)];
    const result = await generatePdf({ records, config: baseConfig });

    expect(result.blob).toBeInstanceOf(Blob);

    // Warning for row 2
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toBe(
      "Row 2: barcode value could not be encoded, skipped",
    );

    // Only 2 valid records → 1 row in the PDF
    const pages = findByType(capturedDoc, "Page");
    const pageChildren = pages[0].props.children;
    const pdfRows = Array.isArray(pageChildren) ? pageChildren : [pageChildren];
    expect(pdfRows).toHaveLength(1);
  });
});
