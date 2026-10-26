"use client";

/**
 * The moment before a battle (battle intro picks 2026-10-25, https://claude.ai/artifact/WJL6VAkQZjVZKQrtWoTVZw,
 * version A, the versus band): after Battle now, while the duel loads, the trainer's band sweeps in with
 * their picture, VS, then your band, their name, title and the cards they bring. About two seconds;
 * Replay battle gets a short one. Trainer Road and the Daily Duel both use it.
 *
 * Britton's note: text and pictures must never overlap. So nothing here is layered: the trainer's band
 * is a grid with the words in one column and the picture in the other (stacked on phones), VS has a row
 * of its own between the bands, and your band sits under it. No lines of dialogue (the story stays off
 * battle screens), no sound. Tap, Escape, Space or Enter skips; reduced motion shows it still, briefly.
 * Our own drawing: CascadeDS has no splash overlay; the Skip button is CascadeDS.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@empac/cascadeds";
import type { DuelTier } from "@/lib/originals/duel/types";
import type { DuelPicture } from "@/lib/originals/duel/view";
import { TrainerArt } from "./TrainerArt";
import "@/styles/duel-versus.css";

/** A color for each kind of battle (picks: Gyms gold, villain teams red, the Elite Four purple, Champions gold with rays). */
export type VersusTone = "gym" | "villain" | "elite" | "champion";

export interface VersusInfo {
  /** The kind of battle ("Gym battle", "Daily Duel #4", "Blocking the road"). */
  kicker: string;
  name: string;
  title: string;
  /** How many cards they bring. */
  cards: number;
  picture: DuelPicture | null;
  tone: VersusTone;
  you: { name: string; line: string };
}

export function versusTone(tier: DuelTier): VersusTone {
  if (tier === "champion") return "champion";
  if (tier === "elite") return "elite";
  if (tier === "boss" || tier === "grunt" || tier === "admin") return "villain";
  return "gym";
}

/** The kind of battle, from the trainer's tier (the Daily Duel passes its own). */
export function versusKicker(tier: DuelTier, blocking = false): string {
  if (blocking) return "Blocking the road";
  switch (tier) {
    case "gym": return "Gym battle";
    case "elite": return "Elite Four";
    case "champion": return "Champion battle";
    case "rival": return "Rival battle";
    case "boss": return "Boss battle";
    default: return "Villain team";
  }
}

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Shows `info` until it's done or skipped; `short` for a replay. Nothing renders while `info` is null. */
export function DuelVersus({ info, short = false, onDone }: { info: VersusInfo | null; short?: boolean; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  // A new intro starts fresh (state adjusted while rendering, not in an effect).
  const [shown, setShown] = useState(info);
  if (info !== shown) { setShown(info); setLeaving(false); }
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => {
    if (!info) return;
    const still = reduced();
    const hold = still ? 1100 : short ? 1100 : 2300;
    const t1 = window.setTimeout(() => setLeaving(true), hold);
    const t2 = window.setTimeout(() => done.current(), hold + 260);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === " " || e.key === "Enter") { e.preventDefault(); done.current(); } };
    window.addEventListener("keydown", key);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".duel-vs__skip button, button.duel-vs__skip")?.focus({ preventScroll: true }));
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.removeEventListener("keydown", key); };
  }, [info, short]);
  if (!info || typeof document === "undefined") return null;
  const label = `${info.kicker}: ${info.name}, ${info.title}. ${info.cards} ${info.cards === 1 ? "card" : "cards"}.`;
  return createPortal(
    <div className={`duel-vs duel-vs--${info.tone}${short ? " duel-vs--short" : ""}${leaving ? " is-leaving" : ""}`} role="dialog" aria-modal="true" aria-label={label} onClick={() => done.current()}>
      {info.tone === "champion" && <span className="duel-vs__rays" aria-hidden="true" />}
      <div className="duel-vs__stage">
        <div className="duel-vs__foe">
          <div className="duel-vs__foein">
            <div className="duel-vs__words">
              <p className="duel-vs__kicker">{info.kicker}</p>
              <p className="duel-vs__name">{info.name}</p>
              <p className="duel-vs__title">{info.title}</p>
              <p className="duel-vs__cards" aria-hidden="true">
                {Array.from({ length: Math.min(info.cards, 6) }, (_, i) => <span key={i} className="duel-vs__cb" style={{ animationDelay: `${0.75 + i * 0.07}s` }} />)}
                <span className="duel-vs__count">{info.cards} {info.cards === 1 ? "card" : "cards"}</span>
              </p>
            </div>
            <div className="duel-vs__pic">{info.picture && <TrainerArt picture={info.picture} shape="banner" className="duel-vs__art" eager />}</div>
          </div>
        </div>
        <p className="duel-vs__vs" aria-hidden="true">VS</p>
        <div className="duel-vs__you">
          <div className="duel-vs__youin">
            <span className="duel-vs__badge" aria-hidden="true">{info.you.name.trim().charAt(0).toUpperCase() || "Y"}</span>
            <span className="duel-vs__youwords"><b>{info.you.name}</b><span>{info.you.line}</span></span>
          </div>
        </div>
      </div>
      <Button className="duel-vs__skip" variant="ghost" size="small" onClick={(e) => { e.stopPropagation(); done.current(); }}>Skip</Button>
    </div>,
    document.body,
  );
}
