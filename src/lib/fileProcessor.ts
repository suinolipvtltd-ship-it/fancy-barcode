import * as XLSX from "xlsx";
import type { ProductRecord, ParseResult } from "@/lib/types";

/** Columns that must always be present */
const REQUIRED_COLUMNS = ["Product Name", "SKU", "MRP"] as const;

/** Starting value for auto-generated barcode numbers */
const AUTO_BARCODE_START = 10000001;

/**
 * Returns true if the file extension is .xlsx or .csv (case-insensitive).
 */
export function validateFileExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".csv");
}

/**
 * Parses an uploaded .xlsx or .csv file into an array of ProductRecords.
 * Validates required columns. If "Barcode Value" column is missing,
 * sequential barcode numbers are generated automatically.
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

  if (rows.length === 0) {
    return {
      records: [],
      warnings: [],
      errors: ["No valid product data found in the uploaded file."],
    };
  }

  const headers = Object.keys(rows[0]);
  const missingColumns = REQUIRED_COLUMNS.filter(
    (col) => !headers.includes(col),
  );

  if (missingColumns.length > 0) {
    return {
      records: [],
      warnings: [],
      errors: [`Missing columns: ${missingColumns.join(", ")}`],
    };
  }

  const hasBarcodeColumn = headers.includes("Barcode Value");

  if (!hasBarcodeColumn) {
    warnings.push(
      "\"Barcode Value\" column not found — barcode numbers will be generated automatically.",
    );
  }

  let autoCounter = AUTO_BARCODE_START;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // row 1 is the header

    let barcodeValue: string;

    if (hasBarcodeColumn) {
      barcodeValue = String(row["Barcode Value"] ?? "").trim();
      if (!barcodeValue) {
        warnings.push(`Row ${rowNumber}: empty Barcode Value, skipped`);
        continue;
      }
    } else {
      // Auto-generate sequential barcode number
      barcodeValue = String(autoCounter++);
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
