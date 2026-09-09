"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/constants";
import { SESSION_MAX_AGE, createSessionToken } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  getClientIp,
  isLoginBlocked,
  normalizeKey,
  recordLoginFailure,
  resetLoginFailures,
} from "@/lib/rateLimit";

export type AuthResult = { error?: string; success?: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function setSessionCookie(userId: string) {
  const token = await createSessionToken(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

export async function signUp(
  email: string,
  password: string,
): Promise<AuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalizedEmail)) {
    return { error: "Please enter a valid email address." };
  }
  if (!password || password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const sql = getDb();
  const existing =
    await sql`SELECT id FROM users WHERE email = ${normalizedEmail} LIMIT 1`;
  if (existing.length > 0) {
    return { error: "An account with this email already exists." };
  }

  const passwordHash = await hashPassword(password);
  try {
    const rows = await sql`
      INSERT INTO users (email, password_hash)
      VALUES (${normalizedEmail}, ${passwordHash})
      RETURNING id
    `;
    if (!rows[0]?.id) {
      return { error: "Could not create your account. Please try again." };
    }
    await setSessionCookie(rows[0].id);
    return { success: true };
  } catch (err) {
    // Two concurrent sign-ups with the same email can both pass the SELECT
    // above; the second INSERT then violates the UNIQUE constraint (23505).
    if (isUniqueViolation(err)) {
      return { error: "An account with this email already exists." };
    }
    console.error("signUp error:", err);
    return { error: "Could not create your account. Please try again." };
  }
}

export async function signIn(
  email: string,
  password: string,
): Promise<AuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return { error: "Email and password are required." };
  }

  const rateKey = normalizeKey(normalizedEmail, await getClientIp());
  if (await isLoginBlocked(rateKey)) {
    return { error: "Too many failed attempts. Please try again later." };
  }

  const sql = getDb();
  const rows = await sql`
    SELECT id, password_hash FROM users WHERE email = ${normalizedEmail} LIMIT 1
  `;
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await recordLoginFailure(rateKey);
    return { error: "Invalid email or password." };
  }

  await resetLoginFailures(rateKey);
  await setSessionCookie(user.id);
  return { success: true };
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}
