import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Container } from "@empac/cascadeds";
import {
  IconBrandDiscord, IconBrandTwitch, IconChartLine, IconDeviceTv, IconStopwatch, IconTrophy, IconUsers,
} from "@tabler/icons-react";
import { BrowseHero } from "@/components/events/BrowseHero";
import { IconTile } from "@/components/ui/IconTile";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { FaqList } from "@/components/marketing/FaqList";
import { MedalCredit } from "@/components/mmr/MedalCredit";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { AddTimeButton } from "@/components/timeTrials/AddTimeButton";
import { TtConnectDiscord } from "@/components/timeTrials/TtConnectDiscord";
import { LoungeConfirm } from "@/components/lounge/LoungeConfirm";
import { MmrEmblem } from "@/components/mmr/MmrEmblem";
import { MmrDemo } from "@/components/mmr/MmrLive";
import { CmkPlayerSearch } from "@/components/competitive/hub/CmkPlayerSearch";
import { CmkCopyObs } from "@/components/competitive/hub/CmkCopyObs";
import { siteActor } from "@/lib/timeTrials/players";
import { formatTime, ordinal } from "@/lib/timeTrials/rules";
import { climbersThisWeek, hubYou, mkTournaments, recordsThisWeek } from "@/lib/competitive/hub";
import { divisionLook, DEFAULT_LOOK } from "@/lib/mmr/look";
import { MMR_GAMES } from "@/lib/mmr/rules";
import { fmtNum } from "@/lib/lounge/lookup";
import { EVENTS, tagged } from "@/lib/analytics/events";
import "@/styles/mmr-card.css";
import "@/styles/lounge.css";
import "@/styles/competitive-hub.css";

/**
 * Competitive Mario Kart (picks 2026-10-30, https://claude.ai/artifact/ELEvrGGCDpkkkYXVMmXBtf, all as
 * recommended): one page for time trials, lounge stats, the MMR card, tournaments and the Quaxly
 * import, for Mario Kart World and 8 Deluxe. One search finds lounge and time trial players; a
 * signed-in player gets their own strip on top; each tool shows a live preview. The scoring tool
 * this page used to sell is Live scoring now, linked under "With friends".
 */

export const dynamic = "force-dynamic";

const PATH = "/competitive-mario-kart";
const TITLE = "Competitive Mario Kart: lounge stats and time trials";
const DESCRIPTION = "Lounge stats for any player, time trial boards for every Mario Kart World and 8 Deluxe track, your lounge MMR live on stream, and Mario Kart tournaments, on one page.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `https://www.gameshuffle.co${PATH}` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `https://www.gameshuffle.co${PATH}`, siteName: "GameShuffle", type: "website" },
};

const FAQ = [
  { q: "Where do the lounge numbers come from?", a: "From MKCentral's lounge, the community's ranked ladder for Mario Kart World and Mario Kart 8 Deluxe. GameShuffle reads the public numbers; your MMR moves there, not here." },
  { q: "Do time trial times need proof?", a: "Yes: a screenshot of the result for every new time. We read the track and time from it for you to check." },
  { q: "Which times need a clip?", a: "Only times in a board's top ten. A reviewer checks a clip of the run's last 30 seconds, and the time shows as Verified. Until then it shows as Unverified." },
  { q: "Can I bring my times over from Quaxly?", a: "Yes. Run /dx display time in Discord, then copy the reply or press Save to GameShuffle on it. You check every row before anything saves. Connect Discord first so the times land on your account." },
  { q: "Is it free?", a: "Lounge stats, time trials, the MMR card and live scoring are free with a free account. GS Pro adds things for streamers, like the room odds on your overlay and more MMR card looks." },
];

