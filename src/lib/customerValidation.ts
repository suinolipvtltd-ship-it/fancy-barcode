import type {
  ChildGender,
  CreateCustomerRequest,
  UpdateCustomerRequest,
} from "@/lib/types";

/**
 * Runtime validation for the customer API. TypeScript types vanish at runtime,
 * so a request like `{"phone": 42}` or `{"reviewed": "false"}` would otherwise
 * reach the database and blank a phone number or stamp a review flag.
 *
 * Every parser is strict about types and returns a readable error instead of
 * silently coercing, and no database write happens until the whole body passed.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const MAX_NAME = 255;
const MAX_PHONE = 32;
const MAX_NOTE = 2000;
const MAX_CHILD_NAME = 120;

/**
 * True for a real calendar day (`2020-02-29`), false for a date that only looks
 * valid (`2020-02-31`). Postgres would reject the latter mid-transaction.
 */
export function isCalendarDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ChildDraft {
  id?: string | null;
  name?: string | null;
  gender?: ChildGender | null;
  birthday?: string | null;
}

function parseText(
  record: Record<string, unknown>,
  key: string,
  max: number,
): Parsed<string | null | undefined> {
  const value = record[key];
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, error: `Field '${key}' must be a string or null.` };
  }
  if (value.length > max) {
    return { ok: false, error: `Field '${key}' must be ${max} characters or fewer.` };
  }
  return { ok: true, value };
}

function parseChildren(value: unknown): Parsed<ChildDraft[] | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value)) {
    return { ok: false, error: "Field 'children' must be an array." };
  }

  const children: ChildDraft[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isRecord(entry)) {
      return { ok: false, error: `children[${index}] must be an object.` };
    }

    const child: ChildDraft = {};

    if (entry.id !== undefined && entry.id !== null) {
      if (typeof entry.id !== "string") {
        return { ok: false, error: `children[${index}].id must be a string or null.` };
      }
      child.id = entry.id;
    }

    const name = parseText(entry, "name", MAX_CHILD_NAME);
    if (!name.ok) return { ok: false, error: `children[${index}].${name.error}` };
    if (name.value !== undefined) child.name = name.value;

    if (entry.gender !== undefined && entry.gender !== null) {
      if (entry.gender !== "girl" && entry.gender !== "boy") {
        return {
          ok: false,
          error: `children[${index}].gender must be 'girl', 'boy' or null.`,
        };
      }
      child.gender = entry.gender;
    } else if (entry.gender === null) {
      child.gender = null;
    }

    if (entry.birthday !== undefined && entry.birthday !== null) {
      if (typeof entry.birthday !== "string" || entry.birthday.trim() === "") {
        return {
          ok: false,
          error: `children[${index}].birthday must be YYYY-MM-DD or null.`,
        };
      }
      if (!isCalendarDay(entry.birthday.trim())) {
        return {
          ok: false,
          error: `children[${index}].birthday is not a real date (use YYYY-MM-DD).`,
        };
      }
      child.birthday = entry.birthday.trim();
    } else if (entry.birthday === null) {
      child.birthday = null;
    }

    children.push(child);
  }

  return { ok: true, value: children };
}

function parseFlag(
  record: Record<string, unknown>,
  key: string,
): Parsed<boolean | undefined> {
  const value = record[key];
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "boolean") {
    return { ok: false, error: `Field '${key}' must be true or false.` };
  }
  return { ok: true, value };
}

/** Validates a `POST /api/customers` body. */
export function parseCreateCustomer(body: unknown): Parsed<CreateCustomerRequest> {
  if (!isRecord(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }

  const name = parseText(body, "name", MAX_NAME);
  if (!name.ok) return name;
  const phone = parseText(body, "phone", MAX_PHONE);
  if (!phone.ok) return phone;
  const note = parseText(body, "note", MAX_NOTE);
  if (!note.ok) return note;

  const children = parseChildren(body.children);
  if (!children.ok) return children;

  return {
    ok: true,
    value: {
      name: name.value,
      phone: phone.value,
      note: note.value,
      ...(children.value === undefined ? {} : { children: children.value }),
    },
  };
}

/** Validates a `PATCH /api/customers/[id]` body. */
export function parseUpdateCustomer(body: unknown): Parsed<UpdateCustomerRequest> {
  if (!isRecord(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }

  const name = parseText(body, "name", MAX_NAME);
  if (!name.ok) return name;
  const phone = parseText(body, "phone", MAX_PHONE);
  if (!phone.ok) return phone;
  const note = parseText(body, "note", MAX_NOTE);
  if (!note.ok) return note;

  const reviewRequested = parseFlag(body, "reviewRequested");
  if (!reviewRequested.ok) return reviewRequested;
  const reviewed = parseFlag(body, "reviewed");
  if (!reviewed.ok) return reviewed;

  const children = parseChildren(body.children);
  if (!children.ok) return children;

  const value: UpdateCustomerRequest = {};
  if (name.value !== undefined) value.name = name.value;
  if (phone.value !== undefined) value.phone = phone.value;
  if (note.value !== undefined) value.note = note.value;
  if (reviewRequested.value !== undefined) value.reviewRequested = reviewRequested.value;
  if (reviewed.value !== undefined) value.reviewed = reviewed.value;
  if (children.value !== undefined) value.children = children.value;

  if (Object.keys(value).length === 0) {
    return { ok: false, error: "Nothing to update." };
  }

  return { ok: true, value };
}
