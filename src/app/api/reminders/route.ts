import { authenticateRequest } from "@/lib/apiAuth";
import { dismissReminder, listReminders, restoreReminder } from "@/lib/reminders";

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
