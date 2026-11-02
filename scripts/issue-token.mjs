#!/usr/bin/env node
/**
 * Mints an API token for the browser extension (or any non-browser client).
 *
 *   DATABASE_URL=postgres://... node scripts/issue-token.mjs you@example.com "Chrome extension"
 *
 * Reads DATABASE_URL from the environment, falling back to .env.local.
 * The raw token is printed once; only its SHA-256 hash is stored.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import net from "node:net";
import { neon } from "@neondatabase/serverless";

// Node 20's Happy Eyeballs resolver often hangs (ETIMEDOUT) on networks where
// the IPv6 routes to Neon are dead. Neon is dual-stack, so plain IPv4 works.
net.setDefaultAutoSelectFamily?.(false);

function loadEnvLocal() {
  if (process.env.DATABASE_URL) return;
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
      if (!match) continue;
      const value = match[2].replace(/^["']|["']$/g, "");
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  } catch {
    // No .env.local — rely on the real environment.
  }
}

async function main() {
  const [email, label = "browser extension"] = process.argv.slice(2);

  if (!email) {
    console.error(
      "Usage: node scripts/issue-token.mjs <email> [label]\n" +
        "  DATABASE_URL is read from the environment or .env.local",
    );
    process.exit(1);
  }

  loadEnvLocal();

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const users = await sql`SELECT id, email FROM users WHERE email = ${email} LIMIT 1`;
  const user = users[0];

  if (!user) {
    console.error(`No user with email ${email}. Sign up in the app first.`);
    process.exit(1);
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  await sql`
    INSERT INTO api_tokens (user_id, token_hash, label)
    VALUES (${user.id}, ${tokenHash}, ${label})
  `;

  console.log(`\nAPI token for ${user.email} (${label}) — copy it now, it is not stored in plain text:\n`);
  console.log(token);
  console.log("\nPaste it into the extension settings.\n");
}

main().catch((e) => {
  const code = e?.cause?.code;
  if (e?.message === "fetch failed") {
    console.error(
      `Cannot reach the database (${code || "network error"}).\n` +
        "Check your internet connection / VPN and that DATABASE_URL points at a live Neon project.",
    );
  } else {
    console.error(e.message || e);
  }
  process.exit(1);
});
