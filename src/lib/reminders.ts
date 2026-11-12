import { getDb } from "@/lib/db";
import type {
  ReminderRecord,
  ReminderSaleItem,
  UpdateReminderRequest,
} from "@/lib/types";

/**
 * Reminder queries for the admin calendar. A "reminder" is a row in
 * `calendar_events` — the mapping the browser extension saved after booking the
 * follow-up — joined with the sale, customer and line items behind it.
 */

interface ReminderQueryRow {
  id: string;
  sale_id: string;
  external_id: string;
  event_date: string | Date;
  google_event_id: string | null;
  html_link: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  total_amount: string | null;
  sold_at: string | Date;
  child_gender: string | null;
  child_age_years: number | null;
  child_birthday: string | Date | null;
  items: ReminderSaleItem[] | null;
}

/** `YYYY-MM-DD` for a DATE / TIMESTAMPTZ value returned by the driver. */
function isoDay(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toReminder(row: ReminderQueryRow): ReminderRecord {
  return {
    id: row.id,
    saleId: row.sale_id,
    externalId: row.external_id,
    eventDate: isoDay(row.event_date),
    googleEventId: row.google_event_id,
    htmlLink: row.html_link,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    totalAmount: row.total_amount === null ? null : String(row.total_amount),
    soldAt: isoStamp(row.sold_at),
    childGender:
      row.child_gender === "girl" || row.child_gender === "boy"
        ? row.child_gender
        : null,
    childAgeYears: row.child_age_years === null ? null : Number(row.child_age_years),
    childBirthday: row.child_birthday === null ? null : isoDay(row.child_birthday),
    items: (row.items ?? []).map((item) => ({
      id: item.id ?? null,
      name: item.name ?? null,
      size: item.size ?? null,
      qty: Number(item.qty) || 1,
      sku: item.sku ?? null,
    })),
  };
}

/** Open reminders whose event date falls inside `[from, to]` (inclusive). */
export async function listReminders({
  from,
  to,
}: {
  from: string;
  to: string;
}): Promise<ReminderRecord[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT
      ce.id,
      ce.sale_id,
      ce.event_date,
      ce.google_event_id,
      ce.html_link,
      s.external_id,
      s.customer_name,
      s.customer_phone,
      s.total_amount,
      s.sold_at,
      ce.child_gender,
      ce.child_age_years,
      ce.child_birthday,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', si.id,
              'name', si.product_name,
              'size', si.size,
              'qty', si.qty,
              'sku', si.sku
            )
            ORDER BY si.id
          )
          FROM sale_items si
          WHERE si.sale_id = s.id
        ),
        '[]'::json
      ) AS items
    FROM calendar_events ce
    JOIN sales s ON s.id = ce.sale_id
    WHERE ce.dismissed_at IS NULL
      AND ce.event_date >= ${from}::date
      AND ce.event_date <= ${to}::date
    ORDER BY ce.event_date ASC, s.customer_name ASC NULLS LAST
  `) as unknown as ReminderQueryRow[];

  return rows.map(toReminder);
}

/**
 * Removes a reminder from the admin view. The row is kept (soft delete) so the
 * sale history and stock movements stay auditable; `listReminders` filters it.
 *
 * Note: this does not delete the event from Google Calendar — that requires the
 * extension's OAuth token, which lives in the browser.
 */
export async function dismissReminder(id: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    UPDATE calendar_events
    SET dismissed_at = NOW()
    WHERE id = ${id} AND dismissed_at IS NULL
    RETURNING id
  `;
  return Boolean(rows[0]);
}

