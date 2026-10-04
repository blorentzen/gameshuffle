/**
 * The draft engine (service role). Two modes on one table:
 *   * 'vote': game-agnostic chat drafts. A pool (src/lib/drafts/pools) supplies
 *     the slots and candidates; each pick is a poll on the polls engine (kind
 *     'draft'), so chat !vote, /live and the overlay all feed one tally.
 *   * 'captains': captains pick players into teams, turn by turn (rules in
 *     src/lib/drafts/captains.ts). Sign-ups ('signup') come first: the session
 *     lobby, `!draft in` and names added by hand.
 * Schema: supabase/stream-drafts-m1.sql.
 *
 * The pick timer needs no dedicated cron: `tickDraft` runs on the reads the
 * overlay and /live already make, the every-minute polls sweep is the backstop,
 * and resolving a pick claims it first (current_poll_id → null) so two readers
 * ticking at once can't both resolve it.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { closePoll, createPoll, getPoll, isPollError, tally } from "@/lib/polls/store";
import { announceToCommunity } from "@/lib/twitch/announce";
import { draftPool } from "@/lib/drafts/pools";
import { draftPoolInfo } from "@/lib/drafts/catalog";
import { withDefaults, type DraftOption, type DraftPick, type DraftRules, type DraftSlot } from "@/lib/drafts/types";
import {
  MAX_ENTRANTS, MAX_TEAMS, MIN_TEAMS, TEAM_NAMES, picksInARow, teamForTurn, undrafted,
  type CaptainTeam, type Entrant, type PickOrder,
} from "@/lib/drafts/captains";

export interface StreamDraft {
  id: string;
  communityId: string;
  poolId: string;
  title: string;
  rules: DraftRules;
  slots: DraftSlot[];
  picks: DraftPick[];
  optionsPerPick: number;
  /** null: no timer (captain mode only). */
  pickSeconds: number | null;
  currentPollId: string | null;
  mode: "vote" | "captains";
  teams: CaptainTeam[];
  entrants: Entrant[];
  pickOrder: PickOrder;
  turn: number;
  turnStartedAt: string | null;
  status: "signup" | "open" | "done" | "cancelled";
  createdAt: string;
  finishedAt: string | null;
}

type Row = {
  id: string; community_id: string; pool_id: string; title: string; rules: DraftRules | null; slots: DraftSlot[];
  picks: DraftPick[] | null; options_per_pick: number; pick_seconds: number | null; current_poll_id: string | null;
  mode: StreamDraft["mode"]; teams: CaptainTeam[] | null; entrants: Entrant[] | null; pick_order: PickOrder; turn: number;
  turn_started_at: string | null; status: StreamDraft["status"]; created_at: string; finished_at: string | null;
};

const COLS = "id, community_id, pool_id, title, rules, slots, picks, options_per_pick, pick_seconds, current_poll_id, mode, teams, entrants, pick_order, turn, turn_started_at, status, created_at, finished_at";
/** A finished draft stays on the overlay and /live this long. */
const SHOW_FINISHED_MS = 30 * 60 * 1000;

/** Thrown when the tables aren't there yet. */
export class DraftsNotReady extends Error {}
function notReady(e: { code?: string; message?: string } | null): boolean {
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));
}

function toDraft(r: Row): StreamDraft {
  return {
    id: r.id, communityId: r.community_id, poolId: r.pool_id, title: r.title, rules: r.rules ?? {}, slots: r.slots ?? [],
    picks: r.picks ?? [], optionsPerPick: r.options_per_pick, pickSeconds: r.pick_seconds, currentPollId: r.current_poll_id,
    mode: r.mode ?? "vote", teams: r.teams ?? [], entrants: r.entrants ?? [], pickOrder: r.pick_order ?? "snake", turn: r.turn ?? 0,
    turnStartedAt: r.turn_started_at, status: r.status, createdAt: r.created_at, finishedAt: r.finished_at,
  };
}

function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export async function getDraft(id: string): Promise<StreamDraft | null> {
  const { data, error } = await createServiceClient().from("stream_drafts").select(COLS).eq("id", id).maybeSingle();
  if (notReady(error)) throw new DraftsNotReady();
  return data ? toDraft(data as Row) : null;
}

