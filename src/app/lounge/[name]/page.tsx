import type { Metadata } from "next";
import Link from "next/link";
import { cache, type ReactNode } from "react";
import { Button, Container, Input, Progress, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconCircleCheck } from "@tabler/icons-react";
import { LabeledSubNav } from "@/components/ui/LabeledSubNav";
import { BrowseHero } from "@/components/events/BrowseHero";
import { LoungeHero } from "@/components/lounge/LoungeHero";
import { LoungeTabs } from "@/components/lounge/LoungeTabs";
import { LoungeSeasonSelect } from "@/components/lounge/LoungeSeasonSelect";
import { NumbersStrip, FormSquares, type StripCell } from "@/components/lounge/NumbersStrip";
import { SeasonChart } from "@/components/lounge/SeasonChart";
import { PlacementBars } from "@/components/lounge/PlacementBars";
import { TimeOfNight } from "@/components/lounge/TimeOfNight";
import { DayOfWeek } from "@/components/lounge/DayOfWeek";
import { CareerTab } from "@/components/lounge/CareerTab";
import { LoungeProBand } from "@/components/lounge/LoungeProBand";
import { LoungeLookup } from "@/components/lounge/LoungeLookup";
import { LoungeCompare } from "@/components/lounge/LoungeCompare";
import { LoungeShareButton } from "@/components/lounge/LoungeShareButton";
import { RememberLookup } from "@/components/lounge/LoungeRecent";
import { PlayerRowBody } from "@/components/lounge/PlayerRow";
import { MmrEmblem } from "@/components/mmr/MmrEmblem";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { divisionLook } from "@/lib/mmr/look";
import { playerSentence, suggestionHref, type LeaderRow, type Suggestion } from "@/lib/lounge/lookup";
import { closestPlayers, nearInWorld } from "@/lib/lounge/lookupServer";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { LoungeShareNight } from "@/components/mmr/LoungeShareNight";
import { nightFor } from "@/lib/lounge/night";
import { TableScroll } from "@/components/ui/TableScroll";
import { LoungeUnavailable, loungeGames } from "@/lib/mmr/mkcentral";
import { MMR_GAMES, MMR_GAME_IDS, formSquares, isEvent, isMmrGame, placeWord, type MmrChange, type MmrGame } from "@/lib/mmr/rules";
import {
  byFormat, byTier, bestEvent, formatOf, lastEvents, lateInNight, nights, paceTo, placements, seasonSeries, topShare, worstEvent,
} from "@/lib/lounge/season";
import { againstRoomFor, loungeProfile, rivalsFor, type LoungeProfile } from "@/lib/lounge/store";
import { createClient } from "@/lib/supabase/server";
import { isProUser } from "@/lib/subscription-server";
import { countryName } from "@/lib/lounge/countries";
import { playerBests } from "@/lib/timeTrials/store";
import { formatTime as ttFormat, ordinal as ttOrdinal } from "@/lib/timeTrials/rules";
import { trackPath as ttPath, ttTrack, TT_GAMES, type TtGame } from "@/lib/timeTrials/tracks";
import "@/styles/lounge.css";
import "@/styles/time-trials.css";
import { MedalCredit } from "@/components/mmr/MedalCredit";

/**
 * /lounge/<name>: one Mario Kart lounge player (competitive dashboard picks, 2026-10-20; laid out
 * again in the lounge page picks the same day, all as recommended): a header in the division's
 * colors with its emblem, a season picker beside the game pills, and five tabs (Overview, Events,
 * Teammates, How they play, Career) kept in the address. Anyone can be looked up; the page stays
 * out of search unless the player confirmed their lounge name on GameShuffle, and past seasons
 * always do.
 *
 * Not `force-dynamic`: the page is dynamic anyway (it reads the session and the query), and leaving
 * it out lets a finished season's MKCentral reads stay in Next's data cache for good.
 */

type Params = { params: Promise<{ name: string }>; searchParams: Promise<{ game?: string; season?: string; tab?: string }> };

const read = cache(async (name: string, game: MmrGame, season: number | null): Promise<{ profile: LoungeProfile | null; down: boolean }> => {
  try { return { profile: await loungeProfile({ name }, game, { season }), down: false }; }
  catch (e) { if (e instanceof LoungeUnavailable) return { profile: null, down: true }; throw e; }
});

