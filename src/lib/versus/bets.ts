import "server-only";

/**
 * "Who wins?" in each runner's chat (speedrun races pick 8A, GS Pro): when the host turned bets on, every runner with
 * GS Pro who is live on Twitch gets a pick-one market in their own community when the race starts, one option per
 * runner. Chat bets Arcade Tokens with `!bet <runner> <amount>` (or the runner's number). Bets lock once the leader is
 * a quarter of the way in (`betLockAt`, like the PB bet), and the winner's backers split the pot at the finish; nobody
 * finishing, or a cancelled race, hands every bet back. Every step waits that runner's stream delay, so chat never
 * hears about a split before their stream shows it.
 *
 * On the markets engine with no new tables, like the PB bet (src/lib/speedrun/prediction.ts): game_key
 * "speedrun-race", session_id = a uuid from the room and the runner, a fixed disabled template row, and
 * notifications.race = { room, code, runner, options, lockAfter, delayMs }.
 */

import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";
import { ensureActiveStream } from "@/lib/economy/streams";
import { cancelMarket, getMarketPools, lockMarket, openFixedMarket, resolveMarket } from "@/lib/economy/markets/lifecycle";
import { claimEnd, claimFlag, say, streamerEconomy } from "@/lib/speedrun/prediction";
import { shownName } from "@/lib/speedrun/splitGroups";
import { fmtClock } from "@/lib/speedrun/time";
import { betLockAt, cleanVersusSettings, raceBetOptions, standings } from "./rules";
import type { RoomRow } from "./store";
import type { RoomHookBody, RoomView } from "./types";

export const RACE_GAME_KEY = "speedrun-race";
export const RACE_TEMPLATE_ID = "00000000-0000-4000-8000-000000000011";
const COLS = "id, community_id, status, lock_at, resolved_value, created_by, notifications";

