import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { generateApiToken, hashToken } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

/**
 * API tokens for non-browser clients (the Chrome extension).
 * Only a signed-in browser session can mint or revoke them.
 */

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let label: string | null = null;
  try {
    const body = (await request.json()) as { label?: unknown };
    if (typeof body.label === "string") label = body.label.trim().slice(0, 128);
  } catch {
    // A body is optional.
  }

  try {
    const sql = getDb();
    const token = generateApiToken();
    const rows = await sql`
      INSERT INTO api_tokens (user_id, token_hash, label)
      VALUES (${user.id}, ${hashToken(token)}, ${label})
      RETURNING id, label, created_at
    `;

    const row = rows[0];
    return Response.json(
      {
        id: row.id,
        label: row.label,
        createdAt: new Date(row.created_at).toISOString(),
        // Shown exactly once — store it in the extension settings.
        token,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("POST /api/tokens error:", e);
    return Response.json({ error: "Token could not be created." }, { status: 500 });
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, label, created_at, last_used_at
      FROM api_tokens
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
    `;

    return Response.json(
      rows.map((row) => ({
        id: row.id,
        label: row.label,
        createdAt: new Date(row.created_at).toISOString(),
        lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
      })),
    );
  } catch (e) {
    console.error("GET /api/tokens error:", e);
    return Response.json({ tokens: [] }, { status: 200 });
  }
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return Response.json({ error: "Query parameter 'id' is required." }, { status: 400 });
  }

  try {
    const sql = getDb();
    await sql`DELETE FROM api_tokens WHERE id = ${id} AND user_id = ${user.id}`;
    return Response.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/tokens error:", e);
    return Response.json({ error: "Token could not be revoked." }, { status: 500 });
  }
}
