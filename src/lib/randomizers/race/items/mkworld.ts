/**
 * MKWorld item catalog — items + themed modes.
 *
 * Items sourced from `src/data/mkworld-data.json`. Themed modes are
 * pending Britton's curated list (mirroring the MK8DX themed-modes
 * spec); for now ships with one baseline mode so the picker has
 * something to render until the curated themes land.
 *
 * Category mapping: source data uses `boost` for speed-style items;
 * we map that to `speed` to match the shared `ItemCategory` taxonomy.
 */

import type { Item, ItemMode } from "../types";

const ITEM_CDN = "https://cdn.empac.co/gameshuffle/images/mkworld/items";

export const MKWORLD_ITEMS: Item[] = [
  // Offensive
  { id: "green-shell", name: "Green Shell", category: "offensive", game: "mkworld", image: `${ITEM_CDN}/Green_Shell.png` },
  { id: "triple-green-shell", name: "Triple Green Shell", category: "offensive", game: "mkworld", image: `${ITEM_CDN}/Triple_Green_Shell.png` },
  { id: "red-shell", name: "Red Shell", category: "offensive", game: "mkworld", image: `${ITEM_CDN}/Red_Shell.png` },
  { id: "triple-red-shell", name: "Triple Red Shell", category: "offensive", game: "mkworld", image: `${ITEM_CDN}/Triple_Red_Shell.png` },
  { id: "blue-shell", name: "Blue Shell", category: "offensive", game: "mkworld", image: `${ITEM_CDN}/Blue_Shell.png` },
  { id: "golden-shell", name: "Golden Shell", category: "offensive", game: "mkworld", image: `${ITEM_CDN}/Coin_Shell.png` },
  { id: "bob-omb", name: "Bob-omb", category: "offensive", game: "mkworld", image: `${ITEM_CDN}/Bob-omb.png` },
  { id: "blooper", name: "Blooper", category: "offensive", game: "mkworld", image: `${ITEM_CDN}/Blooper.png` },
  { id: "boomerang", name: "Boomerang", category: "offensive", game: "mkworld", image: `${ITEM_CDN}/Boomerang.png` },
  { id: "fire-flower", name: "Fire Flower", category: "offensive", game: "mkworld", image: `${ITEM_CDN}/Fire_Flower.png` },
  { id: "ice-flower", name: "Ice Flower", category: "offensive", game: "mkworld", image: `${ITEM_CDN}/Ice_Flower.png` },
  { id: "hammer", name: "Hammer", category: "offensive", game: "mkworld", image: `${ITEM_CDN}/Hammer.png` },

  // Defensive
  { id: "banana", name: "Banana", category: "defensive", game: "mkworld", image: `${ITEM_CDN}/Banana.png` },
  { id: "triple-banana", name: "Triple Banana", category: "defensive", game: "mkworld", image: `${ITEM_CDN}/Triple_Banana.png` },
  { id: "super-horn", name: "Super Horn", category: "defensive", game: "mkworld", image: `${ITEM_CDN}/Super_Horn.png` },

  // Speed (`boost` in source data)
  { id: "mushroom", name: "Mushroom", category: "speed", game: "mkworld", image: `${ITEM_CDN}/Mushroom.png` },
  { id: "triple-mushroom", name: "Triple Mushroom", category: "speed", game: "mkworld", image: `${ITEM_CDN}/Triple_Mushroom.png` },
  { id: "golden-mushroom", name: "Golden Mushroom", category: "speed", game: "mkworld", image: `${ITEM_CDN}/Golden_Mushroom.png` },
  { id: "mega-mushroom", name: "Mega Mushroom", category: "speed", game: "mkworld", image: `${ITEM_CDN}/Mega_Mushroom.png` },
  { id: "bullet-bill", name: "Bullet Bill", category: "speed", game: "mkworld", image: `${ITEM_CDN}/Bullet_Bill.png` },
  { id: "dash-food", name: "Dash Food", category: "speed", game: "mkworld", image: `${ITEM_CDN}/Dash_Food.png` },

  // Utility
  { id: "coin", name: "Coin", category: "utility", game: "mkworld", image: `${ITEM_CDN}/Coin.png` },

  // Special / wild card
  { id: "boo", name: "Boo", category: "special", game: "mkworld", image: `${ITEM_CDN}/Boo.png` },
  { id: "feather", name: "Feather", category: "special", game: "mkworld", image: `${ITEM_CDN}/Feather.png` },
  { id: "kamek", name: "Kamek", category: "special", game: "mkworld", image: `${ITEM_CDN}/Kamek.png` },
  { id: "lightning", name: "Lightning", category: "special", game: "mkworld", image: `${ITEM_CDN}/Lightning.png` },
  { id: "question-block", name: "Question Block", category: "special", game: "mkworld", image: `${ITEM_CDN}/Question_Block.png` },
  { id: "super-star", name: "Super Star", category: "special", game: "mkworld", image: `${ITEM_CDN}/Super_Star.png` },
];

