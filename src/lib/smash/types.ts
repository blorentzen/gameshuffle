/**
 * Smash data model. Client-safe. The randomizer, cards (deck family "smash")
 * and night plan build on this; generic draws come from src/lib/party/roll.
 */

/** DLC packs, as a person ticks what they own. */
export type SmashPack = "piranha" | "fp1" | "fp2";

export interface SmashFighter {
  name: string;
  /** Art path under the asset base (rendered once artReady). */
  img: string;
  series: string;
  pack?: SmashPack;
  /** Echo Fighter of this original (merged or listed separately). */
  echoOf?: string;
  /** Mii Fighter: needs a Mii made first. */
  mii?: boolean;
  /** The costumes by their colors, in the game's order (Melee: 4 to 6). Unset = 8 numbered costumes (Ultimate). */
  costumes?: string[];
  /** Art per costume, same order as `costumes` (Melee's select screen portraits). Unset = `img` for every costume. */
  costumeImgs?: string[];
}

export type StageStatus = "starter" | "counterpick" | "sometimes" | "banned";

export interface SmashStage {
  id: string;
  name: string;
  img: string;
  series: string;
  pack?: SmashPack;
  /** Common competitive status (organizers set their own list). */
  status: StageStatus;
  /** The game it first appeared in (SSB, SSBM, SSBB, SSB4, SSBU). */
  origin: string;
}

export interface SmashMode {
  id: string;
  label: string;
  blurb: string;
  minPlayers: number;
  maxPlayers: number;
  /** Rough minutes for one sitting. */
  minutes: number;
  options?: { label: string; values: string[] };
}

export interface CustomSmashOption { id: string; label: string; values: string[] }

/** A starter list an organizer can pick in one go (the tournament rules editor). */
export interface StarterPreset { id: string; label: string; stages: string[] }

export interface SmashGame {
  slug: string;
  label: string;
  shortLabel: string;
  assetBase: string;
  artReady: boolean;
  packs: { id: SmashPack; label: string }[];
  series: Record<string, string>;
  fighters: SmashFighter[];
  stages: SmashStage[];
  modes: SmashMode[];
  customSmash: CustomSmashOption[];
  /** Rough minutes per match, for sizing a night. */
  minutesPerMatch: number;
  /**
   * What the game's own rules allow, where it differs from Ultimate (Melee, 2026-11-11): unset = Ultimate's.
   *   competitive  the common competitive ruleset (Melee: 4 stocks, 8 minutes, items off)
   *   stamina      Stamina is a regular battle type (Ultimate yes; Melee only has it in Special Melee)
   *   finalSmash   the game has Final Smashes
   *   stageForms   stages have Battlefield and Omega forms and a hazards switch
   *   squadStrike  Squad Strike exists
   */
  rules?: { competitive: { kind: "stock" | "time" | "stamina"; stocks: number | null; minutes: number | null; items: "off" | "low" | "medium" | "high" | "very high"; finalSmashMeter: boolean }; stamina: boolean; finalSmash: boolean; stageForms: boolean; squadStrike: boolean };
  /** Players in one match (Ultimate 8, Melee 4). Unset = 8. */
  maxPlayers?: number;
  /** Starter lists organizers pick from (unset = Ultimate's three and five). */
  starterPresets?: StarterPreset[];
}
