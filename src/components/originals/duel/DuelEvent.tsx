"use client";

/**
 * The duel's events (picks 2026-10-22, https://claude.ai/artifact/P9oteT6tmhCmAqpQrAakJZ, all as
 * recommended): one strip with two halves, This turn and Next turn, in the same place at the same
 * height every turn, so nothing below it moves. A half with nothing in it says "No event". The
 * coming event glows gold; the trainer's own event wears their picture. Professor's advice says its
 * play for the turn in the This turn half. When an event lands it takes the middle of the arena for
 * a moment first (DuelEventMoment). Our own drawing: CascadeDS has no game event strip.
 */

import { IconCircleDashed } from "@tabler/icons-react";
import type { DuelEventView, DuelHintView, DuelPicture } from "@/lib/originals/duel/view";
import { EVENT_LOOK } from "./duelLook";
import { TrainerArt } from "./TrainerArt";

/** An event's tile: its icon on its color, or the trainer's picture for their own event. */
function EventTile({ event, picture, size, next = false }: { event: DuelEventView | null; picture: DuelPicture | null; size: "sm" | "lg"; next?: boolean }) {
  if (!event) return <span className={`duel-evs__tile duel-evs__tile--${size} duel-evs__tile--quiet`} aria-hidden="true"><IconCircleDashed size={size === "lg" ? 34 : 18} stroke={2} /></span>;
  if (event.kind === "signature" && picture) return <TrainerArt picture={picture} shape="tile" className={`duel-evs__tile duel-evs__tile--${size} duel-evs__face`} />;
  const look = EVENT_LOOK[event.kind];
  const Glyph = look.icon;
  return (
    <span className={`duel-evs__tile duel-evs__tile--${size}${next ? " duel-evs__tile--next" : ""}`} style={next ? undefined : { background: look.bg }} aria-hidden="true">
      <Glyph size={size === "lg" ? 34 : 20} stroke={2} />
    </span>
  );
}

/** This turn's line: Professor's play, what the event did instead when it did nothing, or its short line. */
export function eventNowText(event: DuelEventView, outcome: string | null, hint: DuelHintView | null): string {
  if (event.kind === "advice" && hint) return hint.text;
  return outcome ?? event.short;
}

export function DuelEventStrip({ event, outcome, forecast, hint, picture = null, staging = false, className = "" }: {
  event: DuelEventView | null;
  outcome: string | null;
  forecast: DuelEventView | null;
  hint: DuelHintView | null;
  picture?: DuelPicture | null;
  /** The exchange is still playing: next turn's event waits until it's done. */
  staging?: boolean;
  className?: string;
}) {
  const next = staging ? null : forecast;
  // Professor's play gets its own full-width line under the halves (too long for half a phone),
  // led by the same gold Tip as the button it points at.
  const tip = event?.kind === "advice" && hint ? hint.text : null;
  return (
    <div className={`duel-evs ${className}`} role="group" aria-label="Events">
      <div key={event ? `now-${event.kind}-${event.turn}` : "now-none"} className={`duel-evs__half duel-evs__half--now${event ? " is-on" : ""}`}>
        <span className="duel-evs__k">This turn</span>
        <EventTile event={event} picture={picture} size="sm" />
        <span className="duel-evs__text">
          <b>{event ? event.title : "No event"}</b>
          {event && <span>{tip ? event.short : eventNowText(event, outcome, hint)}</span>}
        </span>
      </div>
      <div key={next ? `next-${next.kind}-${next.turn}` : "next-none"} className={`duel-evs__half duel-evs__half--next${next ? " is-on" : ""}`}>
        <span className="duel-evs__k">Next turn</span>
        <EventTile event={next} picture={picture} size="sm" next />
        <span className="duel-evs__text">
          <b>{next ? next.title : "No event"}</b>
          {next && <span>{next.short}</span>}
        </span>
      </div>
      {tip && <p className="duel-evs__tip"><span className="duel-tip" aria-hidden="true">Tip</span>{tip}</p>}
    </div>
  );
}

/**
 * The moment an event lands: it takes the middle of the arena for about a second and a half, then
 * the strip carries it. A tap ends it early. Decoration only (the turn's announcement reads the
 * event), so it's hidden from screen readers and never takes focus.
 */
export function DuelEventMoment({ event, text, picture = null, onDone }: { event: DuelEventView; text: string; picture?: DuelPicture | null; onDone: () => void }) {
  return (
    <div className="duel-moment" aria-hidden="true" onPointerDown={(e) => { e.stopPropagation(); onDone(); }}>
      <div className="duel-moment__card">
        <small>This turn</small>
        <EventTile event={event} picture={picture} size="lg" />
        <b>{event.title}</b>
        <span>{text}</span>
      </div>
    </div>
  );
}
