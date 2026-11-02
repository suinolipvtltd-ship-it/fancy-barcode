import { getDb } from "@/lib/db";
import type { ReminderRecord, ReminderSaleItem } from "@/lib/types";

/**
 * Reminder queries for the admin calendar. A "reminder" is a row in
 * `calendar_events` — the mapping the browser extension saved after booking the
 * follow-up — joined with the sale, customer and line items behind it.
 */

interface ReminderQueryRow {
  id: string;
  sale_id: string;
  event_date: string | Date;
  google_event_id: string | null;
  html_link: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  total_amount: string | null;
  sold_at: string | Date;
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
    eventDate: isoDay(row.event_date),
    googleEventId: row.google_event_id,
    htmlLink: row.html_link,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    totalAmount: row.total_amount === null ? null : String(row.total_amount),
    soldAt: isoStamp(row.sold_at),
    items: (row.items ?? []).map((item) => ({
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
      s.customer_name,
      s.customer_phone,
      s.total_amount,
      s.sold_at,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
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
