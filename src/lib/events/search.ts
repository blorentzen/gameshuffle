import "server-only";

/**
 * Server-side browse: filter and paginate in SQL instead of shipping every row.
 *
 * The hubs used to load up to 200 rows into the page payload and filter them in
 * memory. That was fine at 74 tournaments and gets worse linearly. This runs the
 * same facets as a query against gs_browse_tournaments / gs_browse_game_nights,
 * which carry the two aggregates the filters need (going_count and
 * min_price_cents) so a cursor actually means something.
 *
 * KEYSET, NOT OFFSET. Ordering is (starts_at, id) and the cursor is the last
 * row's pair, so page two cannot repeat or skip a row when an event is created
 * between requests. Offset paging silently does both.
 *
 * WHAT STAYS ON THE CLIENT: the "best match" sort, which scores against the
 * viewer's saved preferences and cannot be expressed in SQL. It re-ranks the
 * rows already fetched, which is honest for a sort and would not be for a
 * filter. Distance IS expressible, as a bounding box, so radius is applied here.
 *
 * SHIPS DARK: `browseViewsReady()` is false until browse-views-m1.sql runs, and
 * every caller falls back to the old load-everything path.
 */

import { notStaleOpenFilter } from "@/lib/events/lifecycle";
import { createServiceClient } from "@/lib/supabase/admin";
import { getGameName } from "@/data/game-registry";
import { FORMAT_LABEL } from "@/data/tournament-formats";
import type { BrowseEvent } from "@/components/events/EventsBrowser";

export const PAGE_SIZE = 24;
/** Rows older than this are not browsable. Mirrors the legacy loaders. */
const PAST_DAYS = 30;
/**
 * Finished tournaments stay browsable this long: the Completed tab and All's
 * "Recent results". Mirrors loadTournamentRows (RESULTS_DAYS), which draws the
 * first paint and the tab counts; with 30 here the list emptied after the first
 * fetch while the tabs still counted a year (found 2026-10-19).
 */
const RESULTS_DAYS = 365;

/** A browse cursor: the last row's (date, id), and for tournaments which part of All it sits in. */
export type BrowseCursor = { startsAt: string | null; id: string; seg?: "coming" | "results" };

export interface BrowseQuery {
  type: "tournament" | "game-night";
  q?: string;
  genre?: string;
  level?: string;
  kind?: string;
  game?: string;
  online?: "" | "online" | "in_person";
  price?: "" | "free" | "paid";
  format?: string;
  openSpots?: boolean;
  /** Tournament lifecycle tab. */
  status?: string;
  /** Lifecycle window for game nights: upcoming | live | past | "" */
  when?: string;
  /** Bounding box for a radius search, in degrees. */
  box?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  /** Keyset cursor: the previous page's last (starts_at, id). */
  cursor?: BrowseCursor | null;
  limit?: number;
}

export interface BrowsePage {
  rows: BrowseEvent[];
  nextCursor: BrowseCursor | null;
  /** Total matching the filters, so the UI can say how many are left. */
  total: number;
}

function isMissingView(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message ?? "");
}

