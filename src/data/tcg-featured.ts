/**
 * Curated marquee card sets for public promotional surfaces (client-safe).
 *
 * These are SPECIFIC, hand-picked Scrydex card ids tied to decks we actively
 * feature — not a bulk/expansion pull. Public pages read these ids from the
 * already-populated `tcg_cards` table (read-only, 0 credits). To warm/refresh
 * them, run: `npx tsx -r ./scripts/server-only-shim.cjs scripts/populate-tcg-featured.ts`
 *
 * Ids use Scrydex set codes. Destined Rivals = `sv10` (verified: the deck's
 * "DRI {n}" community code maps to `sv10-{n}`). Cheap playable prints only
 * (Double Rares / base prints) — never the Special Illustration / alt-art ids.
 */

/** Team Rocket (Mewtwo ex) deck — the FULL card list (heroes first so the
 *  4-card fan leads with the marquee cards). Destined Rivals = sv10; the
 *  neutral trainers are Ascended Heroes = me2pt5. Basic energy is omitted
 *  (not a showcase card). All verified against the Scrydex catalog. */
export const TEAM_ROCKET_MARQUEE: string[] = [
  // Hero cards (drive the fan / featured imagery)
  "sv10-81", // Team Rocket's Mewtwo ex (main)
  "sv10-150", // Team Rocket's Persian ex
  "sv10-82", // Team Rocket's Wobbuffet
  "sv10-87", // Team Rocket's Mimikyu
  // Rest of the Pokémon
  "sv10-127", // Team Rocket's Murkrow
  "sv10-149", // Team Rocket's Meowth
  "sv10-20", // Team Rocket's Spidops
  "sv10-19", // Team Rocket's Tarountula
  // Rocket Trainers (Destined Rivals)
  "sv10-171", // Team Rocket's Ariana
  "sv10-174", // Team Rocket's Giovanni
  "sv10-177", // Team Rocket's Proton
  "sv10-176", // Team Rocket's Petrel
  "sv10-175", // Team Rocket's Great Ball
  "sv10-178", // Team Rocket's Transceiver
  "sv10-173", // Team Rocket's Factory (Stadium)
  "sv10-180", // Team Rocket's Watchtower (Stadium)
  "sv10-182", // Team Rocket's Energy
  // Neutral staples (Ascended Heroes)
  "me2pt5-183", // Boss's Orders
  "me2pt5-213", // Ultra Ball
  "me2pt5-184", // Buddy-Buddy Poffin
  "me2pt5-196", // Night Stretcher
];

/** The deck a marquee set links back to, for the shop/decks surfaces. */
export const TEAM_ROCKET_DECK_SLUG = "team-rocket-deck-standard-2026";

/** Cynthia's Garchomp ex — Destined Rivals (sv10) core + Mega Evolution (me1),
 *  Perfect Order (me3), White Flare (rsv10pt5) support. Heroes first. */
const CYNTHIA_GARCHOMP_MARQUEE: string[] = [
  "sv10-104", // Cynthia's Garchomp ex (main)
  "sv10-8", // Cynthia's Roserade
  "sv10-129", // Cynthia's Spiritomb
  "sv10-10", // Shaymin
  "sv10-102", // Cynthia's Gible
  "sv10-103", // Cynthia's Gabite
  "sv10-7", // Cynthia's Roselia
  "sv10-162", // Cynthia's Power Weight
  "me1-119", // Lillie's Determination
  "me1-116", // Fighting Gong
  "me1-124", // Premium Power Pro
  "me3-76", // Judge
  "me3-81", // Poké Pad
  "rsv10pt5-84", // Hilda
  "sv10-180", // Team Rocket's Watchtower (Stadium)
  "me2pt5-183", // Boss's Orders
  "me2pt5-184", // Buddy-Buddy Poffin
  "me2pt5-196", // Night Stretcher
  "me3-87", // Rocky Fighting Energy
];