const fmt = (n: number | null | undefined) => (n == null ? "?" : Math.round(n).toLocaleString("en-US"));
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : "0");
const pathFor = (name: string, game: MmrGame, season?: number | null) => {
  const q = new URLSearchParams();
  if (game !== "mkworld12p") q.set("game", game);
  if (season) q.set("season", String(season));
  const s = q.toString();
  return `/lounge/${encodeURIComponent(name)}${s ? `?${s}` : ""}`;
};
/** Keeps the tab the page opened on when the game changes (tabs switched later live only in the address). */
const withTab = (href: string, tab: string | undefined) => (tab && /^[a-z]{1,12}$/.test(tab) && tab !== "overview" ? `${href}${href.includes("?") ? "&" : "?"}tab=${tab}` : href);
const seasonParam = (v: string | undefined) => (v && /^\d{1,3}$/.test(v) ? Number(v) : null);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
/** A night by its own Pacific day ("2026-10-17"): events past midnight belong to the evening before. */
const nightDay = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const tierWord = (t: string | null) => (t === "SQ" ? "Squad queue" : t ? `Tier ${t}` : "");
const formatWord = (c: MmrChange) => { const f = formatOf(c); return f === "FFA" ? "Free-for-all" : f; };
const Delta = ({ n }: { n: number }) => <span className={n >= 0 ? "lounge-up" : "lounge-down"}>{signed(n)}</span>;

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const name = decodeURIComponent((await params).name);
  const sp = await searchParams;
  const game: MmrGame = isMmrGame(sp.game) ? sp.game : "mkworld12p";
  const { profile } = await read(name, game, seasonParam(sp.season));
  if (!profile) return { title: `${name}: lounge stats`, robots: { index: false, follow: true } };
  const p = profile.player;
  const canonical = `https://www.gameshuffle.co${pathFor(profile.current.name, game)}`;
  if (!profile.isCurrent) {
    return { title: `${p.name}: ${MMR_GAMES[game].short} lounge season ${profile.season}`, robots: { index: false, follow: true }, alternates: { canonical } };
  }
  const title = `${p.name}: ${MMR_GAMES[game].short} lounge stats`;
  const description = `${p.name} is ${profile.division} with ${fmt(p.mmr)} MMR in ${MMR_GAMES[game].label} lounge${p.worldRank ? `, #${fmt(p.worldRank)} in the world` : ""}. Season chart, nights, formats, partners, placements and every past season.`;
  return {
    title,
    description,
    robots: profile.confirmed ? undefined : { index: false, follow: true },
    alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: "GameShuffle", type: "profile" },
  };
}

