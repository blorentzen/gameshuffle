/**
 * Splatoon data model. Client-safe. The randomizer builds on this; generic
 * draws come from src/lib/party/roll.
 */

export type WeaponClass =
  | "Shooter" | "Roller" | "Charger" | "Slosher" | "Splatling" | "Dualies"
  | "Brella" | "Blaster" | "Brush" | "Stringer" | "Splatana";

export interface SplatWeapon {
  /** The kit's in-game name (each kit is its own entry). */
  name: string;
  cls: WeaponClass;
  sub: string;
  special: string;
  /** Art path under the asset base (rendered once artReady). */
  img: string;
  /** When it arrived (Launch, a season name). */
  season: string;
  /** A replica shares this weapon's kit (Hero Shot Replica and so on). */
  replicaOf?: string;
}

export interface SplatStage { name: string; added: string }

export type SplatModeKind = "turf" | "ranked";
export interface SplatMode { id: string; name: string; kind: SplatModeKind; blurb: string }

export interface SplatoonGame {
  slug: string;
  label: string;
  assetBase: string;
  artReady: boolean;
  /** Class order and tile colours (used until art is in). */
  classes: { id: WeaponClass; label: string; color: string }[];
  weapons: SplatWeapon[];
  stages: SplatStage[];
  modes: SplatMode[];
  salmonStages: string[];
}
