"use client";

/**
 * Platform ▸ Game catalog (staff/admin): the games GameShuffle knows
 * (src/data/game-catalog.ts) with their box art, how many profiles favorite
 * each, the games people added that aren't in the catalog yet ("Other"), and
 * the candidate list for the next randomizer or mode. Curating = add an entry
 * to the catalog, then run scripts/pull-box-art.ts.
 *
 * Layout (admin kit): four counts, then the curation queue first (Asked for,
 * Candidates), then every game with a status filter and a search. Each list
 * shows 25 at a time.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Alert, Badge, Button, EmptyState, Input, Select, StatCard, Table, TableBody, TableCell, TableEmpty, TableHead,
  TableHeader, TableRow,
} from "@empac/cascadeds";
import { IconBox, IconHeart, IconPhoto, IconSparkles } from "@tabler/icons-react";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { GameCover } from "@/components/games/GameCover";
import { GAME_CATALOG, boxArt, type CatalogEntry, type CatalogStatus } from "@/data/game-catalog";
import { AdminHeader, AdminSection, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";

interface Payload { ok: boolean; profiles: number; favorites: Record<string, number>; asked: { name: string; count: number }[] }

const PAGE = 25;
/** The API returns the 100 most asked-for names. */
const ASKED_CAP = 100;

const STATUS: Record<CatalogStatus, { label: string; variant: "success" | "info" | "default" }> = {
  live: { label: "Live", variant: "success" },
  candidate: { label: "Candidate", variant: "info" },
  listed: { label: "Listed", variant: "default" },
};
type Filter = "all" | CatalogStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All games" },
  { value: "live", label: "Live" },
  { value: "candidate", label: "Candidates" },
  { value: "listed", label: "Listed" },
];

const n = (x: number) => x.toLocaleString();
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "Show 25 more of 83" under a list, while there's more to show. */
function ShowMore({ total, limit, onMore }: { total: number; limit: number; onMore: () => void }) {
  if (total <= limit) return null;
  return (
    <div>
      <Button variant="ghost" size="small" onClick={onMore}>Show {Math.min(PAGE, total - limit)} more of {n(total)}</Button>
    </div>
  );
}

/** A game's small cover next to its name (linked to our page when it has one). */
function GameName({ game, sub }: { game: CatalogEntry; sub?: string }) {
  return (
    <span className="admin-library-game">
      <span className="admin-library-game__thumb"><GameCover name={game.name} /></span>
      <span className="admin-library-game__text">
        {game.href ? <Link href={game.href} className="admin-library-game__name">{game.name}</Link> : <span className="admin-library-game__name">{game.name}</span>}
        {sub && <span className="admin-table__sub">{sub}</span>}
      </span>
    </span>
  );
}

