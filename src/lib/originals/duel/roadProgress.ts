import "server-only";

/**
 * Trainer Road's path, server side (phase 2 step 1, picks 2026-10-23,
 * https://claude.ai/artifact/6Bbdmob4u66QwdHdnxFaoC; tables from supabase/trainer-road-m2.sql; rules
 * in roadPath.ts). Accounts only: guests play free play.
 *
 * Everything a player earns is a row in road_ledger with its own key, so a badge, a League or a
 * region pays once however often a duel is replayed; XP is the ledger's sum. road_league keeps where a
 * player is in each region's League. A finished duel (roadStore.ts roadAct) runs applyRunToPath:
 * the first win against each team each month earns XP, and a win against the next trainer on your
 * path earns its milestone (badge, League step, League, region) with XP and tokens (earn_road). Every
 * number is a lever (gs_economy_config road_*). Missing tables (before the migration) leave the path
 * out quietly.
 *
 * Road encounters (picks 2026-10-24, supabase/trainer-road-m3.sql, rules in roadEncounters.ts): a
 * villain team turns up after a path win (a region's story battle when its Gym is next, else a grunt
 * now and then after a badge), swipes some tokens (gs_road_encounter_open, one step under the wallet's
 * locks) and blocks the next trainer on the path until it's beaten. Beating it gives the tokens back
 * with a reward and XP; a story battle adds its villain team's mark to the card.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { gsDay } from "@/lib/time/gsClock";
import { ensureAccountWallet } from "@/lib/economy/accountWallet";
import { describePlayers } from "@/lib/daily/boards";
import { DUEL_DATA } from "./data";
import { personOf } from "./rules";
import { regionOf, roadMonth, roadPath, roadRegion, ROAD_REGIONS } from "./road";
import { personPicture, roadMap } from "./roadPages";
import {
  CARD_COLOR_LABEL, CHAMPION_KEY, ROAD_LEVER_DEFAULTS, ROAD_PATHS, badgeKey, encounterKey, hardKey, judgePath, leagueKey, levelOf, markKey, nextStep, outcomeRewards,
  pathSpot, progressFrom, regionKey, regionPath, stepState, winKey, winXp,
  type LedgerRow, type PathKind, type PathOutcome, type RoadLevers, type RoadProgress,
} from "./roadPath";
import { gruntAfter, markNames, setCause, setDue, villainTeamOf } from "./roadEncounters";
import { giveTools, toolsReady } from "./roadTools";
import { TOOLS, badgeTools, leagueTools, regionTools, rewardTool } from "./tools";
import type { DuelTier, DuelTrainer, ToolId } from "./types";
import type { DuelPicture } from "./view";
import type { RoadEncounterView, RoadNextView, RoadPathResult, RoadPathView, RoadProgressView, RoadStepView } from "./roadView";

type DbError = { code?: string; message?: string } | null;
const missing = (e: DbError) => !!e && (["42P01", "PGRST205", "42703", "PGRST204", "PGRST202"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? ""));
const duplicate = (e: DbError) => !!e && (e.code === "23505" || /duplicate key/i.test(e.message ?? ""));

// ─── levers ──────────────────────────────────────────────────────────────────

let leverCache: { v: RoadLevers; at: number } | null = null;

/** The road's numbers as last read (the defaults before the first read): for code that can't wait, like a run's setup. */
export const cachedLevers = (): RoadLevers => leverCache?.v ?? ROAD_LEVER_DEFAULTS;

