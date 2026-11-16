import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { isCalendarDay } from "@/lib/customerValidation";
import { phoneDigits } from "@/lib/reviewMessage";
import type {
  ChildGender,
  CustomerChild,
  CustomerDetail,
  CustomerRecord,
  CustomerSale,
  CreateCustomerRequest,
  UpdateCustomerRequest,
} from "@/lib/types";

/**
 * CRM queries. A customer is a row in `customers`, keyed by phone number, and
 * the purchase history behind it is every `sales` row pointing at that
 * customer. Nothing is duplicated: visit counts and spend are aggregates.
 */

const MAX_ROWS = 500;
const MAX_NAME = 255;
const MAX_PHONE = 32;
const MAX_NOTE = 2000;
const MAX_CHILD_NAME = 120;
const MAX_CHILDREN = 20;

interface CustomerRow {
  id: string;
  name: string | null;
  phone: string | null;
  note: string | null;
  visits: number | string | null;
  total_spend: string | null;
  first_purchase_at: string | Date | null;
  last_purchase_at: string | Date | null;
  review_requested_at: string | Date | null;
  reviewed_at: string | Date | null;
  created_at: string | Date;
  children: CustomerChild[] | null;
}

interface SaleRow {
  id: string;
  external_id: string;
  source: string;
  sold_at: string | Date;
  total_amount: string | null;
  items: {
    sku: string | null;
    name: string | null;
    size: string | null;
    qty: number;
    unit_price: string | null;
  }[] | null;
}

function isoStamp(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** `YYYY-MM-DD` for a DATE column returned as a string or Date. */
function isoDay(value: string | Date | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function toChild(row: {
  id: string;
  name: string | null;
  gender: string | null;
  birthday: string | Date | null;
}): CustomerChild {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender === "girl" || row.gender === "boy" ? row.gender : null,
    birthday: isoDay(row.birthday),
  };
}

function toCustomer(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    note: row.note,
    visits: Number(row.visits ?? 0),
    totalSpend: row.total_spend === null ? null : String(row.total_spend),
    firstPurchaseAt: isoStamp(row.first_purchase_at),
    lastPurchaseAt: isoStamp(row.last_purchase_at),
    children: (row.children ?? []).map(toChild),
    reviewRequestedAt: isoStamp(row.review_requested_at),
    reviewedAt: isoStamp(row.reviewed_at),
    createdAt: isoStamp(row.created_at) ?? new Date().toISOString(),
  };
}

/**
 * Every customer with their visit count, spend, children and review status,
 * most recent shopper first. `search` matches name or phone (leniently).
 */
export async function listCustomers(search?: string): Promise<CustomerRecord[]> {
  const sql = getDb();
  const term = search?.trim() ? search.trim().slice(0, 100) : null;
  // `phoneDigits("Priya")` is "", and `''` would match every phone number via
  // LIKE '%%' — so an empty digit string must disable phone matching.
  const digits = term ? phoneDigits(term) || null : null;

  const rows = (await sql`
    SELECT
      c.id,
      c.name,
      c.phone,
      c.note,
      c.review_requested_at,
      c.reviewed_at,
      c.created_at,
      agg.visits,
      agg.total_spend,
      agg.first_purchase_at,
      COALESCE(agg.last_purchase_at, c.last_purchase_at) AS last_purchase_at,
      kids.children
    FROM customers c
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS visits,
        SUM(s.total_amount) AS total_spend,
        MIN(s.sold_at) AS first_purchase_at,
        MAX(s.sold_at) AS last_purchase_at
      FROM sales s
      WHERE s.customer_id = c.id
    ) agg ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id', ch.id,
            'name', ch.name,
            'gender', ch.gender,
            'birthday', ch.birthday
          )
          ORDER BY ch.birthday NULLS LAST, ch.created_at
        ),
        '[]'::json
      ) AS children
      FROM customer_children ch
      WHERE ch.customer_id = c.id
    ) kids ON TRUE
    WHERE (
      ${term}::text IS NULL
      OR c.name ILIKE '%' || ${term}::text || '%'
      OR c.phone ILIKE '%' || ${term}::text || '%'
      OR EXISTS (
        SELECT 1
        FROM customer_children ch
        WHERE ch.customer_id = c.id
          AND ch.name ILIKE '%' || ${term}::text || '%'
      )
      OR (
        ${digits}::text IS NOT NULL
        AND regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') LIKE '%' || ${digits}::text || '%'
      )
    )
    ORDER BY COALESCE(agg.last_purchase_at, c.last_purchase_at, c.created_at) DESC
    LIMIT ${MAX_ROWS}
  `) as unknown as CustomerRow[];

  return rows.map(toCustomer);
}

