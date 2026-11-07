/**
 * Rank: someone's standing in one place (Britton, 2026-11-06: "our own special container for showing rank, points,
 * etc. that works with the space"). Their MMR card in their own look, then the numbers the card doesn't show (world
 * rank, season peak, GameShuffle season points) and where to go next (their lounge page, them in the game's space).
 * One piece, two homes: the profile's side column (theirs) and a game space's Lounge rail (yours). It only exists
 * where there's a card or a lounge to show.
 */

import Link from "next/link";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { MmrCard } from "@/components/mmr/MmrCard";
import type { MmrLook } from "@/lib/mmr/look";
import type { MmrView } from "@/lib/mmr/rules";
import "@/styles/rank.css";
import "@/styles/mmr-card.css";

export interface RankLine { label: string; value: string; href?: string | null }

export function RankBlock({ id, title = "Rank", mmr, card, lines, links, look = "profile", note }: {
  id: string;
  title?: string;
  /** Their MMR card: the block becomes the card's profile version, in their look (round two picks 3A). */
  mmr?: { view: MmrView; look: MmrLook; last10?: boolean } | null;
  /** Something else to show above the lines (kept for a block without a card). */
  card?: React.ReactNode;
  lines: RankLine[];
  links: { href: string; label: string }[];
  /** profile: a card in the profile's side column. room: a block in a space's rail. */
  look?: "profile" | "room";
  /** A line when there's nothing to show yet (the space: confirm your lounge name). */
  note?: React.ReactNode;
}) {
  if (mmr) {
    return (
      <section className="rank-card" aria-labelledby={id}>
        <MmrCard view={mmr.view} look={mmr.look} fit="frame" profile={{ title, titleId: id, rows: lines, links, last10: mmr.last10 }} />
      </section>
    );
  }
  const head = <h2 id={id} className={look === "profile" ? "pcard__title" : undefined}>{title}</h2>;
  return (
    <section className={look === "profile" ? "pcard rank-block" : "room-tile room-rail__block rank-block rank-block--room"} aria-labelledby={id}>
      {look === "room" ? <div className="room-tile__head">{head}</div> : head}
      {card && <div className="rank-block__card">{card}</div>}
      {lines.length > 0 && (
        <dl className="rank-block__lines">
          {lines.map((l) => (
            <div key={l.label} className="rank-block__line">
              <dt>{l.label}</dt>
              <dd>{l.href ? <Link href={l.href}>{l.value}</Link> : l.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {note}
      {links.length > 0 && (
        <ul className="rank-block__links">
          {links.map((l) => <li key={l.href}><ArrowLink href={l.href}>{l.label}</ArrowLink></li>)}
        </ul>
      )}
    </section>
  );
}