/** Restores a previously dismissed reminder (useful when a click was a slip). */
export async function restoreReminder(id: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    UPDATE calendar_events
    SET dismissed_at = NULL
    WHERE id = ${id}
    RETURNING id
  `;
  return Boolean(rows[0]);
}

/** A single reminder, or null when it is missing / already removed. */
export async function getReminder(id: string): Promise<ReminderRecord | null> {
  const sql = getDb();
  const rows = (await sql`
    SELECT
      ce.id,
      ce.sale_id,
      ce.event_date,
      ce.google_event_id,
      ce.html_link,
      s.external_id,
      s.customer_name,
      s.customer_phone,
      s.total_amount,
      s.sold_at,
      ce.child_gender,
      ce.child_age_years,
      ce.child_birthday,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', si.id,
              'name', si.product_name,
              'size', si.size,
              'qty', si.qty,
              'sku', si.sku
            )
            ORDER BY si.id
          )
          FROM sale_items si
          WHERE si.sale_id = s.id
        ),
        '[]'::json
      ) AS items
    FROM calendar_events ce
    JOIN sales s ON s.id = ce.sale_id
    WHERE ce.id = ${id}
    LIMIT 1
  `) as unknown as ReminderQueryRow[];

  const row = rows[0];
  return row ? toReminder(row) : null;
}

const MAX_ITEMS = 50;
const MAX_NAME = 255;
const MAX_SIZE = 32;
const MAX_SKU = 128;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function qty(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? 1), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 9999) : 1;
}

/**
 * Updates what the reminder is *about*: which child, their age, and the line
 * items (product / size / quantity). Pass `items` to replace the sale's items,
 * omit it to leave them untouched.
 */
export async function updateReminder(
  id: string,
  patch: UpdateReminderRequest,
): Promise<ReminderRecord | null> {
  const sql = getDb();

  const ownerRows = await sql`
    SELECT id, sale_id, child_gender, child_age_years, child_birthday
    FROM calendar_events
    WHERE id = ${id} AND dismissed_at IS NULL
    LIMIT 1
  `;
  const owner = ownerRows[0];
  if (!owner) return null;

  const saleId = owner.sale_id as string;
  const nextGender =
    patch.childGender === undefined
      ? ((owner.child_gender as string | null) ?? null)
      : patch.childGender;
  const nextAge =
    patch.childAgeYears === undefined
      ? ((owner.child_age_years as number | null) ?? null)
      : patch.childAgeYears;
  const nextBirthday =
    patch.childBirthday === undefined
      ? owner.child_birthday === null
        ? null
        : isoDay(owner.child_birthday as string | Date)
      : patch.childBirthday || null;

  await sql`
    UPDATE calendar_events
    SET child_gender = ${nextGender}, child_age_years = ${nextAge},
        child_birthday = ${nextBirthday}::date
    WHERE id = ${id}
  `;

  if (Array.isArray(patch.items)) {
    const items = patch.items.slice(0, MAX_ITEMS).map((item) => ({
      id: typeof item.id === "string" && item.id ? item.id : null,
      name: text(item.name, MAX_NAME),
      size: text(item.size, MAX_SIZE),
      sku: text(item.sku, MAX_SKU),
      qty: qty(item.qty),
    }));

    const keptIds = items.map((item) => item.id).filter((value): value is string => Boolean(value));

    if (keptIds.length > 0) {
      await sql`
        DELETE FROM sale_items
        WHERE sale_id = ${saleId} AND NOT (id = ANY(${keptIds}::uuid[]))
      `;
    } else {
      await sql`DELETE FROM sale_items WHERE sale_id = ${saleId}`;
    }

    for (const item of items) {
      if (item.id) {
        await sql`
          UPDATE sale_items
          SET product_name = ${item.name}, size = ${item.size},
              sku = ${item.sku}, qty = ${item.qty}
          WHERE id = ${item.id} AND sale_id = ${saleId}
        `;
      } else {
        await sql`
          INSERT INTO sale_items (sale_id, sku, product_name, size, qty)
          VALUES (${saleId}, ${item.sku}, ${item.name}, ${item.size}, ${item.qty})
        `;
      }
    }
  }

  return getReminder(id);
}
