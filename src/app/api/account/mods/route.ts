/**
 * GET / POST / DELETE / PATCH /api/account/mods
 *
 *   GET    — list this streamer's mods, grouped by status (active /
 *            invited / pending), plus the user's settings + last sync
 *            timestamp
 *   POST   — manually add a mod by Twitch handle OR Discord user id /
 *            handle. Body: { twitch_login? | discord_user_id? | discord_handle?, display_name? }
 *   DELETE — revoke a mod (body: { id })
 *   PATCH  — update the streamer's mod settings (body:
 *            { auto_revoke_lost_twitch_mods?, allow_mod_code_release? })
 *
 * All routes scope writes to `streamer_user_id = auth.uid()` via RLS;
 * the service-role client is used for cross-row writes (revoke) so we
 * don't have to thread the session client through every call.
 */

import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getUserByLogin } from "@/lib/twitch/client";
import { getValidUserAccessToken } from "@/lib/twitch/userToken";

export const runtime = "nodejs";

interface ModRow {
  id: string;
  gs_user_id: string | null;
  twitch_user_id: string | null;
  discord_user_id: string | null;
  display_name: string;
  status: "pending" | "invited" | "active" | "revoked";
  source: "twitch_auto_import" | "streamer_manual";
  invited_at: string | null;
  invite_token: string | null;
  invite_expires_at: string | null;
  claimed_at: string | null;
  created_at: string;
}

interface ListResponse {
  ok: true;
  mods: {
    active: ModRow[];
    invited: ModRow[];
    pending: ModRow[];
  };
  settings: {
    autoRevokeLostTwitchMods: boolean;
    allowModCodeRelease: boolean;
  };
  twitchModsLastSyncedAt: string | null;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// ---------------------------------------------------------------------------
// GET — list
// ---------------------------------------------------------------------------

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  const admin = createServiceClient();
  const [modsRes, profileRes] = await Promise.all([
    admin
      .from("streamer_mods")
      .select(
        "id, gs_user_id, twitch_user_id, discord_user_id, display_name, status, source, invited_at, invite_token, invite_expires_at, claimed_at, created_at",
      )
      .eq("streamer_user_id", user.id)
      .order("created_at", { ascending: false }),
    admin
      .from("users")
      .select(
        "auto_revoke_lost_twitch_mods, allow_mod_code_release, twitch_mods_last_synced_at",
      )
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  const rows = (modsRes.data as ModRow[] | null) ?? [];
  const profile =
    (profileRes.data as {
      auto_revoke_lost_twitch_mods: boolean | null;
      allow_mod_code_release: boolean | null;
      twitch_mods_last_synced_at: string | null;
    } | null) ?? null;
  const active = rows.filter((r) => r.status === "active");
  const invited = rows.filter((r) => r.status === "invited");
  const pending = rows.filter((r) => r.status === "pending");
  // Revoked rows are not surfaced by default — they're audit-only.
  const body: ListResponse = {
    ok: true,
    mods: { active, invited, pending },
    settings: {
      autoRevokeLostTwitchMods: profile?.auto_revoke_lost_twitch_mods ?? true,
      allowModCodeRelease: profile?.allow_mod_code_release ?? false,
    },
    twitchModsLastSyncedAt: profile?.twitch_mods_last_synced_at ?? null,
  };
  return NextResponse.json(body);
}

// ---------------------------------------------------------------------------
// POST — manual add by Twitch handle / Discord identifier
// ---------------------------------------------------------------------------

interface AddBody {
  twitch_login?: string;
  discord_user_id?: string;
  discord_handle?: string;
  display_name?: string;
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  let body: AddBody;
  try {
    body = (await request.json()) as AddBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }

  const insert: Record<string, unknown> = {
    streamer_user_id: user.id,
    source: "streamer_manual",
  };

  // Twitch path — resolve the handle to a durable twitch_user_id via
  // Helix so renames don't break the row.
  if (body.twitch_login) {
    const login = body.twitch_login.trim().replace(/^@/, "");
    if (!login) {
      return NextResponse.json(
        { ok: false, error: "twitch_login_empty" },
        { status: 400 },
      );
    }
    try {
      const token = await getValidUserAccessToken(user.id);
      const helixUser = await getUserByLogin(login, token);
      if (!helixUser) {
        return NextResponse.json(
          { ok: false, error: "twitch_user_not_found" },
          { status: 404 },
        );
      }
      insert.twitch_user_id = helixUser.id;
      insert.display_name = body.display_name?.trim() || helixUser.display_name;
    } catch (err) {
      console.error("[account/mods] Twitch lookup failed:", err);
      return NextResponse.json(
        { ok: false, error: "twitch_lookup_failed" },
        { status: 502 },
      );
    }
  } else if (body.discord_user_id) {
    // Discord-only mod — we trust the streamer to paste the right id.
    // Discord user ids are numeric strings; light validation only.
    const id = body.discord_user_id.trim();
    if (!/^[0-9]{15,25}$/.test(id)) {
      return NextResponse.json(
        { ok: false, error: "discord_user_id_invalid" },
        { status: 400 },
      );
    }
    insert.discord_user_id = id;
    insert.display_name =
      body.display_name?.trim() || body.discord_handle?.trim() || `Discord user ${id.slice(-4)}`;
  } else {
    return NextResponse.json(
      { ok: false, error: "missing_identity" },
      { status: 400 },
    );
  }

  // Manual-add rows go straight to 'invited' (no 'pending' intermediate
  // step — the streamer added them on purpose, so we can generate the
  // invite token right away).
  insert.status = "invited";
  insert.invited_at = new Date().toISOString();
  insert.invite_token = crypto.randomUUID();
  // 14-day TTL on invite tokens — matches the spec.
  insert.invite_expires_at = new Date(
    Date.now() + 14 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("streamer_mods")
    .insert(insert)
    .select("id, invite_token")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { ok: false, error: "mod_already_exists" },
        { status: 409 },
      );
    }
    console.error("[account/mods] insert failed:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  const row = data as { id: string; invite_token: string };
  return NextResponse.json({
    ok: true,
    id: row.id,
    inviteToken: row.invite_token,
  });
}

// ---------------------------------------------------------------------------
// DELETE — revoke a mod (soft-delete)
// ---------------------------------------------------------------------------

interface DeleteBody {
  id: string;
}

export async function DELETE(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  let body: DeleteBody;
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }
  const admin = createServiceClient();
  const { error } = await admin
    .from("streamer_mods")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by_user_id: user.id,
      updated_at: new Date().toISOString(),
      // Invalidate the invite token if revoking before claim.
      invite_token: null,
    })
    .eq("id", body.id)
    .eq("streamer_user_id", user.id); // belt + suspenders alongside RLS
  if (error) {
    console.error("[account/mods] revoke failed:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// PATCH — update streamer mod settings
// ---------------------------------------------------------------------------

interface SettingsBody {
  auto_revoke_lost_twitch_mods?: boolean;
  allow_mod_code_release?: boolean;
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  let body: SettingsBody;
  try {
    body = (await request.json()) as SettingsBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }
  const updates: Record<string, unknown> = {};
  if (typeof body.auto_revoke_lost_twitch_mods === "boolean") {
    updates.auto_revoke_lost_twitch_mods = body.auto_revoke_lost_twitch_mods;
  }
  if (typeof body.allow_mod_code_release === "boolean") {
    updates.allow_mod_code_release = body.allow_mod_code_release;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }
  const admin = createServiceClient();
  const { error } = await admin.from("users").update(updates).eq("id", user.id);
  if (error) {
    console.error("[account/mods] settings update failed:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
