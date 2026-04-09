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
        "Product Name": "Widget",
        SKU: "W-001",
        MRP: "9.99",
        "Barcode Value": "1234567890",
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
      "Product Name,SKU,MRP,Barcode Value\nGadget,G-001,19.99,9876543210";
    const file = createCsvFile(csv);

    const result = await parseFile(file);

    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].productName).toBe("Gadget");
  });

  it("returns errors for missing columns", async () => {
    const file = createXlsxFile([{ "Product Name": "Widget", SKU: "W-001" }]);

    const result = await parseFile(file);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("MRP");
    expect(result.records).toHaveLength(0);
  });

  it("skips rows with empty Barcode Value and adds warnings", async () => {
    const file = createXlsxFile([
      {
        "Product Name": "A",
        SKU: "A-1",
        MRP: "1",
        "Barcode Value": "111",
      },
      {
        "Product Name": "B",
        SKU: "B-1",
        MRP: "2",
        "Barcode Value": "",
      },
      {
        "Product Name": "C",
        SKU: "C-1",
        MRP: "3",
        "Barcode Value": "333",
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
        "Product Name": "A",
        SKU: "A-1",
        MRP: "1",
        "Barcode Value": "",
      },
    ]);

    const result = await parseFile(file);

    expect(result.records).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("No valid product data");
  });

  it("auto-generates sequential barcode numbers when Barcode Value column is missing", async () => {
    const file = createXlsxFile([
      { "Product Name": "A", SKU: "A-1", MRP: "10" },
      { "Product Name": "B", SKU: "B-1", MRP: "20" },
    ]);

    const result = await parseFile(file);

    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(2);
    expect(result.records[0].barcodeValue).toBe("10000001");
    expect(result.records[1].barcodeValue).toBe("10000002");
    expect(result.warnings.some((w) => w.includes("generated automatically"))).toBe(true);
  });
});
