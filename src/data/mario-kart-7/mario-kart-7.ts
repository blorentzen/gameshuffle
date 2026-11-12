import type { Mk7Game } from "@/lib/mario-kart-7/types";

/**
 * Mario Kart 7 (Nintendo 3DS, 2011). Checked 2026-11-12 on Super Mario Wiki (mariowiki.com):
 *   - "Mario Kart 7": Characters (the drivers table: weight class and unlock method; eight from the start, nine to
 *     unlock, the Mii by completing every cup in any engine class), Vehicle parts (17 bodies, 10 tires, 7 gliders,
 *     1,190 combinations; the Standard, Birthday Girl and Bolt Buggy bodies, the Standard, Roller and Monster tires and
 *     the Super Glider are there from the start, the rest come at random as coins are collected, and the gold parts
 *     have their own conditions), Courses (4 new and 4 classic cups in order, the classic courses named with their
 *     console; the 6 battle stages), Battle (Balloon Battle and Coin Runners, any vehicle), Game modes (50cc, 100cc,
 *     150cc, and Mirror after the three).
 *   - "Wuhu Loop" and "Maka Wuhu": raced as one lap in three sections, as is this game's Rainbow Road.
 * Names are the North American ones the wiki leads with ("Koopa Beach", "Honeybee Hive", "Birthday Girl", "Bruiser").
 * Two players picking the same character: the wiki doesn't say for local play; online rooms had repeats, so the
 * randomizer allows them, with "Everyone a different character" in the options.
 *
 * Do not reorder these lists: saved setups and chat rolls store names, and shared rolls are read back by name.
 * Art: scripts/pull-mario-kart-7-art.ts (sources in scripts/data/mario-kart-7-art.json).
 */
