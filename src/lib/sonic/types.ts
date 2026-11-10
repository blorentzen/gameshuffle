/**
 * Types for the Sonic Racing: CrossWorlds randomizer. Client-safe, no data.
 */

/** The five stat types. Every racer and every machine has one; they don't have to match. */
export type SonicStat = "speed" | "acceleration" | "handling" | "power" | "boost";

/**
 * How something is had: in the game from the start, earned by playing (Donpa Tickets, Race Park, Rival Duel),
 * a free update, or paid (a DLC pack, a season pass, an edition or pre-order bonus).
 */
export type SonicAccess = "start" | "unlock" | "free" | "paid";

/** The paid packs and bonuses, so the randomizer can use only the ones a player owns. */
export type SonicPack =
  | "prime" | "werehog" | "minecraft" | "spongebob" | "pacman" | "megaman" | "tmnt" | "avatar"
  | "godzilla" | "sp2-bonus" | "super-shadow";

export interface SonicRacer {
  name: string;
  type: SonicStat;
  access: SonicAccess;
  /** The pack a paid racer comes in. */
  pack?: SonicPack;
  /** A guest racer's home series ("Persona"). Sonic characters leave it out. */
  guest?: string;
  /** Super Sonic and Super Shadow: Grand Prix only. */
  super?: boolean;
}

export interface SonicMachine {
  name: string;
  type: SonicStat;
  access: SonicAccess;
  pack?: SonicPack;
}

export interface SonicGadget {
  name: string;
  /** Slots it takes on the Gadget Plate. */
  slots: 1 | 2 | 3;
  /** The game's group ("Ring Gain", "Advanced Kit"). */
  category: string;
  /** A kit: several effects in one 3-slot gadget. */
  kit: boolean;
}

export interface SonicTrack {
  name: string;
  pack?: SonicPack;
}

export interface SonicCup {
  name: string;
  tracks: [string, string, string];
  /** Packs every track in it needs (the CrossOver Grand Prix). */
  packs?: SonicPack[];
}

export interface SonicPlate {
  id: string;
  label: string;
  /** Slots on the plate (3x2 at most). */
  slots: number;
  /** The Grand Master Plate's seventh slot: one 1-slot gadget with a stronger effect. */
  superSlot: boolean;
}

export interface SonicGame {
  slug: string;
  label: string;
  racers: SonicRacer[];
  machines: SonicMachine[];
  gadgets: SonicGadget[];
  tracks: SonicTrack[];
  crossWorlds: string[];
  cups: SonicCup[];
  stats: { id: SonicStat; label: string; color: string }[];
  packs: { id: SonicPack; label: string; what: string }[];
  plates: SonicPlate[];
}
