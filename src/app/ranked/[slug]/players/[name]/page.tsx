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
import { Delta, LadderChart, longDay, seasonOptions } from "@/components/ladders/LadderBits";
import { LadderSeasonSelect } from "@/components/ladders/LadderSeasonSelect";
import { divisionLook } from "@/lib/mmr/look";
import { getLadder, ladderSeasons, laddersOpen, laddersReady, playerByName, playerSeason, type PlayerSeason, type SeasonInfo } from "@/lib/ladders/store";
import { formatLabel, ladderPath, ladderPlayerPath, ladderTablePath, type Ladder } from "@/lib/ladders/types";
import { shareMeta } from "@/lib/og/meta";
import "@/styles/lounge.css";
import "@/styles/ladders.css";

/**
 * One player's season on a lounge ladder: their numbers, the line of their MMR and every verified table, with
 * penalties and bonuses between them (history import, pick 5A). A Season menu opens their earlier seasons and a
 * Seasons table lists them (pick 8A).
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; name: string }>; searchParams: Promise<{ season?: string }> };

const load = cache(async (slug: string, name: string, wanted: number | null): Promise<{ ladder: Ladder; season: PlayerSeason; seasons: SeasonInfo[]; shown: SeasonInfo } | null> => {
  if (!(await laddersReady()) || !(await laddersOpen())) return null;
  const ladder = await getLadder({ slug });
  if (!ladder) return null;
  let decoded = name;
  try { decoded = decodeURIComponent(name); } catch { /* already plain */ }
  const player = await playerByName(ladder.id, decoded);
  if (!player) return null;
  const seasons = await ladderSeasons(ladder);
  const shown = seasons.find((x) => x.season === wanted) ?? seasons.find((x) => x.current)!;
  return { ladder, season: await playerSeason(ladder, player, { season: shown.season }), seasons, shown };
});

const num = (n: number) => n.toLocaleString("en-US");
const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }) : "");
const place = (p: number) => `${p}${p % 10 === 1 && p !== 11 ? "st" : p % 10 === 2 && p !== 12 ? "nd" : p % 10 === 3 && p !== 13 ? "rd" : "th"}`;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const p = await params;
  const got = await load(p.slug, p.name, Number((await searchParams).season) || null);
  if (!got) return { title: "Player", robots: { index: false } };
  const { ladder, season } = got;
  const title = `${season.player.name} · ${ladder.name}`;
  const description = season.rating ? `${season.player.name} on ${ladder.name}: ${num(season.rating.mmr)} MMR, ${season.rating.division}, ${season.rating.events} tables in Season ${season.season}.` : `${season.player.name} on ${ladder.name}.`;
  return { title, description, robots: { index: false, follow: true }, ...shareMeta({ title, description, path: ladderPlayerPath(ladder.slug, season.player.name) }) };
}

