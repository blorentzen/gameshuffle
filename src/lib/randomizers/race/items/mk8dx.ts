/**
 * MK8DX item catalog — split into modes (gameplay rule sets) and items
 * (individual physical items that can appear in the box).
 *
 * Per the multi-game spec refinement: the older `MK8DX_ITEM_PRESETS`
 * collapsed both into one list, which made it impossible to ban an
 * individual item (Blue Shell) without banning every mode that includes
 * it. This split lets streamers tune both axes independently.
 *
 * Catalog scope:
 *   - 7 modes (3 baseline + 4 themed)
 *   - 21 individual items (covers the full MK8DX item box)
 *
 * No CDN artwork on items yet — they render as text chips. When the
 * Empac CDN gets per-item icons, drop the URLs into the `image` field
 * here and the picker UI auto-upgrades to artwork tiles.
 */

import type { Item, ItemMode } from "../types";

/**
 * MK8DX themed item modes — each mode is a curated item box that the
 * streamer can roll. Per Britton's themed-modes spec, replacing the
 * earlier generic rule-set modes (Normal / Frantic / No Items / etc.).
 *
 * Each mode lists the item IDs that make up its box. When a mode rolls
 * via `!gs-items`, GS surfaces the mode name + items in chat so viewers
 * know what's in play.
 */
export const MK8DX_ITEM_MODES: ItemMode[] = [
  {
    id: "rise-of-the-koopa",
    name: "Rise of the Koopa",
    description: "Shells, shells, and more shells.",
    game: "mk8dx",
    items: [
      "green-shell",
      "triple-green-shells",
      "red-shell",
      "triple-red-shells",
      "blue-shell",
      "crazy-eight",
    ],
  },
  {
    id: "let-chaos-reign",
    name: "Let Chaos Reign",
    description: "Maximum mayhem — heavy hitters only.",
    game: "mk8dx",
    items: [
      "blue-shell",
      "bob-omb",
      "lightning",
      "bullet-bill",
      "star",
      "boo",
      "crazy-eight",
    ],
  },
  {
    id: "need-for-speed",
    name: "Need for Speed",
    description: "Boost-only. Hit the gas and don't look back.",
    game: "mk8dx",
    items: ["triple-mushrooms", "golden-mushroom", "bullet-bill"],
  },
  {
    id: "bombs-away",
    name: "Bombs Away",
    description: "Bob-ombs everywhere.",
    game: "mk8dx",
    items: ["bob-omb", "crazy-eight"],
  },
  {
    id: "going-nanners",
    name: "Going Nanners",
    description: "Bananas as far as the eye can see.",
    game: "mk8dx",
    items: ["banana", "triple-bananas", "crazy-eight"],
  },
  {
    id: "sniper-mode",
    name: "Sniper Mode",
    description: "Aim small, hit small. Precision items only.",
    game: "mk8dx",
    items: ["green-shell", "fire-flower", "boomerang", "banana"],
  },
  {
    id: "blues-and-shrooms",
    name: "Blues and Shrooms",
    description: "Boost or get blasted.",
    game: "mk8dx",
    items: ["mushroom", "blue-shell"],
  },
  {
    id: "blued-up",
    name: "Blued Up",
    description: "Blue Shell only. May the leader survive.",
    game: "mk8dx",
    items: ["blue-shell"],
  },
  {
    id: "overpowered",
    name: "Overpowered",
    description: "Top-tier items only. No mercy.",
    game: "mk8dx",
    items: ["lightning", "star", "bullet-bill", "crazy-eight"],
  },
  {
    id: "get-chomped",
    name: "Get Chomped",
    description: "Pets and horns. Defensive shenanigans.",
    game: "mk8dx",
    items: ["piranha-plant", "blooper", "super-horn"],
  },
  {
    id: "get-rich-quick",
    name: "Get Rich Quick",
    description: "Coins, eights, and ghosts.",
    game: "mk8dx",
    items: ["coin", "crazy-eight", "boo"],
  },
  {
    id: "mk64",
    name: "MK64",
    description: "Throwback set — N64 vibes.",
    game: "mk8dx",
    items: [
      "banana",
      "triple-bananas",
      "green-shell",
      "triple-green-shells",
      "red-shell",
      "triple-red-shells",
      "golden-mushroom",
      "star",
      "lightning",
      "boo",
    ],
  },
  {
    id: "running-of-the-bills",
    name: "Running of the Bills",
    description: "Bullet Bills only. Hold on tight.",
    game: "mk8dx",
    items: ["bullet-bill"],
  },
];

