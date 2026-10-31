import "server-only";

/**
 * The road's tools, server side (picks 2026-10-25, https://claude.ai/artifact/2Jvhc2QgmCGMZSTcLMME1o;
 * tables from supabase/trainer-road-m6.sql; rules in tools.ts). Accounts only.
 *
 * The bag (road_bag) holds up to the bag's limit of each tool. Tools come from the road (badges, the
 * League, a region, a first three-star win, a villain team beaten: roadProgress.ts calls giveTools once
 * per reward) or the Mart (gs_road_tool_buy, one step under the wallet's locks). A region cleared lets
 * you keep one tool for good (road_kept), ready once a Pacific day. A duel takes a tool with takeTool
 * (gs_road_tool_take: the bag first, then a kept tool; each use once per run and number, so a retried
 * step never takes two). Missing tables (before the migration) leave tools out quietly.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { gsDay } from "@/lib/time/gsClock";
import { ensureAccountWallet } from "@/lib/economy/accountWallet";
import { getBalance } from "@/lib/economy/tokens";
import { DUEL_DATA } from "./data";
import { roadRegion } from "./road";
import { regionPath, type RoadLevers, type RoadProgress } from "./roadPath";
import { BADGE_TOOLS, SHELF_START, TOOLS, TOOL_IDS, VIRIDIAN_GIFT, shelfFor } from "./tools";
import { toolArtView } from "./toolArt";
import type { ToolId } from "./types";
import type { MartView } from "./roadView";
import type { ToolBagView, ToolItemView } from "./view";

type DbError = { code?: string; message?: string } | null;
const missing = (e: DbError) => !!e && (["42P01", "PGRST205", "42703", "PGRST204", "PGRST202"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? ""));
const duplicate = (e: DbError) => !!e && (e.code === "23505" || /duplicate key/i.test(e.message ?? ""));

let readyMemo: { ok: boolean; at: number } | null = null;

/** Whether the tools' tables exist (supabase/trainer-road-m6.sql). A yes is kept; a no is asked again after a minute. */
export async function toolsReady(): Promise<boolean> {
  if (readyMemo && (readyMemo.ok || Date.now() - readyMemo.at < 60_000)) return readyMemo.ok;
  const { error } = await createServiceClient().from("road_bag").select("user_id").limit(1);
  readyMemo = { ok: !error, at: Date.now() };
  return readyMemo.ok;
}

interface KeptRow { region: string; tool: ToolId; used_on: string | null }

/** An account's bag and kept tools, or null when the tables aren't there. */
async function readBag(userId: string): Promise<{ bag: Partial<Record<ToolId, number>>; kept: KeptRow[] } | null> {
  const svc = createServiceClient();
  const [b, k] = await Promise.all([
    svc.from("road_bag").select("tool, count").eq("user_id", userId),
    svc.from("road_kept").select("region, tool, used_on").eq("user_id", userId),
  ]);
  if (b.error || k.error) { if (!missing(b.error) && !missing(k.error)) console.error("[road] bag read failed:", b.error ?? k.error); return null; }
  const bag: Partial<Record<ToolId, number>> = {};
  for (const r of (b.data ?? []) as { tool: ToolId; count: number }[]) bag[r.tool] = r.count;
  return { bag, kept: (k.data ?? []) as KeptRow[] };
}

function itemView(id: ToolId, count: number, kept: KeptRow[], price: number, today: string): ToolItemView {
  const t = TOOLS[id];
  const mine = kept.filter((k) => k.tool === id);
  return {
    id, name: t.name, line: t.line, count, price,
    kept: mine.length > 0, keptReady: mine.some((k) => !k.used_on || k.used_on < today),
    art: toolArtView(t.art),
  };
}

