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
}
