const encoder = new TextEncoder();

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

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string): Promise<string> {
  // Web Crypto works in both the Node runtime (server actions, route handlers)
  // and the edge runtime (proxy.ts), so this module can be imported anywhere.
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getAuthSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Create a signed session token for a user id. */
export async function createSessionToken(userId: string): Promise<string> {
  const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${await sign(payload)}`;
}

/** Verify a session token and return the user id, or null if invalid/expired. */
export async function getUserIdFromToken(
  token: string,
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [userId, expiresAt, signature] = parts;
  const expected = await sign(`${userId}.${expiresAt}`);
  if (!safeEqual(signature, expected)) return null;

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return null;

  return userId;
}
