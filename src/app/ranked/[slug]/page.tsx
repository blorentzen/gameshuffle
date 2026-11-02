import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { Container, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { TableScroll } from "@/components/ui/TableScroll";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { MmrEmblem } from "@/components/mmr/MmrEmblem";
import { MedalCredit } from "@/components/mmr/MedalCredit";
import { LastTen, longDay, seasonOptions } from "@/components/ladders/LadderBits";
import { LadderSeasonSelect } from "@/components/ladders/LadderSeasonSelect";
import { RankedYou } from "@/components/ladders/RankedYou";
import { RankedQueue } from "@/components/ladders/RankedQueue";
import { divisionLook } from "@/lib/mmr/look";
import { tableTitle } from "@/lib/ladders/rules";
import { board, getLadder, ladderSeasons, laddersOpen, laddersReady, recentTables } from "@/lib/ladders/store";
import { LADDER_GAMES, ladderPath, ladderPlayerPath, ladderStaffPath, ladderTablePath, type Ladder } from "@/lib/ladders/types";
import { shareMeta } from "@/lib/og/meta";
import "@/styles/lounge.css";
import "@/styles/ladders.css";

/**
 * A lounge ladder's page (lounge plan step 1): this season's standings and the newest tables. The lounge runs in its
 * own Discord server; this page is its public board. Not indexed while ladders are in their first trials. A Season
 * menu (?season=N) opens earlier seasons, imported ones included (history import, pick 8A).
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string; season?: string }> };
const PER_PAGE = 50;

const load = cache(async (slug: string): Promise<Ladder | null> => {
  if (!(await laddersReady()) || !(await laddersOpen())) return null;
  return getLadder({ slug });
});

const roomsLine = (l: Ladder) => (l.kind === "knockout" ? "Knockout Tour rooms of 24" : "rooms of 12");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ladder = await load((await params).slug);
  if (!ladder) return { title: "Ladder", robots: { index: false } };
  const title = `${ladder.name} standings`;
  const description = `${ladder.name}'s season ${ladder.season} standings: every player's MMR, division and last 10, ${LADDER_GAMES[ladder.game]} ${roomsLine(ladder)}.`;
  return { title, description, robots: { index: false, follow: true }, ...shareMeta({ title, description, path: ladderPath(ladder.slug) }) };
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) : "");

export default async function LadderPage({ params, searchParams }: Props) {
  const ladder = await load((await params).slug);
  if (!ladder) notFound();
  const sp = await searchParams;
  const page = Math.max(1, Math.min(200, Number(sp.page) || 1));
  const seasons = await ladderSeasons(ladder);
  const asked = Number(sp.season);
  const shown = seasons.find((x) => x.season === asked) ?? seasons.find((x) => x.current)!;
  const past = !shown.current;
  const [{ rows, total }, tables] = await Promise.all([
    board(ladder, { limit: PER_PAGE, offset: (page - 1) * PER_PAGE, season: shown.season }),
    recentTables(ladder, 12, past ? shown.season : undefined),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageHref = (n: number) => `${ladderPath(ladder.slug)}?${past ? `season=${shown.season}&` : ""}page=${n}`;

  return (
    <main className="ladder-page">
      <BrowseHero
        eyebrow="GS Ranked"
        title={ladder.name}
        sub={`${LADDER_GAMES[ladder.game]}, ${roomsLine(ladder)}. Season ${shown.season}: ${total.toLocaleString("en-US")} ${total === 1 ? "player" : "players"}.`}
        accent="blue"
        field="compete"
        compact
      />
      <Container className="lounge-body">
        {!past && <RankedYou ladderId={ladder.id} ladderName={ladder.name} kind={ladder.kind} staffPath={ladderStaffPath(ladder.slug)} signInPath={`/login?redirect=${encodeURIComponent(ladderPath(ladder.slug))}`} />}
        {!past && <RankedQueue ladderId={ladder.id} kind={ladder.kind} />}
        <section className="lounge-sec lounge-sec--flat" aria-labelledby="ladder-board">
          <h2 id="ladder-board">{past ? `Season ${shown.season} standings` : "Standings"}</h2>
          {seasons.length > 1 && (
            <div className="ladder-seasonbar">
              <LadderSeasonSelect options={seasonOptions(seasons)} value={String(shown.season)} basePath={ladderPath(ladder.slug)} />
              {past && <p className="ladder-note">{shown.endedAt ? `Season ${shown.season} finished ${longDay(shown.endedAt)}.` : `Season ${shown.season}.`}{shown.imported ? " From the lounge's own records." : ""}</p>}
            </div>
          )}
          {rows.length ? (
            <TableScroll label={`${ladder.name} standings`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead align="right" className="lounge-rank-col">#</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead align="right">MMR</TableHead>
                    <TableHead align="right">Events</TableHead>
                    <TableHead align="right">Win rate</TableHead>
                    <TableHead>Last 10</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.playerId}>
                      <TableCell align="right" className="ladder-num">{r.rank}</TableCell>
                      <TableCell>
                        <span className="lounge-board-name">
                          <MmrEmblem d={divisionLook(r.division)} frame="tile" />
                          <span><Link href={ladderPlayerPath(ladder.slug, r.name)}>{r.name}</Link><span className="lounge-cell-note">{r.division}</span></span>
                        </span>
                      </TableCell>
                      <TableCell align="right" className="ladder-num">{r.mmr.toLocaleString("en-US")}</TableCell>
                      <TableCell align="right" className="ladder-num">{r.events}</TableCell>
                      <TableCell align="right" className="ladder-num">{r.events ? `${Math.round((r.wins / r.events) * 100)}%` : ""}</TableCell>
                      <TableCell><LastTen deltas={r.recent} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          ) : (
            <p className="lounge-empty">{past ? `No standings for Season ${shown.season}.` : "No tables are verified this season yet. Standings fill in as the updaters verify them."}</p>
          )}
          {pages > 1 && (
            <nav className="ladder-pager" aria-label="Standings pages">
              {page > 1 && <ArrowLink href={pageHref(page - 1)}>Players {(page - 2) * PER_PAGE + 1} to {(page - 1) * PER_PAGE}</ArrowLink>}
              <span className="ladder-muted">Page {page} of {pages}</span>
              {page < pages && <ArrowLink href={pageHref(page + 1)}>Players {page * PER_PAGE + 1} on</ArrowLink>}
            </nav>
          )}
        </section>

        <section className="lounge-sec" aria-labelledby="ladder-tables">
          <h2 id="ladder-tables">{past ? `Season ${shown.season}'s last tables` : "Newest tables"}</h2>
          {tables.length ? (
            <ul className="ladder-tables">
              {tables.map((t) => (
                <li key={t.number}>
                  <Link href={ladderTablePath(ladder.slug, t.number)}>{tableTitle(t, ladder.kind)}</Link>
                  <small>{t.status === "pending" ? "Waiting on an updater" : t.imported ? `Played ${longDay(t.createdAt)}` : `Verified ${when(t.verifiedAt)}`} · {t.players} players</small>
                </li>
              ))}
            </ul>
          ) : <p className="lounge-empty">No tables yet.</p>}
        </section>

        <section className="lounge-sec">
          <p className="ladder-note">Tables are submitted in the lounge&apos;s Discord or on this page, and verified by its updaters. Ranked on GameShuffle. <Link href="/help/ranked#ranked-players">How playing here works</Link></p>
          <MedalCredit className="ladder-note" />
        </section>
      </Container>
    </main>
  );
}
