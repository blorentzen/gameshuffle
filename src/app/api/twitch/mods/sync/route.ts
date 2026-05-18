/**
 * POST /api/twitch/mods/sync
 *
 * Pulls the streamer's current Twitch moderator list via Helix and
 * upserts the result into `streamer_mods`:
 *   - New Twitch mods → inserted as `pending` (one-click invite from the
 *     Hub Mods tab)
 *   - Existing rows → status is preserved (we never overwrite a row the
 *     streamer has already actioned)
 *   - Disappeared from Twitch → if the streamer has
 *     `auto_revoke_lost_twitch_mods = true`, the row flips to `revoked`.
 *     Default ON; per-streamer setting on `users`.
 *
 * Called manually from the Mods tab's "Sync now" button. A scheduled
 * cron (every 6h) does the same call across all connected streamers —
 * lands in a follow-up PR; this endpoint is the building block.
 *
 * Requires the streamer's Twitch connection to have `moderation:read`
 * scope. The reauth banner on the Twitch dashboard surfaces when that's
 * missing.
 */

import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { listChannelModerators } from "@/lib/twitch/client";
import { getValidUserAccessToken, forceRefreshUserToken } from "@/lib/twitch/userToken";

export const runtime = "nodejs";

interface SyncResult {
  imported: number;
  preserved: number;
  revoked: number;
  lastSyncedAt: string;
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  const admin = createServiceClient();

  // Resolve broadcaster id + auto-revoke setting from the user row +
  // their twitch_connections row. One query each, ordered so we can
  // bail early if the streamer hasn't connected Twitch yet.
  const { data: profile } = await admin
    .from("users")
    .select("auto_revoke_lost_twitch_mods")
    .eq("id", user.id)
    .maybeSingle();
  const autoRevoke =
    (profile as { auto_revoke_lost_twitch_mods: boolean | null } | null)
      ?.auto_revoke_lost_twitch_mods ?? true;

  const { data: conn } = await admin
    .from("twitch_connections")
    .select("twitch_user_id, scopes")
    .eq("user_id", user.id)
    .maybeSingle();
  const broadcasterId = (conn as { twitch_user_id: string | null } | null)
    ?.twitch_user_id;
  if (!broadcasterId) {
    return NextResponse.json(
      { ok: false, error: "twitch_not_connected" },
      { status: 400 },
    );
  }
  const scopes =
    (conn as { scopes: string[] | null } | null)?.scopes ?? [];
  if (!scopes.includes("moderation:read")) {
    return NextResponse.json(
      { ok: false, error: "missing_scope_moderation_read" },
      { status: 403 },
    );
  }

  // Fetch moderators via Helix. One token fetch up-front; if the
  // paginated call hits a 401 mid-walk, we retry once with a forced
  // refresh. Catches the rare "token expired between pages" race.
  let moderators;
  try {
    const token = await getValidUserAccessToken(user.id);
    try {
      moderators = await listChannelModerators({
        broadcasterId,
        accessToken: token,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("(401)")) {
        const fresh = await forceRefreshUserToken(user.id);
        moderators = await listChannelModerators({
          broadcasterId,
          accessToken: fresh,
        });
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error("[twitch-mods/sync] Helix call failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "helix_call_failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const importedTwitchIds = new Set(moderators.map((m) => m.user_id));

  // Pull existing rows for this streamer so we can compute the delta
  // without race-y individual upserts. Twitch returns moderator lists
  // in the low-hundreds at worst — fine to load into memory.
  const { data: existingRaw } = await admin
    .from("streamer_mods")
    .select("id, twitch_user_id, status")
    .eq("streamer_user_id", user.id);
  const existing = (existingRaw as Array<{
    id: string;
    twitch_user_id: string | null;
    status: string;
  }> | null) ?? [];
  const existingByTwitchId = new Map(
    existing
      .filter((r) => r.twitch_user_id !== null)
      .map((r) => [r.twitch_user_id as string, r]),
  );

  let imported = 0;
  let preserved = 0;
  const toInsert: Array<{
    streamer_user_id: string;
    twitch_user_id: string;
    display_name: string;
    source: string;
  }> = [];

  for (const mod of moderators) {
    const known = existingByTwitchId.get(mod.user_id);
    if (known) {
      // Already in the table — never overwrite. The streamer may have
      // already invited / activated / revoked them; this sync is for
      // discovery, not state regression.
      preserved += 1;
      continue;
    }
    toInsert.push({
      streamer_user_id: user.id,
      twitch_user_id: mod.user_id,
      display_name: mod.user_name,
      source: "twitch_auto_import",
    });
  }

  if (toInsert.length > 0) {
    const { error: insertErr, count } = await admin
      .from("streamer_mods")
      .insert(toInsert, { count: "exact" });
    if (insertErr) {
      console.error("[twitch-mods/sync] insert failed:", insertErr);
      return NextResponse.json(
        { ok: false, error: insertErr.message },
        { status: 500 },
      );
    }
    imported = count ?? toInsert.length;
  }

  // Auto-revoke: any currently-active row whose twitch_user_id isn't in
  // the imported set anymore. Guarded by the streamer's setting; flag
  // is OFF (skip revoke) for streamers who demod for testing.
  let revoked = 0;
  if (autoRevoke) {
    const toRevoke = existing.filter(
      (r) =>
        r.status === "active" &&
        r.twitch_user_id !== null &&
        !importedTwitchIds.has(r.twitch_user_id),
    );
    if (toRevoke.length > 0) {
      const ids = toRevoke.map((r) => r.id);
      const { error: revokeErr, count } = await admin
        .from("streamer_mods")
        .update(
          {
            status: "revoked",
            revoked_at: new Date().toISOString(),
            revoked_by_user_id: user.id,
            updated_at: new Date().toISOString(),
          },
          { count: "exact" },
        )
        .in("id", ids);
      if (revokeErr) {
        console.error("[twitch-mods/sync] revoke failed:", revokeErr);
        // Soft-fail — we still imported successfully, just couldn't
        // revoke. Surface the count in the response.
      } else {
        revoked = count ?? toRevoke.length;
      }
    }
  }

  const lastSyncedAt = new Date().toISOString();
  await admin
    .from("users")
    .update({ twitch_mods_last_synced_at: lastSyncedAt })
    .eq("id", user.id);

  const result: SyncResult = { imported, preserved, revoked, lastSyncedAt };
  return NextResponse.json({ ok: true, result });
}
