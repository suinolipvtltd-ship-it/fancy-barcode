import * as XLSX from "xlsx";
import type { ProductRecord, ParseResult } from "@/lib/types";

/**
 * Header aliases, in priority order. Matching ignores case, spaces and
 * punctuation, so "Sku Id", "SKU ID" and "sku_id" all resolve to the SKU, and
 * "Name" resolves to the product name.
 */
const COLUMN_ALIASES = {
  product: ["product", "productname", "name", "itemname", "item", "title"],
  barcode: ["barcode", "barcodevalue", "barcodeno", "barcodenumber", "ean", "upc"],
  mrp: ["unitprice", "mrp", "sellingprice", "price", "rate", "amount"],
  sku: ["sku", "skuid", "skucode", "productcode", "itemcode", "code"],
  quantity: [
    "quantity",
    "qty",
    // Swipe's export uses "Opening Qty" for the stock on hand.
    "openingqty",
    "openingquantity",
    "stock",
    "stockqty",
    "units",
    "pcs",
    "count",
  ],
} as const;

type ColumnField = keyof typeof COLUMN_ALIASES;
type ColumnMap = Partial<Record<ColumnField, string>>;

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Quantity from the sheet; blank, zero, negative, fractional or unreadable
 * values fall back to one label. The whole cell is validated — digits are not
 * stripped, so "-5" does not become 5 and "1.5" does not become 15.
 */
function parseQuantity(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 1;

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

/** Maps each logical field to the actual header name found in the sheet. */
export function resolveColumns(headers: string[]): ColumnMap {
  const byNormalized = new Map<string, string>();
  for (const header of headers) {
    const key = normalizeHeader(header);
    if (!byNormalized.has(key)) byNormalized.set(key, header);
  }

  const map: ColumnMap = {};
  for (const field of Object.keys(COLUMN_ALIASES) as ColumnField[]) {
    for (const alias of COLUMN_ALIASES[field]) {
      const header = byNormalized.get(alias);
      if (header) {
        map[field] = header;
        break;
      }
    }
  }
  return map;
}

/**
 * Returns true if the file extension is .xlsx or .csv (case-insensitive).
 */
export function validateFileExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".csv");
}

/**
 * Parses an uploaded .xlsx or .csv file into an array of ProductRecords.
 *
 * Required: a product name column (Product / Name) and a price column
 * (Unit Price / MRP / Selling Price). A barcode comes from the Barcode column
 * when present, otherwise the SKU ("Sku Id") is encoded as the barcode — that
 * is the whole point of the SKU column.
 *
 * An optional Quantity column is captured so the generators can print one
 * label per unit.
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
  // `defval` keeps empty cells in the row objects, so a blank value in the
  // first data row cannot hide its header from `resolveColumns`.
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  if (rows.length === 0) {
    return {
      records: [],
      warnings: [],
      errors: ["No valid product data found in the uploaded file."],
    };
  }

  const headers = Object.keys(rows[0]);
  const columns = resolveColumns(headers);

  const missing: string[] = [];
  if (!columns.product) missing.push("Product / Name");
  if (!columns.mrp) missing.push("Unit Price / MRP");
  if (!columns.barcode && !columns.sku) missing.push("Barcode or SKU / Sku Id");

  if (missing.length > 0) {
    return {
      records: [],
      warnings: [],
      errors: [`Missing columns: ${missing.join(", ")}`],
    };
  }

  if (!columns.barcode && columns.sku) {
    warnings.push(
      `No Barcode column found — using ${columns.sku} (SKU) as the barcode value.`,
    );
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // row 1 is the header

    const read = (field: ColumnField): string => {
      const header = columns[field];
      return header ? String(row[header] ?? "").trim() : "";
    };

    const sku = read("sku");
    // The barcode is the Barcode column when it exists, otherwise the SKU.
    const barcodeValue = read("barcode") || sku;

    if (!barcodeValue) {
      warnings.push(`Row ${rowNumber}: empty Barcode and SKU, skipped`);
      continue;
    }

    records.push({
      productName: read("product"),
      sku,
      mrp: read("mrp"),
      barcodeValue,
      quantity: parseQuantity(read("quantity")),
      rowNumber,
    });
  }

  if (records.length === 0) {
    errors.push("No valid product data found in the uploaded file.");
  }

  return { records, warnings, errors };
}
