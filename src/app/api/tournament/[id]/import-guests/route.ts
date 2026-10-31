/**
 * POST /api/tournament/[id]/import-guests  { names: string[] }
 *
 * "Run it as a live tournament" from the free bracket tools: the create form
 * makes the tournament, then adds the tool's players as guests (no account,
 * confirmed, the way the organizer's own Add a guest works). Organizers and
 * co-organizers only, before the event starts, at most 64 names.
 *
 * The seats stop at the event's own limit and, once GS Circuit billing is on,
 * the organizer's plan (the same field size every join path respects); names
 * already in the event are skipped. Returns how many were added and how many
 * didn't fit, with the plan's cap, so the form can say so.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveTournamentCircuit } from "@/lib/tournaments/circuit-resolve";
import { cleanName, MAX_PLAYERS } from "@/lib/brackets/tool";

const SEATED = ["registered", "confirmed", "checked_in", "offered"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Tournament not found." }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { names?: unknown } | null;
  const seen = new Set<string>();
  const names = (Array.isArray(body?.names) ? body.names : [])
    .filter((x): x is string => typeof x === "string")
    .map(cleanName)
    .filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()))
    .slice(0, MAX_PLAYERS);
  if (!names.length) return NextResponse.json({ ok: false, error: "No names to add." }, { status: 400 });

  const admin = createServiceClient();
  const { data: t } = await admin.from("tournaments").select("id, organizer_id, game_slug, created_at, status, max_participants").eq("id", id).maybeSingle();
  if (!t) return NextResponse.json({ ok: false, error: "Tournament not found." }, { status: 404 });
  const row = t as { id: string; organizer_id: string; game_slug: string | null; created_at: string; status: string; max_participants: number | null };
  if (row.organizer_id !== user.id) {
    const { data: co } = await admin.from("tournament_organizers").select("user_id").eq("tournament_id", id).eq("user_id", user.id).maybeSingle();
    if (!co) return NextResponse.json({ ok: false, error: "Only the organizers can add players." }, { status: 403 });
  }
  if (row.status !== "draft" && row.status !== "open") return NextResponse.json({ ok: false, error: "Players can only be added before the tournament starts." }, { status: 409 });

  const { data: existing } = await admin.from("tournament_participants").select("display_name, status").eq("tournament_id", id);
  const people = (existing ?? []) as { display_name: string | null; status: string }[];
  const already = new Set(people.map((p) => (p.display_name ?? "").toLowerCase()));
  const seated = people.filter((p) => SEATED.includes(p.status)).length;

  const circuit = await resolveTournamentCircuit(admin, row);
  const planCap = Number.isFinite(circuit.playerCap) ? circuit.playerCap : null;
  const limit = Math.min(row.max_participants ?? Infinity, planCap ?? Infinity);
  const fresh = names.filter((n) => !already.has(n.toLowerCase()));
  const room = Math.max(0, limit - seated);
  const add = fresh.slice(0, room);

  if (add.length) {
    const { error } = await admin
      .from("tournament_participants")
      .insert(add.map((display_name) => ({ tournament_id: id, user_id: null, display_name, status: "confirmed" })));
    if (error) return NextResponse.json({ ok: false, error: "Couldn't add the players. Try again from the Players tab." }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    added: add.length,
    skipped: names.length - fresh.length,
    left: fresh.length - add.length,
    // Which limit stopped it: the plan's field size, or the event's own max.
    cap: fresh.length > add.length ? (planCap != null && planCap <= (row.max_participants ?? Infinity) ? { kind: "plan", players: planCap } : { kind: "event", players: row.max_participants }) : null,
  });
}
