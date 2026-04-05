import { validateBarcodeValue } from "@/lib/barcodeUtils";
import type { ProductRecord, LabelConfig } from "@/lib/types";

export interface ZplOptions {
  records: ProductRecord[];
  config: LabelConfig;
  dpi: 203 | 300;
}

export interface ZplGeneratorResult {
  zpl: string;
  warnings: string[];
}

/**
 * Generates a ZPL string containing one label block per valid ProductRecord.
 * Records with invalid/unencodable barcode values are skipped, and warnings
 * are collected with affected row numbers.
 *
 * Each label block starts with ^XA and ends with ^XZ.
 * Print width is set based on DPI: ^PW832 for 203, ^PW1248 for 300.
 * Label content respects config toggles for Product Name and SKU.
 * Barcode (Code 128) and MRP are always included.
 */
export function generateZpl(options: ZplOptions): ZplGeneratorResult {
  const { records, config, dpi } = options;
  const printWidth = dpi === 203 ? 832 : 1248;

  // Filter out records with invalid barcode values
  const warnings: string[] = [];
  const validRecords: ProductRecord[] = [];
  for (const record of records) {
    if (validateBarcodeValue(record.barcodeValue)) {
      validRecords.push(record);
    } else {
      warnings.push(
        `Row ${record.rowNumber}: barcode value could not be encoded, skipped`,
      );
    }
  }

  const zpl = validRecords
    .map((record) => {
      const lines: string[] = [];
      lines.push("^XA");
      lines.push(`^PW${printWidth}`);

      let yPos = 20;

      // Product Name (conditional)
      if (config.includeProductName) {
        lines.push(`^FO20,${yPos}^A0N,28,28^FD${record.productName}^FS`);
        yPos += 40;
      }

      // Barcode (always shown) — Code 128
      lines.push(`^FO20,${yPos}^BCN,60,Y,N,N^FD${record.barcodeValue}^FS`);
      yPos += 80;

      // SKU (conditional)
      if (config.includeSku) {
        lines.push(`^FO20,${yPos}^A0N,22,22^FD${record.sku}^FS`);
        yPos += 30;
      }

      // MRP (always shown)
      lines.push(`^FO20,${yPos}^A0N,22,22^FDMRP: ${record.mrp}^FS`);

      lines.push("^XZ");
      return lines.join("\n");
    })
    .join("\n");

  return { zpl, warnings };
}
