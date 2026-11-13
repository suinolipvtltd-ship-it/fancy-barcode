import { describe, it, expect } from "vitest";
import {
  isCalendarDay,
  parseCreateCustomer,
  parseUpdateCustomer,
} from "@/lib/customerValidation";

describe("isCalendarDay", () => {
  it("accepts real dates including leap days", () => {
    expect(isCalendarDay("2020-02-29")).toBe(true);
    expect(isCalendarDay("2026-11-13")).toBe(true);
  });

  it("rejects dates that only look valid", () => {
    expect(isCalendarDay("2020-02-31")).toBe(false);
    expect(isCalendarDay("2026-13-01")).toBe(false);
    expect(isCalendarDay("2026-1-1")).toBe(false);
    expect(isCalendarDay("not-a-date")).toBe(false);
  });
});

describe("parseUpdateCustomer", () => {
  it("rejects non-object bodies", () => {
    expect(parseUpdateCustomer(null).ok).toBe(false);
    expect(parseUpdateCustomer([]).ok).toBe(false);
    expect(parseUpdateCustomer("x").ok).toBe(false);
  });

  it("rejects wrong-typed fields instead of coercing them", () => {
    expect(parseUpdateCustomer({ phone: 42 }).ok).toBe(false);
    expect(parseUpdateCustomer({ reviewed: "false" }).ok).toBe(false);
    expect(parseUpdateCustomer({ name: {} }).ok).toBe(false);
  });

  it("rejects malformed child entries before the database write", () => {
    expect(parseUpdateCustomer({ children: [null] }).ok).toBe(false);
    expect(parseUpdateCustomer({ children: [{ birthday: "2020-02-31" }] }).ok).toBe(false);
    expect(parseUpdateCustomer({ children: [{ gender: "other" }] }).ok).toBe(false);
    expect(parseUpdateCustomer({ children: "nope" }).ok).toBe(false);
  });

  it("accepts valid partial updates and keeps omitted fields absent", () => {
    const parsed = parseUpdateCustomer({ note: "Likes pastels" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual({ note: "Likes pastels" });
  });

  it("passes explicit nulls and booleans through", () => {
    const parsed = parseUpdateCustomer({ phone: null, reviewed: true });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual({ phone: null, reviewed: true });
  });

  it("rejects an empty update", () => {
    expect(parseUpdateCustomer({}).ok).toBe(false);
  });
});

describe("parseCreateCustomer", () => {
  it("accepts a name with children", () => {
    const parsed = parseCreateCustomer({
      name: "Priya",
      children: [{ name: "Aarav", gender: "boy", birthday: "2021-04-09" }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.children).toHaveLength(1);
  });

  it("rejects children:[null] and wrong types", () => {
    expect(parseCreateCustomer({ name: "A", children: [null] }).ok).toBe(false);
    expect(parseCreateCustomer({ name: 42 }).ok).toBe(false);
    expect(parseCreateCustomer({ name: "A", phone: 98765 }).ok).toBe(false);
  });
});
