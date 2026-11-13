/** Core product data extracted from a file row */
export interface ProductRecord {
  productName: string;
  sku: string;
  mrp: string;
  barcodeValue: string;
  /**
   * How many labels to print for this row (the Quantity column). Defaults to 1
   * when the file has no quantity column.
   */
  quantity: number;
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
  /**
   * Labels actually produced (quantity-expanded). Kept separate from rowCount
   * so a row with quantity 3 is not reported as three source rows.
   */
  labelCount?: number;
}

/** GET /api/jobs response item */
export interface JobRecord {
  id: string;
  fileName: string;
  rowCount: number;
  /** Null for jobs saved before label counts were tracked. */
  labelCount: number | null;
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
  /** The child's birthday, `YYYY-MM-DD`, or null when not captured yet. */
  childBirthday: string | null;
  items: ReminderSaleItem[];
}

/* -------------------------------------------------------------------------- */
/* CRM                                                                        */
/* -------------------------------------------------------------------------- */

/** One of a customer's children, captured for birthday follow-ups. */
export interface CustomerChild {
  id: string;
  name: string | null;
  gender: ChildGender | null;
  /** `YYYY-MM-DD`, or null when the birthday is not known. */
  birthday: string | null;
}

/** A row in the CRM list. Totals are computed from recorded sales. */
export interface CustomerRecord {
  id: string;
  name: string | null;
  phone: string | null;
  note: string | null;
  /** How many recorded sales this phone number has. */
  visits: number;
  /** Sum of `sales.total_amount`, as a decimal string, or null when unknown. */
  totalSpend: string | null;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  children: CustomerChild[];
  /** When the shop last asked for a Google review. */
  reviewRequestedAt: string | null;
  /** When the review was left. Null means it is still due. */
  reviewedAt: string | null;
  createdAt: string;
}

/** A line item on a past sale, as shown in the CRM purchase history. */
export interface CustomerSaleItem {
  sku: string | null;
  name: string | null;
  size: string | null;
  qty: number;
  unitPrice: string | null;
}

/** One past purchase. */
export interface CustomerSale {
  id: string;
  externalId: string;
  source: string;
  soldAt: string;
  totalAmount: string | null;
  items: CustomerSaleItem[];
}

/** GET /api/customers/[id] response. */
export interface CustomerDetail extends CustomerRecord {
  sales: CustomerSale[];
}

/** POST /api/customers request body. */
export interface CreateCustomerRequest {
  name?: string | null;
  phone?: string | null;
  note?: string | null;
  children?: {
    name?: string | null;
    gender?: ChildGender | null;
    birthday?: string | null;
  }[];
}

/** PATCH /api/customers/[id] request body. */
export interface UpdateCustomerRequest {
  name?: string | null;
  phone?: string | null;
  note?: string | null;
  /** Pass to replace the whole list of children; omit to leave untouched. */
  children?: {
    id?: string | null;
    name?: string | null;
    gender?: ChildGender | null;
    birthday?: string | null;
  }[];
  /**
   * `true` stamps `review_requested_at` with now, `false` clears it.
   * Omit to leave untouched.
   */
  reviewRequested?: boolean;
  /**
   * `true` stamps `reviewed_at` with now, `false` clears it.
   * Omit to leave untouched.
   */
  reviewed?: boolean;
}

/** PATCH /api/reminders request body */
export interface UpdateReminderRequest {
  id: string;
  childGender?: ChildGender | null;
  childAgeYears?: number | null;
  childBirthday?: string | null;
  items?: {
    id?: string | null;
    name?: string | null;
    size?: string | null;
    sku?: string | null;
    qty?: number;
  }[];
}
