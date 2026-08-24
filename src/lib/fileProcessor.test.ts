import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { validateFileExtension, parseFile } from "@/lib/fileProcessor";

/** Helper: create a File from an array of row objects */
function createXlsxFile(
  rows: Record<string, string>[],
  fileName = "test.xlsx"
): File {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new File([buf], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function createCsvFile(csv: string, fileName = "test.csv"): File {
  return new File([csv], fileName, { type: "text/csv" });
}

describe("validateFileExtension", () => {
  it("accepts .xlsx", () => {
    expect(validateFileExtension("data.xlsx")).toBe(true);
  });

  it("accepts .csv", () => {
    expect(validateFileExtension("data.csv")).toBe(true);
  });

  it("accepts uppercase extensions", () => {
    expect(validateFileExtension("DATA.XLSX")).toBe(true);
    expect(validateFileExtension("DATA.CSV")).toBe(true);
  });

  it("rejects other extensions", () => {
    expect(validateFileExtension("data.pdf")).toBe(false);
    expect(validateFileExtension("data.txt")).toBe(false);
    expect(validateFileExtension("data")).toBe(false);
  });
});

describe("parseFile", () => {
  it("parses a valid xlsx file with all required columns", async () => {
    const file = createXlsxFile([
      {
        Product: "Widget",
        SKU: "W-001",
        "Unit Price": "9.99",
        Barcode: "1234567890",
      },
    ]);

    const result = await parseFile(file);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toEqual({
      productName: "Widget",
      sku: "W-001",
      mrp: "9.99",
      barcodeValue: "1234567890",
      rowNumber: 2,
    });
  });

  it("parses a CSV file", async () => {
    const csv =
      "Product,Barcode,Unit Price,SKU\nGadget,9876543210,19.99,G-001";
    const file = createCsvFile(csv);

    const result = await parseFile(file);

    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].productName).toBe("Gadget");
  });

  it("returns errors for missing columns", async () => {
    const file = createXlsxFile([{ Product: "Widget", Barcode: "111" }]);

    const result = await parseFile(file);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Unit Price");
    expect(result.records).toHaveLength(0);
  });

  it("skips rows with empty Barcode and adds warnings", async () => {
    const file = createXlsxFile([
      {
        Product: "A",
        Barcode: "111",
        "Unit Price": "1",
      },
      {
        Product: "B",
        Barcode: "",
        "Unit Price": "2",
      },
      {
        Product: "C",
        Barcode: "333",
        "Unit Price": "3",
      },
    ]);

    const result = await parseFile(file);

    expect(result.records).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Row 3");
  });

  it("returns error when zero valid rows remain", async () => {
    const file = createXlsxFile([
      {
        Product: "A",
        Barcode: "",
        "Unit Price": "1",
      },
    ]);

    const result = await parseFile(file);

    expect(result.records).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("No valid product data");
  });

  it("allows SKU to be optional — defaults to empty string", async () => {
    const file = createXlsxFile([
      { Product: "A", Barcode: "111", "Unit Price": "10", SKU: "" },
      { Product: "B", Barcode: "222", "Unit Price": "20", SKU: "B-1" },
    ]);

    const result = await parseFile(file);

    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(2);
    expect(result.records[0].sku).toBe("");
    expect(result.records[1].sku).toBe("B-1");
  });
});