/** The road's numbers from gs_economy_config (cached a minute), the defaults where a row is missing. */
export async function roadLevers(): Promise<RoadLevers> {
  if (leverCache && Date.now() - leverCache.at < 60_000) return leverCache.v;
  const { data } = await createServiceClient().from("gs_economy_config").select("key, value").like("key", "road_%");
  const m = new Map(((data ?? []) as { key: string; value: number }[]).map((r) => [r.key, Number(r.value)]));
  const n = (k: string, d: number) => { const v = m.get(k); return v != null && Number.isFinite(v) && v >= 0 ? v : d; };
  const D = ROAD_LEVER_DEFAULTS;
  const v: RoadLevers = {
    xpWin: {
      gym: n("road_xp_gym", D.xpWin.gym), rival: n("road_xp_rival", D.xpWin.rival), elite: n("road_xp_elite", D.xpWin.elite), boss: n("road_xp_boss", D.xpWin.boss),
      champion: n("road_xp_champion", D.xpWin.champion), grunt: n("road_xp_grunt", D.xpWin.grunt), admin: n("road_xp_admin", D.xpWin.admin),
    },
    xpEndgame: n("road_xp_endgame", D.xpEndgame),
    xpStar: n("road_xp_star", D.xpStar),
    xpHardPercent: n("road_xp_hard_percent", D.xpHardPercent),
    xpBadge: n("road_xp_badge", D.xpBadge),
    xpLeague: n("road_xp_league", D.xpLeague),
    xpRegion: n("road_xp_region", D.xpRegion),
    tokensBadge: n("road_badge_tokens", D.tokensBadge),
    tokensLeague: n("road_league_tokens", D.tokensLeague),
    tokensRegion: n("road_region_tokens", D.tokensRegion),
    tokensChampion: n("road_champion_tokens", D.tokensChampion),
    encounterSwipe: n("road_encounter_swipe", D.encounterSwipe),
    encounterTokens: n("road_encounter_tokens", D.encounterTokens),
    xpEncounter: n("road_xp_encounter", D.xpEncounter),
    encounterChance: Math.min(100, n("road_encounter_chance", D.encounterChance)),
    prize: Object.fromEntries(Object.entries(D.prize).map(([k, v]) => [k, n(`road_prize_${k}`, v)])) as RoadLevers["prize"],
    toolPrice: Object.fromEntries(Object.entries(D.toolPrice).map(([k, v]) => [k, n(`road_tool_price_${k}`, v)])) as RoadLevers["toolPrice"],
    bagMax: Math.max(1, n("road_bag_max", D.bagMax)),
    toolsDuel: Math.min(5, n("road_tools_duel", D.toolsDuel)),
  };
  leverCache = { v, at: Date.now() };
  return v;
}

// ─── reading progress ────────────────────────────────────────────────────────

/** An account's progress, or null when the tables aren't there yet. */
export async function readProgress(userId: string): Promise<RoadProgress | null> {
  const svc = createServiceClient();
  const [ledger, league] = await Promise.all([
    svc.from("road_ledger").select("key, kind, region, team_id, xp, tokens, at").eq("user_id", userId),
    svc.from("road_league").select("region, step").eq("user_id", userId),
  ]);
  if (ledger.error || league.error) {
    if (!missing(ledger.error) && !missing(league.error)) console.error("[road] progress read failed:", ledger.error ?? league.error);
    return null;
  }
  const steps = Object.fromEntries(((league.data ?? []) as { region: string; step: number }[]).map((r) => [r.region, r.step]));
  return progressFrom((ledger.data ?? []) as LedgerRow[], steps);
}

// ─── names and pictures from the roster ──────────────────────────────────────

const byId = new Map(DUEL_DATA.trainers.map((t) => [t.id, t]));
const regionName = (slug: string) => roadRegion(slug)?.name ?? slug;

/** A team's person, page and picture (its page is in the team's own region: Red's HeartGold team is Kanto's). */
function teamFace(teamId: string): { person: string; name: string; href: string; picture: DuelPicture | null } {
  const t = byId.get(teamId) as DuelTrainer;
  const region = regionOf(t) ?? "kanto";
  const person = personOf(t);
  const p = roadMap().get(region)?.find((x) => x.slug === person);
  return { person, name: t.name, href: `${roadPath(region, person)}?team=${teamId}`, picture: p ? personPicture(p) : null };
}

const gymWord = (region: string) => (region === "alola" ? "grand trial" : "badge");

function stepLabel(region: string, kind: PathKind, index: number, name: string): string {
  const p = regionPath(region)!;
  if (kind === "gym") return `${name}'s ${gymWord(region)}`;
  if (kind === "league") return index === p.league.length - 1 && region !== "galar" ? "The Champion" : `Challenge ${index + 1} of ${p.league.length}`;
  return "The end-game battle";
}