const TZ = "America/Los_Angeles";
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: TZ });
function ago(at: string): string {
  const h = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 3_600_000));
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export default async function CompetitiveMarioKartPage() {
  const actor = await siteActor();
  const [you, records, climbers, tours] = await Promise.all([
    actor ? hubYou(actor.userId!, actor.player) : Promise.resolve(null),
    recordsThisWeek(),
    climbersThisWeek(),
    mkTournaments(),
  ]);
  const link = (to: string) => tagged(EVENTS.cmkClicked, { to });

  return (
    <main className="cmk-page">
      <MarketingJsonLd breadcrumb={{ label: "Competitive Mario Kart", path: PATH }} faq={FAQ} />
      <BrowseHero
        eyebrow="Mario Kart"
        title="Competitive Mario Kart"
        sub="Lounge stats, time trial boards, your MMR on stream and tournaments, for Mario Kart World and Mario Kart 8 Deluxe."
        subShort="Lounge stats, time trials, your MMR on stream and tournaments."
        accent="blue"
        field="compete"
        actions={<CmkPlayerSearch />}
      />

      <Container className="cmk-body">
        {you && actor && (
          <section className="cmk-you" aria-label="You">
            <div className="cmk-you__cell">
              <span className="cmk-k">{you.lounge ? `Your lounge · ${you.lounge.gameShort}` : "Your lounge"}</span>
              {you.lounge ? (
                <>
                  <span className="cmk-you__row">
                    <span className="cmk-you__emblem" aria-hidden="true"><MmrEmblem d={divisionLook(you.lounge.division ?? "Placement")} frame="tile" /></span>
                    <span className="cmk-big">{you.lounge.mmr != null ? fmtNum(you.lounge.mmr) : "Placement"}</span>
                    {you.lounge.division && <span className="cmk-muted">{you.lounge.division}</span>}
                  </span>
                  <span className="cmk-muted">
                    {[you.lounge.worldRank ? `#${fmtNum(you.lounge.worldRank)} in the world` : null, you.lounge.week ? `${you.lounge.week > 0 ? "+" : ""}${fmtNum(you.lounge.week)} this week` : null].filter(Boolean).join(" · ") || you.lounge.name}
                  </span>
                  <ArrowLink href={you.lounge.href}>Your lounge page</ArrowLink>
                </>
              ) : (
                <>
                  <span className="cmk-muted">Confirm your lounge name with Discord to see your MMR here and on the boards.</span>
                  <span><LoungeConfirm /></span>
                </>
              )}
            </div>
            <div className="cmk-you__cell">
              <span className="cmk-k">Your time trials</span>
              {you.times.tracks ? (
                <>
                  <span className="cmk-you__row"><span className="cmk-big">{you.times.tracks}</span><span className="cmk-muted">{you.times.tracks === 1 ? "track" : "tracks"} · {you.times.records} {you.times.records === 1 ? "record" : "records"} · {you.times.topTens} top {you.times.topTens === 1 ? "ten" : "tens"}</span></span>
                  {you.times.needClip > 0 && <span className="cmk-muted">{you.times.needClip} top-ten {you.times.needClip === 1 ? "time still needs" : "times still need"} a clip.</span>}
                </>
              ) : <span className="cmk-muted">Add your first time from a result screenshot, or bring your times from Quaxly.</span>}
              <span className="cmk-you__row">
                <AddTimeButton game="mk8dx" signedIn returnTo={PATH} label="Add a time" />
                {you.times.tracks > 0 ? <ArrowLink href="/time-trials/players/me">Your times</ArrowLink> : <ArrowLink href="/time-trials/import">Import from Quaxly</ArrowLink>}
              </span>
            </div>
            <div className="cmk-you__cell">
              <span className="cmk-k">Your MMR card</span>
              {you.card ? (
                <>
                  <span className="cmk-big cmk-big--sm">Ready for OBS</span>
                  <span className="cmk-muted">Add the link as a browser source and it plays each event.</span>
                  <span className="cmk-you__row"><CmkCopyObs token={you.card.token} /><ArrowLink href="/mmr-card">Edit the look</ArrowLink></span>
                </>
              ) : (
                <>
                  <span className="cmk-muted">Your lounge MMR on stream, with a moment each time an event is verified. Free.</span>
                  <ArrowLink href="/mmr-card">Build your card</ArrowLink>
                </>
              )}
            </div>
          </section>
        )}

        {/* Two stacked columns so each card keeps its own height (no stretched empty space); on phones the
            cards run in the same order: time trials, lounge, MMR card, tournaments. */}
        <div className="cmk-tools">
          <div className="cmk-col">
          <section className="cmk-tool cmk-tool--tt" aria-labelledby="cmk-tt">
            <div className="cmk-tool__head">
              <IconTile icon={IconStopwatch} tone="blue" />
              <div><h2 id="cmk-tt">Time trials</h2><p>Every track&apos;s best times in Mario Kart World and 8 Deluxe. Add yours from a screenshot.</p></div>
            </div>
            <div className="cmk-peek">
              <h3 className="cmk-k">New this week</h3>
              {records.length ? (
                <ul className="cmk-list">
                  {records.map((r) => (
                    <li key={r.href}>
                      <Link href={r.href} className="cmk-row">
                        {r.image ? <Image src={r.image} alt="" width={56} height={32} className="cmk-row__pic" sizes="56px" /> : <span className="cmk-row__pic" aria-hidden="true" />}
                        <span className="cmk-row__main"><b>{r.track}</b><small>{r.what}</small></span>
                        <span className="cmk-row__end"><b>{formatTime(r.timeMs)}</b><small>{r.holder} · {r.record ? <span className="cmk-rec">Record</span> : ordinal(r.place)} · {ago(r.at)}</small></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="cmk-muted">No new times this week yet. Add yours.</p>}
            </div>
            <div className="cmk-tool__acts">
              <ArrowLink href="/time-trials" className={link("time-trials")}>See every board</ArrowLink>
              <ArrowLink href="/time-trials/import" className={link("import")}>Bring your Quaxly times</ArrowLink>
            </div>
          </section>
          <section className="cmk-tool cmk-tool--lounge" aria-labelledby="cmk-lounge">
            <div className="cmk-tool__head">
              <IconTile icon={IconChartLine} tone="teal" />
              <div><h2 id="cmk-lounge">Lounge stats</h2><p>Any lounge player&apos;s season, a room checked before it starts, and two players side by side.</p></div>
            </div>
            <div className="cmk-peek">
              <h3 className="cmk-k">Climbing this week</h3>
              {climbers === null ? <p className="cmk-muted">The lounge isn&apos;t answering right now. Try again in a minute.</p>
                : climbers.length ? (
                  <ul className="cmk-list">
                    {climbers.map((c) => (
                      <li key={`${c.game}-${c.name}`}>
                        <Link href={c.href} className="cmk-row">
                          <span className="cmk-row__emblem" aria-hidden="true"><MmrEmblem d={divisionLook(c.division ?? "Placement")} frame="tile" /></span>
                          <span className="cmk-row__main"><b>{c.name}</b><small>{MMR_GAMES[c.game].short}{c.division ? ` · ${c.division}` : ""}</small></span>
                          <span className="cmk-row__end"><b>{c.mmr != null ? fmtNum(c.mmr) : ""}</b><small className="cmk-up">Up {fmtNum(c.climbed)} {c.climbed === 1 ? "place" : "places"}</small></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : <p className="cmk-muted">Nobody has climbed yet this week.</p>}
            </div>
            <div className="cmk-tool__acts">
              <ArrowLink href="/lounge" className={link("lounge")}>Lounge boards</ArrowLink>
              <ArrowLink href="/lounge#lounge-room" className={link("room")}>Check a room</ArrowLink>
            </div>
          </section>
          </div>
          <div className="cmk-col">
          <section className="cmk-tool cmk-tool--mmr" aria-labelledby="cmk-mmr">
            <div className="cmk-tool__head">
              <IconTile icon={IconDeviceTv} tone="violet" />
              <div><h2 id="cmk-mmr">MMR card</h2><p>Your lounge MMR on stream, with a moment each time an event is verified. Free with an account.</p></div>
            </div>
            <div className="mmr-stage cmk-mmr">
              <div className="mmr-frame" tabIndex={0} role="region" aria-label="MMR card example, playing a made-up night">
                <MmrDemo look={DEFAULT_LOOK} />
              </div>
            </div>
            <div className="cmk-tool__acts">
              <ArrowLink href="/mmr-card" className={link("mmr-card")}>Build your card</ArrowLink>
            </div>
          </section>
          <section className="cmk-tool cmk-tool--tour" aria-labelledby="cmk-tour">
            <div className="cmk-tool__head">
              <IconTile icon={IconTrophy} tone="orange" />
              <div><h2 id="cmk-tour">Tournaments</h2><p>Brackets, Swiss and points, with random picks each round.</p></div>
            </div>
            <div className="cmk-peek">
              <h3 className="cmk-k">Coming up</h3>
              {tours.coming.length ? (
                <ul className="cmk-list">
                  {tours.coming.map((t) => (
                    <li key={t.id}>
                      <Link href={`/tournament/${t.id}`} className="cmk-row">
                        <span className="cmk-date" aria-hidden="true">{t.live ? <b>Live</b> : t.at ? <><small>{dayFmt.format(new Date(t.at)).split(" ")[0]}</small><b>{dayFmt.format(new Date(t.at)).split(" ")[1]}</b></> : <small>Soon</small>}</span>
                        <span className="cmk-row__main"><b>{t.title}</b><small>{[t.live ? "Running now" : t.at ? dayFmt.format(new Date(t.at)) : null, t.game, t.format, `${t.players}${t.capacity ? ` of ${t.capacity}` : ""} ${t.players === 1 && !t.capacity ? "player" : "players"}`].filter(Boolean).join(" · ")}</small></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="cmk-muted">No Mario Kart tournaments open right now. Run one.</p>}
            </div>
            {tours.winners.length > 0 && (
              <div className="cmk-peek">
                <h3 className="cmk-k">Recent winners</h3>
                <ul className="cmk-list">
                  {tours.winners.map((w) => (
                    <li key={w.id}>
                      <Link href={`/tournament/${w.id}`} className="cmk-row">
                        <span className="cmk-date cmk-date--icon" aria-hidden="true"><IconTrophy size={20} /></span>
                        <span className="cmk-row__main"><b>{w.title}</b><small>Won by {w.winner}{w.players ? ` · ${w.players} ${w.players === 1 ? "player" : "players"}` : ""}</small></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="cmk-tool__acts">
              <ArrowLink href="/tournament" className={link("tournaments")}>Browse tournaments</ArrowLink>
              <ArrowLink href="/mario-kart-tournaments" className={link("run")}>Run one</ArrowLink>
            </div>
          </section>
          </div>



        </div>

        <section className="cmk-band" aria-labelledby="cmk-quaxly">
          <div className="cmk-band__intro">
            <p className="cmk-band__eyebrow">Moving from Quaxly</p>
            <h2 id="cmk-quaxly">Bring your times over</h2>
            <p>Every time you&apos;ve posted moves in one go.</p>
            <div className="cmk-band__acts">
              <Link href="/time-trials/import" className={`empac-button empac-button--primary empac-button--medium cmk-band__btn ${link("import-band")}`}>Import your times</Link>
            </div>
            {actor && !actor.discordLinked && <TtConnectDiscord returnTo={PATH} compact text="Connect Discord first so your Quaxly times land on this account." />}
          </div>
          <ol className="cmk-steps">
            <li><span className="cmk-steps__n">1</span><span><b>Show your times in Discord</b>Run <code>/dx display time</code> in any server with Quaxly.</span></li>
            <li><span className="cmk-steps__n">2</span><span><b>Copy the reply, or press Save to GameShuffle</b>The button is on Quaxly&apos;s reply once GameShuffle&apos;s bot is in the server.</span></li>
            <li><span className="cmk-steps__n">3</span><span><b>Check and save</b>We match every track and show what&apos;s new before anything saves.</span></li>
          </ol>
        </section>

        <section className="cmk-sec" aria-labelledby="cmk-where">
          <h2 id="cmk-where">Wherever you race</h2>
          <div className="cmk-where">
            <div>
              <IconTile icon={IconBrandDiscord} tone="violet" />
              <h3>In your Discord server</h3>
              <p>Times, MMR and room checks without leaving the chat.</p>
              <ul className="cmk-cmds">
                <li><code>/gs-tt add</code> a time from a screenshot</li>
                <li><code>/gs-tt track</code> your server&apos;s board</li>
                <li><code>/gs-mmr</code> anyone&apos;s lounge MMR</li>
                <li><code>/gs-room</code> the odds for a room</li>
              </ul>
              <ArrowLink href="/discord" className={link("discord")}>Add GameShuffle to Discord</ArrowLink>
            </div>
            <div>
              <IconTile icon={IconBrandTwitch} tone="blue" />
              <h3>On stream</h3>
              <p>Chat asks, the bot answers, the overlay shows it.</p>
              <ul className="cmk-cmds">
                <li><code>!mmr</code> your MMR and tonight&apos;s run</li>
                <li><code>!last10</code> and <code>!tonight</code></li>
                <li><code>!odds</code> tonight&apos;s room, with GS Pro</li>
                <li>The MMR card and Tonight&apos;s room on your overlay</li>
              </ul>
              <ArrowLink href="/gs-pro#lounge" className={link("gs-pro")}>What GS Pro adds</ArrowLink>
            </div>
            <div>
              <IconTile icon={IconUsers} tone="green" />
              <h3>With friends</h3>
              <p>Live scoring for a set between friends: everyone logs their own finish from their phone.</p>
              <ul className="cmk-cmds">
                <li>Free for all, or 2v2 to 6v6</li>
                <li>12 races on the standard table</li>
                <li>Standings anyone can follow by link</li>
              </ul>
              <span className="cmk-links">
                <ArrowLink href="/competitive/mario-kart-8-deluxe" className={link("live-scoring")}>Start live scoring</ArrowLink>
                <ArrowLink href="/randomizers/mario-kart-8-deluxe" className={link("randomizer")}>Mario Kart randomizers</ArrowLink>
              </span>
            </div>
          </div>
        </section>

        <section className="cmk-sec" aria-labelledby="cmk-faq">
          <h2 id="cmk-faq">Questions</h2>
          <FaqList items={FAQ} />
        </section>
        <MedalCredit className="cmk-credit" />
      </Container>
    </main>
  );
}