/** A single customer with their full purchase history. */
export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  const sql = getDb();

  const rows = (await sql`
    SELECT
      c.id,
      c.name,
      c.phone,
      c.note,
      c.review_requested_at,
      c.reviewed_at,
      c.created_at,
      agg.visits,
      agg.total_spend,
      agg.first_purchase_at,
      COALESCE(agg.last_purchase_at, c.last_purchase_at) AS last_purchase_at,
      kids.children
    FROM customers c
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS visits,
        SUM(s.total_amount) AS total_spend,
        MIN(s.sold_at) AS first_purchase_at,
        MAX(s.sold_at) AS last_purchase_at
      FROM sales s
      WHERE s.customer_id = c.id
    ) agg ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id', ch.id,
            'name', ch.name,
            'gender', ch.gender,
            'birthday', ch.birthday
          )
          ORDER BY ch.birthday NULLS LAST, ch.created_at
        ),
        '[]'::json
      ) AS children
      FROM customer_children ch
      WHERE ch.customer_id = c.id
    ) kids ON TRUE
    WHERE c.id = ${id}
    LIMIT 1
  `) as unknown as CustomerRow[];

  const row = rows[0];
  if (!row) return null;

  const saleRows = (await sql`
    SELECT
      s.id,
      s.external_id,
      s.source,
      s.sold_at,
      s.total_amount,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'sku', si.sku,
              'name', si.product_name,
              'size', si.size,
              'qty', si.qty,
              'unit_price', si.unit_price
            )
            ORDER BY si.id
          )
          FROM sale_items si
          WHERE si.sale_id = s.id
        ),
        '[]'::json
      ) AS items
    FROM sales s
    WHERE s.customer_id = ${id}
    ORDER BY s.sold_at DESC
    LIMIT ${MAX_ROWS}
  `) as unknown as SaleRow[];

  const sales: CustomerSale[] = saleRows.map((sale) => ({
    id: sale.id,
    externalId: sale.external_id,
    source: sale.source,
    soldAt: isoStamp(sale.sold_at) ?? new Date().toISOString(),
    totalAmount: sale.total_amount === null ? null : String(sale.total_amount),
    items: (sale.items ?? []).map((item) => ({
      sku: item.sku,
      name: item.name,
      size: item.size,
      qty: Number(item.qty) || 1,
      unitPrice: item.unit_price === null ? null : String(item.unit_price),
    })),
  }));

  return { ...toCustomer(row), sales };
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function gender(value: unknown): ChildGender | null {
  return value === "girl" || value === "boy" ? value : null;
}

function birthday(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // Reject dates that only look right ("2020-02-31"); Postgres would fail the
  // INSERT after earlier statements in the transaction had already run.
  return isCalendarDay(trimmed) ? trimmed : null;
}

interface ChildInput {
  id?: string | null;
  name?: string | null;
  gender?: ChildGender | null;
  birthday?: string | null;
}

function cleanChildren(input: ChildInput[]): {
  name: string | null;
  gender: ChildGender | null;
  birthday: string | null;
}[] {
  return input
    .slice(0, MAX_CHILDREN)
    .map((child) => ({
      name: text(child.name, MAX_CHILD_NAME),
      gender: gender(child.gender),
      birthday: birthday(child.birthday),
    }))
    .filter((child) => child.name || child.gender || child.birthday);
}

