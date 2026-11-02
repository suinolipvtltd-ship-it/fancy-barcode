import { getDb } from "@/lib/db";
import { authenticateRequest } from "@/lib/apiAuth";
import type { SaveCalendarEventRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/calendar/events — remembers which Google Calendar event was created
 * for a sale, so the extension can de-duplicate and link back to it.
 */
export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SaveCalendarEventRequest;
  try {
    body = (await request.json()) as SaveCalendarEventRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.saleId || typeof body.saleId !== "string") {
    return Response.json({ error: "Field 'saleId' is required." }, { status: 400 });
  }
  if (!body.eventDate || !DATE_PATTERN.test(body.eventDate)) {
    return Response.json(
      { error: "Field 'eventDate' must be YYYY-MM-DD." },
      { status: 400 },
    );
  }

  try {
    const sql = getDb();
    const rows = await sql`
      INSERT INTO calendar_events (sale_id, google_event_id, event_date, html_link, calendar_id)
      VALUES (
        ${body.saleId},
        ${body.googleEventId ?? null},
        ${body.eventDate},
        ${body.htmlLink ?? null},
        ${body.calendarId ?? "primary"}
      )
      ON CONFLICT (sale_id) DO UPDATE SET
        google_event_id = COALESCE(EXCLUDED.google_event_id, calendar_events.google_event_id),
        event_date = EXCLUDED.event_date,
        html_link = COALESCE(EXCLUDED.html_link, calendar_events.html_link),
        calendar_id = EXCLUDED.calendar_id
      RETURNING id, sale_id, google_event_id, event_date, html_link, calendar_id
    `;

    const row = rows[0];
    return Response.json(
      {
        id: row.id,
        saleId: row.sale_id,
        googleEventId: row.google_event_id,
        eventDate: row.event_date,
        htmlLink: row.html_link,
        calendarId: row.calendar_id,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("POST /api/calendar/events error:", e);
    return Response.json({ error: "Calendar mapping could not be saved." }, { status: 500 });
  }
}
