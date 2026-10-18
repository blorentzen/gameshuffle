/**
 * Daily leaderboards (server only): scores, the boards, and the prizes when a
 * week or month ends. Rules in ./boardRules.ts; guests in ./guests.ts; tables
 * from supabase/daily-boards-m1.sql (a missing table reads as "no boards yet",
 * so the Daily keeps working before the migration).
 *
 * Every finished game becomes one daily_scores row (the first result for a day
 * stands) and pays its tokens once: into the player's wallet for accounts and
 * Discord identities (GameShuffle pays, never a streamer's allowance, written
 * through token_events.idempotency_key like idea rewards), or held for a guest
 * until an account claims them. Prizes are paid when a period settles, two days
 * after it ends (closeDue, from the daily cron), each once.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureAccountWallet, walletIdentityFor } from "@/lib/economy/accountWallet";
import { createNotification } from "@/lib/social/notifications";
import { accountAvatar, type AccountRow } from "@/lib/discord/faces";
import { gsAddDays, gsDay, gsMonthStart, gsWeekStart } from "@/lib/time/gsClock";
import {
  DEFAULT_LEVERS, GAME_LABEL, ordinal, parsePlayer, periodRange, playerKey, pointsFor, prizeFor, settlesOn,
  type BoardGame, type BoardLevers, type BoardPeriod, type PlayerKind,
} from "@/lib/daily/boardRules";
import type { BoardRow, BoardView, ScoreResult, SolveTimes } from "@/lib/daily/boardTypes";

export type { BoardRow, BoardView, ScoreResult };

type DbError = { code?: string; message?: string } | null;
/** A table or function from daily-boards-m1 that isn't there yet. */
export const boardsMissing = (e: DbError) => !!e && (["42P01", "PGRST205", "42883", "PGRST202"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? ""));
const duplicate = (e: DbError) => !!e && (e.code === "23505" || /duplicate key|unique/i.test(e.message ?? ""));

const GAME_PAGE: Record<BoardGame, string> = { shuffle: "/daily", dex: "/daily-dex" };

/** The payout levers (Platform ▸ Token economy), falling back to the seeded defaults. */
export async function boardLevers(): Promise<BoardLevers> {
  const { data } = await createServiceClient().from("gs_economy_config").select("key, value").like("key", "daily_%");
  const v = new Map(((data ?? []) as { key: string; value: number }[]).map((r) => [r.key, Number(r.value)]));
  const n = (key: string, fallback: number) => (Number.isFinite(v.get(key)) ? Math.max(0, v.get(key)!) : fallback);
  const d = DEFAULT_LEVERS;
  return {
    tokensPerPoint: n("daily_tokens_per_point", d.tokensPerPoint),
    places: n("daily_board_places", d.places),
    week: [n("daily_week_prize_1", d.week[0]), n("daily_week_prize_2", d.week[1]), n("daily_week_prize_3", d.week[2]), n("daily_week_prize_rest", d.week[3])],
    month: [n("daily_month_prize_1", d.month[0]), n("daily_month_prize_2", d.month[1]), n("daily_month_prize_3", d.month[2]), n("daily_month_prize_rest", d.month[3])],
    holdDays: n("daily_guest_hold_days", d.holdDays),
  };
}

export interface ScorePlayer { kind: PlayerKind; id: string }

/**
 * Pays tokens to a player once per key: into the wallet (accounts, Discord
 * identities) or held for a guest. Returns the tokens paid or held, 0 when
 * this key was already paid.
 */
async function pay(player: ScorePlayer, amount: number, kind: "play" | "prize", key: string, meta: Record<string, unknown>, holdDays: number): Promise<number> {
  if (amount <= 0) return 0;
  const admin = createServiceClient();
  if (player.kind === "g") {
    const { error } = await admin.from("daily_guest_rewards").insert({
      guest_key: player.id, kind, amount, ref: key, expires_at: new Date(Date.now() + holdDays * 86_400_000).toISOString(),
    });
    if (error) { if (!duplicate(error)) console.error("[boards] guest reward failed:", error); return 0; }
    return amount;
  }
  const wallet = player.kind === "u" ? (await ensureAccountWallet(player.id))?.identityId ?? null : await walletIdentityFor(player.id);
  if (!wallet) return 0;
  const { error } = await admin.from("token_events").insert({
    identity_id: wallet, community_id: null, amount, type: kind === "play" ? "earn_daily" : "award_board",
    meta: { source: "daily", ...meta }, idempotency_key: key,
  });
  if (error) { if (!duplicate(error)) console.error("[boards] payout failed:", error); return 0; }
  return amount;
}

/**
 * Records a finished game on the boards and pays its tokens. The first result
 * for a day stands: a second call for the same game, day and player changes
 * nothing. Null before the migration.
 */