function nextView(progress: RoadProgress | null): RoadNextView | null {
  const n = nextStep(progress);
  if (!n) return null;
  const p = regionPath(n.region)!;
  const face = teamFace(n.team);
  const label = n.kind === "gym" ? `${face.name}'s ${gymWord(n.region)}, ${n.index + 1} of ${p.gyms.length}`
    : n.kind === "league" ? `${p.leagueLabel}, challenge ${n.index + 1} of ${p.league.length}`
    : `The end-game battle, to clear ${regionName(n.region)}`;
  return { team: n.team, region: n.region, regionName: regionName(n.region), name: face.name, href: face.href, kind: n.kind, label, picture: face.picture };
}

/** A region's path with this player's place on it (null progress = signed out or a new player). */
export function pathView(region: string, progress: RoadProgress | null): RoadPathView | null {
  const p = regionPath(region);
  if (!p) return null;
  const i = ROAD_PATHS.findIndex((x) => x.region === region);
  const r = progress?.regions.find((x) => x.region === region);
  const step = (team: string, kind: PathKind, index: number): RoadStepView => {
    const face = teamFace(team);
    return { team, ...face, kind, index, state: stepState(progress, team)?.state ?? "locked", label: stepLabel(region, kind, index, face.name) };
  };
  return {
    region, regionName: regionName(region), game: p.game, leagueLabel: p.leagueLabel, gymWord: gymWord(region),
    open: r?.open ?? i === 0, cleared: r?.cleared ?? false, openedBy: i > 0 ? regionName(ROAD_PATHS[i - 1].region) : null,
    gyms: p.gyms.map((t, k) => step(t, "gym", k)),
    league: p.league.map((t, k) => step(t, "league", k)),
    leagueStep: r?.leagueStep ?? 0, leagueDone: r?.leagueDone ?? false,
    endgame: step(p.endgame, "endgame", 0),
  };
}

/** An account's trainer card and path (null when they haven't earned anything yet, or before the migration). */
export async function roadProgressView(userId: string, opts: { always?: boolean } = {}): Promise<RoadProgressView | null> {
  const progress = await readProgress(userId);
  if (!progress) return null;
  if (!opts.always && progress.xp === 0 && progress.badges === 0) return null;
  const svc = createServiceClient();
  const month = roadMonth(gsDay());
  const [people, best] = await Promise.all([
    describePlayers([`u:${userId}`]),
    svc.from("road_best").select("stars").eq("player", `u:${userId}`).eq("month", month),
  ]);
  const who = people.get(`u:${userId}`);
  const lv = levelOf(progress.xp);
  const [open, levers] = await Promise.all([openEncounterOf(userId), roadLevers()]);
  return {
    name: who?.name || "Trainer",
    avatar: who?.avatar ?? null,
    profile: who?.profile ?? null,
    xp: progress.xp, level: lv.level, into: lv.into, need: lv.need,
    color: progress.color, colorLabel: CARD_COLOR_LABEL[progress.color],
    badges: progress.badges, regionsCleared: progress.regionsCleared, trainersBeaten: progress.trainersBeaten,
    starsThisMonth: ((best.data ?? []) as { stars: number }[]).reduce((s, r) => s + (r.stars ?? 0), 0),
    startedAt: progress.startedAt, champion: progress.champion,
    regions: progress.regions.map((r) => {
      const p = regionPath(r.region)!;
      return { region: r.region, name: regionName(r.region), open: r.open, cleared: r.cleared, badges: r.badges.length, gyms: p.gyms.length, leagueStep: r.leagueStep, leagueSize: p.league.length, leagueDone: r.leagueDone, endgameHard: r.endgameHard };
    }),
    next: nextView(progress),
    encounter: open ? encounterView(open, levers) : null,
    marks: markNames(progress).map((m) => ({ region: m.region, name: m.name, picture: villainPicture(m.region, m.person) })),
  };
}

// ─── road encounters ─────────────────────────────────────────────────────────

interface EncounterRow {
  id: string; region: string; team_id: string; kind: "set" | "grunt"; blocks: string; cause: string; swiped: number; status: "open" | "beaten"; created_at: string;
}
const ENC_COLS = "id, region, team_id, kind, blocks, cause, swiped, status, created_at";

/** The account's villain team on the road right now (null when there's none, or before the migration). */
export async function openEncounterOf(userId: string): Promise<EncounterRow | null> {
  const { data, error } = await createServiceClient().from("road_encounters").select(ENC_COLS).eq("user_id", userId).eq("status", "open").maybeSingle();
  if (error) { if (!missing(error)) console.error("[road] encounter read failed:", error); return null; }
  return (data as EncounterRow | null) ?? null;
}

