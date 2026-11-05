import "server-only";

/**
 * Predictions on a team series night (Summer Series pick 7A): where each team finishes, each player's
 * points over or under a line, and who wins the night. One question per night for the whole series, picked
 * from any of the streamers' live pages (or the event page), one pot of GameShuffle tokens each. They lock
 * when the night's first race is in and settle on their own once its last race is (store.tickSeries).
 *
 * Tokens can't be bought or cashed out, and prizes never go to predictions; on GameShuffle it's "predict",
 * never "bet". Viewers in places where prediction pools aren't allowed can't put tokens in (the compliance
 * gate, src/lib/economy/compliance).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { credit, spend } from "@/lib/economy/tokens";
import {
  defaultLine, finishOptions, formatLine, overUnderOptions, predictionWinners, splitPot, winnerOptions,
  type PredictionKind, type PredictionOption,
} from "./rules";
import { playerFor, teamsLite, type Loaded, type NightData } from "./store";
import { readSettings, type PredictionView } from "./view";

type PredRaw = {
  id: string; series_id: string; night_id: string; kind: PredictionKind; team_id: string | null; player_id: string | null;
  question: string; options: PredictionOption[]; line: number | string | null; status: PredictionView["status"]; result: string[] | null; sort: number;
};
const PRED_COLS = "id, series_id, night_id, kind, team_id, player_id, question, options, line, status, result, sort";

/** Every prediction in a series with its pots (tokens put on each option). */
export async function predictionViews(seriesId: string): Promise<PredictionView[]> {
  const admin = createServiceClient();
  const { data, error } = await admin.from("gs_series_predictions").select(PRED_COLS).eq("series_id", seriesId).order("sort").order("created_at");
  if (error || !data?.length) return [];
  const preds = data as PredRaw[];
  const pots = new Map<string, Map<string, number>>();
  const pickers = new Map<string, Set<string>>();
  // A night's stakes; paged so a busy night past 1,000 picks still adds up.
  const ids = preds.map((p) => p.id);
  for (let from = 0; ; from += 1000) {
    const { data: rows } = await admin.from("gs_series_stakes").select("prediction_id, option_key, amount, identity_id").in("prediction_id", ids).order("id").range(from, from + 999);
    const list = (rows ?? []) as { prediction_id: string; option_key: string; amount: number; identity_id: string }[];
    for (const r of list) {
      const m = pots.get(r.prediction_id) ?? new Map<string, number>();
      m.set(r.option_key, (m.get(r.option_key) ?? 0) + Number(r.amount));
      pots.set(r.prediction_id, m);
      const s = pickers.get(r.prediction_id) ?? new Set<string>();
      s.add(r.identity_id);
      pickers.set(r.prediction_id, s);
    }
    if (list.length < 1000) break;
  }
  return preds.map((p) => {
    const m = pots.get(p.id) ?? new Map<string, number>();
    const options = (p.options ?? []).map((o) => ({ key: o.key, label: o.label, pot: m.get(o.key) ?? 0 }));
    return {
      id: p.id, nightId: p.night_id, kind: p.kind, teamId: p.team_id, playerId: p.player_id, question: p.question, options,
      line: p.line == null ? null : Number(p.line), status: p.status, result: p.result,
      pot: options.reduce((s, o) => s + o.pot, 0), picks: pickers.get(p.id)?.size ?? 0,
    };
  });
}

