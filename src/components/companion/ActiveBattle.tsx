"use client";

/**
 * The "battle line" — both players' active Pokémon side by side
 * with the shared coin + dice utilities sandwiched between them.
 *
 * This row is where the moment-to-moment game state lives — damage
 * adjustments, coin flips for Burn / Sleep, dice rolls for one-off
 * effects — so collapsing the two actives into one horizontal strip
 * cuts wasted vertical space and puts every active interaction
 * within thumb-reach of either player.
 *
 * No rotation: this layout is "share-mode native". Per the design
 * call, everything reads right-side-up regardless of which side of
 * the device the player is sitting on. The mobile "flip between P1
 * and P2 view" and the future dual-device path layer in later.
 */

import { Slot } from "./Slot";
import { CoinFlip } from "./CoinFlip";
import { Dice } from "./Dice";

export function ActiveBattle() {
  return (
    <div className="companion-active-battle">
      <div className="companion-active-battle__slot companion-active-battle__slot--p2">
        <Slot player="p2" position="active" emphasis="active" />
      </div>

      <div className="companion-active-battle__utilities">
        <CoinFlip />
        <Dice />
      </div>

      <div className="companion-active-battle__slot companion-active-battle__slot--p1">
        <Slot player="p1" position="active" emphasis="active" />
      </div>
    </div>
  );
}
