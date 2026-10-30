import "server-only";

/**
 * What the competitive Mario Kart hub shows (/competitive-mario-kart, picks 2026-10-30, all as
 * recommended): this week's new time trial records, who's climbing the lounge this week, Mario Kart
 * tournaments coming up and recent winners, and a signed-in player's own strip (lounge, time trials,
 * MMR card). Every part reads data the site already has; each one fails quietly to empty.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { describePlayers } from "@/lib/daily/boards";
import { notStaleOpenFilter } from "@/lib/events/lifecycle";
import { FORMAT_LABEL } from "@/data/tournament-formats";
import { placeOf, trackSummary, playerBests } from "@/lib/timeTrials/store";
import { trackPath, ttTrack, TT_GAMES, TT_GAME_ORDER, type TtClass, type TtGame } from "@/lib/timeTrials/tracks";
import { categoryText, TOP_TEN, type TtItems } from "@/lib/timeTrials/categories";
import type { TtPlayer } from "@/lib/timeTrials/rules";
import { weekClimbers } from "@/lib/lounge/lookupServer";
import { linksFor } from "@/lib/lounge/store";
import { cardFor } from "@/lib/mmr/store";
import { MMR_GAME_IDS, MMR_GAMES, type MmrGame } from "@/lib/mmr/rules";

const MK_SLUGS = ["mario-kart-8-deluxe", "mario-kart-world"];
const WEEK_MS = 7 * 86_400_000;

export interface HubRecord { track: string; image: string | null; what: string; timeMs: number; holder: string; at: string; href: string; record: boolean; place: number; total: number }

/**
 * This week's times (not imports): the ones that hold their open board's record first, then the newest
 * others with their place, so the card is never half empty on a quiet week.
 */
export async function recordsThisWeek(limit = 3): Promise<HubRecord[]> {
  try {
    const since = new Date(Date.now() - WEEK_MS).toISOString();
    const { data } = await createServiceClient().from("tt_times")
      .select("game, track, cc, items, player, time_ms, created_at")
      .eq("status", "ok").neq("source", "import").gte("created_at", since)
      .order("created_at", { ascending: false }).limit(300);
    const recent = (data ?? []) as { game: TtGame; track: string; cc: number; items: TtItems; player: string; time_ms: number; created_at: string }[];
    if (!recent.length) return [];
    const boards = new Map<string, Awaited<ReturnType<typeof trackSummary>>>();
    for (const g of TT_GAME_ORDER) for (const it of ["shrooms", "none"] as TtItems[]) {
      if (recent.some((r) => r.game === g && r.items === it)) boards.set(`${g}|${it}`, await trackSummary(g, it, "any"));
    }
    const out: HubRecord[] = [];
    const seen = new Set<string>();
    const row = (r: (typeof recent)[number], record: boolean, place: number, total: number): HubRecord | null => {
      const t = ttTrack(r.game, r.track);
      if (!t) return null;
      return {
        track: t.name, image: t.image, timeMs: r.time_ms, holder: r.player, at: r.created_at, record, place, total,
        what: `${TT_GAMES[r.game].label} · ${categoryText(r.game, r.cc as TtClass, r.items, "any", TT_GAMES[r.game].classes.length > 1)}`,
        href: trackPath(t, r.cc as TtClass, { items: r.items }),
      };
    };
    for (const r of recent) {
      const key = `${r.game}|${r.track}|${r.cc}|${r.items}`;
      if (seen.has(key)) continue;
      const s = boards.get(`${r.game}|${r.items}`)?.find((x) => x.track === r.track && x.cc === r.cc);
      if (!s || s.recordPlayer !== r.player || s.recordMs !== r.time_ms) continue;
      const h = row(r, true, 1, s.players);
      if (!h) continue;
      seen.add(key);
      out.push(h);
      if (out.length >= limit) break;
    }
    for (const r of recent) {
      if (out.length >= limit) break;
      const key = `${r.game}|${r.track}|${r.cc}|${r.items}`;
      if (seen.has(key)) continue;
      const { place, total } = await placeOf(r.game, r.track, r.cc as TtClass, r.time_ms, r.player, null, r.items, "any");
      const h = row(r, false, place, total);
      if (!h) continue;
      seen.add(key);
      out.push(h);
    }
    const names = await describePlayers(out.map((o) => o.holder));
    return out.map((o) => ({ ...o, holder: names.get(o.holder)?.name ?? "A player" }));
  } catch (e) {
    console.error("[cmk] records:", (e as Error).message);
    return [];
  }
}

export interface HubClimber { name: string; game: MmrGame; mmr: number | null; division: string | null; climbed: number; href: string }

