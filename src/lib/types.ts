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

/** Label rendering configuration */
export interface LabelConfig {
  includeProductName: boolean;
  includeSku: boolean;
  outputMode: "pdf" | "zpl";
  dpi: 203 | 300;
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
