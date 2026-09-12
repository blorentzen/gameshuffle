/** POST /api/tournament/[id]/quick-join — one-tap registration from a feed
 *  announcement. Server mirror of the public tournament page's handleJoin:
 *  pulls the player's profile (respecting gamertag visibility), enforces
 *  open-status / capacity / verified-only, and inserts a participant row.
 *  Returns the resulting status so the feed card can reflect it inline. */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isEmailVerified } from "@/lib/auth-utils";

export const runtime = "nodejs";

/** Current registration state for the feed's quick-register button. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: t } = await supabase
    .from("tournaments")
    .select("id, status, max_participants, organizer_id")
    .eq("id", id)
    .maybeSingle();
  if (!t) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [{ data: mine }, { count }] = await Promise.all([
    supabase.from("tournament_participants").select("status").eq("tournament_id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("tournament_participants").select("id", { count: "exact", head: true }).eq("tournament_id", id).neq("status", "dropped"),
  ]);

  return NextResponse.json({
    ok: true,
    status: t.status as string,
    registered: !!mine,
    registeredStatus: (mine as { status: string } | null)?.status ?? null,
    isOrganizer: t.organizer_id === user.id,
    full: t.max_participants ? (count ?? 0) >= t.max_participants : false,
  });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: t } = await supabase
    .from("tournaments")
    .select("id, status, acceptance_mode, max_participants, settings")
    .eq("id", id)
    .maybeSingle();
  if (!t) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (t.status !== "open") return NextResponse.json({ error: "not_open" }, { status: 409 });

  const settings = (t.settings as Record<string, unknown> | null) ?? {};
  if (settings.requireVerified && !isEmailVerified(user)) {
    return NextResponse.json({ error: "verification_required" }, { status: 403 });
  }

  // Already registered? Report it as success so the button lands in the joined state.
  const { data: existing } = await supabase
    .from("tournament_participants")
    .select("status")
    .eq("tournament_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true, status: existing.status, already: true });

  // Capacity check (best-effort; a unique index still guards the actual row).
  if (t.max_participants) {
    const { count } = await supabase
      .from("tournament_participants")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", id)
      .neq("status", "dropped");
    if ((count ?? 0) >= t.max_participants) return NextResponse.json({ error: "full" }, { status: 409 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("display_name, gamertags, gamertag_visibility")
    .eq("id", user.id)
    .maybeSingle();
  const gamertags = (profile?.gamertags as { nso?: string; discord?: string }) || {};
  const vis = (profile?.gamertag_visibility as string) ?? "session_participants";
  const shareTags = vis === "public" || vis === "session_participants";
  const status = t.acceptance_mode === "auto" ? "confirmed" : "registered";

  const { error } = await supabase.from("tournament_participants").insert({
    tournament_id: id,
    user_id: user.id,
    display_name: profile?.display_name || (user.user_metadata?.display_name as string) || "Player",
    friend_code: shareTags ? (gamertags.nso || null) : null,
    discord_username: shareTags ? (gamertags.discord || null) : null,
    status,
  });
  if (error) {
    if (error.message.includes("duplicate")) return NextResponse.json({ ok: true, status, already: true });
    return NextResponse.json({ error: "insert_failed" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, status });
}