/** The lounge's biggest climbers this week across the three games (null when MKCentral doesn't answer). */
export async function climbersThisWeek(limit = 3): Promise<HubClimber[] | null> {
  const boards = await Promise.all(MMR_GAME_IDS.map((g) => weekClimbers(g).then((b) => ({ g, b })).catch(() => null)));
  if (boards.every((x) => !x)) return null;
  const rows = boards.flatMap((x) => (x ? x.b.rows.map((r) => ({ ...r, game: x.g })) : []))
    .filter((r) => r.weekChange != null && r.weekChange < 0);
  return rows.sort((a, b) => (a.weekChange ?? 0) - (b.weekChange ?? 0)).slice(0, limit).map((r) => ({
    name: r.name, game: r.game, mmr: r.mmr, division: r.division, climbed: -(r.weekChange ?? 0),
    href: `/lounge/${encodeURIComponent(r.name)}${r.game === "mkworld12p" ? "" : `?game=${r.game}`}`,
  }));
}

export interface HubTournament { id: string; title: string; at: string | null; game: string; format: string | null; players: number; capacity: number | null; live: boolean }
export interface HubWinner { id: string; title: string; winner: string; players: number }

/** Mario Kart tournaments coming up (soonest first), and recent winners from the last two weeks. */
export async function mkTournaments(): Promise<{ coming: HubTournament[]; winners: HubWinner[] }> {
  try {
    const db = createServiceClient();
    const [{ data: c }, { data: done }] = await Promise.all([
      db.from("gs_browse_tournaments").select("id, title, date_time, game_slug, game_label, format, status, going_count, max_participants")
        .in("game_slug", MK_SLUGS).in("status", ["open", "in_progress"]).is("archived_at", null).is("championship_id", null)
        .or(notStaleOpenFilter()).order("date_time", { ascending: true, nullsFirst: false }).limit(3),
      db.from("gs_browse_tournaments").select("id, title, going_count")
        .in("game_slug", MK_SLUGS).eq("status", "complete").is("archived_at", null)
        .gte("date_time", new Date(Date.now() - 2 * WEEK_MS).toISOString()).order("date_time", { ascending: false }).limit(6),
    ]);
    type Row = { id: string; title: string; date_time: string | null; game_slug: string; game_label: string | null; format: string | null; status: string; going_count: number; max_participants: number | null };
    const coming = ((c ?? []) as Row[]).map((t) => ({
      id: t.id, title: t.title, at: t.date_time, game: t.game_label || (t.game_slug === "mario-kart-world" ? "Mario Kart World" : "Mario Kart 8 Deluxe"),
      format: t.format ? FORMAT_LABEL[t.format] ?? null : null, players: t.going_count ?? 0, capacity: t.max_participants, live: t.status === "in_progress",
    }));
    const finished = (done ?? []) as { id: string; title: string; going_count: number }[];
    const winners: HubWinner[] = [];
    if (finished.length) {
      const { data: res } = await db.from("tournament_results").select("tournament_id, participant_id").eq("placement", 1).in("tournament_id", finished.map((t) => t.id));
      const firsts = (res ?? []) as { tournament_id: string; participant_id: string }[];
      const { data: parts } = firsts.length ? await db.from("tournament_participants").select("id, display_name").in("id", firsts.map((r) => r.participant_id)) : { data: [] };
      const nameOf = new Map(((parts ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, p.display_name]));
      for (const t of finished) {
        const ids = firsts.filter((r) => r.tournament_id === t.id).map((r) => nameOf.get(r.participant_id)).filter((n): n is string => !!n);
        if (ids.length) winners.push({ id: t.id, title: t.title, winner: ids.join(" and "), players: t.going_count ?? 0 });
        if (winners.length >= 2) break;
      }
    }
    return { coming, winners };
  } catch (e) {
    console.error("[cmk] tournaments:", (e as Error).message);
    return { coming: [], winners: [] };
  }
}

export interface HubYou {
  lounge: { name: string; game: MmrGame; gameShort: string; mmr: number | null; division: string | null; worldRank: number | null; week: number | null; href: string } | null;
  times: { tracks: number; records: number; topTens: number; needClip: number };
  card: { token: string } | null;
}

/** A signed-in player's strip: their best confirmed lounge game, their time trials, their MMR card. */
export async function hubYou(userId: string, player: TtPlayer): Promise<HubYou> {
  const [links, bests, card] = await Promise.all([
    linksFor(userId).catch(() => []),
    playerBests(player).catch(() => []),
    cardFor(userId).catch(() => null),
  ]);
  const best = [...links].sort((a, b) => (b.mmr ?? -1) - (a.mmr ?? -1))[0];
  const open = bests.filter((b) => b.vehicle === "any");
  return {
    lounge: best ? {
      name: best.name, game: best.game, gameShort: MMR_GAMES[best.game].short, mmr: best.mmr, division: best.division, worldRank: best.worldRank,
      week: best.mmr != null && best.weekMmr != null ? best.mmr - best.weekMmr : null,
      href: `/lounge/${encodeURIComponent(best.name)}${best.game === "mkworld12p" ? "" : `?game=${best.game}`}`,
    } : null,
    times: {
      tracks: new Set(open.map((b) => `${b.game}|${b.track}`)).size,
      records: open.filter((b) => b.place === 1).length,
      topTens: open.filter((b) => b.place <= TOP_TEN).length,
      needClip: bests.filter((b) => b.place <= TOP_TEN && b.video !== "checked" && b.video !== "waiting").length,
    },
    card: card ? { token: card.token } : null,
  };
}
