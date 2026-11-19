#!/usr/bin/env node
/**
 * Bulk-loads a Shopify order export into the CRM (customers + sales + sale_items).
 *
 *   node scripts/import-orders.mjs order.csv
 *   node scripts/import-orders.mjs order.csv --dry-run
 *
 * Shopify exports one row per line item, with the customer/order columns only
 * filled on the first row of each order. Rows are grouped by the `Name` column
 * (the order number, e.g. "Ch3035"), which is also used as `sales.external_id`
 * so re-running is safe (ON CONFLICT DO NOTHING).
 *
 * Duplicates are avoided two ways:
 *   - orders:  UNIQUE (source, external_id) — the same CSV/order never lands twice
 *   - people:  phone is the natural key, normalised to the last 10 digits so
 *              "+917507557615" and "7507557615" resolve to the same customer
 *              (this also merges with customers captured by the extension).
 */
import { readFileSync } from "node:fs";
import net from "node:net";
import { neon } from "@neondatabase/serverless";

net.setDefaultAutoSelectFamily?.(false);

const SOURCE = "shopify";

function loadEnvLocal() {
  if (process.env.DATABASE_URL) return;
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
      if (!match) continue;
      const value = match[2].replace(/^["']|["']$/g, "");
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  } catch {
    /* no .env.local */
  }
}

/* -------------------------------------------------------------------------- */
/* CSV parsing                                                                */
/* -------------------------------------------------------------------------- */

/** RFC4180-ish parser: quoted fields, escaped quotes, embedded newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toObjects(rows) {
  const [header, ...body] = rows;
  return body
    .filter((cells) => cells.some((cell) => cell.trim() !== ""))
    .map((cells) => {
      const object = {};
      header.forEach((key, index) => {
        object[key.trim()] = (cells[index] ?? "").trim();
      });
      return object;
    });
}

/* -------------------------------------------------------------------------- */
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

/** Last 10 digits, so "+917507557615" and "7507557615" collapse to one key. */
function normalisePhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.length > 10) return digits.slice(-10);
  if (digits.length === 10) return digits;
  return null; // too short to be a real mobile number
}

