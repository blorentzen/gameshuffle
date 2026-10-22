"use client";

/**
 * The duel's events: the banner for the one that flipped this turn (icon tile, title, its short
 * line, or what happened instead when it did nothing) and the one-line "Next turn" chip a turn
 * ahead. The trainer's own event wears their picture instead of an icon. The banner flips in when it appears; the chip glows once when a new event comes into view.
 * The full sentences stay in the turn's announcement and the turn log.
 */

import type { DuelEventView, DuelPicture } from "@/lib/originals/duel/view";
import { EVENT_LOOK } from "./duelLook";
import { TrainerArt } from "./TrainerArt";

/**
 * `picture`: the trainer's picture, shown in place of the icon when the event is their own (the
 * event's title names it, so the picture is decoration).
 */
export function DuelEventBanner({ event, outcome, picture = null }: { event: DuelEventView; outcome?: string | null; picture?: DuelPicture | null }) {
  const look = EVENT_LOOK[event.kind];
  const Glyph = look.icon;
  const face = event.kind === "signature" ? picture : null;
  return (
    <div key={`${event.kind}-${event.turn}`} className="duel-event" data-event={event.kind}>
      {face
        ? <TrainerArt picture={face} shape="tile" className="duel-event__face" />
        : <span className="duel-event__tile" style={{ background: look.bg }} aria-hidden="true"><Glyph size={22} stroke={2} /></span>}
      <div className="duel-event__body">
        <b>{event.title}</b>
        <span>{outcome ?? event.short}</span>
      </div>
    </div>
  );
}

export function DuelForecast({ event, hidden = false, picture = null }: { event: DuelEventView; hidden?: boolean; picture?: DuelPicture | null }) {
  const look = EVENT_LOOK[event.kind];
  const Glyph = look.icon;
  const face = event.kind === "signature" ? picture : null;
  return (
    <p key={`${event.kind}-${event.turn}`} className={`duel-forecast${hidden ? " duel-forecast--later" : ""}`}>
      {face ? <TrainerArt picture={face} shape="round" className="duel-forecast__face" /> : <Glyph size={16} stroke={2} aria-hidden="true" />}
      <span>
        Next turn: <b>{event.title}</b>
        <span aria-hidden="true"> · </span><span className="sr-only">. </span>
        {event.short}
      </span>
    </p>
  );
}
