/**
 * Google-review follow-up messaging.
 *
 * Everything here is pure so it can be unit-tested and used from a client
 * component: the shop taps a link, WhatsApp or the SMS app opens with the
 * message pre-filled, and the owner presses send.
 */

/** Fallback used when `NEXT_PUBLIC_GOOGLE_REVIEW_URL` is not configured. */
export const DEFAULT_REVIEW_URL = "https://search.google.com/local/writereview";

/** Digits only, so "98765 43210" and "+91 98765-43210" both compare equal. */
export function phoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export interface ReviewTarget {
  name: string | null;
  phone: string | null;
  visits?: number;
}

/**
 * Strips formatting and adds the 91 country code for 10-digit Indian numbers.
 * Returns digits only (no `+`), or null when the number is unusable.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = phoneDigits(raw);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

/** First name only — friendlier in a WhatsApp message. */
function firstName(name: string | null): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

/**
 * The review request itself. Kept short: WhatsApp/SMS are charged per message
 * and long copy lowers reply rates.
 */
export function buildReviewMessage(target: ReviewTarget, reviewUrl?: string): string {
  const url = reviewUrl || DEFAULT_REVIEW_URL;
  const visits = target.visits ?? 0;
  const thanks =
    visits > 1
      ? `Thank you for shopping with us ${visits} times!`
      : "Thank you for shopping with us!";
  return `Hi ${firstName(target.name)}, ${thanks} Could you take 30 seconds to leave us a Google review? It really helps our little shop. ${url}`;
}

/** `https://wa.me/<digits>?text=…`, or null when the phone is unusable. */
export function whatsappReviewLink(
  target: ReviewTarget,
  reviewUrl?: string,
): string | null {
  const phone = normalizePhone(target.phone);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(buildReviewMessage(target, reviewUrl))}`;
}

/** `sms:<digits>?body=…` — opens the device's SMS app. */
export function smsReviewLink(target: ReviewTarget, reviewUrl?: string): string | null {
  const phone = normalizePhone(target.phone);
  if (!phone) return null;
  return `sms:+${phone}?body=${encodeURIComponent(buildReviewMessage(target, reviewUrl))}`;
}

/** `tel:` link for a tap-to-call button. */
export function telLink(phone: string | null | undefined): string | null {
  const digits = normalizePhone(phone);
  return digits ? `tel:+${digits}` : null;
}

/** "12 Mar" style birthday with the age they will be, or null. */
export function birthdayLabel(birthday: string | null): string | null {
  if (!birthday) return null;
  const [year, month, day] = birthday.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

/** Whole years old today, or null when the birthday is unknown. */
export function ageFromBirthday(birthday: string | null, now = new Date()): number | null {
  if (!birthday) return null;
  const [year, month, day] = birthday.split("-").map(Number);
  if (!year || !month || !day) return null;
  let age = now.getFullYear() - year;
  const beforeBirthday =
    now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}