/** Creates a customer, or merges into the existing row with the same phone. */
export async function createCustomer(
  input: CreateCustomerRequest,
): Promise<CustomerDetail | null> {
  const sql = getDb();
  const name = text(input.name, MAX_NAME);
  const phone = text(input.phone, MAX_PHONE);
  const note = text(input.note, MAX_NOTE);

  if (!name && !phone) {
    throw new Error("A customer needs a name or a phone number.");
  }

  const children = cleanChildren(input.children ?? []);
  // The id is generated here so the child inserts can be part of the same
  // transaction — they resolve the row by phone (merge case) or by our id.
  const generatedId = randomUUID();

  const insertCustomer = phone
    ? sql`
        INSERT INTO customers (id, name, phone, note)
        VALUES (${generatedId}::uuid, ${name}, ${phone}, ${note})
        ON CONFLICT (phone) DO UPDATE SET
          name = COALESCE(EXCLUDED.name, customers.name),
          note = COALESCE(EXCLUDED.note, customers.note),
          updated_at = NOW()
        RETURNING id
      `
    : sql`
        INSERT INTO customers (id, name, phone, note)
        VALUES (${generatedId}::uuid, ${name}, ${phone}, ${note})
        RETURNING id
      `;

  const insertChild = (child: {
    name: string | null;
    gender: ChildGender | null;
    birthday: string | null;
  }) =>
    phone
      ? sql`
          INSERT INTO customer_children (customer_id, name, gender, birthday)
          SELECT c.id, ${child.name}, ${child.gender}, ${child.birthday}::date
          FROM customers c
          WHERE c.phone = ${phone}
        `
      : sql`
          INSERT INTO customer_children (customer_id, name, gender, birthday)
          SELECT c.id, ${child.name}, ${child.gender}, ${child.birthday}::date
          FROM customers c
          WHERE c.id = ${generatedId}::uuid
        `;

  const results = (await sql.transaction([
    insertCustomer,
    ...children.map(insertChild),
  ])) as { id: string }[][];

  const id = results[0]?.[0]?.id;
  if (!id) return null;

  return getCustomer(id);
}

/**
 * Updates a customer, their children (replaced wholesale when `children` is
 * passed) and the Google-review bookkeeping flags.
 *
 * Only fields present in `patch` are written: each column uses a CASE that
 * keeps the stored value when the field was omitted, so two overlapping PATCH
 * requests cannot clobber each other with a stale snapshot. The customer row
 * and the child rows are written in one transaction.
 */
export async function updateCustomer(
  id: string,
  patch: UpdateCustomerRequest,
): Promise<CustomerDetail | null> {
  const sql = getDb();

  const setReviewRequested = patch.reviewRequested !== undefined;
  const setReviewed = patch.reviewed !== undefined;

  const statements = [
    sql`
      UPDATE customers
      SET name = CASE WHEN ${patch.name === undefined}::boolean THEN name
                      ELSE ${text(patch.name, MAX_NAME)} END,
          phone = CASE WHEN ${patch.phone === undefined}::boolean THEN phone
                       ELSE ${text(patch.phone, MAX_PHONE)} END,
          note = CASE WHEN ${patch.note === undefined}::boolean THEN note
                      ELSE ${text(patch.note, MAX_NOTE)} END,
          review_requested_at = CASE
            WHEN ${setReviewRequested}::boolean = false THEN review_requested_at
            WHEN ${patch.reviewRequested === true}::boolean THEN NOW()
            ELSE NULL END,
          reviewed_at = CASE
            WHEN ${setReviewed}::boolean = false THEN reviewed_at
            WHEN ${patch.reviewed === true}::boolean THEN NOW()
            ELSE NULL END,
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING id
    `,
  ];

  if (Array.isArray(patch.children)) {
    statements.push(sql`DELETE FROM customer_children WHERE customer_id = ${id}`);
    for (const child of cleanChildren(patch.children)) {
      statements.push(sql`
        INSERT INTO customer_children (customer_id, name, gender, birthday)
        VALUES (${id}::uuid, ${child.name}, ${child.gender}, ${child.birthday}::date)
      `);
    }
  }

  let results: { id: string }[][];
  try {
    results = (await sql.transaction(statements)) as { id: string }[][];
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23505") {
      throw new Error("Another customer already uses that phone number.");
    }
    throw e;
  }

  if (!results[0]?.[0]?.id) return null;

  return getCustomer(id);
}
