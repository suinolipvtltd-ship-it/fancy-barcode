import { describe, it, expect } from "vitest";
import {
  ageFromBirthday,
  buildReviewMessage,
  normalizePhone,
  smsReviewLink,
  telLink,
  whatsappReviewLink,
} from "@/lib/reviewMessage";

const REVIEW_URL = "https://g.page/r/test-shop/review";

describe("normalizePhone", () => {
  it("adds the Indian country code to a 10-digit number", () => {
    expect(normalizePhone("9876543210")).toBe("919876543210");
  });

  it("strips punctuation and a leading zero", () => {
    expect(normalizePhone("098765-43210")).toBe("919876543210");
  });

  it("keeps numbers that already carry a country code", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("919876543210");
  });

  it("rejects numbers that are too short or missing", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("buildReviewMessage", () => {
  it("greets by first name and includes the review link", () => {
    const message = buildReviewMessage({ name: "Priya Sharma", phone: "9876543210" }, REVIEW_URL);
    expect(message).toContain("Hi Priya,");
    expect(message).toContain(REVIEW_URL);
    expect(message).toContain("Thank you for shopping with us!");
  });

  it("falls back to a neutral greeting and mentions repeat visits", () => {
    const message = buildReviewMessage({ name: null, phone: null, visits: 3 }, REVIEW_URL);
    expect(message).toContain("Hi there,");
    expect(message).toContain("3 times");
  });

  it("uses the default review URL when none is configured", () => {
    expect(buildReviewMessage({ name: "A", phone: null })).toContain(
      "https://search.google.com/local/writereview",
    );
  });
});

describe("review links", () => {
  const target = { name: "Priya Sharma", phone: "9876543210", visits: 2 };

  it("builds a wa.me link with the message encoded", () => {
    const link = whatsappReviewLink(target, REVIEW_URL);
    expect(link?.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    expect(decodeURIComponent(link!.split("text=")[1])).toContain("Hi Priya,");
  });

  it("builds an sms link with the message encoded", () => {
    const link = smsReviewLink(target, REVIEW_URL);
    expect(link?.startsWith("sms:+919876543210?body=")).toBe(true);
  });

  it("returns null when there is no usable phone number", () => {
    expect(whatsappReviewLink({ name: "X", phone: null })).toBeNull();
    expect(smsReviewLink({ name: "X", phone: "123" })).toBeNull();
    expect(telLink(null)).toBeNull();
  });
});

describe("ageFromBirthday", () => {
  it("counts whole years and only increments after the birthday", () => {
    const now = new Date(2026, 10, 13, 12);
    expect(ageFromBirthday("2020-11-12", now)).toBe(6);
    expect(ageFromBirthday("2020-11-14", now)).toBe(5);
  });

  it("returns null for a missing birthday", () => {
    expect(ageFromBirthday(null)).toBeNull();
  });
});