const ITEM_CDN = "https://cdn.empac.co/gameshuffle/images/mk8dx/items";

export const MK8DX_ITEMS: Item[] = [
  // Offensive
  { id: "green-shell", name: "Green Shell", category: "offensive", game: "mk8dx", image: `${ITEM_CDN}/GreenShellMK8.webp` },
  { id: "triple-green-shells", name: "Triple Green Shells", category: "offensive", game: "mk8dx", image: `${ITEM_CDN}/TripleGreenShellsMK8.webp` },
  { id: "red-shell", name: "Red Shell", category: "offensive", game: "mk8dx", image: `${ITEM_CDN}/RedShellMK8.webp` },
  { id: "triple-red-shells", name: "Triple Red Shells", category: "offensive", game: "mk8dx", image: `${ITEM_CDN}/TripleRedShellsMK8.webp` },
  { id: "blue-shell", name: "Blue Shell (Spiny)", category: "offensive", game: "mk8dx", image: `${ITEM_CDN}/SpinyShellMK8.webp` },
  { id: "bob-omb", name: "Bob-omb", category: "offensive", game: "mk8dx", image: `${ITEM_CDN}/Bob-ombMK8.webp` },
  { id: "fire-flower", name: "Fire Flower", category: "offensive", game: "mk8dx", image: `${ITEM_CDN}/FireFlowerMK8.webp` },
  { id: "boomerang", name: "Boomerang Flower", category: "offensive", game: "mk8dx", image: `${ITEM_CDN}/BoomerangFlowerMK8.webp` },
  { id: "piranha-plant", name: "Piranha Plant", category: "offensive", game: "mk8dx", image: `${ITEM_CDN}/PiranhaPlantPotMK8.webp` },
  { id: "lightning", name: "Lightning", category: "offensive", game: "mk8dx", image: `${ITEM_CDN}/LightningBoltMK8.webp` },
  { id: "blooper", name: "Blooper", category: "offensive", game: "mk8dx", image: `${ITEM_CDN}/BlooperMK8.webp` },

  // Defensive
  { id: "banana", name: "Banana", category: "defensive", game: "mk8dx", image: `${ITEM_CDN}/BananaMK8.webp` },
  { id: "triple-bananas", name: "Triple Bananas", category: "defensive", game: "mk8dx", image: `${ITEM_CDN}/TripleBananaMK8.webp` },
  { id: "super-horn", name: "Super Horn", category: "defensive", game: "mk8dx", image: `${ITEM_CDN}/SuperHornMK8.webp` },

  // Speed (boost in source data, mapped to "speed" category in our taxonomy)
  { id: "mushroom", name: "Mushroom", category: "speed", game: "mk8dx", image: `${ITEM_CDN}/MushroomMarioKart8.webp` },
  { id: "triple-mushrooms", name: "Triple Mushrooms", category: "speed", game: "mk8dx", image: `${ITEM_CDN}/TripleMushroomMK8.webp` },
  { id: "golden-mushroom", name: "Golden Mushroom", category: "speed", game: "mk8dx", image: `${ITEM_CDN}/GoldenMushroomMK8.webp` },
  { id: "bullet-bill", name: "Bullet Bill", category: "speed", game: "mk8dx", image: `${ITEM_CDN}/BulletBillMK8.webp` },
  { id: "star", name: "Super Star", category: "speed", game: "mk8dx", image: `${ITEM_CDN}/StarMK8.webp` },

  // Utility
  { id: "coin", name: "Coin", category: "utility", game: "mk8dx", image: `${ITEM_CDN}/CoinMK8.webp` },

  // Special / wild card
  { id: "crazy-eight", name: "Crazy 8", category: "special", game: "mk8dx", image: `${ITEM_CDN}/crazy-eight.webp` },
  { id: "boo", name: "Boo", category: "special", game: "mk8dx", image: `${ITEM_CDN}/603px-BooNSMBWii.webp` },
];

/**
 * @deprecated Renamed to `MK8DX_ITEM_MODES`. Kept for callers still
 * importing the old name — remove once all callers update.
 */
export const MK8DX_ITEM_PRESETS = MK8DX_ITEM_MODES;
