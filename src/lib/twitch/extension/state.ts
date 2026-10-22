import "server-only";

/**
 * What the Twitch extension shows, from the same game code /live and the
 * overlay use (no game logic of its own). Two parts:
 *
 *   publicState(channel)  what's running on the channel right now, the same
 *                         for every viewer (so it caches): the poll, Stream
 *                         Bingo, the trivia night, a break game, Chat Brain,
 *                         a Chat Draft, a picks and bans round; when nothing
 *                         is running, the channel's leaderboard.
 *   myState(channel, v)   one viewer's part: tokens, their vote, bingo card,
 *                         answers, captain turn, ballot.
 *
 * Each game reads on its own and a failure leaves only that game out.
 * Predictions are deliberately not here (Twitch's rules; the picks said no).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { getOpenPollForCommunity, tally } from "@/lib/polls/store";
import type { Poll, PollTally } from "@/lib/polls/types";
import { getCard, getCurrentGame, tickAuto, viewOf as bingoViewOf, type StreamBingoView } from "@/lib/bingo/stream";
import { liveStreamGame, overlayTrivia, streamView, type TriviaStreamView } from "@/lib/trivia/stream";
import { breakView, getShowable, myAnswer, tickBreak } from "@/lib/break/store";
import type { BreakView } from "@/lib/break/types";
import { brainLiveView, type BrainLiveView } from "@/lib/chatbrain/live";
import { DraftsNotReady, getCurrentDraft, teamOnClock, tickDraft, viewOf as draftViewOf, type StreamDraftView } from "@/lib/drafts/store";
import { isCaptainOnClock } from "@/lib/drafts/captains";
import { getActiveSessionForOwner } from "@/lib/sessions/service";
import { listTracksForGame, type RaceGame } from "@/lib/randomizers/race";
import { getLeaderboard, type LeaderboardRow } from "@/lib/economy/leaderboards";
import { getBalance } from "@/lib/economy/tokens";
import { loadRecapForStreamer } from "@/lib/sessions/recap";
import { nextStreamOccurrence, resolveStreamSchedule } from "@/lib/schedule/streamSchedule";
import type { ExtChannel } from "./context";
import type { ExtViewer } from "./viewer";

export interface ExtPicks {
  roundId: string;
  game: string;
  /** Every track the viewer can pick or ban (names from our race data). */
  tracks: { id: string; name: string }[];
  locked: number;
  topPicks: { id: string; name: string; count: number }[];
  topBans: { id: string; name: string; count: number }[];
}

export interface ExtPublicState {
  channel: { name: string; slug: string | null; connected: boolean; pro: boolean; live: boolean };
  poll: { poll: Poll; tally: PollTally } | null;
  bingo: StreamBingoView | null;
  trivia: TriviaStreamView | null;
  brk: BreakView | null;
  brain: Omit<BrainLiveView, "you"> | null;
  draft: StreamDraftView | null;
  picks: ExtPicks | null;
  /** The channel's leaderboard, only when nothing is running. */
  leaderboard: LeaderboardRow[] | null;
  at: string;
}

export interface ExtMyState {
  name: string;
  tokens: number;
  pollVote: string | null;
  bingoCard: number[] | null;
  trivia: TriviaStreamView["you"];
  brk: string | null;
  brain: BrainLiveView["you"];
  captainOnClock: boolean;
  ballot: { picks: string[]; bans: string[]; locked: boolean } | null;
}

const RACE_GAMES: Record<string, RaceGame> = { "mario-kart-8-deluxe": "mk8dx", "mario-kart-world": "mkworld" };

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof DraftsNotReady)) console.error(`[twitch-ext] ${label} read failed:`, err);
    return null;
  }
}

async function readPicks(ownerUserId: string): Promise<ExtPicks | null> {
  const session = await getActiveSessionForOwner(ownerUserId);
  if (!session) return null;
  const svc = createServiceClient();
  const { data: rows } = await svc.from("session_picks_bans_rounds").select("id, game_slug").eq("session_id", session.id).eq("status", "open")
    .order("opened_at", { ascending: false }).limit(1);
  const open = (rows ?? [])[0] as { id: string; game_slug: string } | undefined;
  const race = open ? RACE_GAMES[open.game_slug] : undefined;
  if (!open || !race) return null;
  const tracks = listTracksForGame(race).map((t) => ({ id: t.id, name: t.name }));
  const nameOf = new Map(tracks.map((t) => [t.id, t.name]));
  const { data: ballots } = await svc.from("session_picks_bans_ballots").select("locked_at, picks_tracks, bans_tracks").eq("round_id", open.id);
  const list = (ballots ?? []) as { locked_at: string | null; picks_tracks: string[] | null; bans_tracks: string[] | null }[];
  const count = (field: "picks_tracks" | "bans_tracks") => {
    const m = new Map<string, number>();
    for (const b of list) for (const id of b[field] ?? []) m.set(id, (m.get(id) ?? 0) + 1);
    return [...m].filter(([id]) => nameOf.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, c]) => ({ id, name: nameOf.get(id)!, count: c }));
  };
  return { roundId: open.id, game: open.game_slug, tracks, locked: list.filter((b) => b.locked_at).length, topPicks: count("picks_tracks"), topBans: count("bans_tracks") };
}