/** Delphox (Fire) — Chaos Rising (me4) line + Perfect Order (me3) engine. */
const DELPHOX_MARQUEE: string[] = [
  "me4-13", // Delphox (main)
  "me4-12", // Braixen
  "me4-11", // Fennekin
  "me3-79", // Naveen
  "me3-76", // Judge
  "me3-80", // Poké Ball
  "me3-81", // Poké Pad
  "me3-82", // Pokémon Catcher
  "me3-83", // Potion
  "me2pt5-184", // Buddy-Buddy Poffin
  "me2pt5-183", // Boss's Orders
  "me2pt5-196", // Night Stretcher
];

/** Team Rocket Spread (Meme) — the damage-counter combo, all Destined Rivals
 *  (sv10) + Ascended Heroes (me2pt5) staples. */
const SPREAD_MEME_MARQUEE: string[] = [
  "sv10-122", // Team Rocket's Crobat ex (main)
  "sv10-150", // Team Rocket's Persian ex
  "sv10-89", // Team Rocket's Orbeetle
  "sv10-82", // Team Rocket's Wobbuffet
  "sv10-121", // Team Rocket's Golbat
  "sv10-120", // Team Rocket's Zubat
  "sv10-15", // Team Rocket's Blipbug
  "sv10-88", // Team Rocket's Dottler
  "sv10-149", // Team Rocket's Meowth
  "sv10-171", // Team Rocket's Ariana
  "sv10-174", // Team Rocket's Giovanni
  "sv10-177", // Team Rocket's Proton
  "sv10-175", // Team Rocket's Great Ball
  "sv10-173", // Team Rocket's Factory (Stadium)
  "sv10-182", // Team Rocket's Energy
  "me2pt5-184", // Buddy-Buddy Poffin
  "me2pt5-213", // Ultra Ball
  "me2pt5-196", // Night Stretcher
];

/** Fighting (Aggro, Family) — Perfect Order (me3) + Ascended Heroes (me2pt5). */
const FIGHTING_MARQUEE: string[] = [
  "me3-46", // Hawlucha (main)
  "me2pt5-104", // Medicham
  "me2pt5-105", // Lunatone
  "me2pt5-106", // Solrock
  "me2pt5-112", // Riolu
  "me2pt5-103", // Meditite
  "me3-79", // Naveen
  "me3-76", // Judge
  "me3-80", // Poké Ball
  "me3-81", // Poké Pad
  "me3-82", // Pokémon Catcher
  "me3-85", // Tarragon
  "me3-83", // Potion
  "me3-84", // Rosa's Encouragement
  "me2pt5-183", // Boss's Orders
  "me2pt5-196", // Night Stretcher
];

/** N's Zoroark (Themed) — all Ascended Heroes (me2pt5). */
const NS_ZOROARK_MARQUEE: string[] = [
  "me2pt5-137", // N's Zoroark ex (main)
  "me2pt5-154", // N's Reshiram
  "me2pt5-155", // N's Zekrom
  "me2pt5-33", // N's Darmanitan
  "me2pt5-136", // N's Zorua
  "me2pt5-32", // N's Darumaka
  "me2pt5-192", // Lillie's Determination
  "me2pt5-183", // Boss's Orders
  "me2pt5-213", // Ultra Ball
  "me2pt5-196", // Night Stretcher
  "me2pt5-195", // N's PP Up
];

/** Ethan's Ho-Oh (Themed) — Destined Rivals (sv10) + Ascended Heroes (me2pt5). */
const ETHANS_HOOH_MARQUEE: string[] = [
  "sv10-39", // Ethan's Ho-Oh ex (main)
  "sv10-34", // Ethan's Typhlosion
  "sv10-36", // Ethan's Magcargo
  "sv10-33", // Ethan's Quilava
  "sv10-32", // Ethan's Cyndaquil
  "sv10-35", // Ethan's Slugma
  "sv10-165", // Ethan's Adventure
  "me2pt5-192", // Lillie's Determination
  "me2pt5-183", // Boss's Orders
  "me2pt5-213", // Ultra Ball
  "me2pt5-196", // Night Stretcher
];

