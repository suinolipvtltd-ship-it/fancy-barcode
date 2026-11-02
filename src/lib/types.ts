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
export type LabelElementType = "productName" | "barcode" | "barcodeNumber" | "sku" | "mrp" | "mrpSku";

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
  /** Whether to show MRP price in the combined MRP/SKU line */
  showMrp: boolean;
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

/** Product row with stock information (GET /api/inventory?sku=...) */
export interface ProductStock {
  sku: string;
  name: string;
  size: string | null;
  price: string | null;
  stockQty: number;
  lowStockThreshold: number;
  lowStock: boolean;
  updatedAt: string;
}

/** POST /api/sales request body sent by the extension */
export interface CreateSaleRequest {
  source?: string;
  externalId: string;
  soldAt?: string;
  customer?: {
    name?: string;
    phone?: string;
    note?: string;
  };
  items: {
    sku?: string;
    name?: string;
    /** Size bought, e.g. "M" or "2-3Y". */
    size?: string | null;
    qty?: number;
    unitPrice?: number;
  }[];
  totalAmount?: number;
  raw?: unknown;
}

/** Stock outcome per line item after a sale was recorded */
export interface SaleItemStock {
  sku: string | null;
  name: string | null;
  size: string | null;
  qty: number;
  stockQty: number | null;
  lowStockThreshold: number | null;
  lowStock: boolean;
  known: boolean;
}

/** POST /api/sales response */
export interface CreateSaleResponse {
  saleId: string;
  /** true when this invoice had already been recorded */
  duplicate: boolean;
  items: SaleItemStock[];
  reminder: {
    date: string;
    title: string;
    description: string;
  };
  warnings: string[];
}

/** POST /api/calendar/events request body */
export interface SaveCalendarEventRequest {
  saleId: string;
  googleEventId?: string;
  eventDate: string;
  htmlLink?: string;
  calendarId?: string;
}

/** One line item as shown in the admin reminder list */
export interface ReminderSaleItem {
  /** sale_items.id — null for a row the admin has not saved yet */
  id: string | null;
  name: string | null;
  size: string | null;
  qty: number;
  sku: string | null;
}

/** Who the order was for */
export type ChildGender = "girl" | "boy";

/** A reminder (calendar event) joined with the sale and customer behind it */
export interface ReminderRecord {
  /** calendar_events.id */
  id: string;
  saleId: string;
  /** Swipe invoice / bill number, e.g. "INV-123". */
  externalId: string;
  /** All-day event date, YYYY-MM-DD */
  eventDate: string;
  googleEventId: string | null;
  htmlLink: string | null;
  customerName: string | null;
  customerPhone: string | null;
  totalAmount: string | null;
  soldAt: string;
  childGender: ChildGender | null;
  childAgeYears: number | null;
  items: ReminderSaleItem[];
}

/** PATCH /api/reminders request body */
export interface UpdateReminderRequest {
  id: string;
  childGender?: ChildGender | null;
  childAgeYears?: number | null;
  items?: {
    id?: string | null;
    name?: string | null;
    size?: string | null;
    sku?: string | null;
    qty?: number;
  }[];
}
