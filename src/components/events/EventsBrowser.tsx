"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@empac/cascadeds";
import { boardGameLevelLabel, BOARD_GAME_LEVELS } from "@/data/board-games";
import { nightVisual } from "@/data/game-night-visuals";
import { NIGHT_KINDS, nightKindLabel } from "@/lib/game-nights/types";
import { matchScore, isGoodMatch, haversineMiles, formatMiles, type ViewerPrefs } from "@/lib/game-nights/match";
import type { EventType } from "@/lib/events/calendar";

/**
 * Shared event browser for the two hubs (Eventbrite's browse, our two intents).
 *
 * `/game-nights` and `/tournament` each render one of these with their own
 * rows; the URLs stay separate and canonical. What is shared: the card, the
 * filter bar, geolocation + radius, sorting, and **URL-state filters** so a
 * filtered view is a link (`?kind=video&when=weekend&near=30.27,-97.74&radius=25`)
 * and the server-rendered HTML for that link already reflects it.
 *
 * Filtering happens in memory over the rows the page loaded (both hubs load a
 * bounded upcoming set), so typing is instant; the URL is kept in sync with
 * `router.replace` and no scroll jump.
 */

export interface BrowseEvent {
  type: EventType;
  id: string;
  href: string;
  title: string;
  starts_at: string | null;
  timezone: string | null;
  /** Place text for in-person; null for online / TBA. */
  place: string | null;
  lat: number | null;
  lng: number | null;
  online: boolean;
  cover: string | null;
  /** Night kind (board/video/tcg/mixed) — null for tournaments. */
  kind: string | null;
  level: string | null;
  genres: string[];
  gameLengths: string[];
  gameCount: number;
  /** Game label for tournaments (filterable); null for nights. */
  game: string | null;
  /** Extra badges: format, mode, "Verified only"… */
  tags: string[];
  /** Lifecycle for the When filter: upcoming / live / past / cancelled. */
  phase: "upcoming" | "live" | "past" | "cancelled";
  goingCount: number | null;
  capacity: number | null;
  organizer: string | null;
}

export interface EventsBrowserConfig {
  type: EventType;
  heading: string;
  createHref?: string | null;
  createLabel?: string;
  searchPlaceholder: string;
  emptyText: string;
  /** Which filters to show. */
  filters: { genre?: boolean; kind?: boolean; level?: boolean; game?: boolean; online?: boolean; when?: boolean };
  /** Default When when the URL has none. */
  defaultWhen?: When;
  /** Optional cross-rail to the other hub, rendered under the grid. */
  crossRail?: { heading: string; href: string; linkLabel: string; items: BrowseEvent[] } | null;
}

type Sort = "soon" | "near" | "match";
type When = "upcoming" | "today" | "weekend" | "week" | "live" | "past" | "all";
type GeoState = "idle" | "locating" | "ok" | "denied" | "unsupported";

const WHEN_OPTIONS: { value: When; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "today", label: "Today" },
  { value: "weekend", label: "This weekend" },
  { value: "week", label: "Next 7 days" },
  { value: "live", label: "Happening now" },
  { value: "past", label: "Past" },
  { value: "all", label: "Everything" },
];

function fmtDate(iso: string | null, tz: string | null): string {
  if (!iso) return "Date TBA";
  try {
    return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz || undefined });
  } catch {
    return new Date(iso).toLocaleDateString();
  }
}

/** Window bounds for the When filter, in the viewer's local time. */
function whenWindow(when: When, now: Date): { from: number; to: number } | null {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  switch (when) {
    case "today": return { from: start.getTime(), to: start.getTime() + day };
    case "week": return { from: now.getTime(), to: now.getTime() + 7 * day };
    case "weekend": {
      // Fri 00:00 → Mon 00:00. Mon–Thu: the coming weekend; Fri–Sun: the one we're in.
      const dow = start.getDay(); // 0 = Sun
      const daysToFri = dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow;
      const fri = new Date(start); fri.setDate(start.getDate() + daysToFri);
      const mon = new Date(fri); mon.setDate(fri.getDate() + 3);
      return { from: Math.max(fri.getTime(), now.getTime()), to: mon.getTime() };
    }
    default: return null;
  }
}