/** Records a ledger row once (false when the key was already earned or the table is missing). */
async function claim(userId: string, key: string, kind: "tool", region: string | null, tokens: number): Promise<boolean> {
  const { error } = await createServiceClient().from("road_ledger").insert({ user_id: userId, key, kind, region, team_id: null, xp: 0, tokens });
  if (!error) return true;
  if (!duplicate(error) && !missing(error)) console.error("[road] ledger write failed:", error);
  return false;
}

/** Pays tokens once under a ledger key (a tool that didn't fit in the bag). */
async function payOnce(userId: string, key: string, amount: number): Promise<number> {
  if (amount <= 0) return 0;
  const wallet = (await ensureAccountWallet(userId))?.identityId;
  if (!wallet) return 0;
  const { error } = await createServiceClient().from("token_events").insert({
    identity_id: wallet, community_id: null, amount, type: "earn_road", meta: { source: "trainer_road", key }, idempotency_key: `road:${userId}:${key}`,
  });
  if (error) { if (!duplicate(error)) console.error("[road] token payout failed:", error); return 0; }
  return amount;
}

/**
 * Gives tools for a reward (call it once per reward: after its own ledger row was new). A tool that
 * doesn't fit in the bag is paid as tokens at its Mart price instead. Returns what went in and what was paid.
 */
export async function giveTools(userId: string, tools: readonly ToolId[], key: string, levers: RoadLevers): Promise<{ added: ToolId[]; paid: number }> {
  const added: ToolId[] = [];
  let paid = 0;
  if (!tools.length || !(await toolsReady())) return { added, paid };
  const svc = createServiceClient();
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    const { data, error } = await svc.rpc("gs_road_tool_add", { p_user_id: userId, p_tool: tool, p_count: 1, p_max: levers.bagMax });
    if (error) { console.error("[road] tool add failed:", error); continue; }
    const r = data as { added: number; over: number };
    if (r.added > 0) added.push(tool);
    if (r.over > 0) {
      const price = levers.toolPrice[tool];
      const k = `tool:${key}:${i}`;
      if (await claim(userId, k, "tool", null, price)) paid += await payOnce(userId, k, price);
    }
  }
  return { added, paid };
}

/** The Poké Mart clerk in Viridian's three Patch Ups, given once to every account (on its first look at the bag). */
async function viridianGift(userId: string, levers: RoadLevers): Promise<void> {
  if (await claim(userId, "gift:viridian-mart", "tool", "kanto", 0)) {
    await giveTools(userId, Array(VIRIDIAN_GIFT.count).fill(VIRIDIAN_GIFT.tool), "gift:viridian-mart", levers);
  }
}

/** An account's tools (every tool with its count), or null for a guest or before the tables exist. */
export async function bagView(userId: string | null, levers: RoadLevers): Promise<ToolBagView | null> {
  if (!userId || !(await toolsReady())) return null;
  await viridianGift(userId, levers);
  const read = await readBag(userId);
  if (!read) return null;
  const today = gsDay();
  return {
    items: TOOL_IDS.map((id) => itemView(id, read.bag[id] ?? 0, read.kept, levers.toolPrice[id], today)),
    max: levers.bagMax, duel: levers.toolsDuel,
  };
}

/**
 * Takes one tool for a duel's use number `n` (the bag first, then a kept tool not used today). Null when
 * the account has none to use. The same run and number again answers as the first time without taking another.
 */
export async function takeTool(userId: string, tool: ToolId, runId: string, game: "road" | "duel", n: number): Promise<"bag" | "kept" | null> {
  if (!(await toolsReady())) return null;
  const { data, error } = await createServiceClient().rpc("gs_road_tool_take", { p_user_id: userId, p_tool: tool, p_run_id: runId, p_game: game, p_n: n, p_day: gsDay() });
  if (error) { console.error("[road] tool take failed:", error); return null; }
  const r = data as { ok: boolean; source?: "bag" | "kept" };
  return r.ok ? r.source ?? "bag" : null;
}

const trainerName = (id: string) => DUEL_DATA.trainers.find((t) => t.id === id)?.name ?? "";

