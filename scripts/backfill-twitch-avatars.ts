/**
 * One-shot backfill: populate `users.twitch_avatar` (+ `twitch_id`,
 * `twitch_username`) for every account that has a `twitch_connections`
 * row but a null `twitch_avatar`. Looks the user up via Helix
 * `/users?login=...` using an app access token — no user token decrypt
 * needed, so this works even if the encryption key has rotated since
 * those connections were stored.
 *
 * Why it exists:
 *   The Twitch streamer integration callback originally only wrote
 *   to `twitch_connections`. The Account → Profile avatar picker reads
 *   `users.twitch_avatar`, so streamers who linked Twitch via the
 *   integration (rather than signing in via Twitch on Supabase Auth)
 *   never saw a Twitch option in the avatar picker. The callback now
 *   writes both — this script catches up existing connections.
 *
 * Usage:
 *   npx tsx scripts/backfill-twitch-avatars.ts            # backfill only nulls
 *   FORCE=1 npx tsx scripts/backfill-twitch-avatars.ts    # overwrite even if set
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY + TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createTwitchAdminClient } from "../src/lib/twitch/admin";
import { getAppAccessToken } from "../src/lib/twitch/client";

const TWITCH_HELIX_BASE = "https://api.twitch.tv/helix";

interface HelixUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url?: string;
}

async function lookupHelixUserByLogin(
  login: string,
  appToken: string,
  clientId: string,
): Promise<HelixUser | null> {
  const url = `${TWITCH_HELIX_BASE}/users?login=${encodeURIComponent(login)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${appToken}`,
      "Client-Id": clientId,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Helix /users lookup failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { data: HelixUser[] };
  return data.data?.[0] ?? null;
}

const force = process.env.FORCE === "1" || process.env.FORCE === "true";

(async () => {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    console.error("TWITCH_CLIENT_ID missing from .env.local");
    process.exit(1);
  }

  const admin = createTwitchAdminClient();
  const appToken = await getAppAccessToken();

  const { data: connections, error } = await admin
    .from("twitch_connections")
    .select("user_id, twitch_login");
  if (error) {
    console.error("[backfill] query failed:", error.message);
    process.exit(1);
  }
  if (!connections || connections.length === 0) {
    console.log("No twitch_connections rows. Nothing to do.");
    return;
  }

  console.log(`Found ${connections.length} connection(s).`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const conn of connections) {
    const userId = conn.user_id as string;
    const login = conn.twitch_login as string | null;
    const label = `${userId} (${login ?? "?"})`;

    if (!login) {
      console.error(`  ✗ ${label}: no twitch_login on connection — skipping`);
      failed += 1;
      continue;
    }

    if (!force) {
      const { data: existing } = await admin
        .from("users")
        .select("twitch_avatar")
        .eq("id", userId)
        .maybeSingle();
      if (existing?.twitch_avatar) {
        console.log(`  - ${label}: already set, skipping`);
        skipped += 1;
        continue;
      }
    }

    try {
      const helixUser = await lookupHelixUserByLogin(login, appToken, clientId);
      if (!helixUser) {
        console.error(`  ✗ ${label}: Helix returned no user`);
        failed += 1;
        continue;
      }
      const updates: Record<string, unknown> = {
        twitch_id: helixUser.id,
        twitch_username: helixUser.login,
      };
      if (helixUser.profile_image_url) {
        updates.twitch_avatar = helixUser.profile_image_url;
      }
      const { error: writeErr } = await admin
        .from("users")
        .update(updates)
        .eq("id", userId);
      if (writeErr) {
        console.error(`  ✗ ${label}: write failed — ${writeErr.message}`);
        failed += 1;
        continue;
      }
      console.log(`  ✓ ${label}: synced ${helixUser.login}`);
      updated += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${label}: ${msg}`);
      failed += 1;
    }
  }

  console.log(
    `\nDone. Updated ${updated}, skipped ${skipped}, failed ${failed}.`,
  );
  if (failed > 0) process.exit(1);
})();
