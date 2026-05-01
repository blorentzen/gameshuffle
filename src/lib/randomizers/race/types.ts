/**
 * Race randomizer types — shared shapes for the race_randomizer module.
 *
 * Per gs-track-item-randomization-phase-a-spec.md §4.2.
 */

export type RaceGame = "mk8dx" | "mkworld";

export interface Track {
  /** Stable cup-prefixed slug, e.g. 'propeller-sky-high-sundae'. Cup
   *  prefix disambiguates the same name appearing in multiple cups
   *  (Mario Circuit appears in Flower, Shell, Boomerang; Rainbow Road
   *  in Special, Lightning, Triforce, Moon, Spiny). */
  id: string;
  /** Display name as shown to viewers. */
  name: string;
  /** Cup grouping, used for visual grouping in the configure UI. */
  cup: string;
  /** Full CDN URL for the track artwork. */
  image: string;
  game: RaceGame;
}

export interface ItemPreset {
  id: string;
  name: string;
  description: string;
  game: RaceGame;
}
