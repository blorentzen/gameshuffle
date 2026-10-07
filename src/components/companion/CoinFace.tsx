"use client";

/**
 * Visual coin face — currently hard-coded to a Pokémon Mode look:
 * Poké Ball for side A (heads), Great Ball for side B (tails).
 *
 * This is intentionally placeholder polish for the beta. The
 * personalization plan (per-user uploads, per-mode galleries) will
 * route the styling through mode config + a future user preference
 * — at which point this component switches from hardcoded classes
 * to consuming a `CoinFaceConfig` from props.
 *
 * The face is our Poké Ball drawing (`PokeBall`, shared with the Pokémon
 * randomizers' empty slots). The element fills its parent (the modal or
 * the center-band button takes care of sizing).
 */

import type { CoinFlipEntry } from "@/lib/companion/types";
import { PokeBall } from "@/components/pokemon/PokeBall";

interface Props {
  side: CoinFlipEntry["side"];
}

export function CoinFace({ side }: Props) {
  return (
    <div
      className={`companion-coin-face companion-coin-face--${side}`}
      aria-hidden="true"
    >
      <PokeBall variant={side === "b" ? "great" : "poke"} className="companion-coin-face__ball" />
    </div>
  );
}
