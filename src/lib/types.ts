/** Core product data extracted from a file row */
export interface ProductRecord {
  productName: string;
  sku: string;
  mrp: string;
  barcodeValue: string;
  /** 1-based row index from the source file */
  rowNumber: number;
}

/** Result of parsing an uploaded file */
export interface ParseResult {
  records: ProductRecord[];
  warnings: string[];
  errors: string[];
}

/** A single element that can appear on a label */
export type LabelElementType = "productName" | "barcode" | "barcodeNumber" | "sku" | "mrp";

/** Positioned element in the label layout (ordered top-to-bottom) */
export interface LabelElement {
  type: LabelElementType;
  visible: boolean;
}

/** Label rendering configuration */
export interface LabelConfig {
  includeProductName: boolean;
  includeSku: boolean;
  outputMode: "pdf" | "zpl";
  dpi: 203 | 300;
  /** Ordered list of label elements for the visual designer */
  layout: LabelElement[];
}

/** POST /api/jobs request body */
export interface CreateJobRequest {
  fileName: string;
  rowCount: number;
}

/** GET /api/jobs response item */
export interface JobRecord {
  id: string;
  fileName: string;
  rowCount: number;
  createdAt: string;
}
