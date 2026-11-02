import { createHash, randomBytes } from "node:crypto";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

/**
 * Two ways to authenticate a request:
 *  - browser session cookie (the Next.js app itself), or
 *  - `Authorization: Bearer <token>` (the browser extension, which lives on a
 *    different origin and therefore has no session cookie).
 */

export interface ApiUser {
  id: string;
  email: string;
}

/** Tokens are random 256-bit strings; only their SHA-256 hash is stored. */
export function generateApiToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export async function authenticateRequest(
  request: Request,
): Promise<ApiUser | null> {
  const token = bearerToken(request);
  if (token) {
    const tokenHash = hashToken(token);
    const sql = getDb();
    const rows = await sql`
      SELECT u.id, u.email
      FROM api_tokens t
      JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ${tokenHash}
      LIMIT 1
    `;
    const user = rows[0];
    if (!user) return null;

    // Best-effort usage tracking; never block the request on it.
    try {
      await sql`UPDATE api_tokens SET last_used_at = NOW() WHERE token_hash = ${tokenHash}`;
    } catch (e) {
      console.error("api token last_used_at update failed:", e);
    }

    return { id: user.id as string, email: user.email as string };
  }

  return await getSessionUser();
}
