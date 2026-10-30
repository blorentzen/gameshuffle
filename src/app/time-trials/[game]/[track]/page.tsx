import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { TtCategoryNav } from "@/components/timeTrials/TtCategoryNav";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { AddTimeButton } from "@/components/timeTrials/AddTimeButton";
import { TimeTrialBoard } from "@/components/timeTrials/TimeTrialBoard";
import { TtMovedToast } from "@/components/timeTrials/TtMovedToast";
import { TtDiscordLine } from "@/components/timeTrials/TtDiscordLine";
import { siteActor } from "@/lib/timeTrials/players";
import { boardFor, serversFor } from "@/lib/timeTrials/store";
import { formatTime } from "@/lib/timeTrials/rules";
import { gameBySlug, gamePath, isClassFor, trackBySegment, trackPath, ttCups, type TtClass } from "@/lib/timeTrials/tracks";
import { categoryText, readCategory, vehicleLabel } from "@/lib/timeTrials/categories";
import "@/styles/time-trials.css";

/**
 * A track's time trial board (picks 2026-10-29): every player's best, by everyone, friends, a
 * crew or a Discord server, with proof and Discord verification marked. Public and in search
 * once three players have a time (a thinner board is noindex).
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ game: string; track: string }>; searchParams: Promise<{ cc?: string; items?: string; vehicle?: string }> };

const MIN_INDEXED = 3;

function resolve(gameSlug: string, segment: string, ccParam?: string, sp: { items?: string; vehicle?: string } = {}) {
  const info = gameBySlug(gameSlug);
  const track = info ? trackBySegment(info.id, segment) : null;
  if (!info || !track) return null;
  const ccRaw = Number(ccParam);
  const cc = (isClassFor(info.id, ccRaw) ? ccRaw : info.classes[0]) as TtClass;
  // An old cup-prefixed address ("flower-dk-spaceport") or the game's short id forwards to the name address (6A).
  const canonical = info.slug === gameSlug && track.slug === segment;
  return { info, track, cc, canonical, ...readCategory(info.id, sp) };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ game, track }, sp] = await Promise.all([params, searchParams]);
  const r = resolve(game, track, sp.cc, sp);
  if (!r) return { title: "Track not found", robots: { index: false } };
  const board = await boardFor({ game: r.info.id, track: r.track.id, cc: r.cc, items: r.items, vehicle: r.vehicle, scope: "everyone", viewer: null, limit: 1 });
  const cls = `${r.info.classes.length > 1 ? ` ${r.cc}cc` : ""}${r.items === "none" ? " no mushrooms" : ""}${r.vehicle !== "any" ? ` ${vehicleLabel(r.vehicle)}` : ""}`;
  const title = `${r.track.name}${cls} time trial leaderboard (${r.info.short})`;
  const top = board.rows[0];
  const description = top
    ? `The fastest ${r.track.name}${cls} times in ${r.info.label}: ${board.total} ${board.total === 1 ? "player" : "players"}, record ${formatTime(top.timeMs)} by ${top.name}. Add your time from a screenshot.`
    : `${r.track.name}${cls} time trial times in ${r.info.label}. Be the first to add one, from a screenshot or in Discord.`;
  const path = trackPath(r.track, r.cc, r);
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
  const r = resolve(game, track, sp.cc, sp);
  if (!r) notFound();
  if (!r.canonical) permanentRedirect(trackPath(r.track, r.cc, r));
  const { info, track: t, cc, items, vehicle } = r;
  const actor = await siteActor();
  const [board, servers] = await Promise.all([
    boardFor({ game: info.id, track: t.id, cc, items, vehicle, scope: "everyone", viewer: actor?.player ?? null }),
    actor ? serversFor(actor.player) : Promise.resolve([]),
  ]);
  const cup = ttCups(info.id).find((c) => c.tracks.some((x) => x.id === t.id));
  const path = trackPath(t, cc, { items, vehicle });
  const what = categoryText(info.id, cc, items, vehicle, info.classes.length > 1);

  return (
    <main className="tt-page">
      <TtMovedToast />
      <MarketingJsonLd breadcrumb={{ label: t.name, path, parent: { label: info.label, path: gamePath(info.id) } }} />
      <BrowseHero
        eyebrow={info.label}
        title={t.name}
        sub={`Each player's best time (${what}), fastest first.`}
        subShort="Each player's best time, fastest first."
        accent="blue"
        field="compete"
        compact
        aside={t.image ? <Image src={t.image} alt="" width={416} height={234} className="tt-hero-pic" priority sizes="260px" /> : undefined}
        actions={<>
          <AddTimeButton game={info.id} track={t.id} cc={cc} items={items} vehicle={vehicle} signedIn={!!actor} returnTo={path} />
          {actor && <Link href="/time-trials/players/me" className="empac-button empac-button--secondary empac-button--medium tt-hero-link">Your times</Link>}
        </>}
      />
      <Container className="tt-body">
        <section className="tt-sec tt-sec--flat" aria-label="Times">
          <TimeTrialBoard
            key={`${t.id}-${cc}-${items}-${vehicle}`}
            initial={board} game={info.id} track={t.id} cc={cc} items={items} vehicle={vehicle} signedIn={!!actor} servers={servers}
            filters={<TtCategoryNav bare game={info.id} cc={cc} items={items} vehicle={vehicle} href={(c) => trackPath(t, c.cc, c)} />}
          />
        </section>
        <TtDiscordLine returnTo={path} needsLink={!!actor && !actor.discordLinked} />
        {cup && cup.tracks.length > 1 && (
          <section className="tt-sec" aria-labelledby="tt-cup">
            <h2 id="tt-cup">{/Mario Kart$/.test(cup.cup) ? "More Super Mario Kart courses" : `More in the ${cup.cup} Cup`}</h2>
            <ul className="tt-more">
              {cup.tracks.filter((x) => x.id !== t.id).map((x) => (
                <li key={x.id}>
                  <Link href={trackPath(x, cc, { items, vehicle })} className="tt-more__card">
                    {x.image ? <Image src={x.image} alt="" width={64} height={36} className="tt-track__pic" sizes="64px" /> : <span className="tt-track__pic tt-track__pic--blank" aria-hidden="true">{x.name.replace(/^SNES /, "").slice(0, 1)}</span>}
                    <span>{x.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <ArrowLink href={gamePath(info.id, cc, { items, vehicle })}>Every {info.label} track</ArrowLink>
          </section>
        )}
      </Container>
    </main>
  );
}
