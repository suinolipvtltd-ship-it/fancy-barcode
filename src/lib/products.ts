import type { ProductStock } from "@/lib/types";

export interface ProductRow {
  sku: string;
  name: string;
  size: string | null;
  price: string | null;
  stock_qty: number;
  low_stock_threshold: number;
  updated_at: string | Date;
}

/** Maps a `products` row to the JSON shape the extension consumes. */
export function toProductStock(row: ProductRow): ProductStock {
  return {
    sku: row.sku,
    name: row.name,
    size: row.size,
    price: row.price === null ? null : String(row.price),
    stockQty: row.stock_qty,
    lowStockThreshold: row.low_stock_threshold,
    lowStock: row.stock_qty <= row.low_stock_threshold,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
