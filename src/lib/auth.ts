import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/constants";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/** Session lifetime: 7 days, in seconds (used for the cookie maxAge). */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET environment variable is not set. Add it to your .env.local file.",
    );
  }
  return secret;
}

/** Hash a password with scrypt. Stored format: `salt:hash` (hex). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

/** Verify a plaintext password against a stored `salt:hash` value. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const hash = await scrypt(password, salt, 64);
  const expected = Buffer.from(hashHex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

function sign(payload: string): string {
  return createHmac("sha256", getAuthSecret())
    .update(payload)
    .digest("base64url");
}

/** Create a signed session token for a user id. */
export function createSessionToken(userId: string): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

/** Verify a session token and return the user id, or null if invalid/expired. */
export function getUserIdFromToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [userId, expiresAt, signature] = parts;
  const expected = sign(`${userId}.${expiresAt}`);

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry < Date.now()) {
    return null;
  }

  return userId;
}

/** Read the session cookie, verify it, and load the matching user. */
export async function getSessionUser(): Promise<{
  id: string;
  email: string;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = getUserIdFromToken(token);
  if (!userId) return null;

  const sql = getDb();
  const rows =
    await sql`SELECT id, email FROM users WHERE id = ${userId} LIMIT 1`;
  const user = rows[0];
  if (!user) return null;

  return { id: user.id, email: user.email };
}