/**
 * MKWorld themed item modes — lifted-and-shifted from the MK8DX
 * themed-modes spec. Per Britton's direction:
 *   - Crazy 8 doesn't exist in MKW, so it's dropped from every mode
 *     that referenced it (Rise of the Koopa, Let Chaos Reign, Bombs
 *     Away, Going Nanners, Overpowered, Get Rich Quick).
 *   - "Get Chomped" is dropped entirely since Piranha Plant isn't in
 *     MKW (the mode's theme depends on it).
 *   - Mechanical renames: triple_X plural → singular,
 *     `star` → `super-star`.
 *
 * Britton may add items to any of these modes — leaving them as the
 * MK8DX-equivalent baseline for now.
 *
 * Net: 11 themed modes (MK8DX's 12 minus Get Chomped).
 */
export const MKWORLD_ITEM_MODES: ItemMode[] = [
  {
    id: "rise-of-the-koopa",
    name: "Rise of the Koopa",
    description: "Shells, shells, and more shells — with a side of magic.",
    game: "mkworld",
    items: [
      "green-shell",
      "triple-green-shell",
      "red-shell",
      "triple-red-shell",
      "blue-shell",
      "golden-shell",
      "kamek",
    ],
  },
  {
    id: "let-chaos-reign",
    name: "Let Chaos Reign",
    description: "Maximum mayhem — heavy hitters and wildcards.",
    game: "mkworld",
    items: [
      "blue-shell",
      "bob-omb",
      "lightning",
      "bullet-bill",
      "super-star",
      "boo",
      "hammer",
      "mega-mushroom",
      "kamek",
    ],
  },
  {
    id: "need-for-speed",
    name: "Need for Speed",
    description: "Boost-only. Hit the gas and don't look back.",
    game: "mkworld",
    items: [
      "triple-mushroom",
      "golden-mushroom",
      "bullet-bill",
      "dash-food",
    ],
  },
  {
    id: "bombs-away",
    name: "Bombs Away",
    description: "Bob-ombs everywhere.",
    game: "mkworld",
    items: ["bob-omb"],
  },
  {
    id: "going-nanners",
    name: "Going Nanners",
    description: "Bananas as far as the eye can see.",
    game: "mkworld",
    items: ["banana", "triple-banana"],
  },
  {
    id: "sniper-mode",
    name: "Sniper Mode",
    description: "Aim small, hit small. Precision items only.",
    game: "mkworld",
    items: [
      "green-shell",
      "fire-flower",
      "boomerang",
      "banana",
      "ice-flower",
      "hammer",
    ],
  },
  {
    id: "blues-and-shrooms",
    name: "Blues and Shrooms",
    description: "Boost or get blasted.",
    game: "mkworld",
    items: ["mushroom", "blue-shell"],
  },
  {
    id: "blued-up",
    name: "Blued Up",
    description: "Blue Shell only. May the leader survive.",
    game: "mkworld",
    items: ["blue-shell"],
  },
  {
    id: "overpowered",
    name: "Overpowered",
    description: "Top-tier items only. No mercy.",
    game: "mkworld",
    items: ["lightning", "super-star", "bullet-bill", "mega-mushroom"],
  },
  {
    id: "get-rich-quick",
    name: "Get Rich Quick",
    description: "Coins, ghosts, and mystery boxes.",
    game: "mkworld",
    items: ["coin", "boo", "question-block"],
  },
  {
    id: "mk64",
    name: "MK64",
    description: "Throwback set — N64 vibes.",
    game: "mkworld",
    items: [
      "banana",
      "triple-banana",
      "green-shell",
      "triple-green-shell",
      "red-shell",
      "triple-red-shell",
      "golden-mushroom",
      "super-star",
      "lightning",
      "boo",
    ],
  },
  {
    id: "red-vs-blue",
    name: "Red vs Blue",
    description: "Fire and ice. Pick your element.",
    game: "mkworld",
    items: ["fire-flower", "ice-flower"],
  },
  {
    id: "road-trippin",
    name: "Road Trippin'",
    description: "Snack stops only.",
    game: "mkworld",
    items: ["dash-food"],
  },
  {
    id: "running-of-the-bills",
    name: "Running of the Bills",
    description: "Bullet Bills only. Hold on tight.",
    game: "mkworld",
    items: ["bullet-bill"],
  },
];
