"use client";

/**
 * A villain team blocking the road (road encounters, picks 2026-10-24,
 * https://claude.ai/artifact/GRHU4zVKU8TjMpu4dQ9Kat): their picture (the team's own card art), what
 * they took and what beating them gives back, and one button to battle them. It stands where Continue
 * would: the region page's path, the front page's road, the Daily Duel page's road module and a
 * finished duel. The one boxed thing in its section (the section's main action).
 */

import { useRouter } from "next/navigation";
import { Button } from "@empac/cascadeds";
import { IconSwords } from "@tabler/icons-react";
import type { RoadEncounterView } from "@/lib/originals/duel/roadView";
import { TrainerArt } from "../TrainerArt";
import { EVENTS, track } from "@/lib/analytics/events";
import "@/styles/road-encounter.css";

/** "Team Rocket is blocking the road", "Giovanni and Team Rocket are blocking the road". */
export const encounterTitle = (e: RoadEncounterView) => (e.name === e.villain ? `${e.villain} is blocking the road` : `${e.name} and ${e.villain} are blocking the road`);

/** What's at stake, in one sentence. */
export function encounterLine(e: RoadEncounterView): string {
  const to = `carry on to ${e.blocks.label}`;
  if (e.swiped > 0) return `They swiped ${e.swiped} of your tokens. Beat them to win them back${e.reward ? `, plus ${e.reward} more,` : ""} and ${to}.`;
  return e.reward ? `Beat them for ${e.reward} tokens and ${to}.` : `Beat them to ${to}.`;
}

export const battleLabel = (e: RoadEncounterView) => `Battle ${e.name === e.villain ? e.villain : e.name}`;

/** `flat` drops the panel, for a place that's already a surface (the Daily Duel page's navy road module). */
export function RoadEncounterCard({ e, from, headingLevel = 3, flat = false }: { e: RoadEncounterView; from: string; headingLevel?: 2 | 3; flat?: boolean }) {
  const router = useRouter();
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={`road-enc${flat ? " road-enc--flat" : ""}`} role="group" aria-label={encounterTitle(e)}>
      <span className="road-enc__art" aria-hidden="true">
        {e.picture ? <TrainerArt picture={e.picture} shape="tile" /> : <span className="road-enc__initial">{e.villain.charAt(0)}</span>}
      </span>
      <div className="road-enc__body">
        <p className="road-enc__kicker">{e.kind === "set" && e.place ? e.place : "On your path"}</p>
        <H className="road-enc__title">{encounterTitle(e)}</H>
        <p className="road-enc__line">{encounterLine(e)}</p>
      </div>
      <Button variant="primary" iconBefore={IconSwords} className="road-enc__go"
        onClick={() => { track(EVENTS.roadEncounterClicked, { from, kind: e.kind }); router.push(e.href); }}>
        {battleLabel(e)}
      </Button>
    </div>
  );
}
