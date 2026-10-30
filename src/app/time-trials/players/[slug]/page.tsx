import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar, Container, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { TableScroll } from "@/components/ui/TableScroll";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { TtCategoryNav } from "@/components/timeTrials/TtCategoryNav";
import { TtCompareButton } from "@/components/timeTrials/TtCompareButton";
import { VideoChip } from "@/components/timeTrials/TimeTrialBoard";
import { createServiceClient } from "@/lib/supabase/admin";
import { describePlayers } from "@/lib/daily/boards";
import { siteActor } from "@/lib/timeTrials/players";
import { playerBests, type TtBest } from "@/lib/timeTrials/store";
import { formatGap, formatTime, ordinal, type TtPlayer } from "@/lib/timeTrials/rules";
import { categoryQuery, readCategory, TOP_TEN, type TtItems, type TtVehicle } from "@/lib/timeTrials/categories";
import { playerPagePath, readPlayerSlug } from "@/lib/timeTrials/playerPath";
import { isClassFor, trackPath, ttTracks, TT_GAMES, TT_GAME_ORDER, type TtClass, type TtGame } from "@/lib/timeTrials/tracks";
import "@/styles/time-trials.css";

/**
 * A player's time trials (round 2, 1A): their best on every track for one game, items setting, speed
 * and vehicle board, with the place, and Verified or Unverified on top-ten places (the only ones that
 * need a clip). For accounts and Discord players alike. /time-trials/players/me is your own;
 * ?vs=<username> compares with another player (the header's Compare button asks for one).
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ game?: string; cc?: string; items?: string; vehicle?: string; vs?: string }> };

type Who = { player: string; name: string; avatar: string | null; profile: string | null; discord: boolean; isPublic: boolean };

async function resolvePlayer(slug: string): Promise<Who | "signin" | null> {
  const s = readPlayerSlug(slug);
  if (!s) return null;
  let player: string | null = null;
  let isPublic = true;
  if (s.kind === "me") {
    const actor = await siteActor();
    if (!actor) return "signin";
    player = actor.player;
  } else if (s.kind === "key") {
    player = s.player;
    isPublic = false;
  } else {
    const { data } = await createServiceClient().from("users").select("id, is_public").eq("username", s.username).maybeSingle();
    const u = data as { id: string; is_public: boolean | null } | null;
    if (!u) return null;
    player = `u:${u.id}`;
    isPublic = u.is_public !== false;
  }
  const who = (await describePlayers([player])).get(player);
  return { player, name: who?.name ?? "A player", avatar: who?.avatar ?? null, profile: who?.profile ?? null, discord: who?.tag === "discord", isPublic };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const who = await resolvePlayer(slug);
  if (!who || who === "signin") return { title: "Time trials", robots: { index: false } };
  return { title: `${who.name}'s time trials`, description: `${who.name}'s best Mario Kart time trial times, with their place on each board.`, robots: who.isPublic && readPlayerSlug(slug)?.kind === "username" ? undefined : { index: false, follow: true } };
}

function sliceBests(bests: TtBest[], game: TtGame, cc: TtClass, items: TtItems, vehicle: TtVehicle): Map<string, TtBest> {
  return new Map(bests.filter((b) => b.game === game && b.cc === cc && b.items === items && b.vehicle === vehicle).map((b) => [b.track, b]));
}

export default async function TtPlayerPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const who = await resolvePlayer(slug);
  if (who === "signin") redirect(`/login?redirect=${encodeURIComponent("/time-trials/players/me")}`);
  if (!who) notFound();
  const bests = await playerBests(who.player as TtPlayer);
  const games = TT_GAME_ORDER.filter((g) => bests.some((b) => b.game === g));
  const game: TtGame = TT_GAME_ORDER.includes(sp.game as TtGame) ? (sp.game as TtGame) : games[0] ?? "mk8dx";
  const info = TT_GAMES[game];
  const ccRaw = Number(sp.cc);
  const cc = (isClassFor(game, ccRaw) ? ccRaw : info.classes[0]) as TtClass;
  const { items, vehicle } = readCategory(game, sp);
  const mine = sliceBests(bests, game, cc, items, vehicle);

  // Compare with another player (?vs=<username or page slug>).
  const vs = sp.vs ? await resolvePlayer(sp.vs) : null;
  const other = vs && vs !== "signin" && vs.player !== who.player ? vs : null;
  const theirs = other ? sliceBests(await playerBests(other.player as TtPlayer), game, cc, items, vehicle) : null;

  const open = bests.filter((b) => b.vehicle === "any");
  const tracks = new Set(open.map((b) => `${b.game}|${b.track}`)).size;
  const records = open.filter((b) => b.place === 1).length;
  const topTens = open.filter((b) => b.place <= TOP_TEN).length;
  const verified = open.filter((b) => b.video === "checked").length;
  const base = playerPagePath(who.player, who.profile);
  const href = (g: TtGame, c: { cc?: TtClass; items?: TtItems; vehicle?: TtVehicle }) => {
    const q = categoryQuery({ cc: c.cc, defaultCc: TT_GAMES[g].classes[0], items: c.items, vehicle: g === "mk8dx" ? c.vehicle : undefined });
    const extra = new URLSearchParams(q.slice(1));
    if (g !== games[0]) extra.set("game", g);
    if (other) extra.set("vs", sp.vs!);
    const s = extra.toString();
    return `${base}${s ? `?${s}` : ""}`;
  };
  const rows = ttTracks(game).filter((t) => mine.has(t.id) || theirs?.has(t.id));
  const keep = new URLSearchParams();
  if (sp.game) keep.set("game", game);
  if (cc !== info.classes[0]) keep.set("cc", String(cc));
  if (items !== "shrooms") keep.set("items", items);
  if (vehicle !== "any") keep.set("vehicle", vehicle);

  return (
    <main className="tt-page">
      <BrowseHero
        eyebrow="Time trials"
        title={who.name}
        sub={who.discord ? "Plays from Discord. Best times on every board, with their place." : "Best times on every board, with their place."}
        accent="blue"
        field="compete"
        compact
        aside={<Avatar size="xlarge" src={who.avatar ?? undefined} initials={who.name.slice(0, 1).toUpperCase()} alt="" />}
        actions={bests.length > 0 ? <TtCompareButton base={base} query={keep.toString()} current={other ? sp.vs : undefined} /> : undefined}
      />
      <Container className="tt-body">
        <section className="tt-sec tt-sec--flat" aria-label="Totals">
          <dl className="tt-stats">
            <div><dt>Tracks</dt><dd>{tracks}</dd></div>
            <div><dt>Records</dt><dd>{records}</dd></div>
            <div><dt>Top tens</dt><dd>{topTens}</dd></div>
            <div><dt>Verified</dt><dd>{verified}</dd></div>
          </dl>
        </section>

        {bests.length === 0 ? (
          <section className="tt-sec"><p className="tt-note">No times yet. <ArrowLink href="/time-trials">See the boards</ArrowLink></p></section>
        ) : (
          <section className="tt-sec" aria-labelledby="tt-player-times">
            <h2 id="tt-player-times" className="sr-only">{info.label}</h2>
            <TtCategoryNav
              game={game} cc={cc} items={items} vehicle={vehicle} href={(c) => href(game, c)}
              games={games.length > 1 ? games.map((g) => ({ label: TT_GAMES[g].label, href: href(g, {}), active: g === game })) : undefined}
            />
            {sp.vs && !other && <p className="tt-note" role="alert">No player called {sp.vs}.</p>}
            {other && <p className="tt-note">Comparing with {other.name}. <Link href={`${base}${keep.size ? `?${keep}` : ""}`}>Stop comparing</Link></p>}
            {rows.length === 0 ? (
              <p className="tt-note">No times on these boards yet.</p>
            ) : (
              <TableScroll label="Best times">
                <Table className="tt-cup__table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Track</TableHead>
                      <TableHead>{other ? who.name : "Best"}</TableHead>
                      <TableHead>Place</TableHead>
                      {other && <TableHead>{other.name}</TableHead>}
                      {other && <TableHead>Gap</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((t) => {
                      const b = mine.get(t.id);
                      const o = theirs?.get(t.id);
                      return (
                        <TableRow key={t.id}>
                          <TableCell><Link href={trackPath(t, cc, { items, vehicle })}>{t.name}</Link></TableCell>
                          <TableCell>{b ? <span className="tt-board__timecell"><span className="tt-board__time">{formatTime(b.timeMs)}</span>{b.place <= TOP_TEN && <VideoChip row={{ video: b.video, videoUrl: b.video === "waiting" ? "waiting" : null, you: false }} />}</span> : <span className="tt-muted">None</span>}</TableCell>
                          <TableCell>{b ? `${ordinal(b.place)} of ${b.total}` : ""}</TableCell>
                          {other && <TableCell className="tt-board__time">{o ? formatTime(o.timeMs) : <span className="tt-muted">None</span>}</TableCell>}
                          {other && <TableCell>{b && o ? (b.timeMs === o.timeMs ? "Tied" : `${b.timeMs < o.timeMs ? "−" : "+"}${formatGap(Math.abs(b.timeMs - o.timeMs))}`) : ""}</TableCell>}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableScroll>
            )}
          </section>
        )}
        {who.profile && <p className="tt-note"><ArrowLink href={who.profile}>{who.name}&apos;s profile</ArrowLink></p>}
      </Container>
    </main>
  );
}