const publicCache = new Map<string, { at: number; value: ExtPublicState }>();

/** What's running on the channel (cached 1.5 seconds per channel; every viewer's card asks). */
export async function publicState(ch: ExtChannel): Promise<ExtPublicState> {
  const hit = publicCache.get(ch.broadcasterId);
  if (hit && Date.now() - hit.at < 1500) return hit.value;
  const channel = { name: ch.name, slug: ch.slug, connected: !!ch.communityId, pro: ch.pro, live: ch.live };
  const empty: ExtPublicState = { channel, poll: null, bingo: null, trivia: null, brk: null, brain: null, draft: null, picks: null, leaderboard: null, at: new Date().toISOString() };
  if (!ch.communityId || !ch.ownerUserId) return empty;
  const communityId = ch.communityId, owner = ch.ownerUserId;

  const [poll, bingo, trivia, brk, brain, draft, picks] = await Promise.all([
    safe("poll", async () => {
      const p = await getOpenPollForCommunity(communityId);
      return p && p.kind !== "draft" ? { poll: p, tally: await tally(p.id) } : null;
    }),
    safe("bingo", async () => {
      const g = await getCurrentGame(communityId);
      return g ? bingoViewOf(await tickAuto(g)) : null;
    }),
    safe("trivia", async () => {
      const live = await liveStreamGame(owner);
      return live ? streamView(live, null) : overlayTrivia(owner);
    }),
    safe("break", async () => {
      const run = await getShowable(communityId);
      return run ? breakView(run.status === "running" ? await tickBreak(run) : run) : null;
    }),
    safe("brain", async () => {
      const v = await brainLiveView(communityId, null);
      return v.game || v.survey ? { game: v.game, survey: v.survey, open: v.open } : null;
    }),
    safe("draft", async () => {
      const d = await getCurrentDraft(communityId);
      return d ? draftViewOf(await tickDraft(d)) : null;
    }),
    safe("picks", () => readPicks(owner)),
  ]);
  const idle = !poll && !bingo && !trivia && !brk && !brain && !draft && !picks;
  const leaderboard = idle ? await safe("leaderboard", () => getLeaderboard({ kind: "combined", communityId, limit: 5 })) : null;
  const value: ExtPublicState = { channel, poll, bingo, trivia, brk, brain, draft, picks, leaderboard, at: new Date().toISOString() };
  publicCache.set(ch.broadcasterId, { at: Date.now(), value });
  if (publicCache.size > 2000) publicCache.delete(publicCache.keys().next().value!);
  return value;
}

