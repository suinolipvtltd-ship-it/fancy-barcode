#!/usr/bin/env node
/**
 * Bulk-loads products (and their stock levels) into the inventory.
 *
 *   node scripts/import-products.mjs sample-products.csv
 *   node scripts/import-products.mjs products.xlsx --threshold 5
 *
 * Recognised columns (case-insensitive, spaces/punctuation ignored):
 *   Product / Name / Product Name  → product name     (required)
 *   SKU / Sku Id / Product Code    → SKU used in the QR (required)
 *   Barcode                        → fallback SKU when there is no SKU column
 *   Unit Price / MRP / Selling Price → MRP
 *   Size                           → size label
 *   Stock / Qty / Quantity         → current stock      (default 0)
 *   Opening Qty / Opening Stock    → current stock      (Swipe export)
 *
 * The SKU is what the product QR code must contain (directly or via
 * /p/<sku>), so keep the two in sync.
 */
import { readFileSync } from "node:fs";
import net from "node:net";
import { neon } from "@neondatabase/serverless";
import * as XLSX from "xlsx";

// Node 20's Happy Eyeballs resolver often hangs (ETIMEDOUT) on networks where
// the IPv6 routes to Neon are dead. Neon is dual-stack, so plain IPv4 works.
net.setDefaultAutoSelectFamily?.(false);

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

function normalizeHeader(key) {
  return key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pick(row, keys) {
  const wanted = keys.map(normalizeHeader);
  for (const key of Object.keys(row)) {
    const normalized = normalizeHeader(key);
    if (wanted.includes(normalized)) return row[key];
  }
  return undefined;
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseArgs(argv) {
  const args = { file: null, threshold: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--threshold") {
      args.threshold = Number(argv[i + 1]) || 3;
      i += 1;
    } else if (!args.file) {
      args.file = argv[i];
    }
  }
  return args;
}

async function main() {
  const { file, threshold } = parseArgs(process.argv.slice(2));

  if (!file) {
    console.error("Usage: node scripts/import-products.mjs <products.csv|products.xlsx> [--threshold 3]");
    process.exit(1);
  }

  loadEnvLocal();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const workbook = XLSX.read(readFileSync(file), { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  if (rows.length === 0) {
    console.error("No rows found in", file);
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = String(
      pick(row, ["product", "name", "product name", "item name", "item", "title"]) ?? "",
    ).trim();
    const rawSku = String(
      pick(row, ["sku", "sku id", "sku code", "product code", "item code", "barcode"]) ?? "",
    ).trim();

    if (!name || !rawSku) {
      skipped += 1;
      continue;
    }

    const sku = rawSku.toUpperCase();
    const price = toNumber(pick(row, ["unit price", "mrp", "selling price", "price", "rate"]));
    const size = String(pick(row, ["size"]) ?? "").trim() || null;
    const stock =
      toNumber(
        pick(row, ["stock", "qty", "quantity", "stock qty", "opening qty", "opening stock"]),
      ) ?? 0;

    await sql`
      INSERT INTO products (sku, name, size, price, stock_qty, low_stock_threshold)
      VALUES (${sku}, ${name}, ${size}, ${price}, ${Math.max(0, Math.floor(stock))}, ${threshold})
      ON CONFLICT (sku) DO UPDATE SET
        name = EXCLUDED.name,
        size = COALESCE(EXCLUDED.size, products.size),
        price = COALESCE(EXCLUDED.price, products.price),
        stock_qty = EXCLUDED.stock_qty,
        low_stock_threshold = EXCLUDED.low_stock_threshold,
        updated_at = NOW()
    `;

    imported += 1;
  }

  console.log(`Imported ${imported} product(s), skipped ${skipped}.`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
