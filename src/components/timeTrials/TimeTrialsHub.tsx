import Link from "next/link";
import Image from "next/image";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { FaqList } from "@/components/marketing/FaqList";
import { AddTimeButton } from "./AddTimeButton";
import { TtPlayerSearch } from "./TtPlayerSearch";
import { TtConnectDiscord } from "./TtConnectDiscord";
import { TtMovedToast } from "./TtMovedToast";
import { TtCategoryNav } from "./TtCategoryNav";
import { TtFilterSelect } from "./TtFilterSelect";
import { TtCountryAsk } from "./TtCountryAsk";
import { TtEventsRow } from "./TtEventsRow";
import { listTtEvents } from "@/lib/tournaments/tt/store";
import { countriesFor } from "@/lib/timeTrials/status";
import { countriesInUse, countryPlayers, shouldAskCountry } from "@/lib/timeTrials/countries";
import { flagUrl } from "@/lib/lounge/flags";
import { countryName } from "@/lib/lounge/countries";
import type { TtItems, TtVehicle } from "@/lib/timeTrials/categories";
import { describePlayers } from "@/lib/daily/boards";
import { headers } from "next/headers";
import { siteActor } from "@/lib/timeTrials/players";
import { playerBests, trackSummary } from "@/lib/timeTrials/store";
import { serverSummary } from "@/lib/timeTrials/server";
import { reviewCounts } from "@/lib/timeTrials/review";
import { IconClipboardCheck } from "@tabler/icons-react";
import { formatTime, ordinal } from "@/lib/timeTrials/rules";
import { gamePath, serverPath, trackPath, ttCups, ttTracks, TT_GAMES, TT_GAME_ORDER, type TtClass, type TtGame } from "@/lib/timeTrials/tracks";

/**
 * The time trials page, for /time-trials (both games, Mario Kart World first) and each game's own
 * page, /time-trials/<game> (picks 2026-10-29, 7A): every track with its record and your own best,
 * by cup; find a player; add a time or bring a list. Round 2 tightening (5A): the search and your
 * links share a row, the filters share one bar, and each cup is a card (three across on desktop).
 * With `server`, it's one Discord server's board (/time-trials/servers/<id>, the time trial panel's Server
 * board): the records among that server's players, and no search or questions.
 */

export const TT_FAQ = [
  { q: "How do I add a time?", a: "Press Add a time and pick the track, or attach a screenshot of the result and we read the track and time for you to check. In Discord, use /tt add with GameShuffle Competitive in the server." },
  { q: "Can I bring my times from Quaxly or a spreadsheet?", a: "Yes. In Quaxly, run /dx display_time (or /display_time for Mario Kart World) with yourself as the player, then press and hold the reply, tap Apps and pick Save to GameShuffle. Or add screenshots of it, or paste it, on the import page. Shrooms lists go on the mushroom boards and No-items lists on the no-mushroom boards. You check every row before it saves." },
  { q: "Which boards are there?", a: "Every track has boards with mushrooms and with no mushrooms, at each speed class. Mario Kart 8 Deluxe also has Inside drift, Teddy Buggy, Biddybuggy and Mr. Scooty boards, and Mario Kart World a Swoop, R.O.B.-HOG board. They show only times set with that vehicle; those times count on the open board too." },
  { q: "Which times need a clip?", a: "Only times in a board's top ten. Add a clip of the run's last 30 seconds (YouTube, Twitch, Streamable, Medal, X, Bluesky, TikTok or Instagram); until a reviewer checks it the time shows as Unverified, then as Verified. If your time moves up into the top ten later, we let you know. Times below tenth don't need one." },
  { q: "Do I need to connect Discord?", a: "Only if you also add times in Discord. Connecting puts the times you add with /tt on your account with the rest, and puts you on your servers' boards." },
  { q: "Do I need proof?", a: "Yes: a screenshot of the result for every new time, on the site and in Discord. We read the track and time from it for you. Times brought over from Quaxly are marked Imported." },
  { q: "What does Community verified mean?", a: "Ten players vouched for the time. Anyone signed in can vouch from a time's window on the board, or with Vouch on the bot's record posts in Discord, but never for their own time. A time in a board's top ten still needs a checked clip to show as Verified." },
  { q: "What does vouched for in a server mean?", a: "Someone who manages a Discord server checked the time and pressed Verify on the bot's post. The board says which server." },
  { q: "Which tracks and speed classes are there?", a: "All 96 Mario Kart 8 Deluxe tracks at 150cc and 200cc, and Mario Kart World's 40 Time Trials courses (including the ten Super Mario Kart courses from version 1.8.0) at 150cc." },
  { q: "What are Legacy times?", a: "Times players set before they came to GameShuffle, brought over from the community's existing records, so the boards start complete. They show as Legacy. If one of the names is you, open it and press This is me: an updater checks it and the times move to your account." },
  { q: "What if a time looks fake?", a: "A time faster than the track's world record can't be saved. For anything else, report it from the board: it opens a ticket, the time's owner can answer with proof, and a reviewer keeps or removes it with a reason everyone in the ticket sees." },
];