/** A viewer's picks in a series: prediction id → option and tokens (and what it paid, once settled). */
export async function myPicks(seriesId: string, identityId: string): Promise<Record<string, { option: string; amount: number; paid: number | null }>> {
  const admin = createServiceClient();
  const { data: preds } = await admin.from("gs_series_predictions").select("id").eq("series_id", seriesId);
  const ids = ((preds ?? []) as { id: string }[]).map((p) => p.id);
  if (!ids.length) return {};
  const { data } = await admin.from("gs_series_stakes").select("prediction_id, option_key, amount, paid").eq("identity_id", identityId).in("prediction_id", ids);
  const out: Record<string, { option: string; amount: number; paid: number | null }> = {};
  for (const r of (data ?? []) as { prediction_id: string; option_key: string; amount: number; paid: number | null }[]) {
    const cur = out[r.prediction_id];
    out[r.prediction_id] = { option: r.option_key, amount: (cur?.amount ?? 0) + Number(r.amount), paid: r.paid == null && cur?.paid == null ? null : (cur?.paid ?? 0) + (r.paid ?? 0) };
  }
  return out;
}

/**
 * Makes a night's predictions (if they aren't there yet): each team's finish, each player's points over or
 * under a line (the organizer's per player, else the series' line for their role, else worked out from the
 * scoring table), and who wins the night. Returns how many were made.
 */
export async function openPredictions(l: Loaded, nightId: string, lines: Record<string, number> = {}): Promise<number> {
  const night = l.nights.find((n) => n.id === nightId);
  if (!night) return 0;
  const settings = readSettings(l.series.settings);
  const teams = teamsLite(l);
  const admin = createServiceClient();
  let scoring: number[] | null = null;
  let raceCount = 12;
  if (night.tournament_id) {
    const { data } = await admin.from("tournaments").select("scoring_table, settings").eq("id", night.tournament_id).maybeSingle();
    const t = data as { scoring_table: number[] | null; settings: { raceCount?: number } | null } | null;
    scoring = t?.scoring_table ?? null;
    raceCount = Number(t?.settings?.raceCount) || 12;
  }
  const auto = defaultLine(scoring, raceCount, Math.max(2, l.players.length));
  const rows: Record<string, unknown>[] = [];
  let sort = 0;
  rows.push({ series_id: l.series.id, night_id: night.id, kind: "night_winner", question: `Who wins the ${night.label}?`, options: winnerOptions(teams), sort: sort++ });
  for (const t of [...l.teams].sort((a, b) => a.n - b.n)) {
    rows.push({ series_id: l.series.id, night_id: night.id, kind: "team_finish", team_id: t.id, question: `Where does ${t.name} finish?`, options: finishOptions(teams.length), sort: sort++ });
    for (const p of l.players.filter((x) => x.team_id === t.id).sort((a, b) => (a.role === b.role ? 0 : a.role === "competitive" ? -1 : 1))) {
      const line = lines[p.id] ?? settings.lines[p.role] ?? auto;
      rows.push({ series_id: l.series.id, night_id: night.id, kind: "player_points", team_id: t.id, player_id: p.id, line, question: `${p.name}: over or under ${formatLine(line)} points?`, options: overUnderOptions(line), sort: sort++ });
    }
  }
  // Only the ones not made yet (a player added later gets theirs on the next open).
  const { data: had } = await admin.from("gs_series_predictions").select("kind, team_id, player_id").eq("night_id", night.id);
  const key = (r: { kind?: unknown; team_id?: unknown; player_id?: unknown }) => `${r.kind}|${r.team_id ?? ""}|${r.player_id ?? ""}`;
  const there = new Set(((had ?? []) as { kind: string; team_id: string | null; player_id: string | null }[]).map(key));
  const fresh = rows.filter((r) => !there.has(key(r)));
  if (!fresh.length) return 0;
  const { data, error } = await admin.from("gs_series_predictions").insert(fresh).select("id");
  if (!error) return data?.length ?? 0;
  // Two organizers at once: the unique index refuses the batch, so go one by one and skip the ones there.
  let made = 0;
  for (const r of fresh) { const { error: e } = await admin.from("gs_series_predictions").insert(r); if (!e) made += 1; }
  return made;
}

export async function lockPredictions(nightId: string): Promise<number> {
  const { data } = await createServiceClient().from("gs_series_predictions").update({ status: "locked", locked_at: new Date().toISOString() })
    .eq("night_id", nightId).eq("status", "open").select("id");
  return data?.length ?? 0;
}