/** Coin-Flip Chaos (Meme) — Perfect Order (me3) + Ascended Heroes (me2pt5). */
const COIN_FLIP_MARQUEE: string[] = [
  "me3-28", // Luxray (main)
  "me3-45", // Tyrantrum
  "me2pt5-64", // Heliolisk
  "sv10-149", // Team Rocket's Meowth
  "me3-26", // Shinx
  "me3-27", // Luxio
  "me3-44", // Tyrunt
  "me5-66", // Pikipek
  "me2pt5-192", // Lillie's Determination
  "me2pt5-183", // Boss's Orders
  "me2pt5-213", // Ultra Ball
  "me2pt5-196", // Night Stretcher
];

/** Single-Prize Fire Swarm (Meme) — Destined Rivals (sv10) + Ascended Heroes. */
const SINGLE_PRIZE_MARQUEE: string[] = [
  "sv10-34", // Ethan's Typhlosion (main)
  "me2pt5-35", // Salazzle
  "me2pt5-33", // N's Darmanitan
  "sv10-36", // Ethan's Magcargo
  "sv10-32", // Ethan's Cyndaquil
  "sv10-33", // Ethan's Quilava
  "me2pt5-32", // N's Darumaka
  "sv10-35", // Ethan's Slugma
  "me2pt5-34", // Salandit
  "me2pt5-192", // Lillie's Determination
  "me2pt5-183", // Boss's Orders
  "me2pt5-213", // Ultra Ball
  "me2pt5-196", // Night Stretcher
];

/** Water family deck — Destined Rivals (sv10) line + Ascended Heroes engine. */
const WATER_FAMILY_MARQUEE: string[] = [
  "sv10-58", // Floatzel (main)
  "sv10-57", // Buizel
  "me2pt5-192", // Lillie's Determination
  "me2pt5-198", // Poké Pad
  "me2pt5-213", // Ultra Ball
  "me2pt5-196", // Night Stretcher
];

/** Grass family deck — all Ascended Heroes (me2pt5) Wurmple lines. */
const GRASS_FAMILY_MARQUEE: string[] = [
  "me2pt5-13", // Beautifly (main)
  "me2pt5-15", // Dustox
  "me2pt5-11", // Wurmple
  "me2pt5-12", // Silcoon
  "me2pt5-14", // Cascoon
  "me2pt5-192", // Lillie's Determination
  "me2pt5-184", // Buddy-Buddy Poffin
  "me2pt5-198", // Poké Pad
  "me2pt5-213", // Ultra Ball
  "me2pt5-196", // Night Stretcher
];

/** Deck slug → curated marquee card ids. A deck detail page shows this strip
 *  when its slug has an entry. Grows as more decks get real card art. */
export const MARQUEE_BY_DECK: Record<string, string[]> = {
  [TEAM_ROCKET_DECK_SLUG]: TEAM_ROCKET_MARQUEE,
  "cynthias-garchomp-deck-list-standard-2026": CYNTHIA_GARCHOMP_MARQUEE,
  "delphox-beginner-deck-standard-2026": DELPHOX_MARQUEE,
  "spread-meme-deck-standard-2026": SPREAD_MEME_MARQUEE,
  "fighting-beginner-deck-standard-2026": FIGHTING_MARQUEE,
  "ns-zoroark-deck-standard-2026": NS_ZOROARK_MARQUEE,
  "ethans-ho-oh-deck-standard-2026": ETHANS_HOOH_MARQUEE,
  "coin-flip-meme-deck-standard-2026": COIN_FLIP_MARQUEE,
  "single-prize-underdog-deck-standard-2026": SINGLE_PRIZE_MARQUEE,
  "water-tempo-family-deck-standard-2026": WATER_FAMILY_MARQUEE,
  "grass-status-family-deck-standard-2026": GRASS_FAMILY_MARQUEE,
};

/** Every curated id across all featured sets — what the populate script warms. */
export const ALL_FEATURED_CARD_IDS: string[] = Array.from(
  new Set(Object.values(MARQUEE_BY_DECK).flat()),
);
