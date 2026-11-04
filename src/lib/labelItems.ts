import type { ProductRecord } from "@/lib/types";

/**
 * A file row can ask for more than one label (the Quantity column). These
 * helpers turn the flat record list into one entry per printed label.
 */

/** Safety valve: a single row cannot request more than this many labels. */
export const MAX_LABELS_PER_ROW = 200;

/** Safety valve: stop before building a PDF/ZPL with millions of labels. */
export const MAX_TOTAL_LABELS = 5000;

/** Total number of labels that would be printed for these records. */
export function countLabels(records: ProductRecord[]): number {
  return records.reduce(
    (total, record) => total + Math.max(1, Math.trunc(record.quantity || 1)),
    0,
  );
}

/**
 * Repeats every record `quantity` times, in order, so `generatePdf` and
 * `generateZpl` can lay them out without knowing about quantities.
 */
export function expandByQuantity(records: ProductRecord[]): {
  records: ProductRecord[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const expanded: ProductRecord[] = [];

  for (const record of records) {
    const requested = Math.max(1, Math.trunc(record.quantity || 1));
    const quantity = Math.min(requested, MAX_LABELS_PER_ROW);

    if (requested > MAX_LABELS_PER_ROW) {
      warnings.push(
        `Row ${record.rowNumber}: quantity ${requested} capped at ${MAX_LABELS_PER_ROW} labels`,
      );
    }

    for (let index = 0; index < quantity; index += 1) {
      expanded.push(record);
    }
  }

  if (expanded.length > MAX_TOTAL_LABELS) {
    warnings.push(
      `Only the first ${MAX_TOTAL_LABELS} labels were generated (${expanded.length} requested).`,
    );
    return { records: expanded.slice(0, MAX_TOTAL_LABELS), warnings };
  }

  return { records: expanded, warnings };
}
