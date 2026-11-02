/**
 * Date helpers — mirrors `src/lib/birthday.ts` so the extension can still build
 * a reminder when the site API is unreachable.
 */

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDate(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid sale date');
  return date;
}

export function formatDate(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Adds `years` to the date, clamping 29 Feb → 28 Feb on non-leap years. */
export function computeAnniversaryDate(input, years = 1) {
  const source = toDate(input);
  const year = source.getUTCFullYear() + years;
  const month = source.getUTCMonth();
  const day = source.getUTCDate();

  const candidate = new Date(Date.UTC(year, month, day));
  if (candidate.getUTCMonth() !== month) {
    return formatDate(new Date(Date.UTC(year, month + 1, 0)));
  }
  return formatDate(candidate);
}

export function nextDay(isoDate) {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  return formatDate(new Date(Date.UTC(year, month - 1, day + 1)));
}

export function buildReminderLocal({
  customerName,
  customerPhone,
  items = [],
  soldAt = new Date(),
  years = 1,
  note = '',
} = {}) {
  const date = computeAnniversaryDate(soldAt, years);
  const customer = (customerName || '').trim() || 'Customer';

  const lines = [];
  if (customerPhone) lines.push(`Phone: ${customerPhone}`);
  lines.push(`Sale date: ${formatDate(toDate(soldAt))}`);
  if (items.length) {
    lines.push('Items:');
    for (const item of items) {
      const label = [item.name, item.sku ? `(${item.sku})` : null].filter(Boolean).join(' ');
      lines.push(`• ${label} × ${item.qty || 1}`);
    }
  }
  if (note.trim()) lines.push(`Notes: ${note.trim()}`);
  lines.push('', 'Sent by Fancy Barcode sales assistant.');

  return {
    date,
    title: `Birthday dress follow-up — ${customer}`,
    description: lines.join('\n'),
  };
}
