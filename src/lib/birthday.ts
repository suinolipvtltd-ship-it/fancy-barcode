/**
 * Helpers for turning a sale into a reminder for the same customer roughly one
 * year later (most of our sales are birthday dresses, so the follow-up is the
 * next year's birthday).
 *
 * Pure functions only — the browser extension mirrors this logic in
 * `extension/lib/dates.js`, and `src/lib/birthday.test.ts` locks the behaviour
 * (including the 29 February edge case) so the two stay in sync.
 */

export interface ReminderItem {
  sku?: string | null;
  name?: string | null;
  /** Size bought, e.g. "M" or "2-3Y". */
  size?: string | null;
  qty?: number | null;
}

export interface ReminderInput {
  customerName?: string | null;
  customerPhone?: string | null;
  items?: ReminderItem[];
  /** When the sale happened (ISO string, Date or epoch millis). */
  soldAt: Date | string | number;
  /** How many years ahead the reminder should land. Defaults to 1. */
  years?: number;
  /** Override the event title. */
  title?: string | null;
  /** Extra free-form text (e.g. invoice number, size, shop notes). */
  note?: string | null;
}

export interface ReminderEvent {
  /** All-day event date, `YYYY-MM-DD`. */
  date: string;
  title: string;
  description: string;
}

const DEFAULT_TITLE_PREFIX = "Birthday dress follow-up";

function toUtcDate(input: Date | string | number): Date {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid sale date");
  }
  return date;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Adds `years` to the calendar date, clamping 29 February to 28 February on
 * non-leap years (Google Calendar rejects an all-day event on 2027-02-29).
 *
 * Returns `YYYY-MM-DD`.
 */
export function computeAnniversaryDate(
  input: Date | string | number,
  years = 1,
): string {
  const source = toUtcDate(input);
  const year = source.getUTCFullYear() + years;
  const month = source.getUTCMonth();
  const day = source.getUTCDate();

  const candidate = new Date(Date.UTC(year, month, day));
  // Date.UTC rolls 29 Feb over to 1 Mar on a non-leap year; undo that.
  if (candidate.getUTCMonth() !== month) {
    return formatUtcDate(new Date(Date.UTC(year, month + 1, 0)));
  }
  return formatUtcDate(candidate);
}

/** `YYYY-MM-DD` for the day after `isoDate` (exclusive end date for all-day events). */
export function nextDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return formatUtcDate(date);
}

export function buildReminderEvent(input: ReminderInput): ReminderEvent {
  const date = computeAnniversaryDate(input.soldAt, input.years ?? 1);
  const customer = input.customerName?.trim() || "Customer";

  const lines: string[] = [];
  if (input.customerPhone) lines.push(`Phone: ${input.customerPhone}`);
  lines.push(`Sale date: ${formatUtcDate(toUtcDate(input.soldAt))}`);

  const items = (input.items ?? []).filter((item) => item?.name || item?.sku);
  if (items.length > 0) {
    lines.push("Items:");
    for (const item of items) {
      const qty = item.qty ?? 1;
      const label = [
        item.name,
        item.sku ? `(${item.sku})` : null,
        item.size ? `Size ${item.size}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      lines.push(`• ${label} × ${qty}`);
    }
  }

  if (input.note?.trim()) lines.push(`Notes: ${input.note.trim()}`);
  lines.push("", "Sent by Fancy Barcode sales assistant.");

  return {
    date,
    title:
      input.title?.trim() ||
      `${DEFAULT_TITLE_PREFIX} — ${customer}`,
    description: lines.join("\n"),
  };
}
