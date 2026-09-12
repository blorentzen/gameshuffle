import "server-only";

/**
 * Auto-assign a handle to any account that doesn't have one, so everybody is
 * addressable at /u/[username] and discoverable in Find Players. Derives a base
 * from the best available hint (Discord/Twitch handle → display name → email),
 * slugifies it to the shared rules, then finds the first free case-insensitive
 * variant. Idempotent: a no-op once a username exists (so a user who later
 * renames keeps their choice). The DB unique index is the real guard — a losing
 * race just falls through to the next candidate.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { RESERVED_USERNAMES, USERNAME_MIN, USERNAME_MAX } from "@/lib/username";

function slugify(raw: string): string {
  const s = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9_-]+/g, "")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, USERNAME_MAX - 4); // leave room for a numeric/random suffix
  return s;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

export interface UsernameHints {
  displayName?: string | null;
  discord?: string | null;
  twitch?: string | null;
  email?: string | null;
}

export async function ensureUsername(userId: string, hints: UsernameHints): Promise<string | null> {
  if (!userId) return null;
  const admin = createServiceClient();

  const { data: existing } = await admin.from("users").select("username").eq("id", userId).maybeSingle();
  const current = (existing as { username: string | null } | null)?.username;
  if (current) return current;

  const raw =
    hints.discord || hints.twitch || hints.displayName || (hints.email ? hints.email.split("@")[0] : "") || "player";
  let base = slugify(raw);
  if (base.length < USERNAME_MIN) base = "player";

  const candidates: string[] = [base];
  for (let i = 1; i <= 30; i++) candidates.push(`${base}${i}`.slice(0, USERNAME_MAX));
  for (let i = 0; i < 5; i++) candidates.push(`${base}-${randomSuffix()}`.slice(0, USERNAME_MAX));

  for (const c of candidates) {
    if (c.length < USERNAME_MIN || RESERVED_USERNAMES.has(c)) continue;
    const { data: taken } = await admin.from("users").select("id").eq("username", c).maybeSingle();
    if (taken) continue;
    const { error } = await admin.from("users").update({ username: c }).eq("id", userId);
    if (!error) return c;
    // Unique-violation race → try the next candidate.
  }
  return null;
}