export async function reopenPredictions(nightId: string): Promise<number> {
  const { data } = await createServiceClient().from("gs_series_predictions").update({ status: "open", locked_at: null })
    .eq("night_id", nightId).eq("status", "locked").select("id");
  return data?.length ?? 0;
}

type StakeRow = { id: string; identity_id: string; option_key: string; amount: number; community_id: string | null };

async function stakesOf(predictionId: string): Promise<StakeRow[]> {
  const out: StakeRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await createServiceClient().from("gs_series_stakes").select("id, identity_id, option_key, amount, community_id").eq("prediction_id", predictionId).order("id").range(from, from + 999);
    const list = (data ?? []) as StakeRow[];
    out.push(...list);
    if (list.length < 1000) break;
  }
  return out;
}

/** Pays a claimed prediction's pot (or refunds it) and records what each pick got. */
async function payOut(p: PredRaw, winners: string[], refundAll: boolean): Promise<void> {
  const stakes = await stakesOf(p.id);
  if (!stakes.length) return;
  const { payouts, refunded } = refundAll
    ? { payouts: stakes.reduce((m, s) => m.set(s.identity_id, (m.get(s.identity_id) ?? 0) + s.amount), new Map<string, number>()), refunded: true }
    : splitPot(stakes.map((s) => ({ identityId: s.identity_id, option: s.option_key, amount: s.amount })), winners);
  const admin = createServiceClient();
  for (const [identityId, amount] of payouts) {
    if (amount <= 0) continue;
    const mine = stakes.filter((s) => s.identity_id === identityId);
    await credit({
      identityId, amount, type: refunded ? "refund" : "payout",
      ctx: { communityId: mine[0]?.community_id ?? null, refId: p.id, meta: { source: "market", series: p.series_id, ...(refunded ? { reason: refundAll ? "cancelled" : "nobody_right" } : {}) } },
    }).catch((e) => console.error(`[series] payout to ${identityId} failed:`, e));
    // What the pick got goes on its first row (the page shows "won 450").
    await admin.from("gs_series_stakes").update({ paid: amount }).eq("id", mine[0].id);
  }
}

/**
 * Locks a night's open predictions once its first race is in, and settles every prediction of a night
 * that's done. Each settle is claimed first (status change), so a prediction pays once.
 */
export async function syncPredictions(l: Loaded, data: Map<string, NightData>): Promise<boolean> {
  const admin = createServiceClient();
  const { data: rows, error } = await admin.from("gs_series_predictions").select(PRED_COLS).eq("series_id", l.series.id).in("status", ["open", "locked"]);
  if (error || !rows?.length) return false;
  let changed = false;
  const teams = teamsLite(l);
  const preds = rows as PredRaw[];
  for (const night of l.nights) {
    const result = data.get(night.id)?.result;
    const mine = preds.filter((p) => p.night_id === night.id);
    if (!result || !mine.length) continue;
    if (result.state === "done") {
      for (const p of mine) {
        const player = p.player_id ? l.players.find((x) => x.id === p.player_id) ?? null : null;
        const participantIds = player ? (data.get(night.id)?.participants ?? []).filter((x) => playerFor([player], x)?.id === player.id).map((x) => x.id) : [];
        const winners = predictionWinners({ kind: p.kind, teamId: p.team_id, participantIds, userId: player?.user_id ?? null, name: player?.name ?? null, line: p.line == null ? null : Number(p.line) }, result, teams);
        const { data: claimed } = await admin.from("gs_series_predictions").update({ status: "settled", result: winners, settled_at: new Date().toISOString(), locked_at: new Date().toISOString() })
          .eq("id", p.id).eq("status", p.status).select("id");
        if (!claimed?.length) continue;
        changed = true;
        await payOut(p, winners, false);
      }
    } else if (result.racesDone >= 1 && mine.some((p) => p.status === "open")) {
      if (await lockPredictions(night.id)) changed = true;
    }
  }
  return changed;
}

