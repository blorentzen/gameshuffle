import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Accordion, Button, Container, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconCaretUpFilled } from "@tabler/icons-react";
import { LabeledSubNav } from "@/components/ui/LabeledSubNav";
import { BrowseHero } from "@/components/events/BrowseHero";
import { MmrEmblem } from "@/components/mmr/MmrEmblem";
import { LoungeConfirm } from "@/components/lounge/LoungeConfirm";
import { RoomCheck } from "@/components/lounge/RoomCheck";
import { LoungeProBand } from "@/components/lounge/LoungeProBand";
import { LoungeLookup } from "@/components/lounge/LoungeLookup";
import { LoungeBoards, type BoardTab } from "@/components/lounge/LoungeBoards";
import { LandingTry } from "@/components/lounge/LandingTry";
import { isProUser } from "@/lib/subscription-server";
import { TableScroll } from "@/components/ui/TableScroll";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { divisionLook } from "@/lib/mmr/look";
import { MMR_GAMES, isMmrGame, stepsFrom, type MmrGame } from "@/lib/mmr/rules";
import { boardRows, climbers as gsClimbers, linksFor, type BoardScope } from "@/lib/lounge/store";
import { climbers as weekClimbRows, divisionTable, type LeaderRow } from "@/lib/lounge/lookup";
import { seasonSummary, tablesWaiting, weekClimbers, worldTop } from "@/lib/lounge/lookupServer";
import { countryName } from "@/lib/lounge/countries";
import "@/styles/lounge.css";

/**
 * /lounge: look up any Mario Kart lounge player, curious or competing (lookup picks, 2026-10-21,
 * all as recommended). The header holds the search (as you type, across all three games, friend
 * codes too), the players looked up lately and the compare form; then the season so far in one
 * line, the boards (the world's top 10, this week's climbers, countries, and the GameShuffle boards
 * from the competitive dashboard), the divisions with "Where would this MMR land?", and the tools
 * for lounge players (check a room, confirm your lounge name).
 */

export const dynamic = "force-dynamic";

const DESCRIPTION = "Look up any Mario Kart lounge player by name or friend code: MMR, division, world rank, nights, formats and partners. The world's top 10, this week's climbers, countries and divisions, from MKCentral's lounge.";

export const metadata: Metadata = {
  title: "Mario Kart lounge stats",
  description: DESCRIPTION,
  alternates: { canonical: "https://www.gameshuffle.co/lounge" },
  openGraph: { title: "Mario Kart lounge stats", description: DESCRIPTION, url: "https://www.gameshuffle.co/lounge", siteName: "GameShuffle", type: "website" },
};

type BoardId = "world" | "climbing" | "countries" | "gs";
const BOARDS: BoardId[] = ["world", "climbing", "countries", "gs"];
const SCOPES: { id: BoardScope; label: string }[] = [
  { id: "everyone", label: "Everyone" },
  { id: "friends", label: "My friends" },
  { id: "crew", label: "My crew" },
  { id: "country", label: "My country" },
];
const fmt = (n: number | null | undefined) => (n == null ? "?" : Math.round(n).toLocaleString("en-US"));
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : "0");
const playerHref = (name: string, game: MmrGame) => `/lounge/${encodeURIComponent(name)}${game === "mkworld12p" ? "" : `?game=${game}`}`;
const isScope = (v: unknown): v is BoardScope => SCOPES.some((s) => s.id === v);

/** A player in a board: emblem, name (a link to their page), division and country under it. */
function PlayerCell({ r, game }: { r: Pick<LeaderRow, "name" | "division" | "country">; game: MmrGame }) {
  return (
    <span className="lounge-board-name">
      <MmrEmblem d={divisionLook(r.division ?? "Placement")} frame="tile" />
      <span>
        <Link href={playerHref(r.name, game)}>{r.name}</Link>
        <span className="lounge-cell-note">{[r.division ?? "Placement", r.country ? countryName(r.country) : null].filter(Boolean).join(" · ")}</span>
      </span>
    </span>
  );
}