/** What a region's Mart shows an account: its shelf by badges, the bag, the balance, and the tool to keep once cleared. */
export async function martView(userId: string, region: string, progress: RoadProgress | null, levers: RoadLevers): Promise<MartView | null> {
  const bag = await bagView(userId, levers);
  if (!bag) return null;
  const r = progress?.regions.find((x) => x.region === region) ?? null;
  // The shelves open with Kanto's badges; once Kanto is cleared every Mart has everything.
  const kanto = progress?.regions.find((x) => x.region === "kanto");
  const kantoDone = !!kanto?.cleared;
  const shelf = region === "kanto" ? shelfFor("kanto", kanto?.badges.length ?? 0, kantoDone) : shelfFor(region, 0, true);
  const opens: MartView["opens"] = {};
  const gyms = regionPath("kanto")?.gyms ?? [];
  (BADGE_TOOLS.kanto ?? []).forEach((t, i) => { if (!shelf.includes(t) && !SHELF_START.includes(t) && gyms[i]) opens[t] = `${trainerName(gyms[i])}'s badge`; });
  const wallet = await ensureAccountWallet(userId).catch(() => null);
  const balance = wallet?.identityId ? await getBalance(wallet.identityId).catch(() => 0) : 0;
  const keptHere = (await readBag(userId))?.kept.find((k) => k.region === region) ?? null;
  return {
    region, regionName: roadRegion(region)?.name ?? region, shelf, opens, bag, balance,
    keep: r?.cleared ? { tool: keptHere?.tool ?? null } : null,
  };
}

export type BuyResult = { ok: true; mart: MartView } | { ok: false; error: "not_ready" | "shelf" | "full" | "insufficient_balance" | "failed" };

/** Buys one tool at a region's Mart (it must be on the shelf there). `nonce` makes a double tap buy once. */
export async function buyTool(userId: string, region: string, tool: ToolId, nonce: string, progress: RoadProgress | null, levers: RoadLevers): Promise<BuyResult> {
  const before = await martView(userId, region, progress, levers);
  if (!before) return { ok: false, error: "not_ready" };
  if (!before.shelf.includes(tool)) return { ok: false, error: "shelf" };
  const wallet = await ensureAccountWallet(userId).catch(() => null);
  if (!wallet?.identityId) return { ok: false, error: "failed" };
  const { data, error } = await createServiceClient().rpc("gs_road_tool_buy", {
    p_user_id: userId, p_identity_id: wallet.identityId, p_tool: tool, p_price: levers.toolPrice[tool], p_max: levers.bagMax, p_key: `${userId}:${nonce}`,
  });
  if (error) { console.error("[road] tool buy failed:", error); return { ok: false, error: "failed" }; }
  const r = data as { ok: boolean; reason?: string };
  if (!r.ok) return { ok: false, error: r.reason === "full" ? "full" : r.reason === "insufficient_balance" ? "insufficient_balance" : "failed" };
  const mart = await martView(userId, region, progress, levers);
  return mart ? { ok: true, mart } : { ok: false, error: "failed" };
}

export type KeepResult = { ok: true; mart: MartView } | { ok: false; error: "not_ready" | "not_cleared" | "kept" | "failed" };

/** Keeps a tool for good in a cleared region (once: the pick stands). */
export async function keepTool(userId: string, region: string, tool: ToolId, progress: RoadProgress | null, levers: RoadLevers): Promise<KeepResult> {
  if (!(await toolsReady())) return { ok: false, error: "not_ready" };
  if (!progress?.regions.find((x) => x.region === region)?.cleared) return { ok: false, error: "not_cleared" };
  const { error } = await createServiceClient().from("road_kept").insert({ user_id: userId, region, tool });
  if (error) { if (duplicate(error)) return { ok: false, error: "kept" }; console.error("[road] keep failed:", error); return { ok: false, error: "failed" }; }
  const mart = await martView(userId, region, progress, levers);
  return mart ? { ok: true, mart } : { ok: false, error: "failed" };
}
