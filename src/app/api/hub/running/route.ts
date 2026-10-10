/**
 * GET /api/hub/running?session=<id>
 *
 * Everything happening on a live stream right now, in one read, for the
 * stream page's control room: the game on stream (so the page can follow a
 * category change), the lobby count, the last roll on screen, and whatever
 * is running (picks and bans, a poll, bingo, a draft, Chat Brain, a
 * prediction, bounties). Only what's running comes back; the page shows a
 * card per item, just in time. Owner only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { getOpenPollForCommunity, tally } from "@/lib/polls/store";
import { getCurrentGame as getBingoGame, doorsOpen, gamePatternLabel } from "@/lib/bingo/stream";
import { getCurrentDraft } from "@/lib/drafts/store";
import { getRunningGame, gameView } from "@/lib/chatbrain/streamGame";
import { rollSlots, rollTitle, rollKind } from "@/lib/twitch/chatRoll";
import type { HubRunning } from "@/lib/hub/types";

export const runtime = "nodejs";


async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const sessionId = new URL(request.url).searchParams.get("session");
  if (!sessionId) return NextResponse.json({ error: "missing_session" }, { status: 400 });

  const admin = createServiceClient();
  const { data: session } = await admin
    .from("gs_sessions")
    .select("id, owner_user_id, active_game, configured_games, config")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.owner_user_id !== user.id) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }

  const communityId = await safe(() => resolveCommunityIdForOwner(user.id), null);

  const [lobbyRes, eventsRes, roundRes] = await Promise.all([
    admin.from("session_participants").select("id", { count: "exact", head: true })
      .eq("session_id", sessionId).is("left_at", null).eq("is_broadcaster", false),
    admin.from("session_events").select("event_type, payload, created_at")
      .eq("session_id", sessionId).in("event_type", ["shuffle", "race_randomized"])
      .order("created_at", { ascending: false }).limit(20),
    admin.from("session_picks_bans_rounds").select("id, game_slug")
      .eq("session_id", sessionId).eq("status", "open").limit(1).maybeSingle(),
  ]);

  // The last thing the streamer rolled in the game on stream now: their own
  // pick, a setup or battle, or a race. Viewers' own rolls and rolls from a
  // game they've since switched away from don't count.
  const configured = (session.configured_games as string[] | null) ?? [];
  const game = (session.active_game as string | null) ?? configured[0] ?? ((session.config as { game?: string } | null)?.game ?? null);
  const RACE_SHORT: Record<string, string> = { mk8dx: "mario-kart-8-deluxe", mkworld: "mario-kart-world" };
  let onScreen: HubRunning["onScreen"] = null;
  for (const e of eventsRes.data ?? []) {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const rolled = e.event_type === "race_randomized"
      ? RACE_SHORT[p.game as string] ?? (p.game as string | undefined)
      : ((p.combo as { game?: string } | null)?.game ?? null);
    if (game && rolled && rolled !== game) continue;
    if (e.event_type === "race_randomized") {
      onScreen = {
        kind: "race",
        track: (p.track_name as string | null) ?? null,
        items: (p.preset_name as string | null) ?? null,
        index: Number(p.series_index ?? 1),
        total: Number(p.series_total ?? 1),
        at: e.created_at as string,
      };
      break;
    }
    if (p.is_broadcaster || rollKind(p.combo) === "setup" || rollKind(p.combo) === "battle") {
      onScreen = {
        kind: "roll",
        who: (p.twitch_display_name as string) ?? (p.display_name as string) ?? "You",
        title: rollTitle(p.combo) ?? null,
        slots: rollSlots(p.combo).slice(0, 12),
        at: e.created_at as string,
      };
      break;
    }
  }

  let picks: HubRunning["picks"] = null;
  if (roundRes.data) {
    const { data: ballots } = await admin.from("session_picks_bans_ballots").select("locked_at").eq("round_id", roundRes.data.id);
    picks = {
      id: roundRes.data.id as string,
      game: roundRes.data.game_slug as string,
      ballots: (ballots ?? []).length,
      locked: (ballots ?? []).filter((b) => b.locked_at).length,
    };
  }

  const empty: HubRunning = {
    activeGame: (session.active_game as string | null) ?? null,
    lobby: lobbyRes.count ?? 0,
    onScreen,
    picks,
    poll: null,
    bingo: null,
    draft: null,
    brain: null,
    market: null,
    bounties: { count: 0, first: null, amount: null },
  };
  if (!communityId) return NextResponse.json(empty);

  const [poll, bingo, draft, brain, market, bounties] = await Promise.all([
    safe(async () => {
      const p = await getOpenPollForCommunity(communityId);
      if (!p || p.kind === "draft") return null;
      const t = await tally(p.id);
      return { id: p.id, question: p.question, votes: t.total, closesAt: p.closesAt };
    }, null),
    safe(async () => {
      const g = await getBingoGame(communityId);
      if (!g) return null;
      return { id: g.id, status: g.status, doors: doorsOpen(g), called: g.called.length, pattern: gamePatternLabel(g), winner: g.winnerName };
    }, null),
    safe(async () => {
      const d = await getCurrentDraft(communityId);
      if (!d || (d.status !== "open" && d.status !== "signup")) return null;
      return { id: d.id, title: d.title, status: d.status, picked: d.picks.length, slots: d.slots.length, mode: d.mode };
    }, null),
    safe(async () => {
      const g = await getRunningGame(communityId);
      if (!g) return null;
      const v = await gameView(g);
      if (!v) return null;
      return { id: g.id, board: v.boardIndex + 1, boards: v.boardCount, question: v.question, strikes: v.strikes, score: v.score };
    }, null),
    safe(async () => {
      const { data } = await admin.from("gs_markets").select("id, question, status, lock_at")
        .eq("community_id", communityId).in("status", ["open", "locked"])
        .order("opened_at", { ascending: false }).limit(1).maybeSingle();
      return data ? { id: data.id as string, question: data.question as string, status: data.status as "open" | "locked", lockAt: (data.lock_at as string | null) ?? null } : null;
    }, null),
    safe(async () => {
      const { data } = await admin.from("gs_bounties").select("description, amount")
        .eq("community_id", communityId).eq("status", "open").order("created_at", { ascending: false }).limit(20);
      const rows = data ?? [];
      return { count: rows.length, first: (rows[0]?.description as string | undefined) ?? null, amount: (rows[0]?.amount as number | undefined) ?? null };
    }, { count: 0, first: null, amount: null }),
  ]);

  return NextResponse.json({ ...empty, poll, bingo, draft, brain, market, bounties } satisfies HubRunning);
}
