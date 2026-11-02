import { getDb } from "@/lib/db";
import { authenticateRequest } from "@/lib/apiAuth";
import { normalizeSku } from "@/lib/inventory";
import { toProductStock, type ProductRow } from "@/lib/products";

export const dynamic = "force-dynamic";

/** GET /api/inventory?sku=DRS-1024 — stock lookup used by the QR scanner. */
export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawSku = new URL(request.url).searchParams.get("sku");
  if (!rawSku || !rawSku.trim()) {
    return Response.json({ error: "Query parameter 'sku' is required." }, { status: 400 });
  }

  const sku = normalizeSku(rawSku);

  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT sku, name, size, price, stock_qty, low_stock_threshold, updated_at
      FROM products
      WHERE sku = ${sku}
      LIMIT 1
    `) as ProductRow[];

    const row = rows[0];
    if (!row) {
      return Response.json(
        { error: "Unknown SKU", sku },
        { status: 404 },
      );
    }

    return Response.json(toProductStock(row));
  } catch (e) {
    console.error("GET /api/inventory error:", e);
    return Response.json({ error: "Inventory lookup failed." }, { status: 500 });
  }
}

interface UpsertBody {
  sku?: string;
  name?: string;
  size?: string | null;
  price?: number | string | null;
  stockQty?: number;
  lowStockThreshold?: number;
}

/**
 * POST /api/inventory — create a product or set its stock.
 * Accepts a session cookie (app) or an extension bearer token.
 */
export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: UpsertBody;
  try {
    body = (await request.json()) as UpsertBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sku = body.sku ? normalizeSku(body.sku) : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!sku) {
    return Response.json({ error: "Field 'sku' is required." }, { status: 400 });
  }
  if (!name) {
    return Response.json({ error: "Field 'name' is required." }, { status: 400 });
  }
  if (
    typeof body.stockQty !== "number" ||
    !Number.isFinite(body.stockQty) ||
    body.stockQty < 0
  ) {
    return Response.json(
      { error: "Field 'stockQty' must be a number >= 0." },
      { status: 400 },
    );
  }

  const stockQty = Math.floor(body.stockQty);
  const lowStockThreshold =
    typeof body.lowStockThreshold === "number" && Number.isFinite(body.lowStockThreshold)
      ? Math.max(0, Math.floor(body.lowStockThreshold))
      : 3;
  const price =
    body.price === null || body.price === undefined || body.price === ""
      ? null
      : Number(body.price);
  const size =
    typeof body.size === "string" && body.size.trim()
      ? body.size.trim().slice(0, 32)
      : null;

  try {
    const sql = getDb();
    const rows = await sql`
      INSERT INTO products (sku, name, size, price, stock_qty, low_stock_threshold)
      VALUES (${sku}, ${name}, ${size}, ${price}, ${stockQty}, ${lowStockThreshold})
      ON CONFLICT (sku) DO UPDATE SET
        name = EXCLUDED.name,
        size = COALESCE(EXCLUDED.size, products.size),
        price = COALESCE(EXCLUDED.price, products.price),
        stock_qty = EXCLUDED.stock_qty,
        low_stock_threshold = EXCLUDED.low_stock_threshold,
        updated_at = NOW()
      RETURNING sku, name, size, price, stock_qty, low_stock_threshold, updated_at
    `;

    return Response.json(toProductStock(rows[0] as ProductRow), { status: 201 });
  } catch (e) {
    console.error("POST /api/inventory error:", e);
    return Response.json({ error: "Product could not be saved." }, { status: 500 });
  }
}