export async function TimeTrialsHub({ game, cc, items = "shrooms", vehicle = "any", gamePage, server, country = null }: { game: TtGame; cc: TtClass; items?: TtItems; vehicle?: TtVehicle; gamePage: boolean; server?: { guildId: string; name: string };
  /** A country's records (round 4 pick 3A): `?country=` on the time trials pages. */
  country?: string | null }) {
  const info = TT_GAMES[game];
  const actor = await siteActor();
  const [summary, mine, countries, reviews, events] = await Promise.all([
    server ? serverSummary(server.guildId, game, items, vehicle) : country ? countryPlayers(country).then((ps) => trackSummary(game, items, vehicle, ps)) : trackSummary(game, items, vehicle),
    actor ? playerBests(actor.player) : Promise.resolve([]),
    server ? Promise.resolve([]) : countriesInUse(),
    // Reviewers and updaters get a way into their queue from here (Britton, 2026-11-05).
    actor?.userId && !server ? reviewCounts(actor.userId) : Promise.resolve(null),
    // Time trial events taking players or running (events pick 12A), not on a Discord server's page.
    server ? Promise.resolve([]) : listTtEvents(gamePage ? game : null),
  ]);
  // Asked once (round 4 pick 1A): someone with times and no country.
  const ask = !server && actor && mine.length > 0 && (await shouldAskCountry(actor.player, "site"));
  const ip = ask ? (await headers()).get("x-vercel-ip-country")?.toLowerCase() ?? null : null;
  const byTrack = new Map(summary.filter((s) => s.cc === cc).map((s) => [s.track, s]));
  const mineByTrack = new Map(mine.filter((b) => b.game === game && b.cc === cc && b.items === items && b.vehicle === vehicle).map((b) => [b.track, b]));
  const holderKeys = [...new Set([...byTrack.values()].map((s) => s.recordPlayer))];
  const [holders, holderCountry] = await Promise.all([describePlayers(holderKeys), country ? Promise.resolve(new Map<string, string>()) : countriesFor(holderKeys)]);
  // Your times on the board being viewed (this game, speed and items), out of the game's own list.
  const myTracks = mineByTrack.size;
  const myRecords = [...mineByTrack.values()].filter((b) => b.place === 1).length;
  const withCountry = (path: string, c: string | null) => (c ? `${path}${path.includes("?") ? "&" : "?"}country=${c}` : path);
  const pathFor = (g: TtGame, c?: TtClass, cat?: { items?: TtItems; vehicle?: TtVehicle }) => (server ? serverPath(server.guildId, g, c, cat) : withCountry(gamePath(g, c, cat), country));
  const here = server || gamePage ? pathFor(game, cc, { items, vehicle }) : withCountry("/time-trials", country);
  const countryFilter = !server && countries.length > 0 ? (
    <TtFilterSelect
      id="tt-hub-country"
      label="Country"
      className="tt-filters__country"
      value={country ?? ""}
      options={[
        { value: "", label: "Every country", href: withCountry(gamePath(game, cc, { items, vehicle }), null) },
        ...countries.map((c) => ({ value: c.country, label: countryName(c.country), href: withCountry(gamePath(game, cc, { items, vehicle }), c.country) })).sort((a, b) => a.label.localeCompare(b.label)),
      ]}
    />
  ) : null;

  return (
    <main className="tt-page">
      <TtMovedToast />
      <BrowseHero
        eyebrow={server ? "Discord server" : "Mario Kart"}
        title={server ? `${server.name} time trials` : gamePage ? `${info.label} time trials` : "Time trials"}
        sub={server
          ? `The best ${info.label} times on every track from players in this Discord server.`
          : gamePage
            ? `The best times on every ${info.label} track, from players on GameShuffle and in Discord.`
            : "The best times on every Mario Kart 8 Deluxe and Mario Kart World track, from players on GameShuffle and in Discord."}
        subShort={server ? "This server's best time on every track." : "Every track's best times, on GameShuffle and in Discord."}
        accent="blue"
        field="compete"
        compact
        actions={<>
          <AddTimeButton game={game} items={items} vehicle={vehicle} signedIn={!!actor} returnTo={here} />
          {reviews && (
            <Link href="/time-trials/review" className="empac-button empac-button--secondary empac-button--medium tt-review-link">
              <IconClipboardCheck size={18} aria-hidden="true" /> Reviews{reviews.total ? <span className="tt-review-link__n">{reviews.total} waiting</span> : null}
            </Link>
          )}
        </>}
      />
      <Container className="tt-body">
        {!server && <section className="tt-find" aria-label="Find a player">
          <TtPlayerSearch />
          {actor && (
            <p className="tt-mine">
              {myTracks ? <>Times on {myTracks} of {ttTracks(game).length} tracks{myRecords ? `, ${myRecords} ${myRecords === 1 ? "record" : "records"}` : ""}</> : "You haven't added a time yet"}
              {myTracks > 0 && <ArrowLink href="/time-trials/players/me">Your times</ArrowLink>}
              <ArrowLink href="/time-trials/import">Import from Quaxly or a list</ArrowLink>
            </p>
          )}
        </section>}
        {!server && <TtEventsRow events={events} game={gamePage ? game : null} />}
        {ask && <TtCountryAsk suggest={ip} />}
        {actor && !actor.discordLinked && <TtConnectDiscord returnTo={here} />}

        <section className="tt-sec" aria-labelledby="tt-tracks">
          <h2 id="tt-tracks" className="sr-only">{info.label} tracks</h2>
          <TtCategoryNav
            game={game} cc={cc} items={items} vehicle={vehicle} href={(c) => pathFor(game, c.cc, c)}
            games={TT_GAME_ORDER.map((g) => ({ label: TT_GAMES[g].label, href: pathFor(g, undefined, { items }), active: g === game }))}
            end={countryFilter}
          />
          {country && (
            <p className="tt-note tt-national">
              {/* eslint-disable-next-line @next/next/no-img-element -- a small flag from public/ */}
              {flagUrl(country) && <img src={flagUrl(country)!} alt="" className="tt-flag" />}
              {countryName(country)}: the best time on each track by a player from there.
            </p>
          )}
          <div className="tt-cups">
            {ttCups(game).map((cup) => (
              <section key={cup.cup} className="tt-cupcard" aria-label={`${cup.cup}${/Mario Kart$/.test(cup.cup) ? " courses" : " Cup"}`}>
                <h3 className="tt-cupcard__head"><span>{cup.cup}{/Mario Kart$/.test(cup.cup) ? " courses" : " Cup"}</span><span className="tt-cupcard__col" aria-hidden="true">{country ? "National record" : "Record"}</span></h3>
                <ul className="tt-cupcard__list">
                  {cup.tracks.map((t) => {
                    const s = byTrack.get(t.id);
                    const m = mineByTrack.get(t.id);
                    const hc = s ? holderCountry.get(s.recordPlayer) : undefined;
                    return (
                      <li key={t.id}>
                        <Link href={country ? `${trackPath(t, cc, { items, vehicle })}${trackPath(t, cc, { items, vehicle }).includes("?") ? "&" : "?"}country=${country}` : trackPath(t, cc, { items, vehicle })} className="tt-trow">
                          {t.image ? <Image src={t.image} alt="" width={64} height={36} className="tt-track__pic" sizes="64px" /> : <span className="tt-track__pic tt-track__pic--blank" aria-hidden="true">{t.name.replace(/^SNES /, "").slice(0, 1)}</span>}
                          <span className="tt-trow__name">
                            <span className="tt-trow__track">{t.name}</span>
                            {m && <span className="tt-trow__me">You: {formatTime(m.timeMs)} · {ordinal(m.place)} of {m.total}</span>}
                          </span>
                          {s ? (
                            <span className="tt-trow__rec">
                              {/* Each piece on its own line (Britton, 2026-11-05): the time with its label, then the driver, so
                                  nothing shares a line and wraps into it. */}
                              <span className="tt-trow__time">
                                <b>{formatTime(s.recordMs)}</b>
                                {!s.recordChecked && <span className="tt-trow__status">{s.recordSheet ? "Legacy" : "Unverified"}</span>}
                              </span>
                              <span className="tt-trow__by">
                                {/* eslint-disable-next-line @next/next/no-img-element -- a small flag from public/ */}
                                {hc && flagUrl(hc) && <img src={flagUrl(hc)!} alt={countryName(hc)} title={countryName(hc)} className="tt-flag tt-trow__flag" />}
                                <span className="tt-trow__who">{holders.get(s.recordPlayer)?.name ?? "A player"}</span>
                              </span>
                            </span>
                          ) : <span className="tt-trow__none">{server ? "No times here yet" : country ? "No times from there yet" : "No times yet"}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </section>

        {!server && <section className="tt-sec" aria-labelledby="tt-discord">
          <h2 id="tt-discord">In Discord</h2>
          <p className="tt-note">With GameShuffle Competitive in your server, <code>/tt add</code> saves a time from the result screenshot, <code>/tt track</code> shows a track&apos;s top ten for the server, and <code>/tt player</code> shows someone&apos;s bests. Coming from Quaxly? Press and hold its reply to <code>/dx display_time</code>, tap Apps, then Save to GameShuffle.</p>
          <div className="tt-links">
            <ArrowLink href="/time-trials/import">Bring your times from Quaxly</ArrowLink>
            <ArrowLink href="/discord/add?app=comp" plain>Add GameShuffle Competitive</ArrowLink>
          </div>
        </section>}

        {!server && <section className="tt-sec" aria-labelledby="tt-faq">
          <h2 id="tt-faq">Questions</h2>
          <FaqList items={TT_FAQ} />
        </section>}
      </Container>
    </main>
  );
}