/** A villain team's picture in a region (its person's own card). */
function villainPicture(region: string, person: string): DuelPicture | null {
  const p = roadMap().get(region)?.find((x) => x.slug === person);
  return p ? personPicture(p) : null;
}

function encounterView(e: EncounterRow, levers: RoadLevers): RoadEncounterView {
  const face = teamFace(e.team_id);
  const blocked = teamFace(e.blocks);
  const spot = pathSpot(e.blocks);
  const vt = villainTeamOf(e.team_id);
  return {
    id: e.id, kind: e.kind, region: e.region, regionName: regionName(e.region), team: e.team_id, name: face.name, villain: vt?.name ?? face.name,
    place: byId.get(e.team_id)?.place ?? null, href: face.href, picture: face.picture, swiped: e.swiped, reward: levers.encounterTokens,
    blocks: { team: e.blocks, name: blocked.name, href: blocked.href, label: spot ? stepLabel(spot.region, spot.kind, spot.index, blocked.name) : blocked.name },
  };
}

/**
 * Opens an encounter: one step in the database that refuses a second open one, lands each cause once
 * and swipes up to the lever's tokens. Null when nothing new turned up (or before the migration).
 */
async function openEncounter(userId: string, a: { region: string; team: string; kind: "set" | "grunt"; blocks: string; cause: string }, levers: RoadLevers): Promise<EncounterRow | null> {
  const wallet = (await ensureAccountWallet(userId))?.identityId;
  if (!wallet) return null;
  const { data, error } = await createServiceClient().rpc("gs_road_encounter_open", {
    p_user_id: userId, p_identity_id: wallet, p_region: a.region, p_team_id: a.team, p_kind: a.kind, p_blocks: a.blocks, p_cause: a.cause,
    p_take: Math.max(0, Math.round(levers.encounterSwipe)),
  });
  if (error) { if (!missing(error)) console.error("[road] encounter open failed:", error); return null; }
  const r = data as { ok?: boolean; id?: string; new?: boolean } | null;
  if (!r?.ok || !r.new) return null;
  return openEncounterOf(userId);
}

/** Whether a cause already turned up for this account (a region's story battle comes once). */
async function hasCause(userId: string, cause: string): Promise<boolean> {
  const { data, error } = await createServiceClient().from("road_encounters").select("id").eq("user_id", userId).eq("cause", cause).maybeSingle();
  return !!data || (!!error && missing(error));
}

/**
 * A region's story battle due on this account's path (its Gym is next) turns up when the player looks
 * at their road, so a road already at that Gym when encounters arrived still meets it. Own views only:
 * the profile page never calls this.
 */
export async function ensureSetEncounter(userId: string, progress: RoadProgress | null): Promise<void> {
  const n = nextStep(progress);
  const due = setDue(n);
  if (!due || !n) return;
  if ((await openEncounterOf(userId)) || (await hasCause(userId, setCause(due.region)))) return;
  await openEncounter(userId, { region: due.region, team: due.team, kind: "set", blocks: n.team, cause: setCause(due.region) }, await roadLevers());
}

/** Gives back what an encounter swiped (once; the refund's key is the encounter). */
async function giveBack(userId: string, e: EncounterRow): Promise<number> {
  if (e.swiped <= 0) return 0;
  const wallet = (await ensureAccountWallet(userId))?.identityId;
  if (!wallet) return 0;
  const { error } = await createServiceClient().from("token_events").insert({
    identity_id: wallet, community_id: null, amount: e.swiped, type: "refund", meta: { source: "trainer_road", encounter: e.id }, idempotency_key: `road:back:${e.id}`,
  });
  if (error) { if (!duplicate(error)) console.error("[road] encounter refund failed:", error); return 0; }
  return e.swiped;
}

