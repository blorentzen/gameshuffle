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
import type { TtItems, TtVehicle } from "@/lib/timeTrials/categories";
import { describePlayers } from "@/lib/daily/boards";
import { siteActor } from "@/lib/timeTrials/players";
import { playerBests, trackSummary } from "@/lib/timeTrials/store";
import { serverSummary } from "@/lib/timeTrials/server";
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
  { q: "How do I add a time?", a: "Press Add a time and pick the track, or attach a screenshot of the result and we read the track and time for you to check. In Discord, use /gs-tt add with GameShuffle's bot in the server." },
  { q: "Can I bring my times from Quaxly or a spreadsheet?", a: "Yes. In Quaxly, run /dx display_time (or /display_time for Mario Kart World) with yourself as the player, then press and hold the reply, tap Apps and pick Save to GameShuffle. Or add screenshots of it, or paste it, on the import page. Shrooms lists go on the mushroom boards and No-items lists on the no-mushroom boards. You check every row before it saves." },
  { q: "Which boards are there?", a: "Every track has boards with mushrooms and with no mushrooms, at each speed class. Mario Kart 8 Deluxe also has inside drift, Mr. Scooty and Teddy Buggy boards, which show only times set with that vehicle; those times count on the open board too." },
  { q: "Which times need a clip?", a: "Only times in a board's top ten. Add a clip of the run's last 30 seconds (YouTube, Twitch, Streamable or Medal); until a reviewer checks it the time shows as Unverified, then as Verified. If your time moves up into the top ten later, we let you know. Times below tenth don't need one." },
  { q: "Do I need to connect Discord?", a: "Only if you also add times in Discord. Connecting puts the times you add with /gs-tt on your account with the rest, and puts you on your servers' boards." },
  { q: "Do I need proof?", a: "Yes: a screenshot of the result for every new time, on the site and in Discord. We read the track and time from it for you. Times brought over from Quaxly are marked Imported." },
  { q: "What does vouched for in a server mean?", a: "Someone who manages a Discord server checked the time and pressed Verify on the bot's post. The board says which server." },
  { q: "Which tracks and speed classes are there?", a: "All 96 Mario Kart 8 Deluxe tracks at 150cc and 200cc, and Mario Kart World's 40 Time Trials courses (including the ten Super Mario Kart courses from version 1.8.0) at 150cc." },
  { q: "What if a time looks fake?", a: "A time faster than the track's world record can't be saved. For anything else, report it from the board: it opens a ticket, the time's owner can answer with proof, and a reviewer keeps or removes it with a reason everyone in the ticket sees." },
];

export async function TimeTrialsHub({ game, cc, items = "shrooms", vehicle = "any", gamePage, server }: { game: TtGame; cc: TtClass; items?: TtItems; vehicle?: TtVehicle; gamePage: boolean; server?: { guildId: string; name: string } }) {
  const info = TT_GAMES[game];
  const actor = await siteActor();
  const [summary, mine] = await Promise.all([
    server ? serverSummary(server.guildId, game, items, vehicle) : trackSummary(game, items, vehicle),
    actor ? playerBests(actor.player) : Promise.resolve([]),
  ]);
  const byTrack = new Map(summary.filter((s) => s.cc === cc).map((s) => [s.track, s]));
  const mineByTrack = new Map(mine.filter((b) => b.game === game && b.cc === cc && b.items === items && b.vehicle === vehicle).map((b) => [b.track, b]));
  const holders = await describePlayers([...new Set([...byTrack.values()].map((s) => s.recordPlayer))]);
  // Your times on the board being viewed (this game, speed and items), out of the game's own list.
  const myTracks = mineByTrack.size;
  const myRecords = [...mineByTrack.values()].filter((b) => b.place === 1).length;
  const pathFor = (g: TtGame, c?: TtClass, cat?: { items?: TtItems; vehicle?: TtVehicle }) => (server ? serverPath(server.guildId, g, c, cat) : gamePath(g, c, cat));
  const here = server || gamePage ? pathFor(game, cc, { items, vehicle }) : "/time-trials";

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
            : "The best times on every Mario Kart World and Mario Kart 8 Deluxe track, from players on GameShuffle and in Discord."}
        subShort={server ? "This server's best time on every track." : "Every track's best times, on GameShuffle and in Discord."}
        accent="blue"
        field="compete"
        compact
        actions={<AddTimeButton game={game} items={items} vehicle={vehicle} signedIn={!!actor} returnTo={here} />}
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
        {actor && !actor.discordLinked && <TtConnectDiscord returnTo={here} />}

        <section className="tt-sec" aria-labelledby="tt-tracks">
          <h2 id="tt-tracks" className="sr-only">{info.label} tracks</h2>
          <TtCategoryNav
            game={game} cc={cc} items={items} vehicle={vehicle} href={(c) => pathFor(game, c.cc, c)}
            games={TT_GAME_ORDER.map((g) => ({ label: TT_GAMES[g].label, href: pathFor(g, undefined, { items }), active: g === game }))}
          />
          <div className="tt-cups">
            {ttCups(game).map((cup) => (
              <section key={cup.cup} className="tt-cupcard" aria-label={`${cup.cup}${/Mario Kart$/.test(cup.cup) ? " courses" : " Cup"}`}>
                <h3 className="tt-cupcard__head"><span>{cup.cup}{/Mario Kart$/.test(cup.cup) ? " courses" : " Cup"}</span><span className="tt-cupcard__col" aria-hidden="true">Record</span></h3>
                <ul className="tt-cupcard__list">
                  {cup.tracks.map((t) => {
                    const s = byTrack.get(t.id);
                    const m = mineByTrack.get(t.id);
                    return (
                      <li key={t.id}>
                        <Link href={trackPath(t, cc, { items, vehicle })} className="tt-trow">
                          {t.image ? <Image src={t.image} alt="" width={64} height={36} className="tt-track__pic" sizes="64px" /> : <span className="tt-track__pic tt-track__pic--blank" aria-hidden="true">{t.name.replace(/^SNES /, "").slice(0, 1)}</span>}
                          <span className="tt-trow__name">
                            <span className="tt-trow__track">{t.name}</span>
                            {m && <span className="tt-trow__me">You: {formatTime(m.timeMs)} · {ordinal(m.place)} of {m.total}</span>}
                          </span>
                          {s ? (
                            <span className="tt-trow__rec">
                              <b>{formatTime(s.recordMs)}</b>
                              <span>{holders.get(s.recordPlayer)?.name ?? "A player"}{s.recordChecked ? "" : " · Unverified"}</span>
                            </span>
                          ) : <span className="tt-trow__none">{server ? "No times here yet" : "No times yet"}</span>}
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
          <p className="tt-note">With GameShuffle&apos;s bot in your server, <code>/gs-tt add</code> saves a time from the result screenshot, <code>/gs-tt track</code> shows a track&apos;s top ten for the server, and <code>/gs-tt player</code> shows someone&apos;s bests. Coming from Quaxly? Press and hold its reply to <code>/dx display_time</code>, tap Apps, then Save to GameShuffle.</p>
          <div className="tt-links">
            <ArrowLink href="/time-trials/import">Bring your times from Quaxly</ArrowLink>
            <ArrowLink href="/discord">Add GameShuffle to Discord</ArrowLink>
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
