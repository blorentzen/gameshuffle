import type { SmashFighter, SmashGame, SmashStage } from "@/lib/smash/types";

/**
 * Super Smash Bros. Melee (game space picks 2026-11-11, all as recommended). Checked 2026-11-11.
 *
 * Roster: the game's 25 select-screen fighters plus Sheik as her own pick (26). In the game Sheik is Zelda's other
 * form (pick Zelda and hold A), but the scene treats her as her own character (players main Sheik), so the randomizer
 * rolls her on her own and she wears Zelda's costume colors. Costumes are colors, 4 to 6 per fighter, in the game's
 * order (123 alternate costumes in all, SmashWiki "Alternate costume (SSBM)"); the select screen portraits below come
 * one per costume, which confirms each count.
 *
 * Stages: all 29 in versus. Competitive status is the singles list from SmashWiki's "Stage legality" (Melee section,
 * the Smash Back Room ruleset) and the start.gg ruleset GENESIS X2's Melee singles ran on (Rollback Rumble Ruleset):
 * starters Battlefield, Dream Land, Final Destination, Fountain of Dreams and Yoshi's Story, struck 1-2-1 for game 1,
 * and Pokémon Stadium a counterpick. Every other stage is banned at events (Brinstar, Corneria, Green Greens and the
 * rest are retired counterpicks). Some events run a modded "frozen" Pokémon Stadium as a starter with Final
 * Destination a counterpick, and doubles strikes Final Destination and Pokémon Stadium with Fountain of Dreams banned;
 * both are presets (`starterPresets`), and organizers edit their own list. Rules: 4 stocks, 8 minutes, items off.
 *
 * Art (scripts/pull-melee-art.ts, sources in scripts/data/melee-art.json), all in-game art from the game itself
 * (Nintendo, HAL Laboratory): the select screen's player-slot portrait for every costume (Super Mario Wiki), stage
 * views from the game's debug camera (SmashWiki), and the official group artwork for headers (Super Mario Wiki).
 * The game has no select screen portrait for Sheik, so she shows "Image coming soon".
 */

const ART = "/images/super-smash-bros-melee/";

/** One fighter: its art per costume is fighters/<slug>-<n>.webp. */
function f(name: string, slug: string, series: string, costumes: string[]): SmashFighter {
  return { name, img: `fighters/${slug}-1.webp`, series, costumes, costumeImgs: costumes.map((_, i) => `fighters/${slug}-${i + 1}.webp`) };
}

const FIGHTERS: SmashFighter[] = [
  f("Dr. Mario", "dr-mario", "smb", ["White", "Red", "Blue", "Green", "Black"]),
  f("Mario", "mario", "smb", ["Red", "Yellow", "Black", "Blue", "Green"]),
  f("Luigi", "luigi", "smb", ["Green", "White", "Blue", "Pink"]),
  f("Bowser", "bowser", "smb", ["Green", "Red", "Blue", "Black"]),
  f("Peach", "peach", "smb", ["Pink", "Yellow", "White", "Blue", "Green"]),
  f("Yoshi", "yoshi", "yoshi", ["Green", "Red", "Blue", "Yellow", "Pink", "Cyan"]),
  f("Donkey Kong", "donkey-kong", "dk", ["Brown", "Black", "Red", "Blue", "Green"]),
  f("Captain Falcon", "captain-falcon", "fz", ["Gray-blue", "Black", "Red", "White", "Green", "Blue"]),
  f("Ganondorf", "ganondorf", "loz", ["Brown", "Red", "Blue", "Green", "Purple"]),
  f("Falco", "falco", "fox", ["Tan", "Red", "Blue", "Green"]),
  f("Fox", "fox", "fox", ["White", "Red", "Blue", "Green"]),
  f("Ness", "ness", "eb", ["Red", "Yellow", "Blue", "Green"]),
  f("Ice Climbers", "ice-climbers", "ic", ["Blue", "Green", "Orange", "Red"]),
  f("Kirby", "kirby", "kirby", ["Pink", "Yellow", "Blue", "Red", "Green", "White"]),
  f("Samus", "samus", "metroid", ["Orange", "Pink", "Black", "Green", "Purple"]),
  f("Zelda", "zelda", "loz", ["Pink", "Red", "Blue", "Green", "White"]),
  // Zelda's other form: her own pick, in Zelda's costume colors, with no select screen portrait of her own.
  { name: "Sheik", img: "", series: "loz", costumes: ["Indigo", "Red", "Blue", "Green", "White"] },
  f("Link", "link", "loz", ["Green", "Red", "Blue", "Black", "White"]),
  f("Young Link", "young-link", "loz", ["Green", "Red", "Blue", "White", "Black"]),
  f("Pichu", "pichu", "pkmn", ["Yellow", "Red", "Blue", "Green"]),
  f("Pikachu", "pikachu", "pkmn", ["Yellow", "Red", "Blue", "Green"]),
  f("Jigglypuff", "jigglypuff", "pkmn", ["Pink", "Red", "Blue", "Green", "Yellow"]),
  f("Mewtwo", "mewtwo", "pkmn", ["Purple", "Red", "Blue", "Green"]),
  f("Mr. Game & Watch", "mr-game-and-watch", "gw", ["Black", "Red", "Blue", "Green"]),
  f("Marth", "marth", "fe", ["Navy", "Red", "Green", "Black", "White"]),
  f("Roy", "roy", "fe", ["Purple", "Red", "Blue", "Green", "Yellow"]),
];

