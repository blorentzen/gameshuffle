/**
 * Participant contact handles (friend code, Discord) for one tournament.
 *
 * These used to live on `tournament_participants`, which is world-readable, so
 * 633 real friend codes were public. They now live in
 * `tournament_participant_contact` with organizer-and-self RLS, and this is the
 * only way a browser reaches them.
 *
 * GET  organizer (or co-organizer) gets the whole map; a player gets their own
 *      row and nothing else.
 * POST a player records their own handles, subject to their gamertag
 *      visibility, which the client already evaluates on join.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function canManage(id: string, userId: string): Promise<boolean> {
  const svc = createServiceClient();
  const [{ data: t }, { data: co }] = await Promise.all([
    svc.from("tournaments").select("organizer_id").eq("id", id).maybeSingle(),
    svc.from("tournament_organizers").select("user_id").eq("tournament_id", id).eq("user_id", userId).maybeSingle(),
  ]);
  return t?.organizer_id === userId || !!co;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ contacts: {} });

  const svc = createServiceClient();
  const organizer = await canManage(id, user.id);

  let q = svc
    .from("tournament_participant_contact")
    .select("participant_id, friend_code, discord_username")
    .eq("tournament_id", id);

  if (!organizer) {
    // Narrow to this caller's own participant rows. Not an error if they have
    // none: an empty map is the honest answer for a spectator.
    const { data: mine } = await svc
      .from("tournament_participants").select("id").eq("tournament_id", id).eq("user_id", user.id);
    const ids = (mine ?? []).map((r) => r.id as string);
    if (ids.length === 0) return NextResponse.json({ contacts: {} });
    q = q.in("participant_id", ids);
  }

  const { data, error } = await q;
  // Pre-migration the table does not exist; an empty map keeps both pages working.
  if (error) return NextResponse.json({ contacts: {} });

  const contacts: Record<string, { friendCode: string | null; discord: string | null }> = {};
  for (const r of (data ?? []) as { participant_id: string; friend_code: string | null; discord_username: string | null }[]) {
    contacts[r.participant_id] = { friendCode: r.friend_code, discord: r.discord_username };
  }
  return NextResponse.json({ contacts });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { participantId, friendCode, discord } = (await request.json().catch(() => ({}))) as {
    participantId?: string; friendCode?: string | null; discord?: string | null;
  };
  if (!participantId) return NextResponse.json({ error: "Missing participantId" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const svc = createServiceClient();
  // The row must be this caller's, in this tournament. Never trust the id alone.
  const { data: row } = await svc
    .from("tournament_participants").select("id, user_id, tournament_id").eq("id", participantId).maybeSingle();
  if (!row || row.tournament_id !== id || row.user_id !== user.id) {
    return NextResponse.json({ error: "Not your entry" }, { status: 403 });
  }

  if (!friendCode && !discord) return NextResponse.json({ ok: true });

  const { error } = await svc.from("tournament_participant_contact").upsert({
    participant_id: participantId,
    tournament_id: id,
    friend_code: friendCode || null,
    discord_username: discord || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "participant_id" });
  if (error) return NextResponse.json({ error: "not_migrated" }, { status: 503 });
  return NextResponse.json({ ok: true });
}
