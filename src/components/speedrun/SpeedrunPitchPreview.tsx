"use client";

/** The pitch's picture: the Column over the game, with the mockups' made-up run (a still, no account needed). */

import { demoState } from "@/lib/speedrun/demo";
import { DEFAULT_LOOK } from "@/lib/speedrun/rules";
import { SpeedrunCanvas } from "./SpeedrunCanvas";

const STATE = demoState("mid");

export function SpeedrunPitchPreview() {
  return (
    <figure className="sr-preview">
      <div role="img" aria-label="The Column overlay over a Mario Kart 8 Deluxe run: every split with ahead and behind, the timer, PB, sum of best and attempt count">
        <div aria-hidden="true">
          <SpeedrunCanvas state={STATE} receivedAt={0} look={DEFAULT_LOOK} still backdrop />
        </div>
      </div>
      <figcaption>A made-up Mario Kart 8 Deluxe run, 48 Tracks.</figcaption>
    </figure>
  );
}
