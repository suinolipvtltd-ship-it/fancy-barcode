/**
 * PDF layout constants in points (1 inch = 72 pt).
 * Designed for a 2-up label layout on 4.3-inch wide Zebra label stock.
 */

/** Total page width: 4.3 inches */
export const PAGE_WIDTH = 309.6;

/** Single label width: 2 inches */
export const LABEL_WIDTH = 144;

/** Single label height: 1 inch */
export const LABEL_HEIGHT = 72;

/** Gap between the two label columns: 0.125 inches */
export const COLUMN_GAP = 9;

/** Left margin: 0.0375 inches */
export const LEFT_MARGIN = 2.7;

/** Default label element ordering matching sample PDF: MRP/SKU → Barcode → Barcode Number */
export const DEFAULT_LAYOUT: import("@/lib/types").LabelElement[] = [
  { type: "mrpSku", visible: true },
  { type: "barcode", visible: true },
  { type: "barcodeNumber", visible: true },
  { type: "productName", visible: false },
  { type: "sku", visible: false },
  { type: "mrp", visible: false },
];