/** Beats an open encounter once: the tokens back, the reward and XP, and a story battle's mark. Null when it was already beaten. */
async function beatEncounter(userId: string, e: EncounterRow, levers: RoadLevers): Promise<{ xp: number; tokens: number; back: number } | null> {
  const { data, error } = await createServiceClient().from("road_encounters").update({ status: "beaten", beaten_at: new Date().toISOString() })
    .eq("id", e.id).eq("status", "open").select("id").maybeSingle();
  if (error || !data) return null;
  const back = await giveBack(userId, e);
  const key = encounterKey(e.id);
  let xp = 0;
  let tokens = 0;
  if (await earn(userId, { key, kind: "encounter", region: e.region, team_id: e.team_id, xp: levers.xpEncounter, tokens: levers.encounterTokens })) {
    xp += levers.xpEncounter;
    tokens += await pay(userId, key, levers.encounterTokens);
  }
  if (e.kind === "set") await earn(userId, { key: markKey(e.region), kind: "mark", region: e.region, team_id: e.team_id, xp: 0, tokens: 0 });
  return { xp, tokens, back };
}

/** The account's encounter as one team's page sees it: this team is the villain team, or it's the one waiting behind it. */
export async function encounterFor(userId: string, teamId: string): Promise<{ role: "villain" | "blocked"; view: RoadEncounterView } | null> {
  const e = await openEncounterOf(userId);
  if (!e || (e.team_id !== teamId && e.blocks !== teamId)) return null;
  return { role: e.team_id === teamId ? "villain" : "blocked", view: encounterView(e, await roadLevers()) };
}

// ─── a finished duel ─────────────────────────────────────────────────────────

/** Records one ledger row; true when it's new (false when the key was already earned or the table is missing). */
async function earn(userId: string, row: Omit<LedgerRow, "at">): Promise<boolean> {
  const { error } = await createServiceClient().from("road_ledger").insert({ user_id: userId, ...row });
  if (!error) return true;
  if (!duplicate(error) && !missing(error)) console.error("[road] ledger write failed:", error);
  return false;
}

/** Pays a milestone's tokens once (the ledger key is the idempotency key). */
async function pay(userId: string, key: string, amount: number): Promise<number> {
  if (amount <= 0) return 0;
  const wallet = (await ensureAccountWallet(userId))?.identityId;
  if (!wallet) return 0;
  const { error } = await createServiceClient().from("token_events").insert({
    identity_id: wallet, community_id: null, amount, type: "earn_road", meta: { source: "trainer_road", key }, idempotency_key: `road:${userId}:${key}`,
  });
  if (error) { if (!duplicate(error)) console.error("[road] token payout failed:", error); return 0; }
  return amount;
}

function outcomeText(o: PathOutcome, progress: RoadProgress): { title: string; line: string } {
  if (o.kind === "champion") return { title: "Trainer Road Champion", line: "Every region on the road cleared." };
  const p = regionPath(o.region)!;
  const name = (team: string) => byId.get(team)?.name ?? "";
  const rn = regionName(o.region);
  switch (o.kind) {
    case "badge":
      return o.region === "alola"
        ? { title: `${name(o.team)}'s grand trial`, line: `Grand trial ${o.index + 1} of ${o.of} in Alola.${o.index + 1 === o.of ? ` Next: the ${p.leagueLabel}.` : ""}` }
        : { title: `${name(o.team)}'s badge`, line: `Badge ${o.index + 1} of ${o.of} in ${rn}.${o.index + 1 === o.of ? ` Next: the ${p.leagueLabel}.` : ""}` };
    case "league_step":
      return { title: `${name(o.team)} beaten`, line: `${p.leagueLabel}: challenge ${o.step + 1} of ${o.of} is ${name(p.league[o.step])}. Lose and you start again from ${name(p.league[0])}.` };
    case "league":
      return { title: `${p.leagueLabel} won`, line: `You won it back to back. Next: ${name(p.endgame)}, to clear ${rn}.` };
    case "league_reset":
      return { title: `Back to ${name(p.league[0])}`, line: `A ${p.leagueLabel} loss sends you back to its first challenge. Your ${o.region === "alola" ? "grand trials" : "badges"} stay.` };
    case "region": {
      const next = o.next ? regionName(o.next) : null;
      return { title: `${rn} cleared`, line: next ? `${next} is open on your path.` : "That was the last region." };
    }
    case "endgame_hard": {
      const done = progress.regions.filter((r) => r.endgameHard).length + 1;
      return { title: "Beaten in Hard", line: `${done} of ${ROAD_PATHS.length} end-game opponents beaten in Hard, toward the holo card.` };
    }
  }
}

