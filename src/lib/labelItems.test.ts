import { describe, it, expect } from "vitest";
import {
  countLabels,
  expandByQuantity,
  MAX_LABELS_PER_ROW,
  MAX_TOTAL_LABELS,
} from "@/lib/labelItems";
import type { ProductRecord } from "@/lib/types";

function record(quantity: number, rowNumber = 2): ProductRecord {
  return {
    productName: `Product ${rowNumber}`,
    sku: `SKU-${rowNumber}`,
    mrp: "999",
    barcodeValue: `SKU-${rowNumber}`,
    quantity,
    rowNumber,
  };
}

describe("countLabels", () => {
  it("sums quantities", () => {
    expect(countLabels([record(3, 2), record(2, 3)])).toBe(5);
  });

  it("treats missing or invalid quantities as one", () => {
    expect(countLabels([record(0, 2), record(-4, 3)])).toBe(2);
  });

  it("applies the same per-row cap as expandByQuantity", () => {
    const records = [record(MAX_LABELS_PER_ROW + 100)];
    expect(countLabels(records)).toBe(MAX_LABELS_PER_ROW);
    expect(expandByQuantity(records).records).toHaveLength(MAX_LABELS_PER_ROW);
  });

  it("applies the same total cap as expandByQuantity", () => {
    const records = Array.from({ length: 40 }, (_, index) =>
      record(MAX_LABELS_PER_ROW, index + 2),
    );

    expect(countLabels(records)).toBe(MAX_TOTAL_LABELS);
    expect(expandByQuantity(records).records).toHaveLength(MAX_TOTAL_LABELS);
  });
});

describe("expandByQuantity", () => {
  it("repeats each record in order", () => {
    const { records, warnings } = expandByQuantity([record(2, 2), record(1, 3)]);

    expect(warnings).toEqual([]);
    expect(records.map((item) => item.sku)).toEqual([
      "SKU-2",
      "SKU-2",
      "SKU-3",
    ]);
  });

  it("warns once and stops allocating past the total cap", () => {
    const records = Array.from({ length: 40 }, (_, index) =>
      record(MAX_LABELS_PER_ROW, index + 2),
    );

    const result = expandByQuantity(records);

    expect(result.records).toHaveLength(MAX_TOTAL_LABELS);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain(`${MAX_TOTAL_LABELS}`);
  });
});
