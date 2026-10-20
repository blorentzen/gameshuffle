import Link from "next/link";
import { Avatar } from "@empac/cascadeds";
import { IconBolt, IconClock, IconEyeOff, IconFlame, IconTrophy } from "@tabler/icons-react";
import type { CSSProperties, ReactNode } from "react";
import { ShareSquares } from "@/components/share/ShareChallenge";
import {
  challengeWho, dayName, ordinalPlace, partLine, partTitle, puzzleHeadline, puzzleVibe, shareTime,
  type ShareData, type SharePart,
} from "@/lib/share/types";

/**
 * The friend's result at the top of a shared result page (picks 2026-10-20): drawn on the page
 * instead of pictured, so it reads at any size and to a screen reader. Their name and picture,
 * the game and day, the result, the squares (never the answer), time, streak and place, with
 * their own colors along the top (else the game's). Server-safe.
 */

const GAME_BAND: Record<string, string> = {
  shuffle: "linear-gradient(135deg, #7a5cff, #4b3fd6)",
  dex: "linear-gradient(135deg, #f08a24, #d6452f)",
  fire: "linear-gradient(135deg, #ff6a2b, #d6223a)",
  weekly: "linear-gradient(135deg, #1aa38f, #2766ec)",
  names: "linear-gradient(135deg, #f08a24, #d6452f)",
  day: "linear-gradient(135deg, #2766ec, #7a5cff)",
};

function Stat({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span className="share-friend__stat">{icon}<span>{children}</span></span>;
}

function placeLine(place: number, now: boolean, when: string) {
  return `${ordinalPlace(place)} on ${now ? "today's" : when === "yesterday" ? "yesterday's" : `${when}'s`} board`;
}

function PartBody({ p, now, when }: { p: SharePart; now: boolean; when: string }) {
  if (p.kind === "shuffle" || p.kind === "dex") {
    return (
      <>
        <p className="share-friend__result"><span className="share-friend__big">{puzzleHeadline(p)}</span><span className="share-friend__vibe">{puzzleVibe(p)}</span></p>
        <ShareSquares rows={p.rows} />
        <p className="share-friend__stats">
          {p.solved && p.seconds != null && <Stat icon={<IconClock size={16} aria-hidden />}>Solved in {shareTime(p.seconds)}</Stat>}
          {p.streak > 1 && <Stat icon={<IconFlame size={16} aria-hidden />}>{p.streak}-day streak</Stat>}
          {p.place != null && <Stat icon={<IconTrophy size={16} aria-hidden />}>{placeLine(p.place, now, when)}</Stat>}
        </p>
      </>
    );
  }
  if (p.kind === "fire") {
    return (
      <>
        <p className="share-friend__result"><span className="share-friend__big">{p.score.toLocaleString("en-US")} points</span><span className="share-friend__vibe">{p.right} right</span></p>
        <p className="share-friend__stats">
          <Stat icon={<IconBolt size={16} aria-hidden />}>Best streak {p.bestStreak}</Stat>
          {p.streak > 1 && <Stat icon={<IconFlame size={16} aria-hidden />}>{p.streak}-day streak</Stat>}
          {p.place != null && <Stat icon={<IconTrophy size={16} aria-hidden />}>{placeLine(p.place, now, when)}</Stat>}
        </p>
      </>
    );
  }
  if (p.kind === "weekly") {
    return (
      <>
        <p className="share-friend__result"><span className="share-friend__big">Answered this week&apos;s question</span></p>
        <p className="share-friend__question">{p.title}</p>
      </>
    );
  }
  if (p.kind === "names") {
    return (
      <>
        <p className="share-friend__result"><span className="share-friend__big">{p.count.toLocaleString("en-US")} of {p.of.toLocaleString("en-US")}</span><span className="share-friend__vibe">in {shareTime(p.seconds)}</span></p>
        <p className="share-friend__stats"><Stat icon={<IconClock size={16} aria-hidden />}>{p.clockLabel}</Stat></p>
      </>
    );
  }
  return null;
}

export function ShareFriendCard({ d, today }: { d: ShareData; today: string }) {
  const who = challengeWho(d);
  const now = d.day === today;
  const when = dayName(d.day, today);
  const first = d.parts[0];
  const band = d.background?.theme ?? GAME_BAND[d.kind] ?? GAME_BAND.day;
  const anyDay = first?.kind === "names";
  const sub = d.kind === "day" ? `Their dailies · ${now ? "today" : when}` : first ? `${partTitle(first)}${anyDay ? "" : ` · ${now ? "today" : when}`}` : "";
  // Squares only show for the puzzles; say so where they show.
  const squares = d.parts.some((p) => (p.kind === "shuffle" || p.kind === "dex") && p.rows.length > 0);

  return (
    <section className="share-friend" style={{ "--share-band": band } as CSSProperties} aria-label={`${who}'s result`}>
      <div className="share-friend__head">
        <Avatar size="medium" src={d.player?.avatar ?? undefined} initials={who.slice(0, 1).toUpperCase()} alt="" color="neutral" />
        <div className="share-friend__who">
          {d.player?.profile ? <Link className="share-friend__name" href={d.player.profile}>{who}</Link> : <p className="share-friend__name">{who}</p>}
          <p className="share-friend__sub">{sub}</p>
        </div>
      </div>
      {d.kind === "day" ? (
        <ul className="share-friend__parts">
          {d.parts.map((p) => <li key={p.kind}><strong>{partTitle(p)}</strong><span>{partLine(p)}</span></li>)}
        </ul>
      ) : first ? <PartBody p={first} now={now} when={when} /> : null}
      {squares && <p className="share-friend__note"><IconEyeOff size={16} aria-hidden />Only the squares: the answer isn&apos;t on this page.</p>}
    </section>
  );
}
