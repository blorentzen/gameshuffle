/**
 * Tournament deck lists (Pokémon TCG events), and team lists (Pokémon Champions events: every answer carries
 * `kind: "team"`, POST takes { team: [ids], name } and there's no ?view=one; src/lib/tournaments/teamListStore.ts).
 *   GET ?view=mine        the signed-in player's entry and list
 *   GET ?view=organizer   every entrant's list status (organizers)
 *   GET ?view=one&participant=  one entrant's full list (organizers)
 *   GET ?view=public      after the event: the lists the organizer chose to show
 *   POST { deckId } | { name, text }       a player sends or swaps their list
 *   POST { action: "check", participantId, checked }   organizer marks a list checked
 *   POST { action: "remind", participantId }           organizer nudges someone without a list
 * Storage and privacy rules in src/lib/tournaments/deckListStore.ts.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageEvent } from "@/lib/events/attendees";
import { rateLimit } from "@/lib/ratelimit";
import {
  DECK_LIST_ERRORS, deckListDetail, myDeckList, organizerDeckLists, publicDeckLists, remindDeckList, setDeckChecked, submitDeckList,
  type DeckListError,
} from "@/lib/tournaments/deckListStore";
import {
  TEAM_LIST_ERRORS, myTeamList, organizerTeamLists, publicTeamLists, remindTeamList, submitTeamList, tournamentListKind,
  type TeamListError,
} from "@/lib/tournaments/teamListStore";

export const runtime = "nodejs";

const refused = (error: DeckListError) =>
  NextResponse.json({ ok: false, error, message: DECK_LIST_ERRORS[error] }, { status: error === "missing" ? 503 : error === "not_found" || error === "no_deck" ? 404 : 400 });

const refusedTeam = (error: TeamListError, message?: string) =>
  NextResponse.json({ ok: false, kind: "team", error, message: message ?? TEAM_LIST_ERRORS[error] }, { status: error === "missing" ? 503 : error === "not_found" ? 404 : 400 });

async function who(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { userId: user?.id ?? null, canManage: user ? await canManageEvent("tournament", id, user.id) : false };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const v = url.searchParams.get("view") ?? "mine";
  const noStore = { headers: { "Cache-Control": "no-store" } };
  const team = (await tournamentListKind(id)) === "team";
  if (team) return teamGet(id, v, noStore);
  if (v === "public") {
    const r = await publicDeckLists(id);
    if (!r.ok) return refused(r.error);
    return NextResponse.json({ ok: true, public: r.value }, noStore);
  }
  const w = await who(id);
  if (!w.userId) return NextResponse.json({ ok: false, error: "signin", message: "Sign in first." }, { status: 401 });
  if (v === "mine") {
    const r = await myDeckList(id, w.userId);
    if (!r.ok) return refused(r.error);
    return NextResponse.json({ ok: true, mine: r.value }, noStore);
  }
  if (!w.canManage) return NextResponse.json({ ok: false, error: "forbidden", message: "You don't run this tournament." }, { status: 403 });
  if (v === "organizer") {
    const r = await organizerDeckLists(id);
    if (!r.ok) return refused(r.error);
    return NextResponse.json({ ok: true, organizer: r.value }, noStore);
  }
  if (v === "one") {
    const r = await deckListDetail(id, String(url.searchParams.get("participant") ?? ""));
    if (!r.ok) return refused(r.error);
    return NextResponse.json({ ok: true, deck: r.value }, noStore);
  }
  return NextResponse.json({ ok: false, error: "bad_view" }, { status: 400 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const w = await who(id);
  if (!w.userId) return NextResponse.json({ ok: false, error: "signin", message: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "submit");
  if ((await tournamentListKind(id)) === "team") return teamPost(id, w, action, body);
  if (action === "check" || action === "remind") {
    if (!w.canManage) return NextResponse.json({ ok: false, error: "forbidden", message: "You don't run this tournament." }, { status: 403 });
    const participantId = String(body?.participantId ?? "");
    const r = action === "check" ? await setDeckChecked(id, participantId, w.userId, body?.checked !== false) : await remindDeckList(id, participantId);
    if (!r.ok) return refused(r.error);
    return NextResponse.json({ ok: true, sent: r.value });
  }
  const { ok } = await rateLimit(`deck-list:${w.userId}`, { max: 12, windowMs: 60_000 });
  if (!ok) return NextResponse.json({ ok: false, error: "slow_down", message: "Too many tries. Wait a moment." }, { status: 429 });
  const r = await submitDeckList(id, w.userId, { deckId: body?.deckId, name: body?.name, text: body?.text });
  if (!r.ok) return refused(r.error);
  return NextResponse.json({ ok: true, deck: r.value });
}

// ── Team lists (Pokémon Champions) ──────────────────────────────────────────

async function teamGet(id: string, v: string, noStore: { headers: Record<string, string> }) {
  if (v === "public") {
    const r = await publicTeamLists(id);
    if (!r.ok) return refusedTeam(r.error, r.message);
    return NextResponse.json({ ok: true, kind: "team", public: r.value }, noStore);
  }
  const w = await who(id);
  if (!w.userId) return NextResponse.json({ ok: false, kind: "team", error: "signin", message: "Sign in first." }, { status: 401 });
  if (v === "mine") {
    const r = await myTeamList(id, w.userId);
    if (!r.ok) return refusedTeam(r.error, r.message);
    return NextResponse.json({ ok: true, kind: "team", mine: r.value }, noStore);
  }
  if (!w.canManage) return NextResponse.json({ ok: false, kind: "team", error: "forbidden", message: "You don't run this tournament." }, { status: 403 });
  if (v === "organizer") {
    const r = await organizerTeamLists(id);
    if (!r.ok) return refusedTeam(r.error, r.message);
    return NextResponse.json({ ok: true, kind: "team", organizer: r.value }, noStore);
  }
  return NextResponse.json({ ok: false, kind: "team", error: "bad_view" }, { status: 400 });
}

async function teamPost(id: string, w: { userId: string | null; canManage: boolean }, action: string, body: Record<string, unknown> | null) {
  if (!w.userId) return NextResponse.json({ ok: false, kind: "team", error: "signin", message: "Sign in first." }, { status: 401 });
  if (action === "check" || action === "remind") {
    if (!w.canManage) return NextResponse.json({ ok: false, kind: "team", error: "forbidden", message: "You don't run this tournament." }, { status: 403 });
    const participantId = String(body?.participantId ?? "");
    if (action === "check") {
      // The same table and the same mark as a deck list.
      const r = await setDeckChecked(id, participantId, w.userId, body?.checked !== false);
      if (!r.ok) return refused(r.error);
      return NextResponse.json({ ok: true, kind: "team", sent: r.value });
    }
    const r = await remindTeamList(id, participantId);
    if (!r.ok) return refusedTeam(r.error, r.message);
    return NextResponse.json({ ok: true, kind: "team", sent: r.value });
  }
  const { ok } = await rateLimit(`deck-list:${w.userId}`, { max: 12, windowMs: 60_000 });
  if (!ok) return NextResponse.json({ ok: false, kind: "team", error: "slow_down", message: "Too many tries. Wait a moment." }, { status: 429 });
  const r = await submitTeamList(id, w.userId, { team: body?.team, name: body?.name });
  if (!r.ok) return refusedTeam(r.error, r.message);
  return NextResponse.json({ ok: true, kind: "team", team: r.value });
}
