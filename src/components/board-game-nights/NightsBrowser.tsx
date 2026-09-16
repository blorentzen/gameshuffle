"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Input, Select } from "@empac/cascadeds";
import { boardGameLevelLabel, BOARD_GAME_LEVELS } from "@/data/board-games";
import { nightVisual } from "@/data/board-game-night-visuals";
import {
  matchScore,
  isGoodMatch,
  haversineMiles,
  formatMiles,
  type ViewerPrefs,
} from "@/lib/board-game-nights/match";

export interface BrowseNight {
  id: string;
  title: string;
  place: string | null;
  lat: number | null;
  lng: number | null;
  starts_at: string | null;
  timezone: string | null;
  genres: string[];
  level: string | null;
  gameCount: number;
  gameLengths: string[];
  cover: string | null;
}

type Sort = "soon" | "near" | "match";
type GeoState = "idle" | "locating" | "ok" | "denied" | "unsupported";

function fmtDate(iso: string | null, tz: string | null): string {
  if (!iso) return "Date TBA";
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: tz || undefined,
    });
  } catch {
    return new Date(iso).toLocaleDateString();
  }
}

export function NightsBrowser({
  nights,
  viewerPrefs,
}: {
  nights: BrowseNight[];
  viewerPrefs: ViewerPrefs | null;
}) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [level, setLevel] = useState("");
  const [sort, setSort] = useState<Sort>("soon");
  const [radius, setRadius] = useState(0); // miles; 0 = any distance
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geo, setGeo] = useState<GeoState>("idle");

  const hasPrefs = !!viewerPrefs && (viewerPrefs.genres.length > 0 || !!viewerPrefs.level || viewerPrefs.lengths.length > 0);

  // Genre options: the union across all nights, so filters only offer real values.
  const genreOptions = useMemo(() => {
    const set = new Set<string>();
    for (const n of nights) for (const g of n.genres) set.add(g);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [nights]);

  const locateMe = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo("unsupported");
      return;
    }
    setGeo("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeo("ok");
        setSort("near");
      },
      () => setGeo("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = nights.map((n) => {
      const score = hasPrefs
        ? matchScore(viewerPrefs!, { genres: n.genres, level: n.level, gameLengths: n.gameLengths })
        : 0;
      const distance =
        coords && n.lat != null && n.lng != null
          ? haversineMiles(coords, { lat: n.lat, lng: n.lng })
          : null;
      return { night: n, score, distance };
    });

    if (q) {
      list = list.filter(
        (r) =>
          r.night.title.toLowerCase().includes(q) ||
          (r.night.place ?? "").toLowerCase().includes(q) ||
          r.night.genres.some((g) => g.toLowerCase().includes(q)),
      );
    }
    if (genre) list = list.filter((r) => r.night.genres.some((g) => g.toLowerCase() === genre.toLowerCase()));
    if (level) list = list.filter((r) => r.night.level === level);
    if (coords && radius > 0) list = list.filter((r) => r.distance != null && r.distance <= radius);

    const bySoon = (a: { night: BrowseNight }, b: { night: BrowseNight }) => {
      const av = a.night.starts_at ? Date.parse(a.night.starts_at) : Infinity;
      const bv = b.night.starts_at ? Date.parse(b.night.starts_at) : Infinity;
      return av - bv;
    };
    if (sort === "near") {
      list.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || bySoon(a, b));
    } else if (sort === "match") {
      list.sort((a, b) => b.score - a.score || bySoon(a, b));
    } else {
      list.sort(bySoon);
    }
    return list;
  }, [nights, query, genre, level, sort, radius, coords, hasPrefs, viewerPrefs]);

  // "For you" — the strongest matches for this viewer, surfaced proactively.
  // Independent of the filters below so it's always a quick shortcut.
  const forYou = useMemo(() => {
    if (!hasPrefs) return [];
    return nights
      .map((n) => ({ night: n, score: matchScore(viewerPrefs!, { genres: n.genres, level: n.level, gameLengths: n.gameLengths }) }))
      .filter((r) => isGoodMatch(r.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [nights, hasPrefs, viewerPrefs]);

  return (
    <>
      {forYou.length > 0 && (
        <div className="bgn-foryou">
          <h2 className="bgn-side__heading" style={{ marginTop: 0 }}>Nights that fit you</h2>
          <div className="bgn-foryou__row">
            {forYou.map(({ night: n }) => (
              <Link key={n.id} href={`/board-game-nights/${n.id}`} className="bgn-foryou__card">
                <span className="bgn-card__when">{fmtDate(n.starts_at, n.timezone)}</span>
                <span className="bgn-card__title">{n.title}</span>
                {n.place && <span className="bgn-card__place">{n.place}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="bgn-browse__head">
        <h2 style={{ fontSize: "var(--font-size-fluid-h3)", fontWeight: "var(--font-weight-bold)", lineHeight: "var(--line-height-tight)", margin: 0 }}>
          Upcoming nights
        </h2>
        <Link href="/board-game-nights/create" style={{ textDecoration: "none" }}>
          <Button variant="secondary">Host a night</Button>
        </Link>
      </div>

      <div className="bgn-filters">
        <div className="bgn-filters__field bgn-filters__field--search">
          <label className="bgn-filters__label" htmlFor="bgn-filter-search">Search</label>
          <Input
            id="bgn-filter-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nights, places, games"
            fullWidth
          />
        </div>
        {genreOptions.length > 0 && (
          <div className="bgn-filters__field">
            <label className="bgn-filters__label">Genre</label>
            <Select
              value={genre}
              onChange={(v) => setGenre(v as string)}
              fullWidth
              options={[{ value: "", label: "Any genre" }, ...genreOptions.map((g) => ({ value: g, label: g }))]}
            />
          </div>
        )}
        <div className="bgn-filters__field">
          <label className="bgn-filters__label">Skill level</label>
          <Select
            value={level}
            onChange={(v) => setLevel(v as string)}
            fullWidth
            options={[{ value: "", label: "Any level" }, ...BOARD_GAME_LEVELS.map((l) => ({ value: l.value, label: l.label }))]}
          />
        </div>
        <div className="bgn-filters__field">
          <label className="bgn-filters__label">Sort by</label>
          <Select
            value={sort}
            onChange={(v) => setSort(v as Sort)}
            fullWidth
            options={[
              { value: "soon", label: "Soonest" },
              { value: "near", label: "Nearest", disabled: !coords },
              ...(hasPrefs ? [{ value: "match", label: "Best match" }] : []),
            ]}
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
                options={[
                  { value: "0", label: "Any distance" },
                  { value: "10", label: "Within 10 mi" },
                  { value: "25", label: "Within 25 mi" },
                  { value: "50", label: "Within 50 mi" },
                  { value: "100", label: "Within 100 mi" },
                ]}
              />
            )}
          </div>
        </div>
      </div>
      {geo === "denied" && (
        <p className="bgn-filters__note">Location access was blocked, so we can&apos;t sort by distance. You can still search and filter.</p>
      )}
      {geo === "unsupported" && (
        <p className="bgn-filters__note">Your browser doesn&apos;t support location, so distance sorting isn&apos;t available.</p>
      )}

      {rows.length === 0 ? (
        <div className="bgn-empty">
          <p>No nights match your filters. Try widening them, or host one yourself.</p>
        </div>
      ) : (
        <div className="bgn-grid">
          {rows.map(({ night: n, score, distance }) => {
            const lvl = boardGameLevelLabel(n.level);
            const good = hasPrefs && isGoodMatch(score);
            return (
              <Link key={n.id} href={`/board-game-nights/${n.id}`} className="bgn-card">
                {(() => { const v = nightVisual(n.id); return (
                  <span className={`bgn-card__hero${n.cover ? " bgn-card__hero--img" : ""}`} style={n.cover ? undefined : { background: v.gradient }}>
                    {n.cover
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={n.cover} alt="" className="bgn-card__hero-photo" />
                      : <span className="bgn-card__hero-emoji" aria-hidden>{v.emoji}</span>}
                    {n.gameCount > 0 && <span className="bgn-card__hero-count">{n.gameCount} game{n.gameCount === 1 ? "" : "s"}</span>}
                    {good && <span className="bgn-card__hero-match">Good match</span>}
                  </span>
                ); })()}
                <span className="bgn-card__body">
                  <span className="bgn-card__when">
                    {fmtDate(n.starts_at, n.timezone)}
                    {distance != null && <span className="bgn-card__distance">· {formatMiles(distance)} away</span>}
                  </span>
                  <span className="bgn-card__title">{n.title}</span>
                  {n.place && <span className="bgn-card__place">{n.place}</span>}
                  <span className="bgn-card__tags">
                    {lvl && <span className="bg-badge bg-badge--level">{lvl}</span>}
                    {n.genres.slice(0, 3).map((g) => <span key={g} className="bg-tag">{g}</span>)}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
