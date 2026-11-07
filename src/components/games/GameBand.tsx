/**
 * The bridge from a search page to the game's space (journeys picks 2026-11-06, 2A,
 * https://claude.ai/artifact/DqZuBnVSJFAuDSDY4Ssb11): one band right after the tool, with the space's pick of the day,
 * how many play there and what's new; for visitors, what a free account keeps there (dashed empty slots) and Join
 * free; GS Pro and GS Circuit as one line of links (Britton's rule: nothing takes away a path to either). It replaces
 * the plans panel only once the game's space is open (staff see it while spaces preview); until then `fallback`
 * renders. Server component.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { KEEPS } from "@/lib/games/keeps";
import { JoinFreeButton } from "@/components/games/JoinSheet";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { spaceFor, spaceOpen, spacePath, type GameSpace } from "@/lib/games/spaces";
import { spaceCounts, spaceJoined } from "@/lib/games/spaceData";
import { pickLine } from "@/lib/spaces/challenges";
import { newsFor } from "@/lib/home/yourGames";
import { isStaffRole } from "@/lib/subscription";
import { gsDay } from "@/lib/time/gsClock";
import { getImagePath } from "@/lib/images";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { SpaceJoin } from "@/components/games/SpaceJoin";
import "@/styles/game-band.css";


async function viewer(): Promise<{ userId: string | null; staff: boolean }> {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return { userId: null, staff: false };
  const { data } = await createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle();
  return { userId: user.id, staff: isStaffRole((data as { role: string | null } | null)?.role) };
}

export async function GameBand({ game, from, fallback, streamReady = true, tournament = true }: {
  /** The game this page is about, any way it's named (`gameKey`). */
  game: string;
  /** Where the band sits, for the clicks ("randomizer", "pokemon-generator"). */
  from: string;
  /** What shows while the game has no open space (the plans panel). */
  fallback: ReactNode;
  streamReady?: boolean;
  tournament?: boolean;
}) {
  const s: GameSpace | null = spaceFor(game);
  if (!s) return <>{fallback}</>;
  const who = await viewer().catch(() => ({ userId: null, staff: false }));
  if (!spaceOpen(s, gsDay()) && !who.staff) return <>{fallback}</>;
  const [counts, pick, news, joined] = await Promise.all([
    spaceCounts(s).catch(() => ({ members: 0, online: 0 })),
    pickLine(s).catch(() => null),
    newsFor(s, null).catch(() => null),
    who.userId ? spaceJoined(s, who.userId).catch(() => false) : Promise.resolve(false),
  ]);
  const href = spacePath(s);
  const tag = (to: string) => tagged(EVENTS.gameBandClicked, { to, space: s.id, from });
  const meta = [counts.members ? `${counts.members.toLocaleString("en-US")} ${counts.members === 1 ? "player" : "players"}` : null, news && !/member/.test(news.text) ? news.text : null].filter(Boolean).join(" · ");
  const keeps = KEEPS[s.id] ?? [];

  return (
    <section className={`game-band${who.userId ? " game-band--member" : ""}`} style={{ "--band-acc": s.accent } as React.CSSProperties} aria-labelledby={`game-band-${s.id}`}>
      {s.hero && <span className="game-band__art" style={{ backgroundImage: `url(${s.hero})` }} aria-hidden="true" />}
      <div className="game-band__main">
        <div className="game-band__who">
          {/* eslint-disable-next-line @next/next/no-img-element -- our box art */}
          {s.box && <img className="game-band__box" src={s.box} alt="" />}
          <div>
            <h2 id={`game-band-${s.id}`}>{s.name} on GameShuffle</h2>
            {meta && <p className="game-band__meta">{meta}</p>}
          </div>
        </div>
        {pick && (
          <div className="game-band__pick">
            {/* eslint-disable-next-line @next/next/no-img-element -- our game art */}
            {pick.img && <img src={getImagePath(pick.img)} alt="" />}
            <span><small>{pick.label}</small><b>{pick.name}</b></span>
          </div>
        )}
      </div>
      <div className="game-band__side">
        {!who.userId && keeps.length > 0 && (
          <div className="game-band__keeps">
            <p>With a free account, the space keeps these for you:</p>
            <ul>{keeps.map((k) => <li key={k.label}><k.icon size={20} stroke={1.8} aria-hidden="true" />{k.label}</li>)}</ul>
          </div>
        )}
        <div className="game-band__go">
          <Link href={href} className={`game-band__btn game-band__btn--ghost ${tag("open")}`}>Open the space</Link>
          {!who.userId ? (
            <JoinFreeButton space={s.id} name={s.name} className={`game-band__btn ${tag("join")}`} />
          ) : !joined ? (
            <SpaceJoin space={s.id} name={s.name} joined={false} signedIn />
          ) : null}
        </div>
        {(streamReady || tournament) && (
          <p className="game-band__more">
            {streamReady && <Link href={`/gs-pro?from=game-band-${s.id}`} className={tag("pro")}>Chat rolls on stream with GS Pro</Link>}
            {streamReady && tournament && <span aria-hidden="true"> · </span>}
            {tournament && <Link href={`/gs-circuit?from=game-band-${s.id}`} className={tag("circuit")}>Brackets with GS Circuit</Link>}
          </p>
        )}
      </div>
    </section>
  );
}