export interface RaceMarketMeta {
  room: string;
  code: string;
  runner: string;
  options: { option_key: string; label: string }[];
  lockAfter: number;
  lockName: string | null;
  delayMs: number;
}
interface RaceMarket {
  id: string; community_id: string; status: "open" | "locked" | "settled" | "cancelled"; lock_at: string | null;
  resolved_value: string | null; created_by: string; notifications: { race?: RaceMarketMeta; [k: string]: unknown } | null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function raceSessionId(roomKey: string, userId: string): string {
  const h = createHash("sha256").update(`race:${roomKey}:${userId}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

let templateReady = false;
async function ensureTemplate(): Promise<boolean> {
  if (templateReady) return true;
  const { error } = await createServiceClient().from("gs_market_templates").upsert(
    { id: RACE_TEMPLATE_ID, variable_type: "pickone", question_tmpl: "Who wins the race?", outcome_spec: { type: "pickone", options: [] }, enabled: false },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) { console.error("[versus] bet template:", error.message); return false; }
  templateReady = true;
  return true;
}

async function marketsOf(roomKey: string, statuses: string[]): Promise<RaceMarket[]> {
  const { data } = await createServiceClient().from("gs_markets").select(COLS)
    .eq("game_key", RACE_GAME_KEY).eq("notifications->race->>room", roomKey).in("status", statuses).limit(16);
  return (data ?? []) as RaceMarket[];
}

/** The race bet chat can bet on in this community now (open or locked), if any (`!bet`). */
export async function activeRaceMarket(communityId: string): Promise<RaceMarket | null> {
  const { data } = await createServiceClient().from("gs_markets").select(COLS)
    .eq("community_id", communityId).eq("game_key", RACE_GAME_KEY).in("status", ["open", "locked"])
    .order("opened_at", { ascending: false }).limit(1).maybeSingle();
  return (data as RaceMarket | null) ?? null;
}

export const raceMetaOf = (m: { notifications: { race?: RaceMarketMeta } | null }): RaceMarketMeta | null => m.notifications?.race ?? null;

async function openFor(room: RoomRow, view: RoomView, userId: string): Promise<void> {
  if (!(await isProUser(userId))) return;
  const me = view.entrants.find((e) => e.key === userId);
  if (!me) return;
  const eco = await streamerEconomy(userId);
  if (!eco || !(await ensureTemplate())) return;
  await sleep(me.delayMs);
  const fresh = await createServiceClient().from("versus_rooms").select("status").eq("id", room.id).maybeSingle();
  if ((fresh.data as { status: string } | null)?.status !== "running") return;
  const options = raceBetOptions(view.entrants);
  const n = view.checkpoints.length;
  const lockAfter = betLockAt(n);
  const lockName = view.checkpoints[lockAfter - 1] ? shownName(view.checkpoints[lockAfter - 1]) : null;
  const stream = await ensureActiveStream({ communityId: eco.communityId });
  const meta: RaceMarketMeta = {
    room: room.room_key, code: room.code, runner: userId, options: options.map(({ option_key, label }) => ({ option_key, label })),
    lockAfter, lockName, delayMs: me.delayMs,
  };
  const res = await openFixedMarket({
    communityId: eco.communityId, streamId: stream.id, sessionId: raceSessionId(room.room_key, userId), gameKey: RACE_GAME_KEY,
    chapter: 1, templateId: RACE_TEMPLATE_ID, variableType: "pickone", subject: eco.name, question: "Who wins the race?",
    outcomes: options.map(({ option_key, label }) => ({ option_key, label })), hostIdentityId: eco.hostIdentityId,
    notifications: { race: meta },
  });
  if (!res.ok) {
    if (res.reason !== "active_market_exists") console.error("[versus] bet open:", res.reason, res.detail ?? "");
    return;
  }
  const keys = options.map((o) => o.option_key).join(", ");
  await say(eco.twitchUserId, `🏁 The race is on. Who wins? Bet Arcade Tokens with !bet <runner> <amount>: ${keys}.${lockName ? ` Bets lock at ${lockName}.` : ""}`);
}

async function lockOne(m: RaceMarket): Promise<void> {
  const meta = raceMetaOf(m);
  if (!meta) return;
  const stamp = new Date().toISOString();
  // Bets close when this runner's stream shows the lock: lock_at = now + their delay.
  await createServiceClient().from("gs_markets").update({ lock_at: new Date(Date.now() + meta.delayMs).toISOString(), notifications: { ...(m.notifications ?? {}), lock_60s: stamp, auto_locked: stamp } })
    .eq("id", m.id).eq("status", "open").is("lock_at", null);
  await sleep(meta.delayMs);
  await lockMarket({ marketId: m.id });
  if (!(await claimFlag(m.id, "race_lock"))) return;
  const pools = await getMarketPools(m.id);
  const total = pools.reduce((a, p) => a + p.total, 0);
  const people = pools.reduce((a, p) => a + p.bettorCount, 0);
  const eco = await streamerEconomy(meta.runner);
  await say(eco?.twitchUserId ?? null, `🔒 Race bets are locked: ${people} ${people === 1 ? "person" : "people"} put in ${total.toLocaleString("en-US")} tokens.`);
}

async function settleOne(m: RaceMarket, view: RoomView): Promise<void> {
  const meta = raceMetaOf(m);
  if (!meta) return;
  await sleep(meta.delayMs);
  const eco = await streamerEconomy(meta.runner);
  const rows = standings(view.entrants, view.checkpoints.length);
  const winner = rows.find((r) => r.status === "done");
  const option = winner ? raceBetOptions(view.entrants).find((o) => o.key === winner.key) : null;
  if (view.status === "cancelled" || !winner || !option || !meta.options.some((o) => o.option_key === option.option_key)) {
    if (!(await claimEnd(m.id, "refund"))) return;
    await cancelMarket({ marketId: m.id, reason: "manual" });
    await say(eco?.twitchUserId ?? null, view.status === "cancelled" ? "🏁 The race was called off, so every bet goes back." : "🏁 Nobody finished the race, so every bet goes back.");
    return;
  }
  if (!(await claimEnd(m.id, option.option_key))) return;
  if (m.status === "open") await lockMarket({ marketId: m.id });
  const pools = await getMarketPools(m.id);
  const r = await resolveMarket({ marketId: m.id, value: option.option_key, resolverIdentityId: m.created_by });
  if (!r.ok) {
    console.warn("[versus] bet settle:", r.reason, r.detail ?? "");
    await cancelMarket({ marketId: m.id, reason: "manual" });
    return;
  }
  const pot = pools.reduce((a, p) => a + p.total, 0);
  const backers = pools.find((p) => p.optionKey === option.option_key)?.bettorCount ?? 0;
  const tail = backers ? ` ${backers} ${backers === 1 ? "person" : "people"} on ${option.label} split ${pot.toLocaleString("en-US")} tokens.` : "";
  await say(eco?.twitchUserId ?? null, `🏆 ${option.label} won the race in ${fmtClock(winner.timeMs)}.${tail}`);
}

/** One room step's effect on its bets (runs after the webhook has answered). */
export async function onRoomEventForBets(room: RoomRow, body: RoomHookBody): Promise<void> {
  const view = body.room;
  if (body.event === "started") {
    if (!cleanVersusSettings(room.settings).bets) return;
    await Promise.all(view.entrants.map((e) => openFor(room, view, e.key).catch((err) => console.error("[versus] bet open:", err))));
    return;
  }
  if (body.event === "progress") {
    const lead = Math.max(0, ...view.entrants.map((e) => e.lane.reached));
    const open = (await marketsOf(room.room_key, ["open"])).filter((m) => !m.lock_at && lead >= (raceMetaOf(m)?.lockAfter ?? Infinity));
    await Promise.all(open.map((m) => lockOne(m).catch((err) => console.error("[versus] bet lock:", err))));
    return;
  }
  if (body.event === "finished" || body.event === "cancelled") {
    const ms = await marketsOf(room.room_key, ["open", "locked"]);
    await Promise.all(ms.map((m) => settleOne(m, view).catch((err) => console.error("[versus] bet settle:", err))));
  }
}