export default async function LadderPlayerPage({ params, searchParams }: Props) {
  const p = await params;
  const got = await load(p.slug, p.name, Number((await searchParams).season) || null);
  if (!got) notFound();
  const { ladder, season, seasons, shown } = got;
  const r = season.rating;
  const past = !shown.current;
  const base = ladderPlayerPath(ladder.slug, season.player.name);
  // Tables and penalty lines together, newest first; the chart reads them oldest first, numbered by table.
  type Row = { kind: "table"; at: string; h: PlayerSeason["history"][number] } | { kind: "adjust"; at: string; a: PlayerSeason["adjustments"][number] };
  const rows: Row[] = [...season.history.map((h) => ({ kind: "table" as const, at: h.at, h })), ...season.adjustments.map((a) => ({ kind: "adjust" as const, at: a.at, a }))]
    .sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
  const oldest = [...rows].reverse();
  let count = 0;
  const points = oldest.map((row) => (row.kind === "table" ? { n: ++count, mmr: row.h.after } : { n: -1, mmr: row.a.after }));
  if (oldest.length) points.unshift({ n: 0, mmr: oldest[0].kind === "table" ? oldest[0].h.before : oldest[0].a.before });
  const others = season.seasons.filter((x) => x.season !== season.season);

  return (
    <main className="ladder-page">
      <BrowseHero
        eyebrow={ladder.name}
        title={season.player.name}
        sub={r
          ? `${r.division}${r.rank ? `, #${num(r.rank)} ${past ? `in Season ${season.season}` : `on ${ladder.name}`}` : ""}.${season.seasons.length > 1 ? ` Played ${season.seasons.length} seasons.` : past ? "" : ` Season ${season.season}.`}${season.earlierNames.length ? ` Also played as ${season.earlierNames.slice(0, 3).join(", ")}.` : ""}`
          : past ? `No tables in Season ${season.season}.` : `No tables this season yet.`}
        accent="blue"
        field="compete"
        compact
        actions={<ArrowLink href={ladderPath(ladder.slug)}>{ladder.name} standings</ArrowLink>}
      />
      <Container className="lounge-body">
        {seasons.length > 1 && (
          <section className="lounge-sec lounge-sec--flat" aria-label="Season">
            <div className="ladder-seasonbar">
              <LadderSeasonSelect options={seasonOptions(seasons)} value={String(shown.season)} basePath={base} />
              {past && shown.endedAt && <p className="ladder-note">Season {shown.season} finished {longDay(shown.endedAt)}.{shown.imported ? " From the lounge's own records." : ""}</p>}
            </div>
          </section>
        )}
        {r && (
          <section className="lounge-sec lounge-sec--flat" aria-label="Season numbers">
            <dl className="ladder-stats">
              <div><dt>MMR</dt><dd><MmrEmblem d={divisionLook(r.division)} frame="tile" />{num(r.mmr)}</dd></div>
              <div><dt>Peak</dt><dd>{num(r.peak)}</dd></div>
              <div><dt>Events</dt><dd>{num(r.events)}</dd></div>
              <div><dt>Win rate</dt><dd>{r.events ? `${Math.round((r.wins / r.events) * 100)}%` : "None yet"}</dd></div>
            </dl>
            {r.startedFrom && <p className="ladder-note">Started this season from {r.startedFrom}.</p>}
          </section>
        )}

        {points.length > 2 && (
          <section className="lounge-sec" aria-labelledby="ladder-line">
            <h2 id="ladder-line">{past ? `Season ${season.season}` : "The season so far"}</h2>
            <LadderChart points={points} label={`${season.player.name}'s MMR after each table, from ${num(points[0].mmr)} to ${num(points[points.length - 1].mmr)}`} />
            {!past && <p className="ladder-note">Show this rating on stream with the MMR card. <ArrowLink href="/mmr-card">Make your MMR card</ArrowLink></p>}
          </section>
        )}

        {others.length > 0 && (
          <section className="lounge-sec" aria-labelledby="ladder-seasons">
            <h2 id="ladder-seasons">Seasons</h2>
            <TableScroll label={`${season.player.name}'s seasons (scrolls sideways on small screens)`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Season</TableHead>
                    <TableHead>Division</TableHead>
                    <TableHead align="right">Final MMR</TableHead>
                    <TableHead align="right">Peak</TableHead>
                    <TableHead align="right">Tables</TableHead>
                    <TableHead align="right">Win rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {season.seasons.map((x) => (
                    <TableRow key={x.season}>
                      <TableCell>{x.season === season.season ? x.season : <Link href={x.season === ladder.season ? base : `${base}?season=${x.season}`}>{x.season}</Link>}</TableCell>
                      <TableCell>{x.division}</TableCell>
                      <TableCell align="right" className="ladder-num">{num(x.mmr)}</TableCell>
                      <TableCell align="right" className="ladder-num">{num(x.peak)}</TableCell>
                      <TableCell align="right" className="ladder-num">{num(x.events)}</TableCell>
                      <TableCell align="right" className="ladder-num">{x.events ? `${Math.round((x.wins / x.events) * 100)}%` : ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          </section>
        )}

        <section className="lounge-sec" aria-labelledby="ladder-history">
          <h2 id="ladder-history">{past ? `Season ${season.season} tables` : "Tables"}</h2>
          {rows.length ? (
            <TableScroll label={`${season.player.name}'s tables (scrolls sideways on small screens)`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead align="right">Place</TableHead>
                    {ladder.kind === "race" && <TableHead align="right">Score</TableHead>}
                    <TableHead align="right">Change</TableHead>
                    <TableHead align="right">MMR</TableHead>
                    <TableHead>Day</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => row.kind === "table" ? (
                    <TableRow key={`t${row.h.number}`}>
                      <TableCell><Link href={ladderTablePath(ladder.slug, row.h.number)}>{row.h.number}</Link></TableCell>
                      <TableCell>{ladder.kind === "knockout" ? "Knockout" : formatLabel(row.h.format)}{row.h.tier ? ` · Tier ${row.h.tier}` : ""}</TableCell>
                      <TableCell align="right" className="ladder-num">{place(row.h.place)}</TableCell>
                      {ladder.kind === "race" && <TableCell align="right" className="ladder-num">{row.h.score ?? ""}</TableCell>}
                      <TableCell align="right" className="ladder-num"><Delta n={row.h.delta} /></TableCell>
                      <TableCell align="right" className="ladder-num">{num(row.h.after)}</TableCell>
                      <TableCell className="ladder-num">{past ? longDay(row.h.at) : day(row.h.at)}</TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={`a${row.at}`}>
                      <TableCell><span className="sr-only">No table</span></TableCell>
                      <TableCell><span className="ladder-penalty">{row.a.kind === "penalty" ? "Penalty" : "Bonus"}</span></TableCell>
                      <TableCell align="right" className="ladder-num"></TableCell>
                      {ladder.kind === "race" && <TableCell align="right" className="ladder-num"></TableCell>}
                      <TableCell align="right" className="ladder-num"><Delta n={row.a.delta} /></TableCell>
                      <TableCell align="right" className="ladder-num">{num(row.a.after)}</TableCell>
                      <TableCell className="ladder-num">{past ? longDay(row.a.at) : day(row.a.at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          ) : <p className="lounge-empty">{past ? `No tables in Season ${season.season}.` : "No verified tables this season."}</p>}
          {season.adjustments.some((a) => a.reason === "From the lounge's records") && <p className="ladder-note">Penalty and bonus lines from the lounge&apos;s records show where a table started from a different number than the last one ended.</p>}
        </section>

        <section className="lounge-sec">
          <p className="ladder-note">Ranked on GameShuffle.</p>
          <MedalCredit className="ladder-note" />
        </section>
      </Container>
    </main>
  );
}
