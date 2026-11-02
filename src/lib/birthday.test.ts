import { describe, it, expect } from "vitest";
import {
  buildReminderEvent,
  computeAnniversaryDate,
  nextDay,
} from "@/lib/birthday";

describe("computeAnniversaryDate", () => {
  it("books the reminder one year after the sale", () => {
    expect(computeAnniversaryDate("2026-10-29T10:15:00.000Z")).toBe("2027-10-29");
  });

  it("clamps 29 February to 28 February on a non-leap year", () => {
    expect(computeAnniversaryDate("2028-02-29T00:00:00.000Z")).toBe("2029-02-28");
  });

  it("keeps 29 February in a leap year", () => {
    expect(computeAnniversaryDate("2027-02-28T00:00:00.000Z", 1)).toBe("2028-02-28");
    expect(computeAnniversaryDate("2028-02-29T00:00:00.000Z", 4)).toBe("2032-02-29");
  });

  it("supports multi-year offsets", () => {
    expect(computeAnniversaryDate("2026-01-05T00:00:00.000Z", 3)).toBe("2029-01-05");
  });

  it("rejects invalid dates", () => {
    expect(() => computeAnniversaryDate("not-a-date")).toThrow(/Invalid sale date/);
  });
});

describe("nextDay", () => {
  it("rolls over month and year boundaries", () => {
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("2027-02-28")).toBe("2027-03-01");
  });
});

describe("buildReminderEvent", () => {
  it("includes customer, items and the anniversary date", () => {
    const reminder = buildReminderEvent({
      customerName: "Asha Rao",
      customerPhone: "9876543210",
      items: [{ sku: "DRS-1024", name: "Red Party Dress", qty: 1 }],
      soldAt: "2026-10-29T10:15:00.000Z",
      note: "Size 6, wants navy next time",
    });

    expect(reminder.date).toBe("2027-10-29");
    expect(reminder.title).toBe("Birthday dress follow-up — Asha Rao");
    expect(reminder.description).toContain("Phone: 9876543210");
    expect(reminder.description).toContain("Red Party Dress (DRS-1024) × 1");
    expect(reminder.description).toContain("Size 6, wants navy next time");
  });

  it("falls back to a generic title without a customer name", () => {
    const reminder = buildReminderEvent({ soldAt: "2026-06-01T00:00:00.000Z" });
    expect(reminder.title).toBe("Birthday dress follow-up — Customer");
    expect(reminder.date).toBe("2027-06-01");
  });
});