/**
 * What a finished duel does to an account's path: XP for the first win against the team this month,
 * and the milestone when it was the next trainer on the path (or a League loss sending it back).
 * Null when the tables aren't there yet.
 */
export async function applyRunToPath(userId: string, run: { trainerId: string; month: string; won: boolean; hard: boolean; stars: number }): Promise<RoadPathResult | null> {
  try {
    const before = await readProgress(userId);
    if (!before) return null;
    const t = byId.get(run.trainerId);
    if (!t) return null;
    const levers = await roadLevers();
    const spot = pathSpot(run.trainerId);
    let outcomes = judgePath(before, run.trainerId, run.won, run.hard);
    let xp = 0;
    let tokens = 0;
    const region = regionOf(t);

    // A villain team on the road: beating it clears the way; until then the next trainer waits (a win there is free play).
    const open = await openEncounterOf(userId);
    const beat = open && run.won && open.team_id === run.trainerId ? await beatEncounter(userId, open, levers) : null;
    const stillOpen = open && !beat ? open : null;
    const extra: RoadPathResult["outcomes"] = [];
    if (beat && open) {
      const v = encounterView(open, levers);
      xp += beat.xp;
      tokens += beat.tokens;
      const paid = beat.back > 0 ? `You got your ${beat.back} tokens back${beat.tokens ? `, plus ${beat.tokens}` : ""}.` : beat.tokens ? `${beat.tokens} tokens for beating them.` : "The road is clear.";
      const mark = open.kind === "set" ? ` ${v.villain}'s mark is on your trainer card.` : "";
      extra.push({ kind: "encounter_beaten", title: `${v.name === v.villain ? v.villain : v.name} beaten`, line: `${paid}${mark} On to ${v.blocks.name}.` });
    }
    if (stillOpen) {
      if (run.won && run.trainerId === stillOpen.blocks && outcomes.some((o) => o.kind !== "endgame_hard")) {
        const v = encounterView(stillOpen, levers);
        extra.push({ kind: "blocked", title: `${v.villain} is still in the way`, line: `This win didn't count for ${v.blocks.label}. Beat ${v.name === v.villain ? "them" : v.name} first and ${v.blocks.name} opens.` });
      }
      outcomes = outcomes.filter((o) => o.kind === "endgame_hard");
    }

    // Tools (picks 2026-10-25): prize money for the first win each month, and tools for milestones, once each.
    const tooled = await toolsReady();
    const gotTools: ToolId[] = [];
    let prize = 0;
    const give = async (list: readonly ToolId[], key: string) => {
      if (!tooled || !list.length) return;
      const g = await giveTools(userId, list, key, levers);
      gotTools.push(...g.added);
      tokens += g.paid;
    };
    if (beat && open) await give([rewardTool(encounterKey(open.id))], encounterKey(open.id));

    if (run.won) {
      const amount = winXp(levers, t.tier as DuelTier, spot?.kind === "endgame", run.stars, run.hard);
      const key = winKey(run.trainerId, run.month);
      const purse = tooled ? levers.prize[t.tier as DuelTier] ?? 0 : 0;
      if (await earn(userId, { key, kind: "win", region, team_id: run.trainerId, xp: amount, tokens: purse })) {
        xp += amount;
        prize = await pay(userId, key, purse);
        tokens += prize;
      }
      // A first three-star win against a team gives a tool.
      if (tooled && run.stars >= 3 && (await earn(userId, { key: `three-stars:${run.trainerId}`, kind: "tool", region, team_id: run.trainerId, xp: 0, tokens: 0 }))) {
        await give([rewardTool(`three-stars:${run.trainerId}`)], `three-stars:${run.trainerId}`);
      }
    }

    const svc = createServiceClient();
    const earned: PathOutcome[] = [];
    for (const o of outcomes) {
      if (o.kind === "league_step") {
        await svc.from("road_league").upsert({ user_id: userId, region: o.region, step: o.step, updated_at: new Date().toISOString() }, { onConflict: "user_id,region" });
        earned.push(o);
        continue;
      }
      if (o.kind === "league_reset") {
        await svc.from("road_league").upsert({ user_id: userId, region: o.region, step: 0, updated_at: new Date().toISOString() }, { onConflict: "user_id,region" });
        earned.push(o);
        continue;
      }
      const key = o.kind === "badge" ? badgeKey(o.region, o.team) : o.kind === "league" ? leagueKey(o.region) : o.kind === "region" ? regionKey(o.region) : o.kind === "endgame_hard" ? hardKey(o.region) : CHAMPION_KEY;
      const kind = o.kind === "endgame_hard" ? "endgame_hard" : o.kind;
      const r = outcomeRewards(levers, o);
      if (await earn(userId, { key, kind, region: o.kind === "champion" ? null : o.region, team_id: o.kind === "champion" ? null : o.team, xp: r.xp, tokens: r.tokens })) {
        xp += r.xp;
        tokens += await pay(userId, key, r.tokens);
        earned.push(o);
        // A badge gives the tool it opens at the Mart, the League two, a region three.
        if (o.kind === "badge") await give(badgeTools(o.region, o.index), key);
        else if (o.kind === "league") await give(leagueTools(o.region), key);
        else if (o.kind === "region") await give(regionTools(o.region), key);
        // The League's step stays at its end once it's won.
        if (o.kind === "league") await svc.from("road_league").upsert({ user_id: userId, region: o.region, step: regionPath(o.region)!.league.length - 1, updated_at: new Date().toISOString() }, { onConflict: "user_id,region" });
      }
    }

    let after = (await readProgress(userId)) ?? before;

    // Something new on the road: a region's story battle when its Gym is next, else (after a badge) a grunt now and then.
    let appeared: EncounterRow | null = null;
    if (!stillOpen) {
      const n = nextStep(after);
      const due = setDue(n);
      if (due && n) {
        if (!(await hasCause(userId, setCause(due.region)))) appeared = await openEncounter(userId, { region: due.region, team: due.team, kind: "set", blocks: n.team, cause: setCause(due.region) }, levers);
      } else {
        const badge = earned.find((o): o is Extract<PathOutcome, { kind: "badge" }> => o.kind === "badge");
        const cause = badge ? badgeKey(badge.region, badge.team) : null;
        const grunt = cause ? gruntAfter(userId, cause, n, levers.encounterChance) : null;
        if (grunt && n && cause) appeared = await openEncounter(userId, { region: n.region, team: grunt, kind: "grunt", blocks: n.team, cause }, levers);
      }
      if (appeared) {
        const v = encounterView(appeared, levers);
        extra.push({ kind: "encounter", title: `${v.name === v.villain ? v.villain : `${v.name} and ${v.villain}`} turned up`, line: `${v.swiped ? `They swiped ${v.swiped} tokens and are` : "They're"} blocking the road to ${v.blocks.name}. Beat them to ${v.swiped ? "get your tokens back" : "carry on"}.` });
        after = (await readProgress(userId)) ?? after;
      }
    }
    const blocking = appeared ?? stillOpen;

    const lvBefore = levelOf(before.xp);
    const lv = levelOf(after.xp);
    return {
      xp, tokens, levelBefore: lvBefore.level, level: lv.level, into: lv.into, need: lv.need,
      colorBefore: before.color, color: after.color, colorLabel: CARD_COLOR_LABEL[after.color],
      outcomes: [...extra.filter((o) => o.kind !== "encounter"), ...earned.map((o) => ({ kind: o.kind, ...outcomeText(o, before) })), ...extra.filter((o) => o.kind === "encounter")],
      next: nextView(after),
      encounter: blocking ? encounterView(blocking, levers) : null,
      prize,
      tools: toolCounts(gotTools),
    };
  } catch (e) {
    console.error("[road] path update failed:", e);
    return null;
  }
}

/** Tools given, counted ("Patch Up ×2"). */
function toolCounts(list: readonly ToolId[]): { id: ToolId; name: string; count: number }[] {
  const out: { id: ToolId; name: string; count: number }[] = [];
  for (const id of list) {
    const row = out.find((x) => x.id === id);
    if (row) row.count += 1; else out.push({ id, name: TOOLS[id].name, count: 1 });
  }
  return out;
}

/** Every region's slug, for the API's ?path= check. */
export const pathRegions = () => ROAD_REGIONS.map((r) => r.slug);