export default async function LoungePlayerPage({ params, searchParams }: Params) {
  const name = decodeURIComponent((await params).name);
  const sp = await searchParams;
  const game: MmrGame = isMmrGame(sp.game) ? sp.game : "mkworld12p";
  const [{ profile, down }, registered] = await Promise.all([read(name, game, seasonParam(sp.season)), loungeGames(name).catch(() => null)]);
  // Only the games the player is registered in (MKCentral lists them); every game when it doesn't say.
  const gameIds = MMR_GAME_IDS.filter((id) => !registered?.length || registered.includes(id) || id === game);
  const games = gameIds.length > 1 ? (
    <LabeledSubNav label="Game"
      variant="pills"
      className="lounge-games"
      items={gameIds.map((id) => ({ label: MMR_GAMES[id].short, href: withTab(pathFor(profile?.current.name ?? name, id), sp.tab), active: id === game }))}
    />
  ) : null;

  if (!profile) {
    // Did you mean: the closest names across all three games (nothing to suggest while MKCentral is down).
    const close: Suggestion[] = down ? [] : await closestPlayers(name).catch(() => []);
    return (
      <main className="lounge-page">
        <BrowseHero
          eyebrow="Lounge"
          title={name}
          sub={down ? "MKCentral isn't answering right now. Try again in a minute." : `No lounge player is called ${name} in ${MMR_GAMES[game].short} this season.`}
          accent="blue"
          field="compete"
          compact
        />
        <Container className="lounge-body">
          {close.length > 0 && (
            <section className="lounge-sec lounge-sec--flat" aria-labelledby="lounge-dym">
              <h2 id="lounge-dym">Did you mean</h2>
              <ul className="lounge-dym">
                {close.map((s) => (
                  <li key={`${s.name}-${s.primary.game}`}>
                    <Link href={suggestionHref(s)} className={`lounge-prow lounge-prow--link ${tagged(EVENTS.loungeSearchUsed, { via: "did-you-mean" })}`}>
                      <PlayerRowBody s={s} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className={`lounge-sec${close.length ? "" : " lounge-sec--flat"}`} aria-labelledby="lounge-again">
            <h2 id="lounge-again">Search again</h2>
            <LoungeLookup tone="light" compareGame={game} />
          </section>
        </Container>
      </main>
    );
  }

  const p = profile.player;
  const cur = profile.current;
  const season = profile.season;
  const thisSeason = profile.isCurrent ? "this season" : `in season ${season}`;
  const noEvents = profile.isCurrent ? "No events yet this season." : `No events in season ${season}.`;
  const played = profile.played && p.eventsPlayed > 0;
  const country = p.country ? countryName(p.country) : null;

  // How they play: against the room is free; rivals, late in a night, time of night and day of week are GS Pro (for the viewer).
  const { data: { user: viewer } } = await (await createClient()).auth.getUser();
  const [viewerPro, vsRoom, near] = await Promise.all([
    viewer ? isProUser(viewer.id) : Promise.resolve(false),
    played ? againstRoomFor(game, p.playerId, season).catch(() => null) : Promise.resolve(null),
    // Near them in the world: the two above and the two below (this season only).
    profile.isCurrent && played && p.worldRank ? nearInWorld(game, p.worldRank).then((b) => b.rows).catch(() => [] as LeaderRow[]) : Promise.resolve([] as LeaderRow[]),
  ]);
  const rivals = viewerPro && played ? await rivalsFor(game, p.playerId, season).catch(() => []) : [];
  // The copied tables keep this season and the one before.
  const tablesKept = profile.isCurrent || (season != null && profile.currentSeason != null && season >= profile.currentSeason - 1);
  const noTables = tablesKept ? "This fills in once this season's tables are copied over." : "Kept for this season and last season only.";

  const sentence = playerSentence({
    name: p.name,
    mmr: p.mmr,
    worldRank: played ? p.worldRank : null,
    countryRank: profile.countryRank,
    country,
    events: p.eventsPlayed,
    winRate: p.winRate,
    finishedSeason: profile.isCurrent ? null : season,
  });

  // ── Overview ──
  const squares = formSquares(p.changes);
  const top = played ? topShare(p.worldRank, profile.totalPlayers) : null;
  const w10 = p.winsLastTen ?? squares.filter((s) => s !== "l").length, l10 = p.lossesLastTen ?? squares.filter((s) => s === "l").length;
  const cells: StripCell[] = [
    { key: "mmr", label: profile.isCurrent ? "MMR" : "Final MMR", value: fmt(p.mmr) },
    ...(played ? [
      { key: "world", label: top ? `World · ${top}` : "World", value: p.worldRank ? `#${fmt(p.worldRank)}` : "?" },
      { key: "peak", label: "Season peak", value: fmt(p.maxMmr) },
      { key: "events", label: p.winRate != null ? `Events · ${Math.round(p.winRate * 100)}% wins` : "Events", value: fmt(p.eventsPlayed) },
      { key: "avg", label: "Average score", value: p.averageScore != null ? p.averageScore.toFixed(1) : "?" },
      { key: "ten", label: squares.length ? `Last ten · ${w10}-${l10}` : "Last ten", value: <FormSquares marks={squares} /> },
    ] : [
      { key: "events", label: "Events", value: "0" },
    ]),
  ];
  const pace = profile.isCurrent ? paceTo(profile.toNext, p.changes) : null;
  const ten = lastEvents(p.changes, 10);
  // Share the night: only on the confirmed owner's own page, for their latest night this season.
  const ownNight = profile.isCurrent && played && viewer && profile.confirmed?.userId === viewer.id
    ? nightFor({ changes: p.changes, steps: profile.steps, mmr: p.mmr, division: profile.division })
    : null;
  const share: ReactNode = ownNight ? <LoungeShareNight game={game} name={p.name} night={ownNight.day} recap={ownNight.recap} label="Share my latest night" /> : null;

  const next = (
    <section className="lounge-sec lounge-sec--flat lounge-next" aria-labelledby="lounge-next">
      <h2 id="lounge-next" className="sr-only">Next division</h2>
      {profile.pending && (
        <p className="lounge-pending">Table submitted: {placeWord(profile.pending.place)}{profile.pending.format === "FFA" ? "" : ` in ${profile.pending.format}`}. About <Delta n={profile.pending.delta} /> once it&apos;s verified.</p>
      )}
      {!profile.isCurrent ? (
        <p className="lounge-next__line">
          {!played ? <>{p.name} didn&apos;t play season {season}.</>
            : profile.next && profile.toNext != null ? <>Finished season {season} in {profile.division}, <b>{fmt(profile.toNext)}</b> short of {profile.next.name}.</>
              : <>Finished season {season} in {profile.division}, the top division.</>}
        </p>
      ) : profile.next && profile.toNext != null && profile.division !== "Placement" ? (
        <>
          <p className="lounge-next__line"><b>{fmt(profile.toNext)}</b> to {profile.next.name}</p>
          <Progress value={Math.round(profile.pct * 100)} label={`${Math.round(profile.pct * 100)} percent of the way through ${profile.division}`} className="admin-progress-quiet" />
          {pace && (
            <p className="lounge-next__pace">
              {pace.events != null
                ? <>At this season&apos;s pace ({signed(pace.gain)} a win, {signed(-pace.loss)} a loss) that&apos;s about {fmt(pace.events)} events{pace.nights ? `, or ${fmt(pace.nights)} ${pace.nights === 1 ? "night" : "nights"} like the usual` : ""}.</>
                : <>At this season&apos;s pace ({signed(pace.gain)} a win, {signed(-pace.loss)} a loss) the number isn&apos;t climbing yet.</>}
            </p>
          )}
        </>
      ) : (
        <p className="lounge-next__line">{profile.division === "Placement" ? "Still in placement." : `${profile.division} is the top division.`}</p>
      )}
      <p className="lounge-next__more"><ArrowLink href={`/lounge${game === "mkworld12p" ? "" : `?game=${game}`}#divisions`}>What the divisions mean</ArrowLink></p>
    </section>
  );

  const nearRows = near.length > 1 && near.some((r) => r.id === p.playerId) ? near : [];
  const nearBlock = nearRows.length ? (
    <section className="lounge-sec" aria-labelledby="lounge-near">
      <h2 id="lounge-near">Near {p.name} in the world</h2>
      <TableScroll label={`Players near ${p.name}, table`}>
        <Table>
          <TableHeader><TableRow><TableHead align="right">#</TableHead><TableHead>Player</TableHead><TableHead align="right">MMR</TableHead><TableHead align="right">Last 10</TableHead></TableRow></TableHeader>
          <TableBody>
            {nearRows.map((r) => {
              const me = r.id === p.playerId;
              return (
                <TableRow key={r.id} className={me ? "lounge-board-row--me" : undefined}>
                  <TableCell align="right">{r.rank ? fmt(r.rank) : "?"}</TableCell>
                  <TableCell>
                    <span className="lounge-board-name">
                      <MmrEmblem d={divisionLook(r.division ?? "Placement")} frame="tile" />
                      <span>
                        {me ? <b aria-current="page">{r.name}</b> : <Link href={pathFor(r.name, game)}>{r.name}</Link>}
                        <span className="lounge-cell-note">{[r.division ?? "Placement", r.country ? countryName(r.country) : null].filter(Boolean).join(" · ")}</span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell align="right">{fmt(r.mmr)}</TableCell>
                  <TableCell align="right">{r.gain10 == null ? "?" : <Delta n={r.gain10} />}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableScroll>
    </section>
  ) : null;

  const overview = (
    <div className="lounge-panel">
      <NumbersStrip cells={cells} label={`${p.name}'s numbers ${thisSeason}`} />
      {next}
      {share && <div className="lounge-share">{share}</div>}
      {nearBlock}
      <section className="lounge-sec" aria-labelledby="lounge-season">
        <h2 id="lounge-season">MMR {thisSeason}</h2>
        <SeasonChart points={seasonSeries(p.changes)} steps={profile.steps} peak={p.maxMmr} />
      </section>
      <section className="lounge-sec" aria-labelledby="lounge-ten">
        <h2 id="lounge-ten">Last ten events {p.averageLastTen != null && ten.length > 0 && <small>Average score {p.averageLastTen.toFixed(1)}</small>}</h2>
        {ten.length ? <EventTable label="Last ten events" rows={ten.map((c) => ({ key: String(c.id), head: day(c.at), change: c }))} /> : <p className="lounge-empty">{noEvents}</p>}
      </section>
    </div>
  );

  // ── Events ──
  const allNights = nights(p.changes);
  const nightRows = allNights.slice(0, 10);
  const formats = byFormat(p.changes);
  const tiers = byTier(p.changes);
  const places = placements(p.changes);
  const best = bestEvent(p.changes), worst = worstEvent(p.changes);
  const events = (
    <div className="lounge-panel">
      <div className="lounge-two">
        <section className="lounge-sec lounge-sec--flat" aria-labelledby="lounge-nights">
          <h2 id="lounge-nights">Nights {allNights.length > nightRows.length && <small>Latest {nightRows.length} of {allNights.length}</small>}</h2>
          {nightRows.length ? (
            <TableScroll label="Nights table">
              <Table>
                <TableHeader><TableRow><TableHead>Night</TableHead><TableHead align="right">Events</TableHead><TableHead align="right">Record</TableHead><TableHead align="right">MMR</TableHead></TableRow></TableHeader>
                <TableBody>
                  {nightRows.map((n) => (
                    <TableRow key={n.start}>
                      <TableCell>{nightDay(n.day)}</TableCell>
                      <TableCell align="right">{n.events}</TableCell>
                      <TableCell align="right">{n.wins}-{n.losses}</TableCell>
                      <TableCell align="right"><Delta n={n.net} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          ) : <p className="lounge-empty">{noEvents}</p>}
        </section>
        <section className="lounge-sec lounge-sec--flat" aria-labelledby="lounge-formats">
          <h2 id="lounge-formats">Formats</h2>
          {formats.length ? (
            <TableScroll label="Formats table">
              <Table>
                <TableHeader><TableRow><TableHead>Format</TableHead><TableHead align="right">Events</TableHead><TableHead align="right">Record</TableHead><TableHead align="right">MMR</TableHead></TableRow></TableHeader>
                <TableBody>
                  {formats.map((f) => (
                    <TableRow key={f.format}>
                      <TableCell>{f.format === "FFA" ? "Free-for-all" : f.format}</TableCell>
                      <TableCell align="right">{f.events}</TableCell>
                      <TableCell align="right">{f.wins}-{f.losses}</TableCell>
                      <TableCell align="right"><Delta n={f.net} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          ) : <p className="lounge-empty">{noEvents}</p>}
        </section>
      </div>
      {(best || worst) && (
        <section className="lounge-sec" aria-labelledby="lounge-bestworst">
          <h2 id="lounge-bestworst">Best and worst events</h2>
          <EventTable label="Best and worst events" rows={[...(best ? [{ key: "best", head: "Best", change: best }] : []), ...(worst && worst !== best ? [{ key: "worst", head: "Worst", change: worst }] : [])]} dated />
        </section>
      )}
      <div className="lounge-two">
        {tiers.length > 0 && (
          <section className="lounge-sec" aria-labelledby="lounge-tiers">
            <h2 id="lounge-tiers">By tier</h2>
            <TableScroll label="Tiers table">
              <Table>
                <TableHeader><TableRow><TableHead>Tier</TableHead><TableHead align="right">Events</TableHead><TableHead align="right">Record</TableHead><TableHead align="right">Average score</TableHead><TableHead align="right">MMR</TableHead></TableRow></TableHeader>
                <TableBody>
                  {tiers.map((t) => (
                    <TableRow key={t.tier}>
                      <TableCell>{tierWord(t.tier)}</TableCell>
                      <TableCell align="right">{t.events}</TableCell>
                      <TableCell align="right">{t.wins}-{t.losses}</TableCell>
                      <TableCell align="right">{t.averageScore != null ? t.averageScore.toFixed(1) : "?"}</TableCell>
                      <TableCell align="right"><Delta n={t.net} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          </section>
        )}
        <section className="lounge-sec" aria-labelledby="lounge-places">
          <h2 id="lounge-places">Free-for-all places <small>{fmt(places.events)} events</small></h2>
          {places.events ? <PlacementBars counts={places.counts} /> : <p className="lounge-empty">No free-for-all events {thisSeason}.</p>}
        </section>
      </div>
    </div>
  );

  // ── Teammates ──
  const teammates = (
    <div className="lounge-panel">
      <section className="lounge-sec lounge-sec--flat" aria-labelledby="lounge-partners">
        <h2 id="lounge-partners">Partners {p.partnerAverage != null && profile.partners.length > 0 && <small>Teammates average {p.partnerAverage.toFixed(1)} points</small>}</h2>
        {profile.partners.length ? (
          <TableScroll label="Partners table">
            <Table>
              <TableHeader><TableRow><TableHead>Partner</TableHead><TableHead align="right">Events</TableHead><TableHead align="right">Record</TableHead><TableHead align="right">Their average</TableHead><TableHead align="right">MMR</TableHead></TableRow></TableHeader>
              <TableBody>
                {profile.partners.map((pt) => (
                  <TableRow key={pt.playerId}>
                    <TableCell><Link href={pathFor(pt.name, game, profile.isCurrent ? null : season)}>{pt.name}</Link><span className="lounge-cell-note">{pt.formats.join(", ")}</span></TableCell>
                    <TableCell align="right">{pt.events}</TableCell>
                    <TableCell align="right">{pt.wins}-{pt.losses}</TableCell>
                    <TableCell align="right">{pt.averageScore != null ? pt.averageScore.toFixed(1) : "?"}</TableCell>
                    <TableCell align="right"><Delta n={pt.net} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        ) : <p className="lounge-empty">No team events {thisSeason}.</p>}
      </section>
      <section className="lounge-sec" aria-labelledby="lounge-compare">
        <h2 id="lounge-compare">Head-to-head</h2>
        <p className="lounge-note">Every event two players shared this season, as opponents and as teammates.</p>
        <form action="/lounge/find" method="get" className="lounge-compare">
          <Input name="vs" floatingLabel="Compare with (a lounge name)" aria-label="Compare with (a lounge name)" maxLength={40} required autoComplete="off" fullWidth />
          <input type="hidden" name="name" value={cur.name} />
          <input type="hidden" name="game" value={game} />
          <Button type="submit" variant="secondary">Compare</Button>
        </form>
      </section>
    </div>
  );

  // ── How they play ──
  const split = lateInNight(p.changes);
  const timed = p.changes.filter(isEvent).map((c) => ({ at: c.at, delta: c.delta }));
  const howTheyPlay = (
    <div className="lounge-panel">
      <section className="lounge-sec lounge-sec--flat lounge-play" aria-labelledby="lounge-room-h">
        <h2 id="lounge-room-h">Against the room {vsRoom && <small>{fmt(vsRoom.events)} events</small>}</h2>
        {vsRoom ? (
          <>
            <p className="lounge-play__big">{Math.round(vsRoom.aboveShare * 100)}%</p>
            <p className="lounge-empty">of events {p.name} finished above where the room&apos;s MMR put them. On average {Math.abs(vsRoom.averagePlaces).toFixed(1)} {Math.abs(vsRoom.averagePlaces).toFixed(1) === "1.0" ? "place" : "places"} {vsRoom.averagePlaces >= 0 ? "above" : "below"} it.</p>
          </>
        ) : <p className="lounge-empty">{played ? noTables : noEvents}</p>}
      </section>
      {viewerPro ? (
        <>
          <div className="lounge-two">
            <section className="lounge-sec lounge-play" aria-labelledby="lounge-rivals">
              <h2 id="lounge-rivals">Rivals <small>Met most as opponents</small></h2>
              {rivals.length ? (
                <TableScroll label="Rivals table">
                  <Table>
                    <TableHeader><TableRow><TableHead>Player</TableHead><TableHead align="right">Events</TableHead><TableHead align="right">Ahead</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {rivals.map((r) => (
                        <TableRow key={r.playerId}>
                          <TableCell><Link href={`/lounge/compare/${encodeURIComponent(cur.name)}/${encodeURIComponent(r.name)}${game === "mkworld12p" ? "" : `?game=${game}`}`}>{r.name}</Link></TableCell>
                          <TableCell align="right">{r.events}</TableCell>
                          <TableCell align="right">{r.ahead}-{r.behind}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableScroll>
              ) : <p className="lounge-empty">{played ? noTables : noEvents}</p>}
            </section>
            <section className="lounge-sec lounge-play" aria-labelledby="lounge-late">
              <h2 id="lounge-late">Late in a night</h2>
              {split.early.events ? (
                <TableScroll label="Late in a night table">
                  <Table>
                    <TableHeader><TableRow><TableHead>Events</TableHead><TableHead align="right">Played</TableHead><TableHead align="right">Average MMR</TableHead></TableRow></TableHeader>
                    <TableBody>
                      <TableRow><TableCell>1 to {split.cutoff} of a night</TableCell><TableCell align="right">{split.early.events}</TableCell><TableCell align="right"><Delta n={Math.round(split.early.average)} /></TableCell></TableRow>
                      {split.late && <TableRow><TableCell>{split.cutoff + 1} and later</TableCell><TableCell align="right">{split.late.events}</TableCell><TableCell align="right"><Delta n={Math.round(split.late.average)} /></TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </TableScroll>
              ) : <p className="lounge-empty">{noEvents}</p>}
            </section>
          </div>
          <div className="lounge-two">
            <section className="lounge-sec lounge-play" aria-labelledby="lounge-time">
              <h2 id="lounge-time">Time of night <small>Your time zone</small></h2>
              <TimeOfNight events={timed} />
            </section>
            <section className="lounge-sec lounge-play" aria-labelledby="lounge-days">
              <h2 id="lounge-days">Day of the week <small>Your time zone</small></h2>
              <DayOfWeek events={timed} />
            </section>
          </div>
        </>
      ) : (
        <section className="lounge-sec" aria-labelledby="lounge-play-pro">
          <h2 id="lounge-play-pro">Rivals, late in a night, time of night and day of the week</h2>
          <p className="lounge-empty">These are part of GS Pro, for every lounge player. <a href="#lounge-pro">See what GS Pro adds</a></p>
        </section>
      )}
    </div>
  );

  // Time trials (picks 2026-10-29): a confirmed player's bests in this lounge's game.
  const ttGame: TtGame = game === "mk8dx" ? "mk8dx" : "mkworld";
  const ttBests = profile.confirmed ? (await playerBests(`u:${profile.confirmed.userId}`).catch(() => [])).filter((b) => b.game === ttGame && b.items === "shrooms" && b.vehicle === "any") : [];
  const times = ttBests.length ? (
    <section className="lounge-sec lounge-sec--flat" aria-label="Time trials">
      <p className="lounge-note">{p.name}&apos;s best {TT_GAMES[ttGame].label} time trial times, with their place on each board.</p>
      <TableScroll label="Time trials">
        <Table className="tt-cup__table">
          <TableHeader><TableRow><TableHead>Track</TableHead><TableHead>Time</TableHead><TableHead>Place</TableHead></TableRow></TableHeader>
          <TableBody>
            {ttBests.map((b) => {
              const t = ttTrack(b.game, b.track);
              return t ? (
                <TableRow key={`${b.track}-${b.cc}`}>
                  <TableCell><Link href={ttPath(t, b.cc)}>{t.name}</Link>{TT_GAMES[b.game].classes.length > 1 ? ` (${b.cc}cc)` : ""}</TableCell>
                  <TableCell className="tt-board__time">{ttFormat(b.timeMs)}</TableCell>
                  <TableCell>{ttOrdinal(b.place)} of {b.total}</TableCell>
                </TableRow>
              ) : null;
            })}
          </TableBody>
        </Table>
      </TableScroll>
    </section>
  ) : null;

  const tabs = [
    { id: "overview", label: "Overview", content: overview },
    { id: "events", label: "Events", content: events },
    { id: "teammates", label: "Teammates", content: teammates },
    { id: "play", label: "How they play", badge: "GS Pro", content: howTheyPlay },
    { id: "career", label: "Career", content: <CareerTab name={cur.name} game={game} /> },
    ...(times ? [{ id: "times", label: "Time trials", content: times }] : []),
  ];

  return (
    <main className="lounge-page">
      <LoungeHero
        eyebrow={profile.isCurrent ? null : season ? `Season ${season}` : "Lounge"}
        division={played || profile.isCurrent ? profile.division : null}
        title={p.name}
        line={sentence || profile.confirmed ? (
          <span className="lounge-sub">
            {sentence && <span className="lounge-sentence">{sentence}</span>}
            {profile.confirmed && (
              <span className="lounge-confirmed">
                <IconCircleCheck size={16} stroke={2.25} aria-hidden="true" />
                {profile.confirmed.username ? <Link href={`/u/${profile.confirmed.username}`}>On GameShuffle</Link> : "On GameShuffle"}
              </span>
            )}
          </span>
        ) : undefined}
        actions={(
          <>
            <LoungeCompare first={cur.name} game={game} from="player" trigger="button" />
            <LoungeShareButton url={`https://www.gameshuffle.co${pathFor(cur.name, game, profile.isCurrent ? null : season)}`} title={`${p.name}: lounge stats`} text={sentence ?? `${p.name}'s ${MMR_GAMES[game].short} lounge stats on GameShuffle`} />
          </>
        )}
      />
      {profile.isCurrent && <RememberLookup name={cur.name} game={game} division={played ? profile.division : null} />}
      <Container className="lounge-body">
        <div className="lounge-picker">
          {games}
          {season != null && <LoungeSeasonSelect seasons={profile.seasons} season={season} current={profile.currentSeason} basePath={pathFor(cur.name, game)} />}
        </div>

        {/* Keyed by game and season: a new page starts on the tab its address names. */}
        <LoungeTabs key={`${game}-${season ?? "now"}`} tabs={tabs} initial={sp.tab ?? "overview"} />

        <LoungeProBand pro={viewerPro} />

        <footer className="lounge-foot">
          <p>Numbers from MKCentral&apos;s lounge{cur.registryLink ? <>, where <a href={cur.registryLink} target="_blank" rel="noopener noreferrer">{cur.name}&apos;s registry profile</a> lives</> : ""}. The season chart starts at the placement number; the tables count verified events.{cur.nameHistory.length ? ` Earlier names: ${cur.nameHistory.slice(0, 4).join(", ")}.` : ""}{game !== "mk8dx" && season === 1 ? " Season 1 of Mario Kart World was one lounge for 12 and 24 players." : ""}</p>
          <p><Link href="/mmr-card">Put this MMR on stream with the MMR card</Link> · <Link href="/lounge">Search the lounge</Link></p>
          <MedalCredit />
        </footer>
      </Container>
    </main>
  );
}

/** Events as rows: when (or a label like "Best"), tier and format, place, score and the MMR change. */
function EventTable({ label, rows, dated = false }: { label: string; rows: { key: string; head: string; change: MmrChange }[]; dated?: boolean }) {
  return (
    <TableScroll label={`${label} table`}>
      <Table>
        <TableHeader><TableRow><TableHead>Event</TableHead><TableHead align="right">Place</TableHead><TableHead align="right">Score</TableHead><TableHead align="right">MMR</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map(({ key, head, change: c }) => (
            <TableRow key={key}>
              <TableCell>{head}<span className="lounge-cell-note">{[dated ? day(c.at) : null, tierWord(c.tier), formatWord(c)].filter(Boolean).join(" · ")}</span></TableCell>
              <TableCell align="right">{c.place ? placeWord(c.place) : "?"}</TableCell>
              <TableCell align="right">{c.score ?? "?"}</TableCell>
              <TableCell align="right"><Delta n={c.delta} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
