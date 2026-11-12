import type { DdGame } from "@/lib/double-dash/types";

/**
 * Mario Kart: Double Dash!! (Nintendo GameCube, 2003). Checked 2026-11-12 on Super Mario Wiki (mariowiki.com):
 *   - "Mario Kart: Double Dash!!": the Characters table (weight, default kart, special item, unlocks), the Karts table
 *     (class, owner, unlocks), Items ▸ Special Items, Courses (four cups of four, six battle courses and their unlocks),
 *     Game modes (engine classes, the All Cup Tour, the three battle modes), lap counts (Baby Park 7, Wario
 *     Colosseum 2, every other course 3).
 *   - The instruction booklet's kart chart (File:MKDD Kart Compatibility.png, page 22), which settles the kart rule:
 *     a pair drives a kart of the heavier character's class, exactly. Light and Light = a light kart; Light or Medium
 *     with Medium = a medium kart; anyone with a Heavy = a heavy kart. A light pair can't take a medium or heavy kart,
 *     and a heavy pair can't take a light one. The Parade Kart (unlocked last) takes any pair.
 *   - "Parade Kart" (any character combination, regardless of weight class).
 * Names are the game's own: "Koopa" and "Paratroopa" (the select screen's names), "All Cup Tour".
 * Special items: Item Boxes give the pair either character's special item. Petey Piranha and King Boo get any special
 * item but the green Fireballs and Birdo's Egg. In Battle mode any character can get any special item.
 *
 * Do not reorder these lists: saved setups and chat rolls store names, and shared rolls are read back by name.
 * Art: scripts/pull-double-dash-art.ts (sources in scripts/data/double-dash-art.json).
 */
