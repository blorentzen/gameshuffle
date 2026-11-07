/**
 * A roll, the same everywhere in a game space (round two picks 5A to 7A, 2026-11-06): what "Roll for me" gives you,
 * a shared roll post, and a card in Rolling now. The randomizer's first part (the racer, the fighter, the board) is
 * the picture, large; the other parts are rows, each with a small picture and its name, so a long name wraps instead
 * of squeezing a tile (Britton: MK8DX's four parts as tiles were too small). `compact` is the carousel card: the
 * picture smaller and the other parts as one line of words. A setup roll (a board, a stage) leads with its picture
 * wide across the top, since those pictures are landscape; a part with no picture (turns, rules) shows an icon for
 * what it is instead of its first letter (other spaces pass, 2026-11-06).
 */

/** An icon for a part that's only words, by what the part is. */
function partIcon(label: string) {
  const p = { size: 22, stroke: 1.8 };
  if (/turn|race|round|length/i.test(label)) return <IconHourglass {...p} />;
  if (/rule/i.test(label)) return <IconBook {...p} />;
  if (/bonus|star/i.test(label)) return <IconStar {...p} />;
  if (/mode|scenario/i.test(label)) return <IconSwords {...p} />;
  if (/map|stage|course|track/i.test(label)) return <IconMap {...p} />;
  if (/cup/i.test(label)) return <IconRoute {...p} />;
  if (/character|fighter|player/i.test(label)) return <IconUser {...p} />;
  return <IconDice5 {...p} />;
}

export function PartArt({ slot }: { slot: RollSlot }) {
  if (slot.kind !== "text" && slot.img) return <RollSlotArt slot={slot} className="roll-card__thumb" glyphSize={20} compact />;
  if (slot.kind === "glyph") return <RollSlotArt slot={slot} className="roll-card__thumb" glyphSize={20} compact />;
  const style = slot.color ? ({ "--part": slot.color } as CSSProperties) : undefined;
  return <span className="roll-card__thumb roll-card__icon" style={style} aria-hidden="true">{partIcon(slot.label)}</span>;
}

import type { CSSProperties } from "react";
import { IconBook, IconDice5, IconHourglass, IconMap, IconRoute, IconStar, IconSwords, IconUser } from "@tabler/icons-react";
import { RollSlotArt } from "@/components/twitch/RollSlotArt";
import type { ChatRoll, RollSlot } from "@/lib/twitch/chatRoll";
import "@/styles/rolls.css";

/** Where each part's reel is (RollReelCard): spinning or just landed, and a count that changes with every frame so
 *  the picture remounts and drops in. */
export type ReelPhase = "idle" | "spinning" | "landed";
export interface ReelState { phase: ReelPhase[]; tick: number[] }

const reelClass = (reel: ReelState | undefined, i: number) => (reel && reel.phase[i] !== "idle" ? ` roll-reel--${reel.phase[i]}` : "");

export function RollCard({ roll, compact = false, head, reel }: { roll: ChatRoll; compact?: boolean; head?: React.ReactNode; reel?: ReelState }) {
  const [lead, ...rest] = roll.slots;
  if (!lead) return null;
  const wide = roll.kind === "setup" && lead.kind === "art" && !!lead.img;
  return (
    <div className={`roll-card${compact ? " roll-card--compact" : ""}${wide ? " roll-card--wide" : ""}`}>
      {head}
      <div className="roll-card__body">
        <RollSlotArt key={reel?.tick[0]} slot={lead} className={`roll-card__lead${reelClass(reel, 0)}`} glyphSize={compact ? 36 : 56} />
        <div className="roll-card__info">
          {roll.title && <span className="roll-card__title">{roll.title}</span>}
          <span className="roll-card__label">{lead.label}</span>
          <b className="roll-card__name">{lead.name}</b>
          {lead.detail && <span className="roll-card__detail">{lead.detail}</span>}
          {compact ? (
            rest.length > 0 && <p className="roll-card__line">{rest.map((p) => p.name).join(" · ")}</p>
          ) : (
            rest.length > 0 && (
              <ul className="roll-card__parts">
                {rest.map((p, i) => (
                  <li key={reel ? `${p.label}-${i}` : `${p.label}-${p.name}`} className={reelClass(reel, i + 1).trim() || undefined}>
                    <PartArt key={reel?.tick[i + 1]} slot={p} />
                    <span><span className="roll-card__label">{p.label}</span><b>{p.name}</b>{p.detail ? <span className="roll-card__detail"> · {p.detail}</span> : null}</span>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </div>
    </div>
  );
}
