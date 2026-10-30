import Link from "next/link";
import Image from "next/image";
import { Container, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { LabeledSubNav } from "@/components/ui/LabeledSubNav";
import { TableScroll } from "@/components/ui/TableScroll";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { FaqList } from "@/components/marketing/FaqList";
import { AddTimeButton } from "./AddTimeButton";
import { TtPlayerSearch } from "./TtPlayerSearch";
import { TtConnectDiscord } from "./TtConnectDiscord";
import { TtMovedToast } from "./TtMovedToast";
import { describePlayers } from "@/lib/daily/boards";
import { siteActor } from "@/lib/timeTrials/players";
import { playerBests, trackSummary } from "@/lib/timeTrials/store";
import { formatTime, ordinal } from "@/lib/timeTrials/rules";
import { gamePath, trackPath, ttCups, TT_GAMES, TT_GAME_ORDER, type TtClass, type TtGame } from "@/lib/timeTrials/tracks";

/**
 * The time trials page, for /time-trials (both games, Mario Kart World first) and each game's own
 * page, /time-trials/<game> (picks 2026-10-29, 7A): every track with its record, how many players
 * have a time and your own best, by cup; find a player; add a time or bring a list.
 */

export const TT_FAQ = [
  { q: "How do I add a time?", a: "Press Add a time and pick the track, or attach a screenshot of the result and we read the track and time for you to check. In Discord, use /gs-tt add with GameShuffle's bot in the server." },
  { q: "Can I bring my times from Quaxly or a spreadsheet?", a: "Yes. In Quaxly, run /dx display_time (or /display_time for Mario Kart World) with yourself as the player, then add screenshots of its reply or paste it on the import page. Anything else, like a spreadsheet, you can paste. You check every row before it saves." },
  { q: "Are these times with mushrooms or no items?", a: "With mushrooms, the game's normal Time Trials. No-item times aren't on these boards." },
  { q: "Do I need to connect Discord?", a: "Only if you also add times in Discord. Connecting puts the times you add with /gs-tt on your account with the rest, and puts you on your servers' boards." },
  { q: "Do I need proof?", a: "No. A time with a screenshot or video gets a mark on the board, and every board can show only times with proof." },
  { q: "What does verified mean?", a: "Someone who manages a Discord server checked the time and pressed Verify on the bot's post. The board says which server." },
  { q: "Which tracks and speed classes are there?", a: "All 96 Mario Kart 8 Deluxe tracks at 150cc and 200cc, and Mario Kart World's 40 Time Trials courses (including the ten Super Mario Kart courses from version 1.8.0) at 150cc." },
  { q: "What if a time looks fake?", a: "A time faster than the track's world record can't be saved. For anything else, report it from the board, and GameShuffle staff remove the ones that aren't real." },
];

export async function TimeTrialsHub({ game, cc, gamePage }: { game: TtGame; cc: TtClass; gamePage: boolean }) {
  const info = TT_GAMES[game];
  const actor = await siteActor();
  const [summary, mine] = await Promise.all([trackSummary(game), actor ? playerBests(actor.player) : Promise.resolve([])]);
  const byTrack = new Map(summary.filter((s) => s.cc === cc).map((s) => [s.track, s]));
  const mineByTrack = new Map(mine.filter((b) => b.game === game && b.cc === cc).map((b) => [b.track, b]));
  const holders = await describePlayers([...new Set([...byTrack.values()].map((s) => s.recordPlayer))]);
  const myTracks = mine.length;
  const myRecords = mine.filter((b) => b.place === 1).length;
  const here = gamePage ? gamePath(game, cc) : "/time-trials";

  return (
    <main className="tt-page">
      <TtMovedToast />
      <BrowseHero
        eyebrow="Mario Kart"
        title={gamePage ? `${info.label} time trials` : "Time trials"}
        sub={gamePage
          ? `The best times on every ${info.label} track, from players on GameShuffle and in Discord.`
          : "The best times on every Mario Kart World and Mario Kart 8 Deluxe track, from players on GameShuffle and in Discord."}
        subShort="Every track's best times, on GameShuffle and in Discord."
        accent="blue"
        field="compete"
        compact
        actions={<AddTimeButton game={game} signedIn={!!actor} discordLinked={actor?.discordLinked ?? true} returnTo={here} />}
      />
      <Container className="tt-body">
        <section className="tt-sec tt-sec--flat" aria-label="Find a player">
          <TtPlayerSearch />
          {actor && (
            <p className="tt-mine">
              {myTracks ? <>You have times on {myTracks} {myTracks === 1 ? "track" : "tracks"}{myRecords ? `, ${myRecords} of them records` : ""}.</> : "You haven't added a time yet."}{" "}
              <ArrowLink href="/time-trials/import">Import your times from Quaxly or a list</ArrowLink>
            </p>
          )}
          {actor && !actor.discordLinked && <TtConnectDiscord returnTo={here} />}
        </section>

        <section className="tt-sec" aria-labelledby="tt-tracks">
          <h2 id="tt-tracks">{info.label} tracks</h2>
          <p className="tt-note">Times with mushrooms, the game&apos;s normal Time Trials.</p>
          <div className="tt-pills">
            <LabeledSubNav label="Game" variant="pills" items={TT_GAME_ORDER.map((g) => ({ label: TT_GAMES[g].label, href: gamePath(g), active: g === game }))} />
            {info.classes.length > 1 && (
              <LabeledSubNav label="Speed class" variant="pills" items={info.classes.map((c) => ({ label: `${c}cc`, href: gamePath(game, c), active: c === cc }))} />
            )}
          </div>
          {ttCups(game).map((cup) => (
            <div key={cup.cup} className="tt-cup">
              <h3>{cup.cup}{/Mario Kart$/.test(cup.cup) ? " courses" : " Cup"}</h3>
              <TableScroll label={`${cup.cup} tracks`}>
                <Table className="tt-cup__table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Track</TableHead>
                      <TableHead>Record</TableHead>
                      {actor && <TableHead>Your best</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cup.tracks.map((t) => {
                      const s = byTrack.get(t.id);
                      const m = mineByTrack.get(t.id);
                      return (
                        <TableRow key={t.id}>
                          <TableCell>
                            <Link href={trackPath(t, cc)} className="tt-track">
                              {t.image ? <Image src={t.image} alt="" width={64} height={36} className="tt-track__pic" sizes="64px" /> : <span className="tt-track__pic tt-track__pic--blank" aria-hidden="true">{t.name.replace(/^SNES /, "").slice(0, 1)}</span>}
                              <span className="tt-track__text">
                                <span className="tt-track__name">{t.name}</span>
                                <span className="tt-track__count">{s ? `${s.players} ${s.players === 1 ? "player" : "players"}` : "No times yet"}</span>
                              </span>
                            </Link>
                          </TableCell>
                          <TableCell>{s ? <span className="tt-rec"><b>{formatTime(s.recordMs)}</b><span>{holders.get(s.recordPlayer)?.name ?? "A player"}</span></span> : <span className="tt-muted">None</span>}</TableCell>
                          {actor && <TableCell>{m ? <span className="tt-rec"><b>{formatTime(m.timeMs)}</b><span>{ordinal(m.place)} of {m.total}</span></span> : <span className="tt-muted">None</span>}</TableCell>}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableScroll>
            </div>
          ))}
        </section>

        <section className="tt-sec" aria-labelledby="tt-discord">
          <h2 id="tt-discord">In Discord</h2>
          <p className="tt-note">With GameShuffle&apos;s bot in your server, <code>/gs-tt add</code> saves a time (attach the result screen and it reads it for you), <code>/gs-tt track</code> shows a track&apos;s top ten for the server, and <code>/gs-tt player</code> shows someone&apos;s bests. A new best gets a post the server&apos;s managers can verify.</p>
          <p className="tt-note">Coming from Quaxly? Press and hold its reply to <code>/dx display_time</code>, tap Apps, then Save to GameShuffle, and your times come over in two taps.</p>
          <div className="tt-links">
            <ArrowLink href="/time-trials/import">Bring your times from Quaxly</ArrowLink>
            <ArrowLink href="/discord">Add GameShuffle to Discord</ArrowLink>
          </div>
        </section>

        <section className="tt-sec" aria-labelledby="tt-faq">
          <h2 id="tt-faq">Questions</h2>
          <FaqList items={TT_FAQ} />
        </section>
      </Container>
    </main>
  );
}
