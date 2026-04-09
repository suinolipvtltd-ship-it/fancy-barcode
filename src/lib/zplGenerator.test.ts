import { describe, it, expect, vi } from "vitest";
import { generateZpl } from "./zplGenerator";
import type { ProductRecord, LabelConfig } from "./types";
import { validateBarcodeValue } from "@/lib/barcodeUtils";
import { DEFAULT_LAYOUT } from "@/lib/constants";

// Mock barcodeUtils to avoid canvas dependency
vi.mock("@/lib/barcodeUtils", () => ({
  validateBarcodeValue: vi.fn(() => true),
}));

const baseConfig: LabelConfig = {
  includeProductName: true,
  includeSku: true,
  outputMode: "zpl",
  dpi: 203,
  showMrp: true,
  layout: DEFAULT_LAYOUT,
};

const sampleRecord: ProductRecord = {
  productName: "Widget A",
  sku: "SKU-001",
  mrp: "9.99",
  barcodeValue: "1234567890",
  rowNumber: 1,
};

describe("generateZpl", () => {
  it("generates one label block per record", () => {
    const records: ProductRecord[] = [
      sampleRecord,
      { ...sampleRecord, productName: "Widget B", sku: "SKU-002", rowNumber: 2 },
      { ...sampleRecord, productName: "Widget C", sku: "SKU-003", rowNumber: 3 },
    ];
    const result = generateZpl({ records, config: baseConfig, dpi: 203 });
    const xaCount = (result.zpl.match(/\^XA/g) || []).length;
    const xzCount = (result.zpl.match(/\^XZ/g) || []).length;
    expect(xaCount).toBe(3);
    expect(xzCount).toBe(3);
    expect(result.warnings).toEqual([]);
  });

  it("uses ^PW832 for 203 DPI", () => {
    const result = generateZpl({ records: [sampleRecord], config: baseConfig, dpi: 203 });
    expect(result.zpl).toContain("^PW832");
    expect(result.zpl).not.toContain("^PW1248");
  });

  it("uses ^PW1248 for 300 DPI", () => {
    const result = generateZpl({ records: [sampleRecord], config: baseConfig, dpi: 300 });
    expect(result.zpl).toContain("^PW1248");
    expect(result.zpl).not.toContain("^PW832");
  });

  it("includes product name when includeProductName is true", () => {
    const result = generateZpl({ records: [sampleRecord], config: baseConfig, dpi: 203 });
    expect(result.zpl).toContain("^FDWidget A^FS");
  });

  it("omits product name when includeProductName is false", () => {
    const config = { ...baseConfig, includeProductName: false };
    const result = generateZpl({ records: [sampleRecord], config, dpi: 203 });
    const lines = result.zpl.split("\n");
    const fdLines = lines.filter((l) => l.includes("^FD"));
    const hasProductNameField = fdLines.some(
      (l) => l.includes("^FDWidget A^FS") && !l.includes("^BC")
    );
    expect(hasProductNameField).toBe(false);
  });

  it("includes SKU when includeSku is true", () => {
    const result = generateZpl({ records: [sampleRecord], config: baseConfig, dpi: 203 });
    expect(result.zpl).toContain("^FDSKU-001^FS");
  });

  it("omits SKU when includeSku is false", () => {
    const config = { ...baseConfig, includeSku: false };
    const result = generateZpl({ records: [sampleRecord], config, dpi: 203 });
    expect(result.zpl).not.toContain("^FDSKU-001^FS");
  });

  it("always includes barcode and MRP", () => {
    const config: LabelConfig = {
      includeProductName: false,
      includeSku: false,
      outputMode: "zpl",
      dpi: 203,
      showMrp: true,
      layout: DEFAULT_LAYOUT,
    };
    const result = generateZpl({ records: [sampleRecord], config, dpi: 203 });
    expect(result.zpl).toContain("^BC");
    expect(result.zpl).toContain("^FD1234567890^FS");
    expect(result.zpl).toContain("^FDMRP: 9.99^FS");
  });

  it("starts each label with ^XA and ends with ^XZ", () => {
    const result = generateZpl({ records: [sampleRecord], config: baseConfig, dpi: 203 });
    const trimmed = result.zpl.trim();
    expect(trimmed.startsWith("^XA")).toBe(true);
    expect(trimmed.endsWith("^XZ")).toBe(true);
  });

  it("returns empty string for empty records array", () => {
    const result = generateZpl({ records: [], config: baseConfig, dpi: 203 });
    expect(result.zpl).toBe("");
    expect(result.warnings).toEqual([]);
  });

  it("skips records with invalid barcodes and returns warnings", () => {
    const mockedValidate = vi.mocked(validateBarcodeValue);
    // First record valid, second invalid, third valid
    mockedValidate
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const records: ProductRecord[] = [
      { ...sampleRecord, rowNumber: 1 },
      { ...sampleRecord, productName: "Bad Barcode", barcodeValue: "INVALID", rowNumber: 2 },
      { ...sampleRecord, productName: "Widget C", rowNumber: 3 },
    ];

    const result = generateZpl({ records, config: baseConfig, dpi: 203 });

    // Only 2 labels should be generated
    const xaCount = (result.zpl.match(/\^XA/g) || []).length;
    expect(xaCount).toBe(2);

    // Warning for row 2
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toBe(
      "Row 2: barcode value could not be encoded, skipped",
    );
  });
});