const s = (id: string, name: string, series: string, status: SmashStage["status"], origin = "SSBM"): SmashStage =>
  ({ id, name, img: `stages/${id}.webp`, series, status, origin });

const STAGES: SmashStage[] = [
  // The legal six (singles): five starters and one counterpick.
  s("battlefield", "Battlefield", "ssb", "starter"),
  s("dream-land", "Dream Land", "kirby", "starter", "SSB"),
  s("final-destination", "Final Destination", "ssb", "starter"),
  s("fountain-of-dreams", "Fountain of Dreams", "kirby", "starter"),
  s("yoshis-story", "Yoshi's Story", "yoshi", "starter"),
  s("pokemon-stadium", "Pokémon Stadium", "pkmn", "counterpick"),
  // Everything else, for casual rolls.
  s("princess-peachs-castle", "Princess Peach's Castle", "smb", "banned"),
  s("rainbow-cruise", "Rainbow Cruise", "smb", "banned"),
  s("mushroom-kingdom", "Mushroom Kingdom", "smb", "banned"),
  s("mushroom-kingdom-ii", "Mushroom Kingdom II", "smb", "banned"),
  s("kongo-jungle", "Kongo Jungle", "dk", "banned"),
  s("jungle-japes", "Jungle Japes", "dk", "banned"),
  s("great-bay", "Great Bay", "loz", "banned"),
  s("temple", "Temple", "loz", "banned"),
  s("yoshis-island", "Yoshi's Island", "yoshi", "banned"),
  s("green-greens", "Green Greens", "kirby", "banned"),
  s("corneria", "Corneria", "fox", "banned"),
  s("venom", "Venom", "fox", "banned"),
  s("brinstar", "Brinstar", "metroid", "banned"),
  s("brinstar-depths", "Brinstar Depths", "metroid", "banned"),
  s("onett", "Onett", "eb", "banned"),
  s("fourside", "Fourside", "eb", "banned"),
  s("mute-city", "Mute City", "fz", "banned"),
  s("big-blue", "Big Blue", "fz", "banned"),
  s("poke-floats", "Poké Floats", "pkmn", "banned"),
  s("icicle-mountain", "Icicle Mountain", "ic", "banned"),
  s("flat-zone", "Flat Zone", "gw", "banned"),
  // Past Stages: the three from the first game.
  s("yoshis-island-n64", "Yoshi's Island (N64)", "yoshi", "banned", "SSB"),
  s("kongo-jungle-n64", "Kongo Jungle (N64)", "dk", "banned", "SSB"),
];

export const MELEE: SmashGame = {
  slug: "super-smash-bros-melee",
  label: "Super Smash Bros. Melee",
  shortLabel: "Melee",
  assetBase: ART,
  artReady: true,
  minutesPerMatch: 5,
  maxPlayers: 4,
  packs: [],
  series: {
    dk: "Donkey Kong", eb: "EarthBound", fe: "Fire Emblem", fox: "Star Fox", fz: "F-Zero", gw: "Game & Watch",
    ic: "Ice Climber", kirby: "Kirby", loz: "The Legend of Zelda", metroid: "Metroid", pkmn: "Pokémon",
    smb: "Super Mario", ssb: "Super Smash Bros.", yoshi: "Yoshi",
  },
  fighters: FIGHTERS,
  stages: STAGES,
  modes: [
    { id: "smash", label: "Melee", blurb: "Everyone on one stage. The main event.", minPlayers: 2, maxPlayers: 4, minutes: 5 },
    { id: "sudden-death", label: "Super Sudden Death", blurb: "Everyone starts at 300%.", minPlayers: 2, maxPlayers: 4, minutes: 4 },
    { id: "stamina", label: "Stamina Mode", blurb: "Hit points count down instead of damage counting up.", minPlayers: 2, maxPlayers: 4, minutes: 6 },
    { id: "giant", label: "Giant Melee", blurb: "Every fighter is huge.", minPlayers: 2, maxPlayers: 4, minutes: 5 },
    { id: "tiny", label: "Tiny Melee", blurb: "Every fighter is tiny.", minPlayers: 2, maxPlayers: 4, minutes: 5 },
    { id: "invisible", label: "Invisible Melee", blurb: "Every fighter is invisible.", minPlayers: 2, maxPlayers: 4, minutes: 5 },
    { id: "lightning", label: "Lightning Melee", blurb: "The whole game runs fast.", minPlayers: 2, maxPlayers: 4, minutes: 4 },
  ],
  customSmash: [],
  rules: {
    competitive: { kind: "stock", stocks: 4, minutes: 8, items: "off", finalSmashMeter: false },
    stamina: false,
    finalSmash: false,
    stageForms: false,
    squadStrike: false,
  },
  starterPresets: [
    { id: "singles", label: "Singles: Battlefield, Dream Land, Final Destination, Fountain of Dreams, Yoshi's Story", stages: ["battlefield", "dream-land", "final-destination", "fountain-of-dreams", "yoshis-story"] },
    { id: "stadium", label: "Pokémon Stadium in, Final Destination a counterpick", stages: ["battlefield", "dream-land", "fountain-of-dreams", "pokemon-stadium", "yoshis-story"] },
    { id: "doubles", label: "Doubles: Final Destination and Pokémon Stadium, no Fountain of Dreams", stages: ["battlefield", "dream-land", "final-destination", "pokemon-stadium", "yoshis-story"] },
  ],
};