/** "2023-10-01 21:49:14 +0530" → Date. */
function parseShopifyDate(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})?$/.exec(text);
  if (match) {
    const [, y, mo, d, h, mi, s, offset] = match;
    const zone = offset ? `${offset.slice(0, 3)}:${offset.slice(3)}` : "Z";
    const parsed = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${zone}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNumber(raw) {
  const cleaned = String(raw ?? "").replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function cleanText(raw, max) {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return max ? text.slice(0, max) : text;
}

/* -------------------------------------------------------------------------- */
/* Grouping                                                                   */
/* -------------------------------------------------------------------------- */

const CANCELLED_OR_UNPAID = new Set(["voided"]);

function groupOrders(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row["Name"] || row["Id"];
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

function buildOrder(orderName, lineRows) {
  const first = lineRows[0];

  if (first["Cancelled at"]) return { skip: "cancelled" };
  if (CANCELLED_OR_UNPAID.has(first["Financial Status"])) return { skip: "voided" };
  if (!first["Paid at"]) return { skip: "unpaid" };

  // Customer details live on the order's first row but fall back to any row.
  const pickField = (key) => cleanText(lineRows.map((row) => row[key]).find(Boolean));
  const phone =
    normalisePhone(pickField("Phone")) ||
    normalisePhone(pickField("Billing Phone")) ||
    normalisePhone(pickField("Shipping Phone"));
  const name = pickField("Billing Name") || pickField("Shipping Name");

  const soldAt = parseShopifyDate(first["Paid at"]) || parseShopifyDate(first["Created at"]);
  if (!soldAt) return { skip: "bad-date" };

  const items = lineRows
    .map((row) => ({
      sku: cleanText(row["Lineitem sku"], 128)?.toUpperCase() ?? null,
      name: cleanText(row["Lineitem name"], 255),
      qty: Math.max(1, Math.floor(toNumber(row["Lineitem quantity"]) ?? 1)),
      unitPrice: toNumber(row["Lineitem price"]),
    }))
    .filter((item) => item.name || item.sku);

  return {
    externalId: orderName,
    name,
    phone,
    soldAt,
    total: toNumber(first["Total"]),
    items,
    raw: {
      order: orderName,
      shopifyId: first["Id"] || null,
      location: first["Location"] || null,
      financialStatus: first["Financial Status"] || null,
      discount: toNumber(first["Discount Amount"]),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Import                                                                     */
/* -------------------------------------------------------------------------- */

const SALE_CHUNK = 200;
const ITEM_CHUNK = 500;

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const file = argv.find((arg) => !arg.startsWith("--"));

  if (!file) {
    console.error("Usage: node scripts/import-orders.mjs <orders.csv> [--dry-run]");
    process.exit(1);
  }

  loadEnvLocal();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const rows = toObjects(parseCsv(readFileSync(file, "utf8")));
  const grouped = groupOrders(rows);

  const stats = {
    ordersInFile: grouped.size,
    ordersImported: 0,
    ordersAlreadyPresent: 0,
    ordersSkipped: 0,
    customersCreated: 0,
    customersMatched: 0,
    customersNamed: 0,
    saleItemsCreated: 0,
  };
  const skips = new Map();
  const orders = [];

  for (const [orderName, lineRows] of grouped) {
    const order = buildOrder(orderName, lineRows);
    if (order.skip) {
      stats.ordersSkipped += 1;
      skips.set(order.skip, (skips.get(order.skip) ?? 0) + 1);
      continue;
    }
    orders.push(order);
  }

  const sql = neon(process.env.DATABASE_URL);

  // ---- existing customers: one read, in-memory de-dupe ----
  const existingCustomers = await sql`SELECT id, name, phone FROM customers`;
  const byPhone = new Map();
  const byName = new Map(); // only phone-less customers, for the name fallback
  for (const customer of existingCustomers) {
    const key = normalisePhone(customer.phone);
    if (key) {
      if (!byPhone.has(key)) byPhone.set(key, customer);
    } else if (customer.name) {
      const nameKey = customer.name.trim().toLowerCase();
      if (!byName.has(nameKey)) byName.set(nameKey, customer);
    }
  }

  const existingExternalIds = new Set(
    (await sql`SELECT external_id FROM sales WHERE source = ${SOURCE}`).map(
      (row) => row.external_id,
    ),
  );

  // Resolve every order to a customer id (existing now, new ones after insert).
  const newCustomers = new Map(); // key → {name, phone}
  const nameBackfills = new Map(); // customerId → better name
  for (const order of orders) {
    if (order.externalId && existingExternalIds.has(order.externalId)) continue;

    if (order.phone) {
      const hit = byPhone.get(order.phone);
      if (hit) {
        order.customerId = hit.id;
        stats.customersMatched += 1;
        if (!hit.name && order.name) {
          hit.name = order.name;
          nameBackfills.set(hit.id, order.name);
        }
      } else if (!newCustomers.has(order.phone)) {
        newCustomers.set(order.phone, { name: order.name, phone: order.phone });
      }
    } else if (order.name) {
      const hit = byName.get(order.name.toLowerCase());
      if (hit) {
        order.customerId = hit.id;
        stats.customersMatched += 1;
      } else if (!newCustomers.has(order.name.toLowerCase())) {
        newCustomers.set(order.name.toLowerCase(), { name: order.name, phone: null });
      }
    }
  }

  if (dryRun) {
    console.log("DRY RUN — nothing was written.");
    console.log({
      ordersInFile: stats.ordersInFile,
      ordersImported: orders.length,
      ordersAlreadyPresent: stats.ordersInFile - stats.ordersSkipped - orders.length,
      ordersSkipped: stats.ordersSkipped,
      skippedReasons: Object.fromEntries(skips),
      customersMatched: stats.customersMatched,
      customersWouldBeCreated: newCustomers.size,
      saleItemsWouldBeCreated: orders.reduce((sum, order) => sum + order.items.length, 0),
    });
    return;
  }

  // ---- create the missing customers ----
  const created = [];
  for (const group of chunk([...newCustomers.values()], 200)) {
    const inserted = await sql`
      INSERT INTO customers (name, phone)
      SELECT * FROM unnest(${group.map((c) => c.name)}::varchar[], ${group.map((c) => c.phone)}::varchar[])
      RETURNING id, name, phone
    `;
    created.push(...inserted);
  }
  for (const customer of created) {
    const key = normalisePhone(customer.phone) || customer.name?.trim().toLowerCase();
    if (key && !byPhone.has(key) && !byName.has(key)) {
      if (customer.phone) byPhone.set(key, customer);
      else byName.set(key, customer);
    }
  }
  stats.customersCreated = created.length;

  // Attach ids to orders (new customers are now in the maps).
  for (const order of orders) {
    if (order.customerId) continue;
    if (order.phone) order.customerId = byPhone.get(order.phone)?.id ?? null;
    else if (order.name) order.customerId = byName.get(order.name.toLowerCase())?.id ?? null;
  }

  // ---- backfill names on phone-matched customers that had none ----
  for (const [id, name] of nameBackfills) {
    await sql`UPDATE customers SET name = ${name}, updated_at = NOW() WHERE id = ${id} AND name IS NULL`;
    stats.customersNamed += 1;
  }

  // ---- sales + items, chunked ----
  const pending = orders.filter((order) => !existingExternalIds.has(order.externalId));
  stats.ordersAlreadyPresent = orders.length - pending.length;

  for (const group of chunk(pending, SALE_CHUNK)) {
    const inserted = await sql`
      INSERT INTO sales (
        source, external_id, customer_id, customer_name, customer_phone,
        total_amount, sold_at, raw_data
      )
      SELECT
        ${SOURCE},
        u.external_id,
        u.customer_id,
        u.customer_name,
        u.customer_phone,
        u.total_amount,
        u.sold_at,
        u.raw_data
      FROM unnest(
        ${group.map((o) => o.externalId)}::varchar[],
        ${group.map((o) => o.customerId)}::uuid[],
        ${group.map((o) => o.name)}::varchar[],
        ${group.map((o) => o.phone)}::varchar[],
        ${group.map((o) => o.total)}::numeric[],
        ${group.map((o) => o.soldAt.toISOString())}::timestamptz[],
        ${group.map((o) => JSON.stringify(o.raw))}::jsonb[]
      ) AS u(external_id, customer_id, customer_name, customer_phone, total_amount, sold_at, raw_data)
      ON CONFLICT (source, external_id) DO NOTHING
      RETURNING id, external_id
    `;

    const saleIds = new Map(inserted.map((row) => [row.external_id, row.id]));
    const items = [];
    for (const order of group) {
      const saleId = saleIds.get(order.externalId);
      if (!saleId) continue;
      stats.ordersImported += 1;
      for (const item of order.items) {
        items.push([saleId, item.sku, item.name, item.qty, item.unitPrice]);
      }
    }

    for (const itemBatch of chunk(items, ITEM_CHUNK)) {
      await sql`
        INSERT INTO sale_items (sale_id, sku, product_name, qty, unit_price)
        SELECT * FROM unnest(
          ${itemBatch.map((row) => row[0])}::uuid[],
          ${itemBatch.map((row) => row[1])}::varchar[],
          ${itemBatch.map((row) => row[2])}::varchar[],
          ${itemBatch.map((row) => row[3])}::int[],
          ${itemBatch.map((row) => row[4])}::numeric[]
        )
      `;
      stats.saleItemsCreated += itemBatch.length;
    }
  }

  // ---- repair first/last purchase windows from the imported history ----
  await sql`
    UPDATE customers c
    SET
      first_purchase_at = LEAST(COALESCE(c.first_purchase_at, agg.first_buy), agg.first_buy),
      last_purchase_at = GREATEST(COALESCE(c.last_purchase_at, agg.last_buy), agg.last_buy),
      updated_at = NOW()
    FROM (
      SELECT customer_id, MIN(sold_at) AS first_buy, MAX(sold_at) AS last_buy
      FROM sales
      WHERE source = ${SOURCE} AND customer_id IS NOT NULL
      GROUP BY customer_id
    ) agg
    WHERE c.id = agg.customer_id
  `;

  console.log("Import complete.");
  console.log({
    ordersInFile: stats.ordersInFile,
    ordersImported: stats.ordersImported,
    ordersAlreadyPresent: stats.ordersAlreadyPresent,
    ordersSkipped: stats.ordersSkipped,
    skippedReasons: Object.fromEntries(skips),
    customersCreated: stats.customersCreated,
    customersMatched: stats.customersMatched,
    customersNamed: stats.customersNamed,
    saleItemsCreated: stats.saleItemsCreated,
  });
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
