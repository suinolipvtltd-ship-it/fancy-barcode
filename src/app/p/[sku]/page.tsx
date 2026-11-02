import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { normalizeSku } from "@/lib/inventory";
import { toProductStock, type ProductRow } from "@/lib/products";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Product stock",
  robots: { index: false, follow: false },
};

/**
 * Public QR landing page: `/<...>/p/DRS-1024`.
 *
 * Product QR codes point here, so scanning one with a phone camera shows the
 * live stock count. It is intentionally public (excluded from the auth proxy)
 * and read-only — the extension does the same lookup through the API.
 */
export default async function ProductStockPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku: rawSku } = await params;
  const sku = normalizeSku(decodeURIComponent(rawSku));

  let product: ReturnType<typeof toProductStock> | null = null;
  let error: string | null = null;

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT sku, name, size, price, stock_qty, low_stock_threshold, updated_at
      FROM products
      WHERE sku = ${sku}
      LIMIT 1
    `;
    const row = rows[0] as ProductRow | undefined;
    product = row ? toProductStock(row) : null;
  } catch (e) {
    console.error("Product stock page error:", e);
    error = "Inventory is temporarily unavailable.";
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
          Stock check
        </p>
        <h1 className="mt-1 text-lg font-semibold text-gray-900">
          {product?.name ?? (error ? "Unavailable" : "Unknown product")}
        </h1>
        <p className="mt-1 font-mono text-xs text-gray-500">{sku || "—"}</p>

        {error ? (
          <p className="mt-6 text-sm text-red-600">{error}</p>
        ) : product ? (
          <>
            <div className="mt-6 flex items-end gap-2">
              <span
                className={`text-5xl font-bold tabular-nums ${
                  product.lowStock ? "text-red-600" : "text-gray-900"
                }`}
              >
                {product.stockQty}
              </span>
              <span className="pb-2 text-sm text-gray-500">in stock</span>
            </div>

            {product.lowStock && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                Low stock — reorder soon.
              </p>
            )}

            <dl className="mt-6 space-y-2 text-sm">
              {product.size && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Size</dt>
                  <dd className="font-medium text-gray-900">{product.size}</dd>
                </div>
              )}
              {product.price && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">MRP</dt>
                  <dd className="font-medium text-gray-900">₹{product.price}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Updated</dt>
                <dd className="text-gray-700">
                  {new Date(product.updatedAt).toLocaleString()}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="mt-6 text-sm text-gray-600">
            No product with this SKU exists in the inventory.
          </p>
        )}
      </div>
    </main>
  );
}