export async function recordScore(args: { game: BoardGame; day: string; player: ScorePlayer; guesses: number; solved: boolean; main: number; startFallback?: string | null }): Promise<ScoreResult | null> {
  const points = pointsFor(args.guesses, args.solved, args.main);
  const key = playerKey(args.player.kind, args.player.id);
  const admin = createServiceClient();
  // No Start under the player: use the one this browser made as a guest, if any (see saveAccountResult).
  const seconds = (await secondsSinceStart(key, args.game, args.day))
    ?? (args.startFallback && args.startFallback !== key && parsePlayer(args.startFallback)?.kind === "g" ? await secondsSinceStart(args.startFallback, args.game, args.day) : null);
  const row = {
    game: args.game, day: args.day, player: key,
    user_id: args.player.kind === "u" ? args.player.id : null,
    identity_id: args.player.kind === "i" ? args.player.id : null,
    guest_key: args.player.kind === "g" ? args.player.id : null,
    points, guesses: args.guesses, solved: args.solved,
  };
  let { data, error } = await admin.from("daily_scores").upsert({ ...row, seconds }, { onConflict: "game,day,player", ignoreDuplicates: true }).select("player");
  // Before daily-times-m1 there's no seconds column: record the score without it.
  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    ({ data, error } = await admin.from("daily_scores").upsert(row, { onConflict: "game,day,player", ignoreDuplicates: true }).select("player"));
  }
  if (error) {
    if (boardsMissing(error)) return null;
    console.error("[boards] score failed:", error);
    return null;
  }
  if (!data?.length) return { points, tokens: 0, recorded: false, seconds };
  const levers = await boardLevers();
  const tokens = await pay(args.player, points * levers.tokensPerPoint, "play", `daily:${args.game}:${args.day}:${key}`, { game: args.game, day: args.day, points }, levers.holdDays).catch((e) => { console.error("[boards] pay failed:", e); return 0; });
  return { points, tokens, recorded: true, seconds };
}

/** A clock longer than this (a Start left open for days) isn't a solve time. */
const MAX_SOLVE_SECONDS = 2 * 86_400;

/**
 * Starts the clock on a player's game for a day: "Start today's puzzle"
 * (Britton's pick, 2026-10-16). The first Start stands, so starting again on
 * another device doesn't reset it. False before daily-times-m1.
 */
export async function markStart(key: string, game: BoardGame, day: string): Promise<boolean> {
  if (!parsePlayer(key)) return false;
  const { error } = await createServiceClient().from("daily_starts").upsert({ player: key, game, day }, { onConflict: "player,game,day", ignoreDuplicates: true });
  return !error;
}

/** Seconds from the player's Start to now, or null without a Start. */
async function secondsSinceStart(key: string, game: BoardGame, day: string): Promise<number | null> {
  const { data, error } = await createServiceClient().from("daily_starts").select("started_at").eq("player", key).eq("game", game).eq("day", day).maybeSingle();
  if (error || !data) return null;
  const s = Math.round((Date.now() - Date.parse((data as { started_at: string }).started_at)) / 1000);
  return s >= 0 && s <= MAX_SOLVE_SECONDS ? s : null;
}

/** A player's solve time for a day and their fastest solve ever in that game (nulls before daily-times-m1). */
export async function timesFor(key: string, game: BoardGame, day: string): Promise<SolveTimes> {
  const admin = createServiceClient();
  const [today, best] = await Promise.all([
    admin.from("daily_scores").select("seconds").eq("player", key).eq("game", game).eq("day", day).maybeSingle(),
    admin.from("daily_scores").select("seconds", { count: "exact" }).eq("player", key).eq("game", game).eq("solved", true).not("seconds", "is", null).order("seconds", { ascending: true }).limit(1).maybeSingle(),
  ]);
  if (today.error || best.error) return { seconds: null, fastest: null, timed: 0 };
  return {
    seconds: (today.data as { seconds: number | null } | null)?.seconds ?? null,
    fastest: (best.data as { seconds: number | null } | null)?.seconds ?? null,
    timed: best.count ?? 0,
  };
}

/** The player key an account or a Discord identity plays under: a linked identity counts as its account. */
export async function playerForIdentity(identityId: string, userId?: string | null): Promise<ScorePlayer> {
  if (userId) return { kind: "u", id: userId };
  const { data } = await createServiceClient().from("gs_identities").select("gs_account_id").eq("id", identityId).maybeSingle();
  const account = (data as { gs_account_id: string | null } | null)?.gs_account_id;
  return account ? { kind: "u", id: account } : { kind: "i", id: identityId };
}

type RawRow = { place: number; player: string; points: number; days: number; guesses: number; seconds?: number | null; user_id: string | null; identity_id: string | null; guest_key: string | null; total_players: number };