/** The viewer's own part of what's running. Read-only: no wallet or identity is made just by looking. */
export async function myState(ch: ExtChannel, v: ExtViewer, now: ExtPublicState): Promise<ExtMyState> {
  const svc = createServiceClient();
  const { data: ident } = await svc.from("gs_identities").select("id").eq("platform", "twitch").eq("platform_id", v.viewer).maybeSingle();
  const identityId = (ident as { id: string } | null)?.id ?? null;
  const holder = v.accountUserId ? { userId: v.accountUserId } : identityId ? { identityId } : null;
  const brainViewer = { platform: "twitch" as const, viewer: v.viewer, name: v.name };

  const [tokens, pollVote, bingoCard, trivia, brk, brain, ballot] = await Promise.all([
    identityId ? safe("tokens", () => getBalance(identityId)) : Promise.resolve(0),
    now.poll && identityId ? safe("vote", async () => {
      const { data } = await svc.from("gs_poll_votes").select("option_id").eq("poll_id", now.poll!.poll.id).eq("gs_identity_id", identityId).maybeSingle();
      return (data as { option_id: string } | null)?.option_id ?? null;
    }) : Promise.resolve(null),
    now.bingo && holder ? safe("card", () => getCard(now.bingo!.id, holder)) : Promise.resolve(null),
    now.trivia && ch.ownerUserId ? safe("trivia-you", async () => {
      const live = await liveStreamGame(ch.ownerUserId!);
      return live ? (await streamView(live, { platform: "twitch", id: v.viewer, name: v.name })).you : null;
    }) : Promise.resolve(null),
    now.brk?.phase === "open" && ch.communityId ? safe("break-you", async () => {
      const run = await getShowable(ch.communityId!);
      return run ? myAnswer(run, "twitch", v.viewer) : null;
    }) : Promise.resolve(null),
    now.brain && ch.communityId ? safe("brain-you", async () => (await brainLiveView(ch.communityId!, brainViewer)).you) : Promise.resolve(null),
    now.picks ? safe("ballot", async () => {
      const { data } = await svc.from("session_picks_bans_ballots").select("picks_tracks, bans_tracks, locked_at").eq("round_id", now.picks!.roundId).eq("viewer_twitch_user_id", v.viewer).maybeSingle();
      const b = data as { picks_tracks: string[] | null; bans_tracks: string[] | null; locked_at: string | null } | null;
      return b ? { picks: b.picks_tracks ?? [], bans: b.bans_tracks ?? [], locked: !!b.locked_at } : null;
    }) : Promise.resolve(null),
  ]);

  let captainOnClock = false;
  if (now.draft?.mode === "captains" && now.draft.status === "open" && ch.communityId) {
    const d = await safe("draft-you", () => getCurrentDraft(ch.communityId!));
    if (d) captainOnClock = isCaptainOnClock(teamOnClock(d), { userId: v.accountUserId, twitchId: v.viewer });
  }
  return { name: v.name, tokens: tokens ?? 0, pollVote: pollVote ?? null, bingoCard: bingoCard ?? null, trivia: trivia ?? null, brk: brk ?? null, brain: brain ?? null, captainOnClock, ballot: ballot ?? null };
}

// ── The panel under the stream (shows offline too) ───────────────────────────


export interface ExtPanelState {
  channel: ExtPublicState["channel"];
  leaderboard: LeaderboardRow[];
  /** The next scheduled stream (ISO), with its title when the streamer named it. */
  next: { at: string; title: string | null } | null;
  /** Last stream's recap in a few plain lines. */
  recap: { endedAt: string; lines: string[] } | null;
}

const panelCache = new Map<string, { at: number; value: ExtPanelState }>();

export async function panelState(ch: ExtChannel): Promise<ExtPanelState> {
  const hit = panelCache.get(ch.broadcasterId);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  const channel = { name: ch.name, slug: ch.slug, connected: !!ch.communityId, pro: ch.pro, live: ch.live };
  if (!ch.communityId || !ch.ownerUserId) return { channel, leaderboard: [], next: null, recap: null };
  const owner = ch.ownerUserId;
  const [leaderboard, schedule, recap] = await Promise.all([
    safe("panel-board", () => getLeaderboard({ kind: "combined", communityId: ch.communityId!, limit: 5 })),
    safe("panel-schedule", async () => {
      const { data } = await createServiceClient().from("users").select("stream_schedule").eq("id", owner).maybeSingle();
      return resolveStreamSchedule((data as { stream_schedule: unknown } | null)?.stream_schedule);
    }),
    safe("panel-recap", () => loadRecapForStreamer(owner)),
  ]);
  const occ = schedule ? nextStreamOccurrence(schedule) : null;
  const lines: string[] = [];
  if (recap) {
    if (recap.participantCount) lines.push(`${recap.participantCount} ${recap.participantCount === 1 ? "viewer" : "viewers"} played along`);
    if (recap.raceCount) lines.push(`${recap.raceCount} ${recap.raceCount === 1 ? "race" : "races"} rolled`);
    if (recap.breaks.count) lines.push(`${recap.breaks.count} ${recap.breaks.count === 1 ? "break" : "breaks"}${recap.breaks.champion ? `, champion ${recap.breaks.champion}` : ""}`);
    if (recap.roundsOpened) lines.push(`${recap.roundsOpened} ${recap.roundsOpened === 1 ? "round" : "rounds"} of picks and bans`);
  }
  const value: ExtPanelState = {
    channel,
    leaderboard: leaderboard ?? [],
    next: occ ? { at: occ.at.toISOString(), title: occ.slot.title ?? null } : null,
    recap: recap ? { endedAt: recap.endedAt, lines } : null,
  };
  panelCache.set(ch.broadcasterId, { at: Date.now(), value });
  if (panelCache.size > 2000) panelCache.delete(panelCache.keys().next().value!);
  return value;
}
