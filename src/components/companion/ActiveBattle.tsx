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

import { useSession } from "@/lib/companion/SessionContext";
import { Slot } from "./Slot";
import { CoinFlip } from "./CoinFlip";
import { Dice } from "./Dice";
import { HelpButton } from "./HelpButton";
import { GameMenuButton } from "./GameMenuButton";

export function ActiveBattle() {
  // This phone's player sits at the bottom (P1, or P2 on the second phone of a shared game).
  const { bottom } = useSession();
  const top = bottom === "p1" ? "p2" : "p1";
  return (
    <div className="companion-active-battle">
      <div className="companion-active-battle__slot companion-active-battle__slot--top">
        <Slot player={top} position="active" emphasis="active" />
      </div>

      <div className="companion-active-battle__utilities">
        <GameMenuButton />
        <div className="companion-active-battle__tools">
          <CoinFlip />
          <Dice />
        </div>
        <HelpButton />
      </div>

      <div className="companion-active-battle__slot companion-active-battle__slot--bottom">
        <Slot player={bottom} position="active" emphasis="active" />
      </div>
    </div>
  );
}
