"use client";

/**
 * The duel's events (arena pass, picks 2026-10-23, https://claude.ai/artifact/BXp1RfGmpEis5UanYC4bdb,
 * all as recommended). A bar at the top of the arena that stays in view while you scroll: the turn,
 * what's on now (the weather with its turns left, or this turn's event) and next turn's event in gold.
 * Each chip is a button that shows its notice again. When an event lands it shows as a notice
 * at the top of the screen for about three seconds (a tap closes it); the bar carries it after that.
 * The turn window repeats the bar's chips (not pressable) because the window covers the bar.
 * Our own drawing: CascadeDS has no game event bar.
 */

import { useEffect, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "@empac/cascadeds";
import { IconX } from "@tabler/icons-react";
import type { DuelEventView, DuelHintView, DuelInPlay, DuelPicture } from "@/lib/originals/duel/view";
import { EVENT_LOOK, WEATHER_CHIP } from "./duelLook";
import { TrainerArt } from "./TrainerArt";

/** An event's tile: its icon on its color, or the trainer's picture for their own event. */
export function EventTile({ event, picture, size, next = false }: { event: DuelEventView; picture: DuelPicture | null; size: "sm" | "lg"; next?: boolean }) {
  if (event.kind === "signature" && picture) return <TrainerArt picture={picture} shape="tile" className={`duel-evtile duel-evtile--${size} duel-evtile--face`} />;
  const look = EVENT_LOOK[event.kind];
  const Glyph = look.icon;
  return (
    <span className={`duel-evtile duel-evtile--${size}${next ? " duel-evtile--next" : ""}`} style={next ? undefined : { background: look.bg }} aria-hidden="true">
      <Glyph size={size === "lg" ? 30 : 15} stroke={2} />
    </span>
  );
}

/** This turn's line: Professor's play, what the event did instead when it did nothing, or its short line. */
export function eventNowText(event: DuelEventView, outcome: string | null, hint: DuelHintView | null): string {
  if (event.kind === "advice" && hint) return hint.text;
  return outcome ?? event.short;
}

const isWeather = (k: DuelEventView["kind"]): k is "rain" | "sun" | "sand" => k === "rain" || k === "sun" || k === "sand";
export const turnsLeft = (n: number) => `${n} ${n === 1 ? "turn" : "turns"} left`;

/** Which notice to show: this turn's event, the weather that's on, or next turn's event. */
export type NoticeWhich = "now" | "weather" | "next";

/** The weather's tile (its event's icon and color). */
export function WeatherTile({ kind, size }: { kind: "rain" | "sun" | "sand"; size: "sm" | "lg" }) {
  const Glyph = WEATHER_CHIP[kind].icon;
  return <span className={`duel-evtile duel-evtile--${size}`} style={{ background: EVENT_LOOK[kind].bg }} aria-hidden="true"><Glyph size={size === "lg" ? 30 : 15} stroke={2} /></span>;
}

export function DuelEventsBar({ turn, event, forecast, weather, outcome, hint, picture, staging = false, onShow, turnRef, inWindow = false }: {
  turn: number;
  event: DuelEventView | null;
  forecast: DuelEventView | null;
  weather: DuelInPlay["weather"];
  outcome: string | null;
  hint: DuelHintView | null;
  picture: DuelPicture | null;
  /** The exchange is still playing: next turn's event waits until it's done. */
  staging?: boolean;
  /** Shows an event's notice again (the bar's chips are buttons; the window's copy isn't). */
  onShow?: (which: NoticeWhich) => void;
  turnRef?: Ref<HTMLSpanElement>;
  /** The copy at the top of the turn window. */
  inWindow?: boolean;
}) {
  const next = staging ? null : forecast;
  // The weather chip covers a weather event that started this turn (one chip, with its turns left).
  // In the turn window this turn's event has its own card above the chips, so it isn't repeated.
  const startedNow = !!event && isWeather(event.kind) && weather?.kind === event.kind;
  const eventChip = event && !startedNow && !inWindow ? event : null;
  const showWeather = !!weather && !(inWindow && startedNow);
  const chip = (which: NoticeWhich, className: string, label: string, children: ReactNode) =>
    onShow && !inWindow ? (
      <button type="button" className={`duel-ev ${className}`} onClick={() => onShow(which)} aria-label={label}>{children}</button>
    ) : (
      <span className={`duel-ev ${className}`}><span aria-hidden="true" className="duel-ev__in">{children}</span><span className="sr-only">{label}</span></span>
    );
  const w = weather && showWeather ? WEATHER_CHIP[weather.kind] : null;
  if (inWindow && !w && !eventChip && !next) return null;
  return (
    <div className={`duel-evbar${inWindow ? " duel-evbar--window" : ""}`} role="group" aria-label="Events">
      {!inWindow && <span className="duel-evbar__turn" ref={turnRef} tabIndex={-1}>{turn > 0 ? `Turn ${turn}` : "Today's six"}</span>}
      {weather && w && (
        chip("weather", "duel-ev--now", `${w.word}: ${w.line}, ${turnsLeft(weather.turnsLeft)}.`, (
          <>
            <WeatherTile kind={weather.kind} size="sm" />
            <span>{w.word}</span>
            <small>{turnsLeft(weather.turnsLeft)}</small>
          </>
        ))
      )}
      {eventChip && (
        chip("now", "duel-ev--now", `This turn: ${eventChip.title}. ${eventNowText(eventChip, outcome, hint)}`, (
          <>
            <EventTile event={eventChip} picture={picture} size="sm" />
            <span>{eventChip.title}</span>
          </>
        ))
      )}
      {next && (
        chip("next", "duel-ev--next", `Next turn: ${next.title}. ${next.short}`, (
          <>
            <EventTile event={next} picture={picture} size="sm" next />
            <span><span className="duel-ev__k">Next</span> {next.title}</span>
          </>
        ))
      )}
    </div>
  );
}

/** This turn's event at the top of the turn window: its tile, title and what it does, for as long as the window is open. */
export function DuelEventCard({ event, text, picture = null }: { event: DuelEventView; text: string; picture?: DuelPicture | null }) {
  return (
    <div className="duel-evcard" role="group" aria-label="This turn's event">
      <EventTile event={event} picture={picture} size="lg" />
      <span className="duel-evcard__text">
        <small>This turn</small>
        <b>{event.title}</b>
        <span>{text}</span>
      </span>
    </div>
  );
}

/**
 * An event's notice at the top of the screen, opened from its chip in the events bar. It stays until
 * closed: the X, a tap on it, or Escape. Portaled to the page, so it sits above the arena.
 */
export function DuelNotice({ tile, kicker, title, text, next = false, onDone }: { tile: ReactNode; kicker: string; title: string; text: string; next?: boolean; onDone: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={`duel-notice${next ? " duel-notice--next" : ""}`} role="status" onClick={onDone}>
      {tile}
      <span className="duel-notice__text">
        <small>{kicker}</small>
        <b>{title}</b>
        <span>{text}</span>
      </span>
      <IconButton variant="tertiary" size="small" className="duel-notice__close" aria-label="Close" onClick={(e) => { e.stopPropagation(); onDone(); }}>
        <IconX size={18} stroke={2} aria-hidden="true" />
      </IconButton>
    </div>,
    document.body,
  );
}
