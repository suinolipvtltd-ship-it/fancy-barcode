import type { ProductRecord } from "@/lib/types";

/**
 * A file row can ask for more than one label (the Quantity column). These
 * helpers turn the flat record list into one entry per printed label.
 */

/** Safety valve: a single row cannot request more than this many labels. */
export const MAX_LABELS_PER_ROW = 200;

/** Safety valve: stop before building a PDF/ZPL with millions of labels. */
export const MAX_TOTAL_LABELS = 5000;

/**
 * Total number of labels that would be printed for these records.
 *
 * Applies the same per-row and total caps as `expandByQuantity` so the number
 * shown to the user matches what the generators can actually produce.
 */
export function countLabels(records: ProductRecord[]): number {
  let total = 0;

  for (const record of records) {
    const requested = Math.max(1, Math.trunc(record.quantity || 1));
    total += Math.min(requested, MAX_LABELS_PER_ROW);
    if (total >= MAX_TOTAL_LABELS) return MAX_TOTAL_LABELS;
  }

  return total;
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
  let requestedTotal = 0;
  let truncated = false;

  for (const record of records) {
    const requested = Math.max(1, Math.trunc(record.quantity || 1));
    const quantity = Math.min(requested, MAX_LABELS_PER_ROW);

    if (requested > MAX_LABELS_PER_ROW) {
      warnings.push(
        `Row ${record.rowNumber}: quantity ${requested} capped at ${MAX_LABELS_PER_ROW} labels`,
      );
    }

    requestedTotal += quantity;
    if (truncated) continue; // keep counting, stop allocating

    for (let index = 0; index < quantity; index += 1) {
      if (expanded.length >= MAX_TOTAL_LABELS) {
        truncated = true;
        break;
      }
      expanded.push(record);
    }
  }

  if (truncated) {
    warnings.push(
      `Only the first ${MAX_TOTAL_LABELS} labels were generated (${requestedTotal} requested).`,
    );
  }

  return { records: expanded, warnings };
}
