import { authenticateRequest } from "@/lib/apiAuth";
import {
  dismissReminder,
  listReminders,
  restoreReminder,
  updateReminder,
} from "@/lib/reminders";
import type { UpdateReminderRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  // 18 months of runway is plenty for birthday follow-ups.
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 18, 0));
  return { from: day(from), to: day(to) };
}

/**
 * GET /api/reminders?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Lists open reminders with the customer, product and size behind each one.
 */
export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const fallback = defaultRange();
  const from = params.get("from") || fallback.from;
  const to = params.get("to") || fallback.to;

  if (!DAY_PATTERN.test(from) || !DAY_PATTERN.test(to)) {
    return Response.json(
      { error: "Query parameters 'from' and 'to' must be YYYY-MM-DD." },
      { status: 400 },
    );
  }
  if (from > to) {
    return Response.json({ error: "'from' must be on or before 'to'." }, { status: 400 });
  }

  try {
    const reminders = await listReminders({ from, to });
    return Response.json({ from, to, reminders });
  } catch (e) {
    console.error("GET /api/reminders error:", e);
    return Response.json({ error: "Reminders could not be loaded." }, { status: 500 });
  }
}

/**
 * DELETE /api/reminders?id=<calendar_events.id>[&restore=1]
 * Admin action: hide (or un-hide) a reminder. The sale itself is untouched.
 */
export async function DELETE(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  if (!id) {
    return Response.json({ error: "Query parameter 'id' is required." }, { status: 400 });
  }

  try {
    if (params.get("restore")) {
      const restored = await restoreReminder(id);
      if (!restored) {
        return Response.json({ error: "Reminder not found." }, { status: 404 });
      }
      return Response.json({ id, dismissed: false });
    }

    const dismissed = await dismissReminder(id);
    if (!dismissed) {
      return Response.json(
        { error: "Reminder not found or already removed." },
        { status: 404 },
      );
    }
    return Response.json({ id, dismissed: true });
  } catch (e) {
    console.error("DELETE /api/reminders error:", e);
    return Response.json({ error: "Reminder could not be updated." }, { status: 500 });
  }
}

/**
 * PATCH /api/reminders — edits what the reminder is about: the products/sizes
 * bought, whether the order was for a girl or boy, and the child's age.
 */
export async function PATCH(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: UpdateReminderRequest;
  try {
    body = (await request.json()) as UpdateReminderRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) {
    return Response.json({ error: "Field 'id' is required." }, { status: 400 });
  }

  if (
    body.childGender !== undefined &&
    body.childGender !== null &&
    body.childGender !== "girl" &&
    body.childGender !== "boy"
  ) {
    return Response.json(
      { error: "Field 'childGender' must be 'girl', 'boy' or null." },
      { status: 400 },
    );
  }

  if (body.childAgeYears !== undefined && body.childAgeYears !== null) {
    const age = Number(body.childAgeYears);
    if (!Number.isInteger(age) || age < 0 || age > 25) {
      return Response.json(
        { error: "Field 'childAgeYears' must be a whole number between 0 and 25." },
        { status: 400 },
      );
    }
  }

  if (
    body.childBirthday !== undefined &&
    body.childBirthday !== null &&
    !DAY_PATTERN.test(String(body.childBirthday))
  ) {
    return Response.json(
      { error: "Field 'childBirthday' must be YYYY-MM-DD or null." },
      { status: 400 },
    );
  }

  if (body.items !== undefined && !Array.isArray(body.items)) {
    return Response.json({ error: "Field 'items' must be an array." }, { status: 400 });
  }

  try {
    const reminder = await updateReminder(id, {
      ...body,
      id,
      childAgeYears:
        body.childAgeYears === undefined
          ? undefined
          : body.childAgeYears === null
            ? null
            : Number(body.childAgeYears),
      childBirthday:
        body.childBirthday === undefined ? undefined : body.childBirthday || null,
    });

    if (!reminder) {
      return Response.json(
        { error: "Reminder not found or already removed." },
        { status: 404 },
      );
    }

    return Response.json({ reminder });
  } catch (e) {
    console.error("PATCH /api/reminders error:", e);
    return Response.json({ error: "Reminder could not be saved." }, { status: 500 });
  }
}
