import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Image from "next/image";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { LabeledSubNav } from "@/components/ui/LabeledSubNav";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { AddTimeButton } from "@/components/timeTrials/AddTimeButton";
import { TimeTrialBoard } from "@/components/timeTrials/TimeTrialBoard";
import { TtMovedToast } from "@/components/timeTrials/TtMovedToast";
import { TtConnectDiscord } from "@/components/timeTrials/TtConnectDiscord";
import { siteActor } from "@/lib/timeTrials/players";
import { boardFor, serversFor } from "@/lib/timeTrials/store";
import { formatTime } from "@/lib/timeTrials/rules";
import { gameBySlug, gamePath, isClassFor, trackBySegment, trackPath, ttCups, type TtClass } from "@/lib/timeTrials/tracks";
import "@/styles/time-trials.css";

/**
 * A track's time trial board (picks 2026-10-29): every player's best, by everyone, friends, a
 * crew or a Discord server, with proof and Discord verification marked. Public and in search
 * once three players have a time (a thinner board is noindex).
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ game: string; track: string }>; searchParams: Promise<{ cc?: string }> };

const MIN_INDEXED = 3;

function resolve(gameSlug: string, segment: string, ccParam?: string) {
  const info = gameBySlug(gameSlug);
  const track = info ? trackBySegment(info.id, segment) : null;
  if (!info || !track) return null;
  const ccRaw = Number(ccParam);
  const cc = (isClassFor(info.id, ccRaw) ? ccRaw : info.classes[0]) as TtClass;
  // An old cup-prefixed address ("flower-dk-spaceport") or the game's short id forwards to the name address (6A).
  const canonical = info.slug === gameSlug && track.slug === segment;
  return { info, track, cc, canonical };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ game, track }, sp] = await Promise.all([params, searchParams]);
  const r = resolve(game, track, sp.cc);
  if (!r) return { title: "Track not found", robots: { index: false } };
  const board = await boardFor({ game: r.info.id, track: r.track.id, cc: r.cc, scope: "everyone", viewer: null, limit: 1 });
  const cls = r.info.classes.length > 1 ? ` ${r.cc}cc` : "";
  const title = `${r.track.name}${cls} time trial leaderboard (${r.info.short})`;
  const top = board.rows[0];
  const description = top
    ? `The fastest ${r.track.name}${cls} times in ${r.info.label}: ${board.total} ${board.total === 1 ? "player" : "players"}, record ${formatTime(top.timeMs)} by ${top.name}. Add your time from a screenshot.`
    : `${r.track.name}${cls} time trial times in ${r.info.label}. Be the first to add one, from a screenshot or in Discord.`;
  const path = trackPath(r.track, r.cc);
  return {
    title,
    description,
    alternates: { canonical: `https://www.gameshuffle.co${path}` },
    robots: board.total >= MIN_INDEXED ? undefined : { index: false, follow: true },
    openGraph: { title, description, url: `https://www.gameshuffle.co${path}`, siteName: "GameShuffle", type: "website" },
  };
}

export default async function TrackBoardPage({ params, searchParams }: Props) {
  const [{ game, track }, sp] = await Promise.all([params, searchParams]);
  const r = resolve(game, track, sp.cc);
  if (!r) notFound();
  if (!r.canonical) permanentRedirect(trackPath(r.track, r.cc));
  const { info, track: t, cc } = r;
  const actor = await siteActor();
  const [board, servers] = await Promise.all([
    boardFor({ game: info.id, track: t.id, cc, scope: "everyone", viewer: actor?.player ?? null }),
    actor ? serversFor(actor.player) : Promise.resolve([]),
  ]);
  const cup = ttCups(info.id).find((c) => c.tracks.some((x) => x.id === t.id));
  const path = trackPath(t, cc);
  const cls = info.classes.length > 1 ? ` at ${cc}cc` : "";

  return (
    <main className="tt-page">
      <TtMovedToast />
      <MarketingJsonLd breadcrumb={{ label: t.name, path, parent: { label: info.label, path: gamePath(info.id) } }} />
      <BrowseHero
        eyebrow={info.label}
        title={t.name}
        sub={`Each player's best time${cls} with mushrooms, fastest first.`}
        accent="blue"
        field="compete"
        compact
        aside={t.image ? <Image src={t.image} alt="" width={416} height={234} className="tt-hero-pic" priority sizes="260px" /> : undefined}
        actions={<AddTimeButton game={info.id} track={t.id} cc={cc} signedIn={!!actor} discordLinked={actor?.discordLinked ?? true} returnTo={path} />}
      />
      <Container className="tt-body">
        {info.classes.length > 1 && (
          <div className="tt-pills">
            <LabeledSubNav label="Speed class" variant="pills" items={info.classes.map((c) => ({ label: `${c}cc`, href: trackPath(t, c), active: c === cc }))} />
          </div>
        )}
        <section className="tt-sec tt-sec--flat" aria-label="Times">
          <TimeTrialBoard key={`${t.id}-${cc}`} initial={board} game={info.id} track={t.id} cc={cc} signedIn={!!actor} servers={servers} />
          {actor && !actor.discordLinked && <TtConnectDiscord returnTo={path} />}
        </section>
        <section className="tt-sec" aria-labelledby="tt-discord">
          <h2 id="tt-discord">From Discord</h2>
          <p className="tt-note">Add a time with <code>/gs-tt add</code> and see this board for your server with <code>/gs-tt track</code>, wherever GameShuffle&apos;s bot is in the server.</p>
          <ArrowLink href="/discord">Add GameShuffle to Discord</ArrowLink>
        </section>
        {cup && cup.tracks.length > 1 && (
          <section className="tt-sec" aria-labelledby="tt-cup">
            <h2 id="tt-cup">{/Mario Kart$/.test(cup.cup) ? "More Super Mario Kart courses" : `More in the ${cup.cup} Cup`}</h2>
            <ul className="tt-cup-links">
              {cup.tracks.filter((x) => x.id !== t.id).map((x) => <li key={x.id}><ArrowLink href={trackPath(x, cc)}>{x.name}</ArrowLink></li>)}
            </ul>
            <ArrowLink href={gamePath(info.id, cc)}>Every {info.label} track</ArrowLink>
          </section>
        )}
      </Container>
    </main>
  );
}
