import type { Metadata } from "next";
import Link from "next/link";
import { Container, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { MmrEmblem } from "@/components/mmr/MmrEmblem";
import { LabeledSubNav } from "@/components/ui/LabeledSubNav";
import { TableScroll } from "@/components/ui/TableScroll";
import { LoungeUnavailable, divisionSteps, loungePlayer, type LoungePlayer } from "@/lib/mmr/mkcentral";
import { divisionLook } from "@/lib/mmr/look";
import { MMR_GAMES, MMR_GAME_IDS, isMmrGame, placeWord, standing, type MmrGame } from "@/lib/mmr/rules";
import { headToHead } from "@/lib/lounge/h2h";
import { loungePagePath } from "@/lib/lounge/lines";
import "@/styles/lounge.css";
import { MedalCredit } from "@/components/mmr/MedalCredit";

/**
 * /lounge/compare/<a>/<b>: head-to-head between two lounge players (dashboard additions picks,
 * 2026-10-20): every event they shared this season, as opponents and as teammates. Kept out of search.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Head-to-head: lounge stats", robots: { index: false, follow: true } };

type Params = { params: Promise<{ a: string; b: string }>; searchParams: Promise<{ game?: string }> };
const fmt = (n: number | null | undefined) => (n == null ? "?" : Math.round(n).toLocaleString("en-US"));
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : "0");
const comparePath = (a: string, b: string, game: MmrGame) => `/lounge/compare/${encodeURIComponent(a)}/${encodeURIComponent(b)}${game === "mkworld12p" ? "" : `?game=${game}`}`;

export default async function ComparePage({ params, searchParams }: Params) {
  const p = await params;
  const aName = decodeURIComponent(p.a), bName = decodeURIComponent(p.b);
  const g = (await searchParams).game;
  const game: MmrGame = isMmrGame(g) ? g : "mkworld12p";
  let a: LoungePlayer | null = null, b: LoungePlayer | null = null, down = false;
  let steps: Awaited<ReturnType<typeof divisionSteps>> = [];
  try { [a, b, steps] = await Promise.all([loungePlayer({ name: aName }, game), loungePlayer({ name: bName }, game), divisionSteps(game)]); }
  catch (e) { if (e instanceof LoungeUnavailable) down = true; else throw e; }
  const games = <LabeledSubNav label="Game" variant="pills" className="lounge-games" items={MMR_GAME_IDS.map((id) => ({ label: MMR_GAMES[id].short, href: comparePath(a?.name ?? aName, b?.name ?? bName, id), active: id === game }))} />;

  if (!a || !b) {
    const missing = !a ? aName : bName;
    return (
      <main className="lounge-page">
        <BrowseHero eyebrow="Head-to-head" title={`${aName} vs ${bName}`} sub={down ? "MKCentral isn't answering right now. Try again in a minute." : `There's no lounge player called ${missing} in ${MMR_GAMES[game].label} this season.`} accent="blue" field="compete" compact />
        <Container className="lounge-body">{games}<p className="lounge-empty"><Link href="/lounge">Search the lounge</Link></p></Container>
      </main>
    );
  }

  const h = headToHead({ id: a.playerId, changes: a.changes }, { id: b.playerId, changes: b.changes });
  const o = h.opponents;
  const aDiv = standing(a.mmr, steps, a.division).division, bDiv = standing(b.mmr, steps, b.division).division;
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
  const rows: [string, string | number, string | number, -1 | 0 | 1][] = [
    ["MMR now", fmt(a.mmr), fmt(b.mmr), Math.sign((a.mmr ?? 0) - (b.mmr ?? 0)) as -1 | 0 | 1],
    ["Season peak", fmt(a.maxMmr), fmt(b.maxMmr), Math.sign((a.maxMmr ?? 0) - (b.maxMmr ?? 0)) as -1 | 0 | 1],
    ["Finished ahead, as opponents", o.aAhead, o.bAhead, Math.sign(o.aAhead - o.bAhead) as -1 | 0 | 1],
    ["Average place, shared free-for-alls", h.aFfaPlace != null ? h.aFfaPlace.toFixed(1) : "?", h.bFfaPlace != null ? h.bFfaPlace.toFixed(1) : "?", h.aFfaPlace != null && h.bFfaPlace != null ? (Math.sign(h.bFfaPlace - h.aFfaPlace) as -1 | 0 | 1) : 0],
    ["MMR from shared events as opponents", signed(o.aNet), signed(o.bNet), Math.sign(o.aNet - o.bNet) as -1 | 0 | 1],
  ];

  return (
    <main className="lounge-page">
      <BrowseHero
        eyebrow="Head-to-head"
        title={`${a.name} vs ${b.name}`}
        sub={h.events ? `${h.events} ${h.events === 1 ? "event" : "events"} together this season: ${o.events} as opponents, ${h.teammates.events} as teammates.` : "They haven't played an event together this season."}
        accent="blue"
        field="compete"
        compact
        aside={<span className="lounge-vs"><MmrEmblem d={divisionLook(aDiv)} frame="tile" /><MmrEmblem d={divisionLook(bDiv)} frame="tile" /></span>}
      />
      <Container className="lounge-body">
        {games}
        <section className="lounge-sec" aria-labelledby="h2h-side">
          <h2 id="h2h-side">Side by side</h2>
          <TableScroll label="Side by side table">
            <Table>
              <TableHeader><TableRow><TableHead><Link href={loungePagePath(a.name, game)}>{a.name}</Link><span className="lounge-cell-note">{aDiv}</span></TableHead><TableHead align="center"><span className="sr-only">Stat</span></TableHead><TableHead align="right"><Link href={loungePagePath(b.name, game)}>{b.name}</Link><span className="lounge-cell-note">{bDiv}</span></TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map(([label, av, bv, lead]) => (
                  <TableRow key={label}>
                    <TableCell><span className={lead > 0 ? "lounge-lead" : undefined}>{av}</span></TableCell>
                    <TableCell align="center"><span className="lounge-cell-note lounge-cell-note--mid">{label}</span></TableCell>
                    <TableCell align="right"><span className={lead < 0 ? "lounge-lead" : undefined}>{bv}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
          {h.teammates.events > 0 && <p className="lounge-empty">As teammates: {h.teammates.wins}-{h.teammates.losses}, <span className={h.teammates.net >= 0 ? "lounge-up" : "lounge-down"}>{signed(h.teammates.net)}</span> for {a.name}.</p>}
        </section>

        {h.meetings.length > 0 && (
          <section className="lounge-sec" aria-labelledby="h2h-meet">
            <h2 id="h2h-meet">Meetings <small>Newest first</small></h2>
            <TableScroll label="Meetings table">
              <Table>
                <TableHeader><TableRow><TableHead>Event</TableHead><TableHead align="right">{a.name}</TableHead><TableHead align="right">{b.name}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {h.meetings.slice(0, 20).map((m) => (
                    <TableRow key={m.tableId}>
                      <TableCell>{day(m.at)}<span className="lounge-cell-note">{m.tier === "SQ" ? "Squad queue" : m.tier ? `Tier ${m.tier}` : ""}{m.tier ? " · " : ""}{m.format === "FFA" ? "Free-for-all" : m.format}{m.together ? " · together" : ""}</span></TableCell>
                      <TableCell align="right">{m.aPlace ? placeWord(m.aPlace) : "?"} <span className={m.aDelta >= 0 ? "lounge-up" : "lounge-down"}>{signed(m.aDelta)}</span></TableCell>
                      <TableCell align="right">{m.bPlace ? placeWord(m.bPlace) : "?"} <span className={m.bDelta >= 0 ? "lounge-up" : "lounge-down"}>{signed(m.bDelta)}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          </section>
        )}

        <footer className="lounge-foot">
          <p>Numbers from MKCentral&apos;s lounge: every verified event both played this season. In a team event, a place is the team&apos;s.</p>
          <p><Link href={loungePagePath(a.name, game)}>{a.name}&apos;s season</Link> · <Link href={loungePagePath(b.name, game)}>{b.name}&apos;s season</Link> · <Link href="/lounge">Search the lounge</Link></p>
          <MedalCredit />
        </footer>
      </Container>
    </main>
  );
}
