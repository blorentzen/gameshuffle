/**
 * Track codes to show as an example where a track goes in, per war game (Mario Kart World's and Wii's own; Mario Kart
 * 8 Deluxe's as they always were). Its own small file so client screens can use it without the track lists.
 */

import type { WarGame } from "./rules";

export const CODE_EXAMPLE: Record<WarGame, { one: string; few: string }> = {
  mk8dx: { one: "SSC", few: "SSC, rMMM, bNYM" },
  mkworld: { one: "PS", few: "MBC, DKS, rDH" },
  mkwii: { one: "LC", few: "LC, rBC3, DKS" },
};
