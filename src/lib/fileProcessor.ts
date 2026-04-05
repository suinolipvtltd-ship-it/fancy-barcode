import * as XLSX from "xlsx";
import type { ProductRecord, ParseResult } from "@/lib/types";

const REQUIRED_COLUMNS = [
  "Product Name",
  "SKU",
  "MRP",
  "Barcode Value",
] as const;

/**
 * Returns true if the file extension is .xlsx or .csv (case-insensitive).
 */
export function validateFileExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".csv");
}

/**
 * Parses an uploaded .xlsx or .csv file into an array of ProductRecords.
 * Validates required columns and skips rows with empty Barcode Value.
 */
export async function parseFile(file: File): Promise<ParseResult> {
  const records: ProductRecord[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  let workbook: XLSX.WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array" });
  } catch {
    return {
      records: [],
      warnings: [],
      errors: [
        "Unable to read file. The file may be corrupted or in an unsupported format.",
      ],
    };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      records: [],
      warnings: [],
      errors: ["The file contains no sheets."],
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  // Validate required columns using the header keys from the first row
  if (rows.length === 0) {
    return {
      records: [],
      warnings: [],
      errors: ["No valid product data found in the uploaded file."],
    };
  }

  const headers = Object.keys(rows[0]);
  const missingColumns = REQUIRED_COLUMNS.filter(
    (col) => !headers.includes(col)
  );

  if (missingColumns.length > 0) {
    return {
      records: [],
      warnings: [],
      errors: [`Missing columns: ${missingColumns.join(", ")}`],
    };
  }

  // Iterate rows — row numbers are 1-based, +2 accounts for header row + 0-index
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // row 1 is the header
    const barcodeValue = String(row["Barcode Value"] ?? "").trim();

    if (!barcodeValue) {
      warnings.push(`Row ${rowNumber}: empty Barcode Value, skipped`);
      continue;
    }

    records.push({
      productName: String(row["Product Name"] ?? "").trim(),
      sku: String(row["SKU"] ?? "").trim(),
      mrp: String(row["MRP"] ?? "").trim(),
      barcodeValue,
      rowNumber,
    });
  }

  if (records.length === 0) {
    errors.push("No valid product data found in the uploaded file.");
  }

  return { records, warnings, errors };
}