export const MARIO_KART_7: Mk7Game = {
  slug: "mario-kart-7",
  name: "Mario Kart 7",
  assetBase: "/images/mario-kart-7/",
  checkedOn: "2026-11-12",
  characters: [
    { name: "Mario", slug: "mario", weight: "Medium", color: "#e60012" },
    { name: "Luigi", slug: "luigi", weight: "Medium", color: "#2a9d3a" },
    { name: "Peach", slug: "peach", weight: "Light", color: "#e886b4" },
    { name: "Yoshi", slug: "yoshi", weight: "Light", color: "#4fb33a" },
    { name: "Bowser", slug: "bowser", weight: "Heavy", color: "#3e7a2c" },
    { name: "Donkey Kong", slug: "donkey-kong", weight: "Cruiser", color: "#8a4a1e" },
    { name: "Toad", slug: "toad", weight: "Feather", color: "#e2463b" },
    { name: "Koopa Troopa", slug: "koopa-troopa", weight: "Feather", color: "#3b9a3b" },
    { name: "Daisy", slug: "daisy", weight: "Light", unlock: "Win the 150cc Mushroom Cup", color: "#f39a21" },
    { name: "Wario", slug: "wario", weight: "Heavy", unlock: "Win the 150cc Flower Cup", color: "#e0b400" },
    { name: "Rosalina", slug: "rosalina", weight: "Cruiser", unlock: "Win the 150cc Star Cup", color: "#4bb0c8" },
    { name: "Metal Mario", slug: "metal-mario", weight: "Heavy", unlock: "Win the 150cc Special Cup", color: "#8d93ab" },
    { name: "Shy Guy", slug: "shy-guy", weight: "Feather", unlock: "Win the 150cc Shell Cup", color: "#d03a34" },
    { name: "Honey Queen", slug: "honey-queen", weight: "Heavy", unlock: "Win the 150cc Banana Cup", color: "#d9a21e" },
    { name: "Wiggler", slug: "wiggler", weight: "Cruiser", unlock: "Win the 150cc Leaf Cup", color: "#e8a11c" },
    { name: "Lakitu", slug: "lakitu", weight: "Feather", unlock: "Win the 150cc Lightning Cup", color: "#5bb25b" },
    { name: "Mii", slug: "mii", weight: "Medium", unlock: "Complete every cup in any engine class", color: "#6b7280" },
  ],
  bodies: [
    { name: "Standard", slug: "standard" },
    { name: "Birthday Girl", slug: "birthday-girl" },
    { name: "Bolt Buggy", slug: "bolt-buggy" },
    { name: "Bumble V", slug: "bumble-v", unlock: "Unlocked at random by collecting coins" },
    { name: "Bruiser", slug: "bruiser", unlock: "Unlocked at random by collecting coins" },
    { name: "Soda Jet", slug: "soda-jet", unlock: "Unlocked at random by collecting coins" },
    { name: "B Dasher", slug: "b-dasher", unlock: "Unlocked at random by collecting coins" },
    { name: "Egg 1", slug: "egg-1", unlock: "Unlocked at random by collecting coins" },
    { name: "Barrel Train", slug: "barrel-train", unlock: "Unlocked at random by collecting coins" },
    { name: "Tiny Tug", slug: "tiny-tug", unlock: "Unlocked at random by collecting coins" },
    { name: "Cact-X", slug: "cact-x", unlock: "Unlocked at random by collecting coins" },
    { name: "Koopa Clown", slug: "koopa-clown", unlock: "Unlocked at random by collecting coins" },
    { name: "Cloud 9", slug: "cloud-9", unlock: "Unlocked at random by collecting coins" },
    { name: "Zucchini", slug: "zucchini", unlock: "Unlocked at random by collecting coins" },
    { name: "Blue Seven", slug: "blue-seven", unlock: "Unlocked at random by collecting coins" },
    { name: "Pipe Frame", slug: "pipe-frame", unlock: "Unlocked at random by collecting coins" },
    { name: "Gold Standard", slug: "gold-standard", unlock: "Reach 10,000 VR or collect 20,000 coins" },
  ],
  tires: [
    { name: "Standard", slug: "standard" },
    { name: "Roller", slug: "roller" },
    { name: "Monster", slug: "monster" },
    { name: "Slim", slug: "slim", unlock: "Unlocked at random by collecting coins" },
    { name: "Slick", slug: "slick", unlock: "Unlocked at random by collecting coins" },
    { name: "Sponge", slug: "sponge", unlock: "Unlocked at random by collecting coins" },
    { name: "Mushroom", slug: "mushroom", unlock: "Unlocked at random by collecting coins" },
    { name: "Wood", slug: "wood", unlock: "Unlocked at random by collecting coins" },
    { name: "Red Monster", slug: "red-monster", unlock: "Unlocked at random by collecting coins" },
    { name: "Gold Tires", slug: "gold-tires", unlock: "A star ranking or better in every cup of every engine class, or collect 15,000 coins" },
  ],
  gliders: [
    { name: "Super Glider", slug: "super-glider" },
    { name: "Peach Parasol", slug: "peach-parasol", unlock: "Unlocked at random by collecting coins" },
    { name: "Flower Glider", slug: "flower-glider", unlock: "Unlocked at random by collecting coins" },
    { name: "Swooper", slug: "swooper", unlock: "Unlocked at random by collecting coins" },
    { name: "Paraglider", slug: "paraglider", unlock: "Unlocked at random by collecting coins" },
    { name: "Gold Glider", slug: "gold-glider", unlock: "Reach 100 StreetPass hits or collect 10,000 coins" },
    { name: "Beast Glider", slug: "beast-glider", unlock: "Collect 5,000 coins" },
  ],
  cups: [
    { name: "Mushroom Cup", slug: "mushroom", kind: "new", courses: [
      { name: "Toad Circuit", slug: "toad-circuit" },
      { name: "Daisy Hills", slug: "daisy-hills" },
      { name: "Cheep Cheep Lagoon", slug: "cheep-cheep-lagoon" },
      { name: "Shy Guy Bazaar", slug: "shy-guy-bazaar" },
    ] },
    { name: "Flower Cup", slug: "flower", kind: "new", courses: [
      { name: "Wuhu Loop", slug: "wuhu-loop", sections: true },
      { name: "Mario Circuit", slug: "mario-circuit" },
      { name: "Music Park", slug: "music-park" },
      { name: "Rock Rock Mountain", slug: "rock-rock-mountain" },
    ] },
    { name: "Star Cup", slug: "star", kind: "new", courses: [
      { name: "Piranha Plant Slide", slug: "piranha-plant-slide" },
      { name: "Wario Shipyard", slug: "wario-shipyard" },
      { name: "Neo Bowser City", slug: "neo-bowser-city" },
      { name: "Maka Wuhu", slug: "maka-wuhu", sections: true },
    ] },
    { name: "Special Cup", slug: "special", kind: "new", courses: [
      { name: "DK Jungle", slug: "dk-jungle" },
      { name: "Rosalina's Ice World", slug: "rosalinas-ice-world" },
      { name: "Bowser's Castle", slug: "bowsers-castle" },
      { name: "Rainbow Road", slug: "rainbow-road", sections: true },
    ] },
    { name: "Shell Cup", slug: "shell", kind: "classic", courses: [
      { name: "N64 Luigi Raceway", slug: "n64-luigi-raceway" },
      { name: "GBA Bowser Castle 1", slug: "gba-bowser-castle-1" },
      { name: "Wii Mushroom Gorge", slug: "wii-mushroom-gorge" },
      { name: "DS Luigi's Mansion", slug: "ds-luigis-mansion" },
    ] },
    { name: "Banana Cup", slug: "banana", kind: "classic", courses: [
      { name: "N64 Koopa Beach", slug: "n64-koopa-beach" },
      { name: "SNES Mario Circuit 2", slug: "snes-mario-circuit-2" },
      { name: "Wii Coconut Mall", slug: "wii-coconut-mall" },
      { name: "DS Waluigi Pinball", slug: "ds-waluigi-pinball" },
    ] },
    { name: "Leaf Cup", slug: "leaf", kind: "classic", courses: [
      { name: "N64 Kalimari Desert", slug: "n64-kalimari-desert" },
      { name: "DS DK Pass", slug: "ds-dk-pass" },
      { name: "GCN Daisy Cruiser", slug: "gcn-daisy-cruiser" },
      { name: "Wii Maple Treeway", slug: "wii-maple-treeway" },
    ] },
    { name: "Lightning Cup", slug: "lightning", kind: "classic", courses: [
      { name: "Wii Koopa Cape", slug: "wii-koopa-cape" },
      { name: "GCN Dino Dino Jungle", slug: "gcn-dino-dino-jungle" },
      { name: "DS Airship Fortress", slug: "ds-airship-fortress" },
      { name: "SNES Rainbow Road", slug: "snes-rainbow-road" },
    ] },
  ],
  battleCourses: [
    { name: "Honeybee Hive", slug: "honeybee-hive" },
    { name: "Sherbet Rink", slug: "sherbet-rink" },
    { name: "Wuhu Town", slug: "wuhu-town" },
    { name: "GBA Battle Course 1", slug: "gba-battle-course-1" },
    { name: "N64 Big Donut", slug: "n64-big-donut" },
    { name: "DS Palm Shore", slug: "ds-palm-shore" },
  ],
  battleModes: [
    { id: "balloon", name: "Balloon Battle", line: "Pop the other karts' balloons for points in two minutes; losing all three costs half your points." },
    { id: "coin", name: "Coin Runners", line: "Collect the most coins in two minutes; a hit makes you drop some." },
  ],
  // Mirror opens once every cup is won in 50cc, 100cc and 150cc.
  engines: ["50cc", "100cc", "150cc", "Mirror"],
};