/** Whether browse-views-m1.sql has been applied. */
export async function browseViewsReady(): Promise<boolean> {
  try {
    const { error } = await createServiceClient()
      .from("gs_browse_tournaments").select("id").limit(1);
    return !isMissingView(error);
  } catch {
    return false;
  }
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const since = () => daysAgo(PAST_DAYS);

/* ── Tournaments ─────────────────────────────────────────────────────────── */

type TRow = {
  id: string; title: string; game_slug: string; mode: string | null; format: string | null;
  status: string; date_time: string | null; max_participants: number | null;
  header_image_url: string | null; settings: Record<string, unknown> | null;
  going_count: number; min_price_cents: number | null; organizer_name: string | null;
  game_label: string | null; is_online: boolean; lat?: number | null; lng?: number | null;
  /** An official GameShuffle event (official-events-m1); missing before that migration. */
  hosted_by_gs?: boolean;
};

function tournamentToEvent(t: TRow): BrowseEvent {
  const s = (t.settings ?? {}) as { location?: string | null; requireVerified?: boolean };
  return {
    type: "tournament",
    id: t.id,
    href: `/tournament/${t.id}`,
    title: t.title,
    starts_at: t.date_time,
    timezone: null,
    place: t.is_online ? null : (s.location ?? "In person"),
    lat: t.is_online ? null : (t.lat ?? null),
    lng: t.is_online ? null : (t.lng ?? null),
    online: t.is_online,
    cover: t.header_image_url ?? null,
    kind: null,
    level: null,
    genres: [],
    gameLengths: [],
    gameCount: 0,
    game: t.game_label || getGameName(t.game_slug),
    format: t.format ?? null,
    tags: [
      t.hosted_by_gs ? "Official" : null,
      t.format ? FORMAT_LABEL[t.format] ?? t.format : null,
      t.mode?.toUpperCase() ?? null,
      s.requireVerified ? "Verified only" : null,
    ].filter((x): x is string => !!x),
    phase: t.status === "cancelled" ? "cancelled"
      : t.status === "complete" ? "past"
      : t.status === "in_progress" ? "live" : "upcoming",
    status: (t.status as BrowseEvent["status"]) ?? null,
    goingCount: t.going_count,
    priceFromCents: t.min_price_cents,
    capacity: t.max_participants,
    organizer: t.organizer_name,
  };
}

/* ── Game nights ─────────────────────────────────────────────────────────── */

type NRow = {
  id: string; title: string; starts_at: string | null; timezone: string | null;
  place: string | null; lat: number | null; lng: number | null;
  cover_image_url: string | null; kind: string | null; level: string | null;
  genres: string[] | null; games: { length?: string | null }[] | null;
  status: string; capacity: number | null;
  going_count: number; min_price_cents: number | null; organizer_name: string | null;
};

function nightToEvent(n: NRow): BrowseEvent {
  const now = Date.now();
  return {
    type: "game-night",
    id: n.id,
    href: `/game-nights/${n.id}`,
    title: n.title,
    starts_at: n.starts_at,
    timezone: n.timezone,
    place: n.place,
    lat: n.lat,
    lng: n.lng,
    online: false,
    cover: n.cover_image_url,
    kind: n.kind ?? "board",
    level: n.level,
    genres: n.genres ?? [],
    gameLengths: [...new Set((n.games ?? []).map((g) => g.length).filter((l): l is string => !!l))],
    gameCount: (n.games ?? []).length,
    game: null,
    tags: [],
    phase: n.status === "cancelled" ? "cancelled"
      : n.starts_at && Date.parse(n.starts_at) < now ? "past" : "upcoming",
    status: null,
    goingCount: n.going_count,
    priceFromCents: n.min_price_cents,
    capacity: n.capacity,
    organizer: n.organizer_name,
  };
}

/* ── The query ───────────────────────────────────────────────────────────── */

export async function searchBrowse(qy: BrowseQuery): Promise<BrowsePage | null> {
  const svc = createServiceClient();
  const limit = qy.limit ?? PAGE_SIZE;
  const isT = qy.type === "tournament";
  const view = isT ? "gs_browse_tournaments" : "gs_browse_game_nights";
  const dateCol = isT ? "date_time" : "starts_at";

  /*
   * Tournaments read in two parts, like loadTournamentRows: what's coming
   * (open and in progress, soonest first, stale ones left out) and then a year
   * of results (newest first), so results never crowd out what's coming. The
   * Completed tab is only the second part; Registration and In progress only
   * the first. Game nights are one part.
   */
  type Seg = "coming" | "results" | "all";
  const segs: Seg[] = !isT ? ["all"]
    : qy.status === "complete" ? ["results"]
    : qy.status ? ["coming"]
    : ["coming", "results"];

  const build = (forCount: boolean, seg: Seg) => {
    let b = svc.from(view).select(forCount ? "id" : "*", forCount ? { count: "exact", head: true } : undefined);

    if (isT) {
      b = b.is("archived_at", null).is("championship_id", null);
      b = seg === "results"
        ? b.eq("status", "complete").or(`${dateCol}.gte.${daysAgo(RESULTS_DAYS)},${dateCol}.is.null`)
        : b.in("status", ["open", "in_progress"]).or(notStaleOpenFilter());
    } else {
      b = b.eq("visibility", "public").in("status", ["scheduled"]).is("archived_at", null);
      b = b.or(`${dateCol}.gte.${since()},${dateCol}.is.null`);
    }

    if (qy.q?.trim()) {
      const t = qy.q.trim().replace(/[%,()]/g, " ");
      const cols = isT
        ? [`title.ilike.%${t}%`, `game_label.ilike.%${t}%`, `organizer_name.ilike.%${t}%`]
        : [`title.ilike.%${t}%`, `place.ilike.%${t}%`, `organizer_name.ilike.%${t}%`];
      b = b.or(cols.join(","));
    }
    if (qy.status && isT && seg === "coming") b = b.eq("status", qy.status);
    if (qy.status && !isT) b = b.eq("status", qy.status);
    if (qy.format) b = b.eq("format", qy.format);
    if (qy.game) b = b.eq("game_label", qy.game);
    if (qy.level) b = b.eq("level", qy.level);
    if (qy.kind) b = b.eq("kind", qy.kind);
    if (qy.genre) b = b.contains("genres", [qy.genre]);
    if (qy.online === "online") b = isT ? b.eq("is_online", true) : b.is("id", null); // nights are never online yet
    if (qy.online === "in_person") b = isT ? b.eq("is_online", false) : b;
    if (qy.price === "free") b = b.is("min_price_cents", null);
    if (qy.price === "paid") b = b.not("min_price_cents", "is", null);
    if (qy.openSpots) b = b.eq("has_room", true);
    if (qy.box) {
      b = b.gte("lat", qy.box.minLat).lte("lat", qy.box.maxLat)
           .gte("lng", qy.box.minLng).lte("lng", qy.box.maxLng);
    }
    // Lifecycle window. Tournaments use status tabs instead, so this is nights.
    if (!isT) {
      if (qy.when === "upcoming") b = b.eq("status", "scheduled").gte(dateCol, new Date().toISOString());
      else if (qy.when === "past") b = b.lt(dateCol, new Date().toISOString());
    }
    return b;
  };

  // Keyset: everything strictly after the cursor in (date, id) order, with
  // undated rows ("date to be announced") sorted LAST.
  //
  // Both branches have to honour that null block. The first version filtered
  // a dated cursor with `date > X OR (date = X AND id > Y)`, which a null date
  // can never satisfy, so every undated event vanished after page 1 while the
  // total still counted them. Once the cursor sits inside the null block,
  // only nulls with a later id remain; `id > Y` alone pulled dated rows back.
  // Results run newest first, so their keyset is the mirror image.
  const pageFor = (seg: Seg, cursor: BrowseCursor | null) => {
    const asc = seg !== "results";
    let page = build(false, seg).order(dateCol, { ascending: asc, nullsFirst: false }).order("id", { ascending: asc });
    if (cursor) {
      const { startsAt, id } = cursor;
      const gt = asc ? "gt" : "lt";
      page = startsAt
        ? page.or(`${dateCol}.${gt}.${startsAt},and(${dateCol}.eq.${startsAt},id.${gt}.${id}),${dateCol}.is.null`)
        : (asc ? page.is(dateCol, null).gt("id", id) : page.is(dateCol, null).lt("id", id));
    }
    return page;
  };

  // A cursor without a part is the first part (and every cursor from before this change).
  const startAt = qy.cursor?.seg ? Math.max(0, segs.indexOf(qy.cursor.seg)) : 0;
  const [counts, fetched] = await Promise.all([
    Promise.all(segs.map((seg) => build(true, seg))),
    (async () => {
      const got: { seg: Seg; row: unknown }[] = [];
      for (let i = startAt; i < segs.length && got.length <= limit; i++) {
        const { data, error } = await pageFor(segs[i], i === startAt ? qy.cursor ?? null : null).limit(limit + 1 - got.length);
        if (error) return { got, error };
        for (const row of data ?? []) got.push({ seg: segs[i], row });
      }
      return { got, error: null };
    })(),
  ]);
  const cErr = counts.find((c) => c.error)?.error ?? null;
  if (isMissingView(fetched.error) || isMissingView(cErr)) return null;
  if (fetched.error) throw new Error(fetched.error.message);

  const hasMore = fetched.got.length > limit;
  const kept = hasMore ? fetched.got.slice(0, limit) : fetched.got;
  const rows = isT
    ? kept.map((k) => tournamentToEvent(k.row as TRow))
    : kept.map((k) => nightToEvent(k.row as NRow));

  const last = kept[kept.length - 1];
  const lastRow = last?.row as ({ id: string } & Record<string, unknown>) | undefined;
  const count = counts.reduce((n, c) => n + (c.count ?? 0), 0);
  return {
    rows,
    nextCursor: hasMore && last && lastRow
      ? { startsAt: (lastRow[dateCol] as string | null) ?? null, id: lastRow.id, ...(isT && last.seg !== "all" ? { seg: last.seg as "coming" | "results" } : {}) }
      : null,
    total: count || rows.length,
  };
}