/** Names, pictures and profile links for a board's rows. Private profiles show as "A player". */
async function describe(rows: RawRow[]): Promise<Map<string, Pick<BoardRow, "name" | "tag" | "avatar" | "profile">>> {
  const admin = createServiceClient();
  const users = [...new Set(rows.map((r) => r.user_id).filter((x): x is string => !!x))];
  const idents = [...new Set(rows.map((r) => r.identity_id).filter((x): x is string => !!x))];
  const guests = [...new Set(rows.map((r) => r.guest_key).filter((x): x is string => !!x))];
  const [u, i, g] = await Promise.all([
    users.length ? admin.from("users").select("id, display_name, username, is_public, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar").in("id", users) : Promise.resolve({ data: [] }),
    idents.length ? admin.from("gs_identities").select("id, display_name, avatar_url").in("id", idents) : Promise.resolve({ data: [] }),
    guests.length ? admin.from("daily_guests").select("guest_key, name").in("guest_key", guests) : Promise.resolve({ data: [] }),
  ]);
  const out = new Map<string, Pick<BoardRow, "name" | "tag" | "avatar" | "profile">>();
  for (const r of (u.data ?? []) as (AccountRow & { display_name: string | null; username: string | null; is_public: boolean | null })[]) {
    out.set(`u:${r.id}`, r.is_public === false
      ? { name: "A player", tag: null, avatar: null, profile: null }
      : { name: r.display_name || r.username || "A player", tag: null, avatar: accountAvatar(r), profile: r.username ? `/u/${r.username}` : null });
  }
  for (const r of (i.data ?? []) as { id: string; display_name: string | null; avatar_url: string | null }[]) {
    out.set(`i:${r.id}`, { name: r.display_name || "A Discord player", tag: "discord", avatar: r.avatar_url ?? null, profile: null });
  }
  for (const r of (g.data ?? []) as { guest_key: string; name: string }[]) {
    out.set(`g:${r.guest_key}`, { name: r.name, tag: "guest", avatar: null, profile: null });
  }
  return out;
}

/** A board: today, this week or this month for a game, with the viewer's own row. */
export async function boardView(args: { game: BoardGame; period: BoardPeriod; day?: string; me?: string | null; limit?: number }): Promise<BoardView> {
  const day = args.day ?? gsDay();
  const { from, to } = periodRange(args.period, day);
  const empty: BoardView = { ready: false, game: args.game, period: args.period, from, to, rows: [], you: null, total: 0, settles: args.period === "day" ? null : settlesOn(args.period, from) };
  const { data, error } = await createServiceClient().rpc("gs_daily_board", { p_game: args.game, p_from: from, p_to: to, p_limit: args.limit ?? 25, p_player: args.me ?? null });
  if (error) {
    if (!boardsMissing(error)) console.error("[boards] board failed:", error);
    return empty;
  }
  const raw = (data ?? []) as RawRow[];
  const names = await describe(raw);
  const levers = args.period === "day" ? null : await boardLevers();
  const toRow = (r: RawRow): BoardRow => ({
    place: Number(r.place),
    ...(names.get(r.player) ?? { name: "A player", tag: null, avatar: null, profile: null }),
    points: Number(r.points), days: Number(r.days), guesses: Number(r.guesses),
    seconds: r.seconds == null ? null : Number(r.seconds),
    you: !!args.me && r.player === args.me,
    // Nobody on 0 points wins a prize (closePeriod skips them too).
    prize: levers && args.period !== "day" && Number(r.points) > 0 ? prizeFor(Number(r.place), args.period, levers) : 0,
  });
  const rows = raw.map(toRow);
  const limit = args.limit ?? 25;
  return {
    ...empty,
    ready: true,
    rows: rows.slice(0, limit),
    you: rows.find((r) => r.you) ?? null,
    total: raw.length ? Number(raw[0].total_players) : 0,
  };
}

/** Takes a player off the boards (their own choice, or staff), or puts them back. */
/**
 * One day's standings with each row's player key (`u:`/`i:`/`g:`), for the
 * winners video and notes (src/lib/daily/winners.ts). Names, avatars and the
 * private-profile rule are the board's own. Null when the boards are missing.
 */
export async function dayStandings(game: BoardGame, day: string, limit = 25): Promise<{ player: string; row: BoardRow }[] | null> {
  const { data, error } = await createServiceClient().rpc("gs_daily_board", { p_game: game, p_from: day, p_to: day, p_limit: limit, p_player: null });
  if (error) {
    if (!boardsMissing(error)) console.error("[boards] day standings failed:", error);
    return null;
  }
  const raw = ((data ?? []) as RawRow[]).slice(0, limit);
  const names = await describe(raw);
  return raw.map((r) => ({
    player: r.player,
    row: {
      place: Number(r.place),
      ...(names.get(r.player) ?? { name: "A player", tag: null, avatar: null, profile: null }),
      points: Number(r.points), days: Number(r.days), guesses: Number(r.guesses),
      seconds: r.seconds == null ? null : Number(r.seconds),
      you: false, prize: 0,
    },
  }));
}

