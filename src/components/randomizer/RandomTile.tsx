/**
 * What an unrolled card shows, in each game's own "random" look instead of
 * Mario Kart's item box (which stays on the Mario Kart randomizers):
 *   kirby     Kirby Air Riders' Random tile on the Stadium select screen
 *   smash     Smash Ultimate's Random fighter "?" (white, dark outline)
 *   splatoon  Splatoon 3's random weapon "?" (bright green)
 *   party     a ? Block (gold, white "?"), the Mario series mystery box
 * Drawn in CSS so it stays sharp at any size (the in-game icons are 75 to
 * 160px). Pass it to KartSlot's `empty`.
 */
export type RandomLook = "kirby" | "smash" | "splatoon" | "party";

export function RandomTile({ look }: { look: RandomLook }) {
  return <span className={`random-tile random-tile--${look}`} aria-hidden>?</span>;
}
