"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/constants";
import {
  SESSION_MAX_AGE,
  createSessionToken,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";

export type AuthResult = { error?: string; success?: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function setSessionCookie(userId: string) {
  const token = createSessionToken(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
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
}

export async function signIn(
  email: string,
  password: string,
): Promise<AuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return { error: "Email and password are required." };
  }

  const sql = getDb();
  const rows = await sql`
    SELECT id, password_hash FROM users WHERE email = ${normalizedEmail} LIMIT 1
  `;
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { error: "Invalid email or password." };
  }

  await setSessionCookie(user.id);
  return { success: true };
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}