export async function setHidden(player: string, hidden: boolean, by: { staff: boolean; userId: string | null }): Promise<boolean> {
  if (!parsePlayer(player)) return false;
  const admin = createServiceClient();
  if (!hidden) {
    // Players can't undo a staff hide themselves.
    let q = admin.from("daily_board_hidden").delete().eq("player", player);
    if (!by.staff) q = q.eq("by_staff", false);
    const { error } = await q;
    return !error;
  }
  const { error } = await admin.from("daily_board_hidden").upsert({ player, by_staff: by.staff, hidden_by: by.userId }, { onConflict: "player" });
  return !error;
}

export async function isHidden(player: string): Promise<{ hidden: boolean; byStaff: boolean } | null> {
  const { data, error } = await createServiceClient().from("daily_board_hidden").select("by_staff").eq("player", player).maybeSingle();
  if (error) return boardsMissing(error) ? null : { hidden: false, byStaff: false };
  return { hidden: !!data, byStaff: !!(data as { by_staff: boolean } | null)?.by_staff };
}

/**
 * Pays a week's or month's prizes, once. Nothing happens before the period
 * settles (two days after its last day) or if another run already claimed it.
 */
export async function closePeriod(game: BoardGame, period: "week" | "month", start: string, today = gsDay()): Promise<{ closed: boolean; paid: number }> {
  if (today < settlesOn(period, start)) return { closed: false, paid: 0 };
  const admin = createServiceClient();
  const claim = await admin.from("daily_board_closings").upsert({ game, period, period_start: start }, { onConflict: "game,period,period_start", ignoreDuplicates: true }).select("game");
  if (claim.error) { if (!boardsMissing(claim.error)) console.error("[boards] close failed:", claim.error); return { closed: false, paid: 0 }; }
  if (!claim.data?.length) return { closed: false, paid: 0 };

  const levers = await boardLevers();
  const { from, to } = periodRange(period, start);
  const { data, error } = await admin.rpc("gs_daily_board", { p_game: game, p_from: from, p_to: to, p_limit: Math.max(levers.places * 5, 50), p_player: null });
  if (error) { console.error("[boards] close board failed:", error); return { closed: true, paid: 0 }; }
  const winners = ((data ?? []) as RawRow[]).filter((r) => Number(r.place) <= levers.places && Number(r.points) > 0);
  let paid = 0;
  for (const r of winners) {
    const place = Number(r.place);
    const amount = prizeFor(place, period, levers);
    const player = parsePlayer(r.player);
    if (!player || amount <= 0) continue;
    const row = await admin.from("daily_board_payouts").insert({ game, period, period_start: start, player: r.player, place, points: Number(r.points), amount });
    if (row.error) { if (!duplicate(row.error)) console.error("[boards] payout row failed:", row.error); continue; }
    const got = await pay(player, amount, "prize", `board:${game}:${period}:${start}:${r.player}`, { game, period, start, place }, levers.holdDays);
    if (got) paid += 1;
    if (got && player.kind === "u") {
      await createNotification({
        userId: player.id,
        type: "daily_prize",
        title: `You finished ${ordinal(place)} in ${GAME_LABEL[game]} ${period === "week" ? "last week" : "last month"}`,
        message: `+${amount.toLocaleString("en-US")} tokens for ${Number(r.points)} points.`,
        link: GAME_PAGE[game],
        data: { game, period, start, place, amount },
      }).catch(() => { /* the tokens are paid either way */ });
    }
  }
  await admin.from("daily_board_closings").update({ winners: paid }).eq("game", game).eq("period", period).eq("period_start", start);
  return { closed: true, paid };
}

/** The daily cron: settles last week and last month for both games once they're due. */
export async function closeDue(now = Date.now()): Promise<{ game: BoardGame; period: string; start: string; closed: boolean; paid: number }[]> {
  const today = gsDay(now);
  const lastWeek = gsAddDays(gsWeekStart(now), -7);
  const lastMonth = gsMonthStart(Date.parse(`${gsAddDays(gsMonthStart(now), -1)}T12:00:00Z`));
  const out = [];
  for (const game of ["shuffle", "dex"] as BoardGame[]) {
    for (const [period, start] of [["week", lastWeek], ["month", lastMonth]] as const) {
      out.push({ game, period, start, ...(await closePeriod(game, period, start, today)) });
    }
  }
  return out;
}