/** Cancels a night's unsettled predictions and gives every token back. */
export async function cancelPredictions(nightId: string): Promise<number> {
  const admin = createServiceClient();
  const { data } = await admin.from("gs_series_predictions").update({ status: "cancelled", settled_at: new Date().toISOString() })
    .eq("night_id", nightId).in("status", ["open", "locked"]).select(PRED_COLS);
  const list = (data ?? []) as PredRaw[];
  for (const p of list) await payOut(p, [], true);
  return list.length;
}

export type StakeError = "not_found" | "closed" | "bad_option" | "other_pick" | "amount" | "too_much" | "no_tokens" | "not_ready";
export const STAKE_ERRORS: Record<StakeError, string> = {
  not_found: "That prediction isn't here any more.",
  closed: "That prediction is closed.",
  bad_option: "Pick one of the options.",
  other_pick: "You already picked a different answer on this one. You can add tokens to your pick.",
  amount: "Put in at least 10 tokens.",
  too_much: "That's more than one pick can take (5,000 tokens at most).",
  no_tokens: "You don't have that many tokens.",
  not_ready: "Predictions aren't open yet.",
};
export const MIN_STAKE = 10;
export const MAX_STAKE = 5000;

/** Puts a viewer's tokens on an option. One answer per prediction; more tokens can go on the same one. */
export async function placeStake(args: { predictionId: string; identityId: string; option: string; amount: number; communityId?: string | null }): Promise<{ ok: true; balance: number } | { ok: false; error: StakeError; balance?: number }> {
  const amount = Math.floor(Number(args.amount));
  if (!Number.isFinite(amount) || amount < MIN_STAKE) return { ok: false, error: "amount" };
  const admin = createServiceClient();
  const { data, error } = await admin.from("gs_series_predictions").select("id, series_id, status, options").eq("id", args.predictionId).maybeSingle();
  if (error) return { ok: false, error: "not_ready" };
  const p = data as { id: string; series_id: string; status: string; options: PredictionOption[] } | null;
  if (!p) return { ok: false, error: "not_found" };
  if (p.status !== "open") return { ok: false, error: "closed" };
  if (!(p.options ?? []).some((o) => o.key === args.option)) return { ok: false, error: "bad_option" };
  const { walletIdentityFor } = await import("@/lib/economy/accountWallet");
  const identityId = await walletIdentityFor(args.identityId);
  const { data: had } = await admin.from("gs_series_stakes").select("option_key, amount").eq("prediction_id", p.id).eq("identity_id", identityId);
  const prior = (had ?? []) as { option_key: string; amount: number }[];
  if (prior.some((s) => s.option_key !== args.option)) return { ok: false, error: "other_pick" };
  if (prior.reduce((s, x) => s + Number(x.amount), 0) + amount > MAX_STAKE) return { ok: false, error: "too_much" };
  const paid = await spend({ identityId, amount, type: "bet", ctx: { communityId: args.communityId ?? null, refId: p.id, meta: { source: "market", series: p.series_id } } });
  if (!paid.ok) return { ok: false, error: paid.reason === "insufficient_balance" ? "no_tokens" : "amount", balance: paid.balance };
  const { error: insErr } = await admin.from("gs_series_stakes").insert({ prediction_id: p.id, identity_id: identityId, option_key: args.option, amount, community_id: args.communityId ?? null, event_id: paid.eventId ?? null });
  if (insErr) {
    // Give the tokens back rather than lose them.
    await credit({ identityId, amount, type: "refund", ctx: { communityId: args.communityId ?? null, refId: p.id, meta: { source: "market", reason: "save_failed" } } }).catch(() => null);
    return { ok: false, error: "not_ready" };
  }
  // The prediction may have locked while the tokens went in: a pick that landed after the lock still counts
  // in the pot (it was open when checked), which matches how the room's own vote works.
  return { ok: true, balance: paid.balance };
}
