import { getDb } from "@/lib/db";
import { authenticateRequest } from "@/lib/apiAuth";
import { normalizeSku } from "@/lib/inventory";
import { toProductStock, type ProductRow } from "@/lib/products";

export const dynamic = "force-dynamic";

interface ScanBody {
  sku?: string;
  source?: string;
}

/**
 * POST /api/inventory/scan — read-only stock lookup that also records the scan
 * (used for "how often is this SKU checked" analytics). Never changes stock.
 */
export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ScanBody;
  try {
    body = (await request.json()) as ScanBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.sku || !body.sku.trim()) {
    return Response.json({ error: "Field 'sku' is required." }, { status: 400 });
  }

  const sku = normalizeSku(body.sku);
  const source = (body.source ?? "extension").slice(0, 32);

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT sku, name, size, price, stock_qty, low_stock_threshold, updated_at
      FROM products
      WHERE sku = ${sku}
      LIMIT 1
    `;

    const row = rows[0];
    const stockQty = row ? (row.stock_qty as number) : null;

    // Log the scan even when the SKU is unknown — that is a useful signal.
    await sql`
      INSERT INTO inventory_scans (sku, stock_qty, source)
      VALUES (${sku}, ${stockQty}, ${source})
    `;

    if (!row) {
      return Response.json({ error: "Unknown SKU", sku }, { status: 404 });
    }

    return Response.json(toProductStock(row as ProductRow));
  } catch (e) {
    console.error("POST /api/inventory/scan error:", e);
    return Response.json({ error: "Scan could not be recorded." }, { status: 500 });
  }
}
