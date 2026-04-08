import React from "react";
import { Document, Page, View, pdf } from "@react-pdf/renderer";
import { LabelCanvas } from "@/components/LabelCanvas";
import {
  PAGE_WIDTH,
  LABEL_WIDTH,
  LABEL_HEIGHT,
  COLUMN_GAP,
  LEFT_MARGIN,
} from "@/lib/constants";
import { validateBarcodeValue, generateBarcodeDataUrl } from "@/lib/barcodeUtils";
import type { ProductRecord, LabelConfig } from "@/lib/types";

export interface PdfGeneratorOptions {
  records: ProductRecord[];
  config: LabelConfig;
}

export interface PdfGeneratorResult {
  blob: Blob;
  warnings: string[];
}

/** Number of labels per row in the 2-up layout */
const LABELS_PER_ROW = 2;

/**
 * Generates a PDF blob containing barcode labels in a 2-column grid layout.
 * Records with invalid/unencodable barcode values are skipped, and warnings
 * are collected with affected row numbers.
 *
 * Layout: portrait orientation, page width 309.6pt (4.3in),
 * label cells 144×72pt (2×1in), column gap 9pt, left margin 2.7pt.
 */
export async function generatePdf(
  options: PdfGeneratorOptions,
): Promise<PdfGeneratorResult> {
  const { records, config } = options;

  // Filter out records with invalid barcode values and pre-generate barcode images
  const warnings: string[] = [];
  const validRecords: ProductRecord[] = [];
  const barcodeImages: Map<string, string> = new Map();

  console.log("[PDF] generatePdf called with", records.length, "records");

  for (const record of records) {
    if (validateBarcodeValue(record.barcodeValue)) {
      validRecords.push(record);
      // Pre-generate barcode data URL so LabelCanvas doesn't need to call it during react-pdf render
      if (!barcodeImages.has(record.barcodeValue)) {
        barcodeImages.set(record.barcodeValue, generateBarcodeDataUrl(record.barcodeValue));
      }
    } else {
      warnings.push(
        `Row ${record.rowNumber}: barcode value could not be encoded, skipped`,
      );
    }
  }

  console.log("[PDF] valid records:", validRecords.length, "| warnings:", warnings.length);
  console.log("[PDF] barcode images generated:", barcodeImages.size);

  // Build rows of label pairs
  const rows: ProductRecord[][] = [];
  for (let i = 0; i < validRecords.length; i += LABELS_PER_ROW) {
    rows.push(validRecords.slice(i, i + LABELS_PER_ROW));
  }

  // Compute explicit page height to avoid react-pdf infinite pagination loop
  // when only width is provided (known bug in @react-pdf/renderer v4.x with
  // custom page sizes missing an explicit height).
  const pageHeight = rows.length * LABEL_HEIGHT;

  const doc = (
    <Document>
      <Page
        size={{ width: PAGE_WIDTH, height: pageHeight }}
        style={{ flexDirection: "column" }}
      >
        {rows.map((row, rowIndex) => (
          <View
            key={rowIndex}
            style={{
              flexDirection: "row",
              marginLeft: LEFT_MARGIN,
            }}
          >
            <LabelCanvas
              record={row[0]}
              config={config}
              widthPt={LABEL_WIDTH}
              heightPt={LABEL_HEIGHT}
              barcodeDataUrl={barcodeImages.get(row[0].barcodeValue)}
            />
            {row.length > 1 && (
              <View style={{ marginLeft: COLUMN_GAP }}>
                <LabelCanvas
                  record={row[1]}
                  config={config}
                  widthPt={LABEL_WIDTH}
                  heightPt={LABEL_HEIGHT}
                  barcodeDataUrl={barcodeImages.get(row[1].barcodeValue)}
                />
              </View>
            )}
          </View>
        ))}
      </Page>
    </Document>
  );

  try {
    console.log("[PDF] calling pdf(doc)...");
    const instance = pdf(doc);
    console.log("[PDF] pdf() returned, calling toBlob()...");
    const blob = await instance.toBlob();
    console.log("[PDF] toBlob() resolved, blob size:", blob?.size);
    if (!blob || blob.size === 0) {
      throw new PdfGenerationError("Generated PDF blob is empty");
    }
    return { blob, warnings };
  } catch (error) {
    console.error("[PDF] error during pdf generation:", error);
    if (error instanceof PdfGenerationError) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Unknown PDF rendering error";
    throw new PdfGenerationError(message);
  }
}

/**
 * Custom error class for PDF generation failures.
 * Consumers can check `instanceof PdfGenerationError` to offer retry.
 */
export class PdfGenerationError extends Error {
  constructor(message: string) {
    super(`PDF generation failed: ${message}`);
    this.name = "PdfGenerationError";
  }
}