export function EventsBrowser({ events, config, viewerPrefs = null }: { events: BrowseEvent[]; config: EventsBrowserConfig; viewerPrefs?: ViewerPrefs | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // ── URL-backed filter state ─────────────────────────────────────────────────
  const initialNear = (() => { const v = params.get("near"); if (!v) return null; const [a, b] = v.split(",").map(Number); return Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lng: b } : null; })();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [genre, setGenre] = useState(params.get("genre") ?? "");
  const [level, setLevel] = useState(params.get("level") ?? "");
  const [kind, setKind] = useState(params.get("kind") ?? "");
  const [game, setGame] = useState(params.get("game") ?? "");
  const [online, setOnline] = useState(params.get("online") ?? "");
  const [when, setWhen] = useState<When>((params.get("when") as When) || config.defaultWhen || "upcoming");
  const [sort, setSort] = useState<Sort>(((params.get("sort") as Sort) || (initialNear ? "near" : "soon")));
  const [radius, setRadius] = useState(Number(params.get("radius") ?? 0) || 0);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(initialNear);
  const [geo, setGeo] = useState<GeoState>(initialNear ? "ok" : "idle");
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const p = new URLSearchParams();
    if (query.trim()) p.set("q", query.trim());
    if (genre) p.set("genre", genre);
    if (level) p.set("level", level);
    if (kind) p.set("kind", kind);
    if (game) p.set("game", game);
    if (online) p.set("online", online);
    if (when !== (config.defaultWhen || "upcoming")) p.set("when", when);
    if (sort !== "soon") p.set("sort", sort);
    if (radius) p.set("radius", String(radius));
    if (coords) p.set("near", `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}`);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [query, genre, level, kind, game, online, when, sort, radius, coords, pathname, router, config.defaultWhen]);

  const hasPrefs = !!viewerPrefs && (viewerPrefs.genres.length > 0 || !!viewerPrefs.level || viewerPrefs.lengths.length > 0);

  const genreOptions = useMemo(() => [...new Set(events.flatMap((e) => e.genres))].sort((a, b) => a.localeCompare(b)), [events]);
  const gameOptions = useMemo(() => [...new Set(events.map((e) => e.game).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b)), [events]);

  const locateMe = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGeo("unsupported"); return; }
    setGeo("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeo("ok"); setSort("near"); },
      () => setGeo("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();
    const win = whenWindow(when, now);
    let list = events.map((e) => ({
      event: e,
      score: hasPrefs ? matchScore(viewerPrefs!, { genres: e.genres, level: e.level, gameLengths: e.gameLengths }) : 0,
      distance: coords && e.lat != null && e.lng != null ? haversineMiles(coords, { lat: e.lat, lng: e.lng }) : null,
    }));

    if (when === "upcoming") list = list.filter((r) => r.event.phase === "upcoming" || r.event.phase === "live");
    else if (when === "live") list = list.filter((r) => r.event.phase === "live");
    else if (when === "past") list = list.filter((r) => r.event.phase === "past");
    else if (win) list = list.filter((r) => r.event.starts_at && Date.parse(r.event.starts_at) >= win.from && Date.parse(r.event.starts_at) < win.to && r.event.phase !== "cancelled");

    if (q) list = list.filter((r) => r.event.title.toLowerCase().includes(q) || (r.event.place ?? "").toLowerCase().includes(q) || (r.event.game ?? "").toLowerCase().includes(q) || (r.event.organizer ?? "").toLowerCase().includes(q) || r.event.genres.some((g) => g.toLowerCase().includes(q)));
    if (genre) list = list.filter((r) => r.event.genres.some((g) => g.toLowerCase() === genre.toLowerCase()));
    if (level) list = list.filter((r) => r.event.level === level);
    if (kind) list = list.filter((r) => (r.event.kind ?? "board") === kind);
    if (game) list = list.filter((r) => r.event.game === game);
    if (online === "online") list = list.filter((r) => r.event.online);
    if (online === "in_person") list = list.filter((r) => !r.event.online);
    if (coords && radius > 0) list = list.filter((r) => r.event.online || (r.distance != null && r.distance <= radius));

    const bySoon = (a: { event: BrowseEvent }, b: { event: BrowseEvent }) => {
      const av = a.event.starts_at ? Date.parse(a.event.starts_at) : Infinity;
      const bv = b.event.starts_at ? Date.parse(b.event.starts_at) : Infinity;
      return when === "past" ? bv - av : av - bv;
    };
    if (sort === "near") list.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || bySoon(a, b));
    else if (sort === "match") list.sort((a, b) => b.score - a.score || bySoon(a, b));
    else list.sort(bySoon);
    return list;
  }, [events, query, genre, level, kind, game, online, when, sort, radius, coords, hasPrefs, viewerPrefs]);

  const forYou = useMemo(() => {
    if (!hasPrefs) return [];
    return events
      .filter((e) => e.phase === "upcoming")
      .map((e) => ({ event: e, score: matchScore(viewerPrefs!, { genres: e.genres, level: e.level, gameLengths: e.gameLengths }) }))
      .filter((r) => isGoodMatch(r.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [events, hasPrefs, viewerPrefs]);

  const activeCount = [query.trim(), genre, level, kind, game, online, radius ? "r" : "", when !== (config.defaultWhen || "upcoming") ? "w" : ""].filter(Boolean).length;
  const clearAll = () => { setQuery(""); setGenre(""); setLevel(""); setKind(""); setGame(""); setOnline(""); setWhen(config.defaultWhen || "upcoming"); setRadius(0); setSort(coords ? "near" : "soon"); };

  return (
    <>
      {forYou.length > 0 && (
        <div className="bgn-foryou">
          <h2 className="bgn-side__heading" style={{ marginTop: 0 }}>Nights that fit you</h2>
          <div className="bgn-foryou__row">
            {forYou.map(({ event: e }) => (
              <Link key={e.id} href={e.href} className="bgn-foryou__card">
                <span className="bgn-card__when">{fmtDate(e.starts_at, e.timezone)}</span>
                <span className="bgn-card__title">{e.title}</span>
                {e.place && <span className="bgn-card__place">{e.place}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="bgn-browse__head">
        <h2 style={{ fontSize: "var(--font-size-fluid-h3)", fontWeight: "var(--font-weight-bold)", lineHeight: "var(--line-height-tight)", margin: 0 }}>
          {config.heading}
        </h2>
        {config.createHref && (
          <Link href={config.createHref} style={{ textDecoration: "none" }}>
            <Button variant="secondary">{config.createLabel ?? "Create"}</Button>
          </Link>
        )}
      </div>

      <div className="bgn-filters">
        <div className="bgn-filters__field bgn-filters__field--search">
          <label className="bgn-filters__label" htmlFor="events-filter-search">Search</label>
          <Input id="events-filter-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={config.searchPlaceholder} fullWidth />
        </div>
        {config.filters.when && (
          <div className="bgn-filters__field">
            <label className="bgn-filters__label">When</label>
            <Select value={when} onChange={(v) => setWhen(v as When)} fullWidth options={WHEN_OPTIONS} />
          </div>
        )}
        {config.filters.game && gameOptions.length > 0 && (
          <div className="bgn-filters__field">
            <label className="bgn-filters__label">Game</label>
            <Select value={game} onChange={(v) => setGame(v as string)} fullWidth options={[{ value: "", label: "Any game" }, ...gameOptions.map((g) => ({ value: g, label: g }))]} />
          </div>
        )}
        {config.filters.genre && genreOptions.length > 0 && (
          <div className="bgn-filters__field">
            <label className="bgn-filters__label">Genre</label>
            <Select value={genre} onChange={(v) => setGenre(v as string)} fullWidth options={[{ value: "", label: "Any genre" }, ...genreOptions.map((g) => ({ value: g, label: g }))]} />
          </div>
        )}
        {config.filters.kind && (
          <div className="bgn-filters__field">
            <label className="bgn-filters__label">Playing</label>
            <Select value={kind} onChange={(v) => setKind(v as string)} fullWidth options={[{ value: "", label: "Anything" }, ...NIGHT_KINDS.map((k) => ({ value: k.value, label: k.short }))]} />
          </div>
        )}
        {config.filters.level && (
          <div className="bgn-filters__field">
            <label className="bgn-filters__label">Skill level</label>
            <Select value={level} onChange={(v) => setLevel(v as string)} fullWidth options={[{ value: "", label: "Any level" }, ...BOARD_GAME_LEVELS.map((l) => ({ value: l.value, label: l.label }))]} />
          </div>
        )}
        {config.filters.online && (
          <div className="bgn-filters__field">
            <label className="bgn-filters__label">Where</label>
            <Select value={online} onChange={(v) => setOnline(v as string)} fullWidth options={[{ value: "", label: "Online + in person" }, { value: "online", label: "Online" }, { value: "in_person", label: "In person" }]} />
          </div>
        )}
        <div className="bgn-filters__field">
          <label className="bgn-filters__label">Sort by</label>
          <Select
            value={sort}
            onChange={(v) => setSort(v as Sort)}
            fullWidth
            options={[{ value: "soon", label: when === "past" ? "Most recent" : "Soonest" }, { value: "near", label: "Nearest", disabled: !coords }, ...(hasPrefs ? [{ value: "match", label: "Best match" }] : [])]}
          />
        </div>
        <div className="bgn-filters__field bgn-filters__field--location">
          <label className="bgn-filters__label">Location</label>
          <div className="bgn-filters__loc">
            <Button variant="secondary" size="small" onClick={locateMe} disabled={geo === "locating"}>
              {geo === "locating" ? "Locating…" : coords ? "📍 Located" : "📍 Near me"}
            </Button>
            {coords && (
              <Select
                value={String(radius)}
                onChange={(v) => setRadius(Number(v))}
                aria-label="Distance radius"
                options={[{ value: "0", label: "Any distance" }, { value: "10", label: "Within 10 mi" }, { value: "25", label: "Within 25 mi" }, { value: "50", label: "Within 50 mi" }, { value: "100", label: "Within 100 mi" }]}
              />
            )}
          </div>
        </div>
      </div>
      {geo === "denied" && <p className="bgn-filters__note">Location access was blocked, so we can&apos;t sort by distance. You can still search and filter.</p>}
      {geo === "unsupported" && <p className="bgn-filters__note">Your browser doesn&apos;t support location, so distance sorting isn&apos;t available.</p>}
      {activeCount > 0 && (
        <p className="bgn-filters__note">
          {rows.length} result{rows.length === 1 ? "" : "s"} · <button type="button" className="events-browser__clear" onClick={clearAll}>Clear filters</button>
        </p>
      )}

      {rows.length === 0 ? (
        <div className="bgn-empty">
          <p>{config.emptyText}</p>
          {config.createHref && (
            <Link href={config.createHref} style={{ textDecoration: "none" }}>
              <Button variant="primary" size="small">{config.createLabel ?? "Create one"}</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="bgn-grid">
          {rows.map(({ event: e, score, distance }) => {
            const lvl = boardGameLevelLabel(e.level);
            const good = hasPrefs && isGoodMatch(score);
            const v = nightVisual(e.id);
            return (
              <Link key={`${e.type}-${e.id}`} href={e.href} className="bgn-card">
                <span className={`bgn-card__hero${e.cover ? " bgn-card__hero--img" : ""}`} style={e.cover ? undefined : { background: v.gradient }}>
                  {e.cover
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={e.cover} alt="" className="bgn-card__hero-photo" />
                    : <span className="bgn-card__hero-emoji" aria-hidden>{e.type === "tournament" ? "🏆" : v.emoji}</span>}
                  {e.phase === "live" && <span className="bgn-card__hero-count events-browser__live">Live now</span>}
                  {e.phase !== "live" && e.gameCount > 0 && <span className="bgn-card__hero-count">{e.gameCount} game{e.gameCount === 1 ? "" : "s"}</span>}
                  {e.phase !== "live" && e.gameCount === 0 && e.goingCount != null && <span className="bgn-card__hero-count">{e.goingCount}{e.capacity ? ` / ${e.capacity}` : ""} {e.type === "tournament" ? "players" : "going"}</span>}
                  {good && <span className="bgn-card__hero-match">Good match</span>}
                </span>
                <span className="bgn-card__body">
                  <span className="bgn-card__when">
                    {fmtDate(e.starts_at, e.timezone)}
                    {distance != null && <span className="bgn-card__distance">· {formatMiles(distance)} away</span>}
                    {e.online && <span className="bgn-card__distance">· Online</span>}
                  </span>
                  <span className="bgn-card__title">{e.title}</span>
                  {(e.place || e.game || e.organizer) && (
                    <span className="bgn-card__place">{[e.game, e.place, e.organizer ? `by ${e.organizer}` : null].filter(Boolean).join(" · ")}</span>
                  )}
                  <span className="bgn-card__tags">
                    {e.phase === "cancelled" && <span className="lounge-status lounge-status--cancelled">Cancelled</span>}
                    {e.kind && e.kind !== "board" && <span className="bg-badge bg-badge--kind">{nightKindLabel(e.kind, true)}</span>}
                    {lvl && <span className="bg-badge bg-badge--level">{lvl}</span>}
                    {e.tags.slice(0, 2).map((t) => <span key={t} className="bg-tag">{t}</span>)}
                    {e.genres.slice(0, 3).map((g) => <span key={g} className="bg-tag">{g}</span>)}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {config.crossRail && config.crossRail.items.length > 0 && (
        <section className="events-browser__cross">
          <div className="bgn-browse__head">
            <h2 className="events-browser__cross-heading">{config.crossRail.heading}</h2>
            <Link href={config.crossRail.href} className="events-browser__cross-link">{config.crossRail.linkLabel} →</Link>
          </div>
          <div className="bgn-foryou__row">
            {config.crossRail.items.map((e) => (
              <Link key={`${e.type}-${e.id}`} href={e.href} className="bgn-foryou__card">
                <span className="bgn-card__when">{fmtDate(e.starts_at, e.timezone)}</span>
                <span className="bgn-card__title">{e.title}</span>
                {(e.place || e.game) && <span className="bgn-card__place">{e.game ?? e.place}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