/** The running draft, else one that finished recently (so the team stays up). */
export async function getCurrentDraft(communityId: string): Promise<StreamDraft | null> {
  const { data, error } = await createServiceClient().from("stream_drafts").select(COLS)
    .eq("community_id", communityId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (notReady(error)) throw new DraftsNotReady();
  if (!data) return null;
  const d = toDraft(data as Row);
  if (d.status === "open" || d.status === "signup") return d;
  if (d.status === "cancelled") return null;
  return Date.now() - Date.parse(d.finishedAt ?? d.createdAt) < SHOW_FINISHED_MS ? d : null;
}

export type DraftResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface StartDraftInput {
  communityId: string;
  poolId: string;
  rules?: DraftRules | null;
  optionsPerPick?: number;
  pickSeconds?: number;
  createdBy: string | null;
  sessionId?: string | null;
}

export async function startDraft(input: StartDraftInput): Promise<DraftResult<StreamDraft>> {
  const pool = draftPool(input.poolId);
  const info = draftPoolInfo(input.poolId);
  if (!pool || !info) return { ok: false, error: "unknown_pool" };
  const rules = withDefaults(pool, input.rules);
  const slots = pool.slots(rules);
  const optionsPerPick = Math.max(2, Math.min(8, Math.round(input.optionsPerPick ?? 4)));
  const pickSeconds = Math.max(15, Math.min(600, Math.round(input.pickSeconds ?? 45)));
  const { data, error } = await createServiceClient().from("stream_drafts").insert({
    community_id: input.communityId, session_id: input.sessionId ?? null, pool_id: pool.id, title: info.label,
    rules, slots, options_per_pick: optionsPerPick, pick_seconds: pickSeconds, created_by: input.createdBy,
  }).select(COLS).single();
  if (notReady(error)) throw new DraftsNotReady();
  if (error) return { ok: false, error: error.code === "23505" ? "already_open" : "insert_failed" };
  const draft = toDraft(data as Row);
  const opened = await openPick(draft);
  return opened ? { ok: true, value: opened } : { ok: false, error: "no_candidates" };
}

/** Offers the next slot's options as a poll. Finishes the draft if the slots are full or nothing fits. */
async function openPick(draft: StreamDraft): Promise<StreamDraft | null> {
  const pool = draftPool(draft.poolId);
  const slot = draft.slots[draft.picks.length];
  if (!pool || !slot) return finish(draft, "done");
  const offered = shuffle(pool.candidates(slot, draft.rules, draft.picks)).slice(0, draft.optionsPerPick);
  if (offered.length < 2) {
    // The rules left too few options (e.g. no-repeated-types late in a draft): finish with what we have.
    await announceToCommunity(draft.communityId, `The draft ran out of options that fit the rules, so it ends at ${draft.picks.length} of ${draft.slots.length}.`);
    return finish(draft, "done");
  }
  const poll = await createPoll({
    communityId: draft.communityId,
    question: pool.question(slot, draft.picks.length, draft.slots.length),
    options: offered.map((o) => o.label),
    open: true,
    closesAt: new Date(Date.now() + (draft.pickSeconds ?? 45) * 1000).toISOString(),
    kind: "draft",
  });
  if (isPollError(poll)) return null;
  const { data } = await createServiceClient().from("stream_drafts").update({ current_poll_id: poll.id })
    .eq("id", draft.id).eq("status", "open").select(COLS).maybeSingle();
  const list = offered.map((o, i) => `${i + 1}) ${o.label}`).join("  ");
  await announceToCommunity(draft.communityId, `${poll.question}  ${list}  · vote with !vote <number> (${draft.pickSeconds ?? 45}s)`);
  return data ? toDraft(data as Row) : null;
}

async function finish(draft: StreamDraft, status: "done" | "cancelled", picks?: DraftPick[]): Promise<StreamDraft | null> {
  const { data } = await createServiceClient().from("stream_drafts")
    .update({ status, finished_at: new Date().toISOString(), current_poll_id: null, ...(picks ? { picks } : {}) })
    .eq("id", draft.id).select(COLS).maybeSingle();
  const done = data ? toDraft(data as Row) : null;
  if (done && status === "done" && done.mode === "vote" && done.picks.length) {
    await announceToCommunity(draft.communityId, `Draft complete! ${done.title.replace(/ \(.*\)$/, "")}: ${done.picks.map((p) => p.label).join(", ")}.`);
  }
  return done;
}

/**
 * Closes the current pick and adds the winner (most votes; ties and no votes
 * pick at random from the leaders or the offered options), then opens the next.
 * `force` closes it early (!draft next). Returns null if someone else got there first.
 */
export async function resolvePick(draft: StreamDraft, opts: { force?: boolean } = {}): Promise<StreamDraft | null> {
  if (draft.status !== "open" || draft.mode !== "vote" || !draft.currentPollId) return null;
  const pollId = draft.currentPollId;
  const poll = await getPoll(pollId);
  if (!poll) return null;
  const due = poll.status === "closed" || (poll.closesAt ? Date.parse(poll.closesAt) <= Date.now() : false);
  if (!due && !opts.force) return null;

  // Claim the pick so a second reader can't resolve it too.
  const admin = createServiceClient();
  const { data: claimed } = await admin.from("stream_drafts").update({ current_poll_id: null })
    .eq("id", draft.id).eq("status", "open").eq("current_poll_id", pollId).select(COLS).maybeSingle();
  if (!claimed) return null;
  const current = toDraft(claimed as Row);

  await closePoll(pollId);
  const t = await tally(pollId);
  const counts = poll.options.map((o) => t.byOption[o.id] ?? 0);
  const top = Math.max(0, ...counts);
  const leaders = poll.options.filter((_, i) => counts[i] === top);
  const winnerOpt = leaders[Math.floor(Math.random() * leaders.length)];
  const pool = draftPool(current.poolId);
  const slot = current.slots[current.picks.length];
  const found: DraftOption | null = pool && slot ? pool.lookup(slot, winnerOpt.label) : null;
  const pick: DraftPick = { slot: slot?.key ?? `pick-${current.picks.length + 1}`, ...(found ?? { id: winnerOpt.id, label: winnerOpt.label }) };
  const picks = [...current.picks, pick];

  await announceToCommunity(current.communityId, top > 0
    ? `${pick.label} is in! (${top} vote${top === 1 ? "" : "s"}${leaders.length > 1 ? ", won a tie" : ""})`
    : `No votes, so ${pick.label} was picked at random.`);

  if (picks.length >= current.slots.length) return finish(current, "done", picks);
  const { data: saved } = await admin.from("stream_drafts").update({ picks }).eq("id", current.id).select(COLS).maybeSingle();
  if (!saved) return null;
  return (await openPick(toDraft(saved as Row))) ?? toDraft(saved as Row);
}

/** Resolves the current pick if its timer has run out. Returns the up-to-date draft. */
export async function tickDraft(draft: StreamDraft): Promise<StreamDraft> {
  if (draft.status !== "open") return draft;
  if (draft.mode === "captains") return tickCaptains(draft);
  if (!draft.currentPollId) {
    // A pick that failed to open (or a lost race): try again once it's been a moment.
    return (await getDraft(draft.id)) ?? draft;
  }
  return (await resolvePick(draft)) ?? (await getDraft(draft.id)) ?? draft;
}

/** The polls sweep closed this poll: if it's a draft's current pick, move the draft on. */
export async function advanceDraftForPoll(pollId: string): Promise<void> {
  const { data } = await createServiceClient().from("stream_drafts").select(COLS).eq("current_poll_id", pollId).eq("status", "open").maybeSingle();
  if (data) await resolvePick(toDraft(data as Row));
}

export async function cancelDraft(draft: StreamDraft): Promise<StreamDraft | null> {
  if (draft.currentPollId) await closePoll(draft.currentPollId);
  return finish(draft, "cancelled");
}

/** What the overlay and /live show: the team so far and the current vote. */
export interface StreamDraftView {
  id: string;
  poolId: string;
  title: string;
  status: StreamDraft["status"];
  slots: DraftSlot[];
  picks: DraftPick[];
  mode: StreamDraft["mode"];
  /** Captain mode only. Players are shown by name; ids stay on the server. */
  captains: null | {
    teams: { name: string; captain: PublicEntrant; players: PublicEntrant[] }[];
    /** Signed up and not picked yet (during sign-ups: everyone signed up). */
    pool: PublicEntrant[];
    order: PickOrder;
    pickSeconds: number | null;
    onClock: null | { team: number; name: string; captain: string; picks: number; closesAt: string | null };
  };
  current: null | {
    pollId: string;
    question: string;
    options: { id: string; label: string; detail?: string; votes: number }[];
    total: number;
    closesAt: string | null;
  };
}

export interface PublicEntrant { key: string; name: string; source: Entrant["source"] }
const pub = (e: Entrant): PublicEntrant => ({ key: e.key, name: e.name, source: e.source });

function captainsView(d: StreamDraft): StreamDraftView["captains"] {
  const pool = d.status === "signup" ? d.entrants : undrafted(d.entrants, d.teams);
  let onClock: NonNullable<StreamDraftView["captains"]>["onClock"] = null;
  if (d.status === "open" && d.teams.length && pool.length) {
    const team = teamForTurn(d.turn, d.teams.length, d.pickOrder);
    const t = d.teams[team];
    onClock = {
      team, name: t.name, captain: t.captain.name, picks: picksInARow(d.turn, d.teams.length, d.pickOrder, pool.length),
      closesAt: d.pickSeconds && d.turnStartedAt ? new Date(Date.parse(d.turnStartedAt) + d.pickSeconds * 1000).toISOString() : null,
    };
  }
  return {
    teams: d.teams.map((t) => ({ name: t.name, captain: pub(t.captain), players: t.players.map(pub) })),
    pool: pool.map(pub), order: d.pickOrder, pickSeconds: d.pickSeconds, onClock,
  };
}

export async function viewOf(draft: StreamDraft): Promise<StreamDraftView> {
  if (draft.mode === "captains") {
    return { id: draft.id, poolId: draft.poolId, title: draft.title, status: draft.status, slots: [], picks: [], mode: "captains", captains: captainsView(draft), current: null };
  }
  let current: StreamDraftView["current"] = null;
  if (draft.status === "open" && draft.currentPollId) {
    const poll = await getPoll(draft.currentPollId);
    if (poll && poll.status === "open") {
      const t = await tally(poll.id);
      const pool = draftPool(draft.poolId);
      const slot = draft.slots[draft.picks.length];
      current = {
        pollId: poll.id,
        question: poll.question,
        options: poll.options.map((o) => ({ id: o.id, label: o.label, detail: (pool && slot ? pool.lookup(slot, o.label)?.detail : undefined), votes: t.byOption[o.id] ?? 0 })),
        total: t.total,
        closesAt: poll.closesAt,
      };
    }
  }
  return { id: draft.id, poolId: draft.poolId, title: draft.title, status: draft.status, slots: draft.slots, picks: draft.picks, mode: "vote", captains: null, current };
}

/* ------------------------------------------------------------------------ */
/* Captain drafts                                                            */
/* ------------------------------------------------------------------------ */

/** Who's in the active session's lobby (the existing !join), as entrants. */
export async function lobbyEntrants(sessionId: string | null | undefined): Promise<Entrant[]> {
  if (!sessionId) return [];
  const { data } = await createServiceClient().from("session_participants")
    .select("platform, platform_user_id, display_name, metadata").eq("session_id", sessionId).is("left_at", null)
    .order("joined_at", { ascending: true }).limit(MAX_ENTRANTS);
  return ((data ?? []) as { platform: string; platform_user_id: string; display_name: string | null; metadata: { twitch_login?: string } | null }[])
    .filter((p) => p.platform === "twitch")
    .map((p) => ({
      key: `tw:${p.platform_user_id}`, name: p.display_name || p.metadata?.twitch_login || "Player",
      twitchId: p.platform_user_id, twitchLogin: p.metadata?.twitch_login ?? null, userId: null, source: "lobby" as const,
    }));
}

/** Adds new entrants, skipping anyone already in by id or by name (a typed-in "harper" when Harper is in the lobby). */
function mergeEntrants(list: Entrant[], add: Entrant[]): Entrant[] {
  const nameKey = (e: Entrant) => e.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const seen = new Set(list.flatMap((e) => [e.key, `n:${nameKey(e)}`]));
  const out = [...list];
  for (const e of add) {
    if (seen.has(e.key) || seen.has(`n:${nameKey(e)}`) || out.length >= MAX_ENTRANTS) continue;
    seen.add(e.key); seen.add(`n:${nameKey(e)}`); out.push(e);
  }
  return out;
}

/** Opens sign-ups for a captain draft, seeded with the session lobby. */
export async function openSignups(input: { communityId: string; createdBy: string | null; sessionId?: string | null }): Promise<DraftResult<StreamDraft>> {
  const entrants = await lobbyEntrants(input.sessionId);
  const { data, error } = await createServiceClient().from("stream_drafts").insert({
    community_id: input.communityId, session_id: input.sessionId ?? null, mode: "captains", pool_id: "players", title: "Team draft",
    slots: [], entrants, status: "signup", pick_seconds: 30, created_by: input.createdBy,
  }).select(COLS).single();
  if (notReady(error)) throw new DraftsNotReady();
  if (error) return { ok: false, error: error.code === "23505" ? "already_open" : "insert_failed" };
  await announceToCommunity(input.communityId, "📋 Team draft sign-ups are open! Type !draft in to get picked (!draft out to drop).");
  return { ok: true, value: toDraft(data as Row) };
}

/**
 * Changes the entrant list during sign-ups. `turn` isn't used until picking
 * starts, so it doubles as a revision number here: compare-and-set on it (a few
 * retries) so two `!draft in`s landing together don't drop one.
 */
async function editEntrants(draftId: string, change: (list: Entrant[]) => Entrant[] | null): Promise<DraftResult<StreamDraft>> {
  const admin = createServiceClient();
  for (let i = 0; i < 5; i++) {
    const d = await getDraft(draftId);
    if (!d || d.mode !== "captains" || d.status !== "signup") return { ok: false, error: "not_signup" };
    const next = change(d.entrants);
    if (!next) return { ok: true, value: d };
    const { data } = await admin.from("stream_drafts").update({ entrants: next, turn: d.turn + 1 })
      .eq("id", d.id).eq("status", "signup").eq("turn", d.turn).select(COLS).maybeSingle();
    if (data) return { ok: true, value: toDraft(data as Row) };
  }
  return { ok: false, error: "busy" };
}

export function addEntrants(draftId: string, add: Entrant[]): Promise<DraftResult<StreamDraft>> {
  return editEntrants(draftId, (list) => {
    const next = mergeEntrants(list, add);
    return next.length === list.length ? null : next;
  });
}

export function removeEntrant(draftId: string, key: string): Promise<DraftResult<StreamDraft>> {
  return editEntrants(draftId, (list) => (list.some((e) => e.key === key) ? list.filter((e) => e.key !== key) : null));
}

export interface StartCaptainsInput {
  teams: { name?: string; captainKey: string }[];
  order?: PickOrder;
  /** null or 0: no timer. */
  pickSeconds?: number | null;
}

/** Sign-ups → picking. Captains come from the entrants; the rest are the pool. */
export async function startCaptains(draft: StreamDraft, input: StartCaptainsInput): Promise<DraftResult<StreamDraft>> {
  if (draft.mode !== "captains" || draft.status !== "signup") return { ok: false, error: "not_signup" };
  if (input.teams.length < MIN_TEAMS || input.teams.length > MAX_TEAMS) return { ok: false, error: "bad_teams" };
  const byKey = new Map(draft.entrants.map((e) => [e.key, e]));
  const keys = input.teams.map((t) => t.captainKey);
  if (new Set(keys).size !== keys.length || keys.some((k) => !byKey.has(k))) return { ok: false, error: "bad_captains" };
  const teams: CaptainTeam[] = input.teams.map((t, i) => ({
    name: (t.name ?? "").trim().slice(0, 24) || TEAM_NAMES[i], captain: byKey.get(t.captainKey)!, players: [],
  }));
  if (undrafted(draft.entrants, teams).length < 1) return { ok: false, error: "no_players" };
  const secs = input.pickSeconds ? Math.max(15, Math.min(600, Math.round(input.pickSeconds))) : null;
  const order: PickOrder = input.order === "alternate" ? "alternate" : "snake";
  const { data } = await createServiceClient().from("stream_drafts").update({
    teams, pick_order: order, pick_seconds: secs, turn: 0, turn_started_at: new Date().toISOString(), status: "open",
  }).eq("id", draft.id).eq("status", "signup").select(COLS).maybeSingle();
  if (!data) return { ok: false, error: "not_signup" };
  const started = toDraft(data as Row);
  const vs = teams.map((t) => `${t.name}: ${t.captain.name}`).join(" vs ");
  await announceToCommunity(draft.communityId, `📋 Team draft! ${vs}. ${teams[0].captain.name} picks first. Captains pick on the /live page or with !pick <name>${secs ? ` (${secs}s a pick)` : ""}.`);
  return { ok: true, value: started };
}

/**
 * Puts a player on the team on the clock and moves the turn on. Claims the
 * turn (turn = the one we read), so a captain and the timer can't both pick.
 * When one player is left they go to the next team automatically.
 */
export async function pickPlayer(draft: StreamDraft, key: string, how: "captain" | "streamer" | "timer"): Promise<DraftResult<StreamDraft>> {
  if (draft.mode !== "captains" || draft.status !== "open") return { ok: false, error: "not_open" };
  const pool = undrafted(draft.entrants, draft.teams);
  const player = pool.find((e) => e.key === key);
  if (!player) return { ok: false, error: "not_available" };
  const n = draft.teams.length;
  const teams = draft.teams.map((t) => ({ ...t, players: [...t.players] }));
  const ti = teamForTurn(draft.turn, n, draft.pickOrder);
  teams[ti].players.push(player);
  let turn = draft.turn + 1;
  let left = undrafted(draft.entrants, teams);
  let lastOne: { player: Entrant; team: CaptainTeam } | null = null;
  if (left.length === 1) {
    const li = teamForTurn(turn, n, draft.pickOrder);
    teams[li].players.push(left[0]);
    lastOne = { player: left[0], team: teams[li] };
    turn += 1;
    left = [];
  }
  const done = left.length === 0;
  const now = new Date().toISOString();
  const { data } = await createServiceClient().from("stream_drafts").update({
    teams, turn, turn_started_at: now, ...(done ? { status: "done", finished_at: now } : {}),
  }).eq("id", draft.id).eq("status", "open").eq("turn", draft.turn).select(COLS).maybeSingle();
  if (!data) return { ok: false, error: "too_late" };
  const next = toDraft(data as Row);

  const team = teams[ti];
  let msg = how === "timer" ? `⏱️ Time's up: ${team.name} gets ${player.name} at random.` : `${team.name} picks ${player.name}.`;
  if (lastOne) msg += ` ${lastOne.player.name} is the last one left and goes to ${lastOne.team.name}.`;
  if (done) {
    msg += ` Teams are set! ${teams.map((t) => `${t.name}: ${[t.captain, ...t.players].map((p) => p.name).join(", ")}`).join(" | ")}`;
  } else {
    const ni = teamForTurn(turn, n, draft.pickOrder);
    const picks = picksInARow(turn, n, draft.pickOrder, left.length);
    msg += ` ${teams[ni].captain.name}'s up${picks > 1 ? ` (${picks} picks)` : ""}.`;
  }
  await announceToCommunity(draft.communityId, msg);
  return { ok: true, value: next };
}

/** The timer ran out on the captain on the clock: pick someone at random for them. */
async function tickCaptains(draft: StreamDraft): Promise<StreamDraft> {
  if (!draft.pickSeconds || !draft.turnStartedAt) return draft;
  if (Date.parse(draft.turnStartedAt) + draft.pickSeconds * 1000 > Date.now()) return draft;
  const pool = undrafted(draft.entrants, draft.teams);
  if (!pool.length) return draft;
  const r = await pickPlayer(draft, pool[Math.floor(Math.random() * pool.length)].key, "timer");
  return r.ok ? r.value : (await getDraft(draft.id)) ?? draft;
}

/** The team on the clock (captain mode), or undefined. */
export function teamOnClock(draft: StreamDraft): CaptainTeam | undefined {
  if (draft.mode !== "captains" || draft.status !== "open" || !draft.teams.length) return undefined;
  return draft.teams[teamForTurn(draft.turn, draft.teams.length, draft.pickOrder)];
}

/** The polls sweep's backstop: random picks for captains whose timer ran out. */
export async function sweepCaptainTimers(): Promise<void> {
  const { data, error } = await createServiceClient().from("stream_drafts").select(COLS)
    .eq("mode", "captains").eq("status", "open").not("pick_seconds", "is", null).limit(50);
  if (error) return;
  await Promise.all(((data ?? []) as Row[]).map((r) => tickCaptains(toDraft(r)).catch(() => null)));
}