export default async function LoungePage({ searchParams }: { searchParams: Promise<{ game?: string; board?: string; scope?: string }> }) {
  const sp = await searchParams;
  const game: MmrGame = isMmrGame(sp.game) ? sp.game : "mkworld12p";
  // ?board= picks the tab; the old board names (everyone, friends, crew, country) open On GameShuffle with that scope.
  const board: BoardId = BOARDS.includes(sp.board as BoardId) ? (sp.board as BoardId) : isScope(sp.board) ? "gs" : "world";
  const scope: BoardScope = isScope(sp.scope) ? sp.scope : isScope(sp.board) ? sp.board : "everyone";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [mine, discord, gsBoard, gsClimbing, viewerPro, summary, top, rising, waiting] = await Promise.all([
    user ? linksFor(user.id) : Promise.resolve([]),
    user ? createServiceClient().from("users").select("discord_id").eq("id", user.id).maybeSingle().then(({ data }) => !!(data as { discord_id: string | null } | null)?.discord_id) : Promise.resolve(false),
    boardRows(game, scope, user?.id ?? null),
    gsClimbers(game),
    user ? isProUser(user.id) : Promise.resolve(false),
    seasonSummary(game).catch(() => null),
    worldTop(game).catch(() => null),
    weekClimbers(game).catch(() => null),
    tablesWaiting(game),
  ]);
  const short = MMR_GAMES[game].short;
  const seasonWord = summary?.season ? `${short}, season ${summary.season}` : short;
  const down = <p className="lounge-empty">MKCentral isn&apos;t answering right now. Try again in a minute.</p>;

  // ── Boards ──
  const world: ReactNode = top?.rows.length ? (
    <TableScroll label={`World top 10, ${short}`}>
      <Table>
        <TableHeader><TableRow><TableHead align="right" className="lounge-rank-col">#</TableHead><TableHead>Player</TableHead><TableHead align="right">MMR</TableHead><TableHead align="right">Last 10</TableHead></TableRow></TableHeader>
        <TableBody>
          {top.rows.slice(0, 10).map((r, i) => (
            <TableRow key={r.id}>
              <TableCell align="right">{r.rank ?? i + 1}</TableCell>
              <TableCell><PlayerCell r={r} game={game} /></TableCell>
              <TableCell align="right">{fmt(r.mmr)}</TableCell>
              <TableCell align="right">
                {r.gain10 == null ? "?" : <span className={r.gain10 >= 0 ? "lounge-up" : "lounge-down"}>{signed(r.gain10)}</span>}
                {r.wins10 != null && r.losses10 != null && <span className="lounge-cell-note">{r.wins10}-{r.losses10}</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  ) : down;

  const climbing = rising ? weekClimbRows(rising.rows) : [];
  const climbingBoard: ReactNode = !rising ? down : climbing.length ? (
    <TableScroll label={`Climbing this week, ${short}`}>
      <Table>
        <TableHeader><TableRow><TableHead>Player</TableHead><TableHead align="right">Climbed</TableHead><TableHead align="right">Rank now</TableHead><TableHead align="right">MMR</TableHead></TableRow></TableHeader>
        <TableBody>
          {climbing.map((r) => (
            <TableRow key={r.id}>
              <TableCell><PlayerCell r={r} game={game} /></TableCell>
              <TableCell align="right">
                <span className="lounge-up lounge-climb"><IconCaretUpFilled size={14} aria-hidden="true" /><span className="sr-only">Up </span>{fmt(Math.abs(r.weekChange ?? 0))} places</span>
              </TableCell>
              <TableCell align="right">{r.rank ? `#${fmt(r.rank)}` : "?"}</TableCell>
              <TableCell align="right">{fmt(r.mmr)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  ) : <p className="lounge-empty">Nobody has climbed since last week yet.</p>;

  const countries: ReactNode = !summary ? down : summary.countries.length ? (
    <>
      <p className="lounge-note">Countries with six players or more, by their top six players&apos; average MMR.{summary.countryCount > summary.countries.length ? ` The top ${summary.countries.length} of ${summary.countryCount}.` : ""}</p>
      <TableScroll label={`Countries, ${short}`}>
        <Table>
          <TableHeader><TableRow><TableHead align="right" className="lounge-rank-col">#</TableHead><TableHead>Country</TableHead><TableHead align="right">Top six average</TableHead><TableHead align="right">Players</TableHead><TableHead>Best player</TableHead></TableRow></TableHeader>
          <TableBody>
            {summary.countries.map((c, i) => (
              <TableRow key={c.code}>
                <TableCell align="right">{i + 1}</TableCell>
                <TableCell>{countryName(c.code)}</TableCell>
                <TableCell align="right">{fmt(c.topSix)}</TableCell>
                <TableCell align="right">{fmt(c.players)}</TableCell>
                <TableCell>{c.best ? <><Link href={playerHref(c.best.name, game)}>{c.best.name}</Link><span className="lounge-cell-note">{fmt(c.best.mmr)} MMR</span></> : "?"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableScroll>
    </>
  ) : <p className="lounge-empty">No country has six players yet this season.</p>;

  const gsHref = (s: BoardScope) => {
    const q = new URLSearchParams();
    if (game !== "mkworld12p") q.set("game", game);
    q.set("board", "gs");
    if (s !== "everyone") q.set("scope", s);
    return `/lounge?${q.toString()}#boards`;
  };
  const needsSignIn = !user && scope !== "everyone";
  const emptyLine = needsSignIn
    ? "Sign in to see this board."
    : scope === "country" && !gsBoard.country
      ? `Confirm your lounge name in ${short} to see your country's board.`
      : scope === "crew" ? "Nobody on a crew with you has confirmed a lounge name in this game yet."
        : scope === "friends" ? "Nobody you follow has confirmed a lounge name in this game yet."
          : "Nobody on GameShuffle has confirmed a lounge name in this game yet.";
  const scopeLabel = (s: BoardScope) => (s === "country" && gsBoard.country ? countryName(gsBoard.country) : SCOPES.find((x) => x.id === s)!.label);
  const gs: ReactNode = (
    <>
      <p className="lounge-note">Players who confirmed their lounge name on GameShuffle with Discord.</p>
      <LabeledSubNav label="Who's on the GameShuffle board" variant="pills" className="lounge-games" items={SCOPES.map((s) => ({ label: scopeLabel(s.id), href: gsHref(s.id), active: s.id === scope }))} />
      <div className="lounge-gs">
        <div>
          {gsBoard.rows.length ? (
            <TableScroll label={`${scopeLabel(scope)}, ${short}`}>
              <Table>
                <TableHeader><TableRow><TableHead align="right" className="lounge-rank-col">#</TableHead><TableHead>Player</TableHead><TableHead align="right">MMR</TableHead><TableHead align="right">This week</TableHead></TableRow></TableHeader>
                <TableBody>
                  {gsBoard.rows.map((r, i) => (
                    <TableRow key={r.userId} className={r.me ? "lounge-board-row--me" : undefined}>
                      <TableCell align="right">{i + 1}</TableCell>
                      <TableCell>
                        <span className="lounge-board-name">
                          <MmrEmblem d={divisionLook(r.division ?? "Placement")} frame="tile" />
                          <span><Link href={playerHref(r.name, game)}>{r.name}</Link>{r.me ? " (you)" : ""}<span className="lounge-cell-note">{r.division ?? "Placement"}</span></span>
                        </span>
                      </TableCell>
                      <TableCell align="right">{fmt(r.mmr)}</TableCell>
                      <TableCell align="right">{r.week == null ? "?" : <span className={r.week >= 0 ? "lounge-up" : "lounge-down"}>{signed(r.week)}</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          ) : <p className="lounge-empty">{emptyLine}</p>}
        </div>
        <div>
          <h3 className="lounge-sub-head">Climbers since Monday</h3>
          {gsClimbing.length ? (
            <TableScroll label="Climbers since Monday on GameShuffle">
              <Table>
                <TableHeader><TableRow><TableHead>Player</TableHead><TableHead align="right">Since Monday</TableHead></TableRow></TableHeader>
                <TableBody>
                  {gsClimbing.map((r) => (
                    <TableRow key={r.userId}>
                      <TableCell><Link href={playerHref(r.name, game)}>{r.name}</Link><span className="lounge-cell-note">{r.division ?? "Placement"} · {fmt(r.mmr)}</span></TableCell>
                      <TableCell align="right"><span className="lounge-up">{signed(r.week ?? 0)}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          ) : <p className="lounge-empty">Nobody confirmed here has climbed since Monday yet.</p>}
        </div>
      </div>
    </>
  );

  const tabs: BoardTab[] = [
    { id: "world", label: "World top 10", content: <div className="lounge-panel">{world}</div> },
    { id: "climbing", label: "Climbing this week", content: <div className="lounge-panel">{climbingBoard}</div> },
    { id: "countries", label: "Countries", content: <div className="lounge-panel">{countries}</div> },
    { id: "gs", label: "On GameShuffle", content: <div className="lounge-panel">{gs}</div> },
  ];

  // ── Divisions ──
  const steps = summary?.steps ?? stepsFrom(null, game);
  const counts = summary?.divisions ?? [];
  const total = summary?.players ?? null;
  const divisions = divisionTable(steps, counts, total);

  return (
    <main className="lounge-page">
      <BrowseHero
        eyebrow="Mario Kart lounge"
        title="Lounge stats"
        sub="Any lounge player's season, from MKCentral's lounge."
        accent="blue"
        field="compete"
        compact
        actions={<LoungeLookup compareGame={game} />}
      />
      <Container className="lounge-body">
        <section className="lounge-sec lounge-sec--flat lounge-sofar" aria-labelledby="lounge-season-h">
          <h2 id="lounge-season-h">The season so far <small>{seasonWord}</small></h2>
          {summary ? (
            <ul className="lounge-sofar__line">
              <li><b>{fmt(summary.players)}</b> players</li>
              <li><b>{fmt(summary.events)}</b> events played</li>
              <li><b>{fmt(summary.medianMmr)}</b> median MMR</li>
              {waiting != null && (
                <li className="lounge-sofar__live"><span className="lounge-live-dot" aria-hidden="true" /><b>{fmt(waiting)}</b> {waiting === 1 ? "table" : "tables"} waiting for staff</li>
              )}
            </ul>
          ) : down}
        </section>

        <section className="lounge-sec" aria-labelledby="lounge-boards-h" id="boards">
          <h2 id="lounge-boards-h">Boards</h2>
          <LoungeBoards tabs={tabs} initial={board} game={game} scope={scope === "everyone" ? null : scope} />
        </section>

        <section className="lounge-sec" aria-labelledby="lounge-div-h" id="divisions">
          <h2 id="lounge-div-h">Divisions <small>{seasonWord}</small></h2>
          <TableScroll label={`Divisions, ${short}`}>
            <Table>
              <TableHeader><TableRow><TableHead>Division</TableHead><TableHead align="right">Starts at</TableHead><TableHead align="right">Players</TableHead><TableHead align="right">Share</TableHead></TableRow></TableHeader>
              <TableBody>
                {divisions.map((d) => {
                  const look = divisionLook(d.name);
                  const pct = total ? Math.min(100, (d.count / total) * 100) : 0;
                  return (
                    <TableRow key={d.name}>
                      <TableCell><span className="lounge-board-name"><MmrEmblem d={look} frame="tile" /><span>{d.name}</span></span></TableCell>
                      <TableCell align="right">{fmt(d.at)}</TableCell>
                      <TableCell align="right">{total ? fmt(d.count) : "?"}</TableCell>
                      <TableCell align="right">
                        {total ? (
                          <span className="lounge-share-cell">
                            <span className="lounge-share-bar" aria-hidden="true"><i style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%`, background: look.c2 }} /></span>
                            {d.share}
                          </span>
                        ) : "?"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableScroll>
          <LandingTry game={game} steps={steps} counts={counts} total={total} />
        </section>

        <section className="lounge-sec lounge-for" aria-labelledby="lounge-for-h">
          <h2 id="lounge-for-h">For lounge players</h2>
          <div className="lounge-for__block">
            <h3 id="lounge-room">Check a room</h3>
            <Accordion
              variant="flush"
              className="lounge-room-fold"
              items={[{
                id: "lounge-room-check",
                title: "Paste a room's names to see what each place pays and where everyone is likely to finish",
                content: <RoomCheck game={game} myNames={Object.fromEntries(mine.map((l) => [l.game, l.name]))} />,
              }]}
            />
          </div>
          <div className="lounge-for__block lounge-mine">
            <h3 id="lounge-mine">Your lounge</h3>
            {!user ? (
              <>
                <p className="lounge-mine__note">Sign in with an account that has Discord linked, and GameShuffle confirms your lounge name from the Discord account MKCentral has on file. Confirmed players show on the GameShuffle board and their page can be found in search.</p>
                <div><Link href="/login?redirect=/lounge"><Button variant="primary">Sign in</Button></Link></div>
              </>
            ) : mine.length ? (
              <>
                <div className="lounge-mine__list">
                  {mine.map((l) => (
                    <Link key={l.game} href={playerHref(l.name, l.game)} className="lounge-mine__item">
                      <MmrEmblem d={divisionLook(l.division ?? "Placement")} frame="tile" />
                      <span><b>{l.name}</b><span>{MMR_GAMES[l.game].short} · {l.division ?? "Placement"} · {fmt(l.mmr)}</span></span>
                    </Link>
                  ))}
                </div>
                <div><LoungeConfirm again /></div>
              </>
            ) : discord ? (
              <>
                <p className="lounge-mine__note">MKCentral keeps each player&apos;s Discord account, so confirming takes one tap and no codes.</p>
                <div><LoungeConfirm /></div>
              </>
            ) : (
              <p className="lounge-mine__note">Confirming uses your Discord account. <Link href="/account?tab=security">Link Discord in Settings ▸ Sign-in &amp; security</Link>, then come back here.</p>
            )}
          </div>
        </section>

        <LoungeProBand pro={viewerPro} />

        <footer className="lounge-foot">
          <p>Numbers from MKCentral&apos;s lounge. GameShuffle checks confirmed players every 15 minutes. <Link href="/mmr-card">Put your MMR on stream with the MMR card</Link>.</p>
        </footer>
      </Container>
    </main>
  );
}
