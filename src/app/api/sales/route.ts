import { getDb } from "@/lib/db";
import { authenticateRequest } from "@/lib/apiAuth";
import { buildReminderEvent } from "@/lib/birthday";
import { normalizeSku, parseQty } from "@/lib/inventory";
import type {
  CreateSaleRequest,
  CreateSaleResponse,
  SaleItemStock,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 200;
const MAX_SKU_LENGTH = 128;
const MAX_NAME_LENGTH = 255;
const MAX_SIZE_LENGTH = 32;
const MAX_PHONE_LENGTH = 32;

type Sql = ReturnType<typeof getDb>;

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

async function loadStock(sql: Sql, sku: string | null): Promise<SaleItemStock["stockQty"]> {
  if (!sku) return null;
  const rows = await sql`SELECT stock_qty FROM products WHERE sku = ${sku} LIMIT 1`;
  const row = rows[0];
  return row ? (row.stock_qty as number) : null;
}

async function loadThreshold(sql: Sql, sku: string | null): Promise<number | null> {
  if (!sku) return null;
  const rows = await sql`
    SELECT low_stock_threshold FROM products WHERE sku = ${sku} LIMIT 1
  `;
  const row = rows[0];
  return row ? (row.low_stock_threshold as number) : null;
}

/**
 * POST /api/sales — records a sale detected on Swipe, decrements stock for
 * every matching SKU, and returns the suggested calendar reminder.
 *
 * Idempotent on (source, externalId): re-sending the same invoice returns
 * `duplicate: true` so the extension does not create a second calendar event.
 */
export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateSaleRequest;
  try {
    body = (await request.json()) as CreateSaleRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const externalId = clean(body?.externalId, 191);
  if (!externalId) {
    return Response.json({ error: "Field 'externalId' is required." }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return Response.json(
      { error: "Field 'items' must be a non-empty array." },
      { status: 400 },
    );
  }

  const soldAt = body.soldAt ? new Date(body.soldAt) : new Date();
  if (Number.isNaN(soldAt.getTime())) {
    return Response.json({ error: "Field 'soldAt' is not a valid date." }, { status: 400 });
  }

  const source = clean(body.source, 32) ?? "swipe";
  const customerName = clean(body.customer?.name, MAX_NAME_LENGTH);
  const customerPhone = clean(body.customer?.phone, MAX_PHONE_LENGTH);
  const customerNote = clean(body.customer?.note, 2000);

  const items = body.items.slice(0, MAX_ITEMS).map((item) => ({
    sku: item.sku ? normalizeSku(item.sku).slice(0, MAX_SKU_LENGTH) : null,
    name: clean(item.name, MAX_NAME_LENGTH),
    size: clean(item.size, MAX_SIZE_LENGTH),
    qty: parseQty(item.qty),
    unitPrice:
      typeof item.unitPrice === "number" && Number.isFinite(item.unitPrice)
        ? item.unitPrice
        : null,
  }));

  const totalAmount =
    typeof body.totalAmount === "number" && Number.isFinite(body.totalAmount)
      ? body.totalAmount
      : null;

  const reminder = buildReminderEvent({
    customerName,
    customerPhone,
    items,
    soldAt,
    note: customerNote,
  });

  const warnings: string[] = [];

  try {
    const sql = getDb();

    const existing = await sql`
      SELECT id FROM sales WHERE source = ${source} AND external_id = ${externalId} LIMIT 1
    `;
    if (existing[0]) {
      const saleId = existing[0].id as string;
      const itemStocks: SaleItemStock[] = [];
      for (const item of items) {
        const stockQty = await loadStock(sql, item.sku);
        const threshold = await loadThreshold(sql, item.sku);
        itemStocks.push({
          sku: item.sku,
          name: item.name,
          size: item.size,
          qty: item.qty,
          stockQty,
          lowStockThreshold: threshold,
          lowStock: stockQty !== null && threshold !== null ? stockQty <= threshold : false,
          known: stockQty !== null,
        });
      }
      return Response.json({
        saleId,
        duplicate: true,
        items: itemStocks,
        reminder,
        warnings: ["Sale already recorded — calendar event not created again."],
      } satisfies CreateSaleResponse);
    }

    // 1. Upsert the customer (phone is the natural key when present).
    let customerId: string | null = null;
    if (customerPhone) {
      const rows = await sql`
        INSERT INTO customers (name, phone, note, first_purchase_at, last_purchase_at)
        VALUES (${customerName}, ${customerPhone}, ${customerNote}, ${soldAt}, ${soldAt})
        ON CONFLICT (phone) DO UPDATE SET
          name = COALESCE(EXCLUDED.name, customers.name),
          note = COALESCE(EXCLUDED.note, customers.note),
          last_purchase_at = EXCLUDED.last_purchase_at
        RETURNING id
      `;
      customerId = (rows[0]?.id as string | undefined) ?? null;
    } else if (customerName) {
      const rows = await sql`
        INSERT INTO customers (name, first_purchase_at, last_purchase_at)
        VALUES (${customerName}, ${soldAt}, ${soldAt})
        RETURNING id
      `;
      customerId = (rows[0]?.id as string | undefined) ?? null;
    }

    // 2. Insert the sale. ON CONFLICT guards against two tabs reporting at once.
    const rawData =
      body.raw === undefined ? null : JSON.stringify(body.raw).slice(0, 100_000);
    const saleRows = await sql`
      INSERT INTO sales (
        source, external_id, customer_id, customer_name, customer_phone,
        total_amount, sold_at, raw_data
      )
      VALUES (
        ${source}, ${externalId}, ${customerId}, ${customerName}, ${customerPhone},
        ${totalAmount}, ${soldAt}, ${rawData}
      )
      ON CONFLICT (source, external_id) DO NOTHING
      RETURNING id
    `;
    const saleId = saleRows[0]?.id as string | undefined;
    if (!saleId) {
      return Response.json(
        {
          error: "Sale already recorded",
          duplicate: true,
        },
        { status: 409 },
      );
    }

    // 3. Line items + stock decrement.
    const itemStocks: SaleItemStock[] = [];
    for (const item of items) {
      await sql`
        INSERT INTO sale_items (sale_id, sku, product_name, size, qty, unit_price)
        VALUES (${saleId}, ${item.sku}, ${item.name}, ${item.size}, ${item.qty}, ${item.unitPrice})
      `;

      let stockQty: number | null = null;
      let threshold: number | null = null;

      if (item.sku) {
        const updated = await sql`
          UPDATE products
          SET stock_qty = GREATEST(stock_qty - ${item.qty}, 0), updated_at = NOW()
          WHERE sku = ${item.sku}
          RETURNING stock_qty, low_stock_threshold
        `;
        if (updated[0]) {
          stockQty = updated[0].stock_qty as number;
          threshold = updated[0].low_stock_threshold as number;
          await sql`
            INSERT INTO inventory_movements (sku, delta, reason, sale_id)
            VALUES (${item.sku}, ${-item.qty}, 'sale', ${saleId})
          `;
        } else {
          warnings.push(`SKU ${item.sku} not found in inventory (stock not updated).`);
        }
      }

      itemStocks.push({
        sku: item.sku,
        name: item.name,
        size: item.size,
        qty: item.qty,
        stockQty,
        lowStockThreshold: threshold,
        lowStock: stockQty !== null && threshold !== null ? stockQty <= threshold : false,
        known: stockQty !== null,
      });
    }

    // 4. Store the reminder itself. The admin calendar reads this table, so a
    // reminder must exist as soon as the sale does — otherwise the app shows
    // nothing until (and unless) the extension manages to book the Google
    // event. `POST /api/calendar/events` later fills in google_event_id and
    // html_link once the event really exists.
    await sql`
      INSERT INTO calendar_events (sale_id, event_date)
      VALUES (${saleId}, ${reminder.date}::date)
      ON CONFLICT (sale_id) DO NOTHING
    `;

    return Response.json(
      {
        saleId,
        duplicate: false,
        items: itemStocks,
        reminder,
        warnings,
      } satisfies CreateSaleResponse,
      { status: 201 },
    );
  } catch (e) {
    console.error("POST /api/sales error:", e);
    return Response.json({ error: "Sale could not be recorded." }, { status: 500 });
  }
}
