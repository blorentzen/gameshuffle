/** POST /api/tournament/[id]/quick-join — one-tap registration from a feed
 *  announcement. Server mirror of the public tournament page's handleJoin:
 *  pulls the player's profile (respecting gamertag visibility), enforces
 *  open-status / capacity / verified-only, and inserts a participant row.
 *  Returns the resulting status so the feed card can reflect it inline. */

import { guardError, joinDecision } from "@/lib/events/waitlist";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
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

  const [{ data: mine }, decision] = await Promise.all([
    supabase.from("tournament_participants").select("status").eq("tournament_id", id).eq("user_id", user.id).maybeSingle(),
    joinDecision("tournament", id),
  ]);

  return NextResponse.json({
    ok: true,
    status: t.status as string,
    registered: !!mine,
    registeredStatus: (mine as { status: string } | null)?.status ?? null,
    isOrganizer: t.organizer_id === user.id,
    // Full means a newcomer would land on the waitlist (no seat, or people already waiting).
    full: decision === "waitlist" || decision === "waitlist_full",
    paid: decision === "paid",
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

  // Seat, waitlist or tickets? The database guard enforces the same answer.
  const decision = await joinDecision("tournament", id);
  if (decision === "paid") return NextResponse.json({ error: "paid" }, { status: 409 });
  if (decision !== "seat") return NextResponse.json({ error: "full", canWaitlist: decision === "waitlist" }, { status: 409 });

  const { data: profile } = await supabase
    .from("users")
    .select("display_name, gamertags, gamertag_visibility")
    .eq("id", user.id)
    .maybeSingle();
  const gamertags = (profile?.gamertags as { nso?: string; discord?: string }) || {};
  const vis = (profile?.gamertag_visibility as string) ?? "session_participants";
  const shareTags = vis === "public" || vis === "session_participants";
  const status = t.acceptance_mode === "auto" ? "confirmed" : "registered";

  const { data: joined, error } = await supabase.from("tournament_participants").insert({
    tournament_id: id,
    user_id: user.id,
    display_name: profile?.display_name || (user.user_metadata?.display_name as string) || "Player",
    status,
  }).select("id").maybeSingle();
  if (error) {
    if (error.message.includes("duplicate")) return NextResponse.json({ ok: true, status, already: true });
    const refused = guardError(error.message);
    if (refused === "paid") return NextResponse.json({ error: "paid" }, { status: 409 });
    if (refused) return NextResponse.json({ error: "full", canWaitlist: refused === "waitlist" }, { status: 409 });
    return NextResponse.json({ error: "insert_failed" }, { status: 400 });
  }

  /* Handles go to the private table. `shareTags` already honours the player's
     gamertag visibility; the bug this fixes is that "share" used to mean
     "share with the entire internet", because the participant row is public. */
  if (joined && shareTags && (gamertags.nso || gamertags.discord)) {
    await createServiceClient().from("tournament_participant_contact")
      .upsert({
        participant_id: (joined as { id: string }).id,
        tournament_id: id,
        friend_code: gamertags.nso || null,
        discord_username: gamertags.discord || null,
      }, { onConflict: "participant_id" })
      .then(undefined, () => {});
  }

  return NextResponse.json({ ok: true, status });
}