export const DOUBLE_DASH: DdGame = {
  slug: "mario-kart-double-dash",
  name: "Mario Kart: Double Dash!!",
  assetBase: "/images/mario-kart-double-dash/",
  checkedOn: "2026-11-12",
  characters: [
    { name: "Mario", slug: "mario", weight: "Medium", special: "fireballs-red", team: "mario", color: "#e60012" },
    { name: "Luigi", slug: "luigi", weight: "Medium", special: "fireballs-green", team: "mario", color: "#2a9d3a" },
    { name: "Peach", slug: "peach", weight: "Medium", special: "heart", team: "peach", color: "#e886b4" },
    { name: "Daisy", slug: "daisy", weight: "Medium", special: "heart", team: "peach", color: "#f39a21" },
    { name: "Yoshi", slug: "yoshi", weight: "Medium", special: "yoshi-egg", team: "yoshi", color: "#4fb33a" },
    { name: "Birdo", slug: "birdo", weight: "Medium", special: "birdo-egg", team: "yoshi", color: "#e8559a" },
    { name: "Baby Mario", slug: "baby-mario", weight: "Light", special: "chain-chomp", team: "baby", color: "#d23030" },
    { name: "Baby Luigi", slug: "baby-luigi", weight: "Light", special: "chain-chomp", team: "baby", color: "#2f9d4a" },
    { name: "Koopa", slug: "koopa", weight: "Light", special: "triple-shells", team: "koopa", color: "#3b9a3b" },
    { name: "Paratroopa", slug: "paratroopa", weight: "Light", special: "triple-shells", team: "koopa", color: "#d03a34" },
    { name: "Donkey Kong", slug: "donkey-kong", weight: "Heavy", special: "giant-banana", team: "dk", color: "#8a4a1e" },
    { name: "Diddy Kong", slug: "diddy-kong", weight: "Light", special: "giant-banana", team: "dk", color: "#c5372e" },
    { name: "Bowser", slug: "bowser", weight: "Heavy", special: "bowsers-shell", team: "bowser", color: "#3e7a2c" },
    { name: "Bowser Jr.", slug: "bowser-jr", weight: "Light", special: "bowsers-shell", team: "bowser", color: "#4c9b3a" },
    { name: "Wario", slug: "wario", weight: "Heavy", special: "bob-omb", team: "wario", color: "#e0b400" },
    { name: "Waluigi", slug: "waluigi", weight: "Medium", special: "bob-omb", team: "wario", color: "#6a3d9e" },
    { name: "Toad", slug: "toad", weight: "Light", special: "golden-mushroom", team: "toad", unlock: "Win the 100cc Special Cup", color: "#e2463b" },
    { name: "Toadette", slug: "toadette", weight: "Light", special: "golden-mushroom", team: "toad", unlock: "Win the 100cc Special Cup", color: "#e468a4" },
    { name: "Petey Piranha", slug: "petey-piranha", weight: "Heavy", special: "any", team: "petey", unlock: "Win the Mirror Star Cup", color: "#2d8c45" },
    { name: "King Boo", slug: "king-boo", weight: "Heavy", special: "any", team: "petey", unlock: "Win the Mirror Star Cup", color: "#8d93ab" },
  ],
  karts: [
    { name: "Red Fire", slug: "red-fire", weight: "Medium", owner: "Mario" },
    { name: "Green Fire", slug: "green-fire", weight: "Medium", owner: "Luigi", unlock: "Win the 50cc Mushroom Cup" },
    { name: "Heart Coach", slug: "heart-coach", weight: "Medium", owner: "Peach" },
    { name: "Bloom Coach", slug: "bloom-coach", weight: "Medium", owner: "Daisy", unlock: "Win the 50cc Flower Cup" },
    { name: "Turbo Yoshi", slug: "turbo-yoshi", weight: "Medium", owner: "Yoshi" },
    { name: "Turbo Birdo", slug: "turbo-birdo", weight: "Medium", owner: "Birdo", unlock: "Win the 150cc Flower Cup" },
    { name: "Goo-Goo Buggy", slug: "goo-goo-buggy", weight: "Light", owner: "Baby Mario" },
    { name: "Rattle Buggy", slug: "rattle-buggy", weight: "Light", owner: "Baby Luigi", unlock: "Win the 100cc Mushroom Cup" },
    { name: "Toad Kart", slug: "toad-kart", weight: "Light", owner: "Toad", unlock: "Win the 100cc Special Cup" },
    { name: "Toadette Kart", slug: "toadette-kart", weight: "Light", owner: "Toadette", unlock: "Win the Mirror Mushroom Cup" },
    { name: "Koopa Dasher", slug: "koopa-dasher", weight: "Light", owner: "Koopa" },
    { name: "Para-Wing", slug: "para-wing", weight: "Light", owner: "Paratroopa", unlock: "Win the 50cc Star Cup" },
    { name: "DK Jumbo", slug: "dk-jumbo", weight: "Heavy", owner: "Donkey Kong" },
    { name: "Barrel Train", slug: "barrel-train", weight: "Light", owner: "Diddy Kong", unlock: "Win the 150cc Star Cup" },
    { name: "Koopa King", slug: "koopa-king", weight: "Heavy", owner: "Bowser" },
    { name: "Bullet Blaster", slug: "bullet-blaster", weight: "Light", owner: "Bowser Jr.", unlock: "Win the 50cc Special Cup" },
    { name: "Wario Car", slug: "wario-car", weight: "Heavy", owner: "Wario" },
    { name: "Waluigi Racer", slug: "waluigi-racer", weight: "Medium", owner: "Waluigi", unlock: "Win the 100cc Flower Cup" },
    { name: "Piranha Pipes", slug: "piranha-pipes", weight: "Heavy", owner: "Petey Piranha", unlock: "Win the Mirror Star Cup" },
    { name: "Boo Pipes", slug: "boo-pipes", weight: "Heavy", owner: "King Boo", unlock: "Win the Mirror Special Cup" },
    { name: "Parade Kart", slug: "parade-kart", weight: null, owner: null, unlock: "Win the Mirror All Cup Tour" },
  ],
  cups: [
    { name: "Mushroom Cup", slug: "mushroom", courses: [
      { name: "Luigi Circuit", slug: "luigi-circuit", laps: 3 },
      { name: "Peach Beach", slug: "peach-beach", laps: 3 },
      { name: "Baby Park", slug: "baby-park", laps: 7 },
      { name: "Dry Dry Desert", slug: "dry-dry-desert", laps: 3 },
    ] },
    { name: "Flower Cup", slug: "flower", courses: [
      { name: "Mushroom Bridge", slug: "mushroom-bridge", laps: 3 },
      { name: "Mario Circuit", slug: "mario-circuit", laps: 3 },
      { name: "Daisy Cruiser", slug: "daisy-cruiser", laps: 3 },
      { name: "Waluigi Stadium", slug: "waluigi-stadium", laps: 3 },
    ] },
    { name: "Star Cup", slug: "star", courses: [
      { name: "Sherbet Land", slug: "sherbet-land", laps: 3 },
      { name: "Mushroom City", slug: "mushroom-city", laps: 3 },
      { name: "Yoshi Circuit", slug: "yoshi-circuit", laps: 3 },
      { name: "DK Mountain", slug: "dk-mountain", laps: 3 },
    ] },
    { name: "Special Cup", slug: "special", unlock: "Win the 100cc Star Cup", courses: [
      { name: "Wario Colosseum", slug: "wario-colosseum", laps: 2 },
      { name: "Dino Dino Jungle", slug: "dino-dino-jungle", laps: 3 },
      { name: "Bowser's Castle", slug: "bowsers-castle", laps: 3 },
      { name: "Rainbow Road", slug: "rainbow-road", laps: 3 },
    ] },
  ],
  battleCourses: [
    { name: "Cookie Land", slug: "cookie-land" },
    { name: "Block City", slug: "block-city" },
    { name: "Nintendo GameCube", slug: "nintendo-gamecube" },
    { name: "Pipe Plaza", slug: "pipe-plaza" },
    { name: "Luigi's Mansion", slug: "luigis-mansion", unlock: "Win the 150cc Mushroom Cup" },
    { name: "Tilt-a-Kart", slug: "tilt-a-kart", unlock: "Win the Mirror Flower Cup" },
  ],
  battleModes: [
    { id: "balloon", name: "Balloon Battle", slug: "balloon-battle", line: "Pop the other karts' balloons; the last kart with any wins." },
    { id: "shine", name: "Shine Thief", slug: "shine-thief", line: "Grab the Shine Sprite and hold it until time runs out." },
    { id: "bobomb", name: "Bob-omb Blast", slug: "bob-omb-blast", line: "Every Item Box is a Bob-omb; land hits to collect stars." },
  ],
  // Mirror opens once the 150cc All Cup Tour is won.
  engines: ["50cc", "100cc", "150cc", "Mirror"],
  specials: {
    "fireballs-red": { name: "Fireballs", slug: "fireballs-red" },
    "fireballs-green": { name: "Fireballs", slug: "fireballs-green" },
    heart: { name: "Heart", slug: "heart" },
    "yoshi-egg": { name: "Yoshi's Egg", slug: "yoshi-egg" },
    "birdo-egg": { name: "Birdo's Egg", slug: "birdo-egg" },
    "chain-chomp": { name: "Chain Chomp", slug: "chain-chomp" },
    "triple-shells": { name: "Triple Shells", slug: "triple-green-shells" },
    "giant-banana": { name: "Giant Banana", slug: "giant-banana" },
    "bowsers-shell": { name: "Bowser's Shell", slug: "bowsers-shell" },
    "bob-omb": { name: "Bob-omb", slug: "bob-omb" },
    "golden-mushroom": { name: "Golden Mushroom", slug: "golden-mushroom" },
    any: { name: "Any special item", slug: null },
  },
};
