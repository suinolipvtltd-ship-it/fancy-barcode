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
import { validateBarcodeValue } from "@/lib/barcodeUtils";
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

  // Build rows of label pairs
  const rows: ProductRecord[][] = [];
  for (let i = 0; i < validRecords.length; i += LABELS_PER_ROW) {
    rows.push(validRecords.slice(i, i + LABELS_PER_ROW));
  }

  const doc = (
    <Document>
      <Page
        size={{ width: PAGE_WIDTH }}
        orientation="portrait"
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
            />
            {row.length > 1 && (
              <View style={{ marginLeft: COLUMN_GAP }}>
                <LabelCanvas
                  record={row[1]}
                  config={config}
                  widthPt={LABEL_WIDTH}
                  heightPt={LABEL_HEIGHT}
                />
              </View>
            )}
          </View>
        ))}
      </Page>
    </Document>
  );

  try {
    const instance = pdf(doc);
    const blob = await instance.toBlob();
    return { blob, warnings };
  } catch (error) {
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