export function PlatformGamesTab() {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [askedLimit, setAskedLimit] = useState(PAGE);
  const [candLimit, setCandLimit] = useState(PAGE);
  const [allLimit, setAllLimit] = useState(PAGE);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/admin/game-catalog", { cache: "no-store" }).then((r) => r.json()).then((j: Payload) => (j.ok ? setData(j) : setFailed(true))).catch(() => setFailed(true));
  }, []);

  const withArt = GAME_CATALOG.filter((g) => boxArt(g)).length;
  const live = GAME_CATALOG.filter((g) => g.status === "live").length;
  const candidates = GAME_CATALOG.filter((g) => g.status === "candidate");
  const fav = (slug: string) => data?.favorites[slug] ?? 0;
  const favText = (slug: string) => (data ? n(fav(slug)) : "-");
  const byFavorites = (a: CatalogEntry, b: CatalogEntry) => fav(b.slug) - fav(a.slug) || a.name.localeCompare(b.name);
  const sortedCandidates = [...candidates].sort(byFavorites);
  const query = norm(q.trim());
  const games = [...GAME_CATALOG]
    .filter((g) => filter === "all" || g.status === filter)
    .filter((g) => !query || norm(g.name).includes(query) || (g.aliases ?? []).some((a) => norm(a).includes(query)))
    .sort(byFavorites);

  const header = (
    <AdminHeader
      title="Game catalog"
      intro="Every game GameShuffle knows by name, with its box art. Favorite-game pickers, profile shelves, event pages and editors all use it."
    />
  );

  if (!data && !failed) return <div className="account-card admin-screen">{header}<LoadingLines label="Loading the game catalog" /></div>;

  return (
    <div className="account-card admin-screen admin-library-games">
      {header}

      <AdminStats label="The catalog at a glance">
        <StatCard label="Games in the catalog" value={n(GAME_CATALOG.length)} source={`${n(live)} live · ${n(candidates.length)} candidates`} icon={<IconBox size={20} />} variant="accent" />
        <StatCard label="With box art" value={`${n(withArt)} of ${n(GAME_CATALOG.length)}`} source={withArt < GAME_CATALOG.length ? "The rest show a lettered tile" : "Every game has its cover"} icon={<IconPhoto size={20} />} />
        <StatCard label="Profiles with favorites" value={data ? n(data.profiles) : "-"} source="Picked at least one game" icon={<IconHeart size={20} />} />
        <StatCard label="Asked for, not in the catalog" value={data ? `${n(data.asked.length)}${data.asked.length >= ASKED_CAP ? "+" : ""}` : "-"} source="Typed in as another game" icon={<IconSparkles size={20} />} />
      </AdminStats>

      {failed && <Alert variant="error">Couldn&apos;t load the favorites, so the counts and Asked for are missing. The catalog itself still shows below; reload in a minute to try again.</Alert>}

      <AdminSection
        title="Asked for"
        intro="Games people typed into their favorites that the catalog doesn't have, most asked first. Adding one is a code change: ask a developer to put it in the catalog and pull its box art."
      >
        {!data ? null : data.asked.length === 0 ? (
          <EmptyState variant="bordered" icon={<IconSparkles size={28} />} title="Nobody has asked for a missing game yet" description="When someone adds a favorite game the catalog doesn't know, it shows here." />
        ) : (
          <>
            <AdminTable label="Games asked for, most asked first">
              <Table variant="striped" dense>
                <TableHeader><TableRow><TableHead>Game, as typed</TableHead><TableHead align="right">Favorites</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.asked.slice(0, askedLimit).map((a) => (
                    <TableRow key={a.name}><TableCell>{a.name}</TableCell><TableCell align="right" className="admin-num">{n(a.count)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminTable>
            <ShowMore total={data.asked.length} limit={askedLimit} onMore={() => setAskedLimit((x) => x + PAGE)} />
          </>
        )}
      </AdminSection>

      <AdminSection title="Candidates" intro="Games that would make a good randomizer or mode next, most favorited first.">
        <AdminTable label="Candidate games, most favorited first">
          <Table variant="striped" dense>
            <TableHeader><TableRow><TableHead>Game</TableHead><TableHead>What it would be</TableHead><TableHead align="right">Favorites</TableHead></TableRow></TableHeader>
            <TableBody>
              {sortedCandidates.slice(0, candLimit).map((g) => (
                <TableRow key={g.slug}>
                  <TableCell><GameName game={g} /></TableCell>
                  <TableCell className="admin-library-pitch">{g.pitch}</TableCell>
                  <TableCell align="right" className="admin-num">{favText(g.slug)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
        <ShowMore total={sortedCandidates.length} limit={candLimit} onMore={() => setCandLimit((x) => x + PAGE)} />
      </AdminSection>

      <AdminSection
        title="All games"
        intro="Live: GameShuffle has a randomizer, tool or tournament roster for it. Candidate: a good fit for one next. Listed: popular enough that people pick it as a favorite."
      >
        <div className="admin-filters">
          <Input fullWidth floatingLabel="Find a game" value={q} onChange={(e) => { setQ(e.target.value); setAllLimit(PAGE); }} />
          <Select floatingLabel="Show" value={filter} onChange={(v) => { setFilter(String(v) as Filter); setAllLimit(PAGE); }} options={FILTERS} />
        </div>
        <AdminTable label="All games in the catalog, most favorited first">
          <Table variant="striped" dense>
            <TableHeader><TableRow><TableHead>Game</TableHead><TableHead>Status</TableHead><TableHead align="right">Favorites</TableHead></TableRow></TableHeader>
            <TableBody>
              {games.length === 0 ? (
                <TableRow><TableCell colSpan={3}><TableEmpty title="No games match" description="Try another name, or show all games." /></TableCell></TableRow>
              ) : games.slice(0, allLimit).map((g) => (
                <TableRow key={g.slug}>
                  <TableCell><GameName game={g} sub={g.family === "Other" ? undefined : g.family} /></TableCell>
                  <TableCell><Badge size="small" variant={STATUS[g.status].variant}>{STATUS[g.status].label}</Badge></TableCell>
                  <TableCell align="right" className="admin-num">{favText(g.slug)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
        <ShowMore total={games.length} limit={allLimit} onMore={() => setAllLimit((x) => x + PAGE)} />
      </AdminSection>
    </div>
  );
}
