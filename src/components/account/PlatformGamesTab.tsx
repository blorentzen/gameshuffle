"use client";

/**
 * Platform ▸ Game catalog (staff/admin): the games GameShuffle knows
 * (src/data/game-catalog.ts) with their box art, how many profiles favorite
 * each, the games people added that aren't in the catalog yet ("Other"), and
 * the candidate list for the next randomizer or mode. Curating = add an entry
 * to the catalog, then run scripts/pull-box-art.ts.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Badge, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs } from "@empac/cascadeds";
import { IconBox, IconHeart, IconPhoto, IconSparkles } from "@tabler/icons-react";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { GameCover } from "@/components/games/GameCover";
import { GAME_CATALOG, boxArt, type CatalogStatus } from "@/data/game-catalog";

interface Payload { ok: boolean; profiles: number; favorites: Record<string, number>; asked: { name: string; count: number }[] }

const STATUS: Record<CatalogStatus, { label: string; variant: "success" | "info" | "default" }> = {
  live: { label: "Live", variant: "success" },
  candidate: { label: "Candidate", variant: "info" },
  listed: { label: "Listed", variant: "default" },
};

export function PlatformGamesTab() {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/admin/game-catalog", { cache: "no-store" }).then((r) => r.json()).then((j: Payload) => (j.ok ? setData(j) : setFailed(true))).catch(() => setFailed(true));
  }, []);

  const withArt = GAME_CATALOG.filter((g) => boxArt(g)).length;
  const candidates = GAME_CATALOG.filter((g) => g.status === "candidate");
  const fav = (slug: string) => data?.favorites[slug] ?? 0;
  const sorted = [...GAME_CATALOG].sort((a, b) => fav(b.slug) - fav(a.slug) || a.name.localeCompare(b.name));

  return (
    <div className="account-tab originals-admin games-admin">
      <h2 className="account-tab__heading">Game catalog</h2>
      <p className="dbot-muted">Every game GameShuffle knows by name, with the publisher&apos;s box art (pulled from Twitch&apos;s game categories). Favorite-game pickers, profile shelves and editor modules all read it. To add a game: put it in <code>src/data/game-catalog.ts</code>, then run <code>scripts/pull-box-art.ts</code>.</p>

      <div className="originals-admin__stats">
        <StatCard label="Games in the catalog" value={GAME_CATALOG.length} source={`${GAME_CATALOG.filter((g) => g.status === "live").length} live · ${candidates.length} candidates`} icon={<IconBox size={20} />} variant="accent" />
        <StatCard label="With box art" value={`${withArt} of ${GAME_CATALOG.length}`} icon={<IconPhoto size={20} />} />
        <StatCard label="Profiles with favorites" value={data ? data.profiles : "…"} icon={<IconHeart size={20} />} />
        <StatCard label="Asked for, not in the catalog" value={data ? data.asked.length : "…"} source="Added as another game" icon={<IconSparkles size={20} />} />
      </div>

      {failed && <Alert variant="error">Couldn&apos;t load favorites. The catalog below still shows.</Alert>}

      <Tabs
        variant="underline"
        defaultActiveTab="catalog"
        tabs={[
          { id: "catalog", label: "Catalog", content: (
            <div className="account-card">
          <ul className="games-admin__grid">
            {sorted.map((g) => (
              <li key={g.slug} className="games-admin__game">
                <GameCover name={g.name} />
                <span className="games-admin__name">{g.href ? <Link href={g.href}>{g.name}</Link> : g.name}</span>
                <span className="games-admin__meta">
                  <Badge size="small" variant={STATUS[g.status].variant}>{STATUS[g.status].label}</Badge>
                  {data && <span className="dbot-muted">{fav(g.slug)} ♥</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
          ) },
          { id: "asked", label: "Asked for", content: (
            <div className="account-card">
          {!data ? <LoadingLines label="Loading" /> : data.asked.length === 0 ? (
            <p className="dbot-muted">Nobody has added a game the catalog doesn&apos;t have yet.</p>
          ) : (
            <div className="originals-admin__scroll">
              <Table variant="default" dense>
                <TableHeader><TableRow><TableHead>Game, as typed</TableHead><TableHead>Profiles</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.asked.map((a) => (
                    <TableRow key={a.name}><TableCell>{a.name}</TableCell><TableCell>{a.count}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
          ) },
          { id: "candidates", label: "Candidates", content: (
            <div className="account-card">
          <p className="dbot-muted">Games that would make a good randomizer or mode, most favorited first.</p>
          <div className="originals-admin__scroll">
            <Table variant="default" dense>
              <TableHeader><TableRow><TableHead>Game</TableHead><TableHead>What it would be</TableHead><TableHead>♥</TableHead></TableRow></TableHeader>
              <TableBody>
                {[...candidates].sort((a, b) => fav(b.slug) - fav(a.slug) || a.name.localeCompare(b.name)).map((g) => (
                  <TableRow key={g.slug}>
                    <TableCell><span className="games-admin__row"><span className="games-admin__thumb"><GameCover name={g.name} /></span>{g.name}</span></TableCell>
                    <TableCell>{g.pitch}</TableCell>
                    <TableCell>{fav(g.slug)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
          ) },
        ]}
      />
    </div>
  );
}
