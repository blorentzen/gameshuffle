/**
 * Each Trainer Road Gym's type and badge, by its team id on the region's path (ROAD_PATHS in roadPath.ts), for the
 * region pages' "Gym Leaders in badge order" lists (SEO pass 2026-11-05). The games' own names: Galar and Paldea
 * name their badges after the Gym's type. Alola has island kahunas and no badges, so it isn't here.
 */

export const GYM_BADGES: Record<string, { type: string; badge: string }> = {
  // Kanto, FireRed and LeafGreen
  "brock-firered": { type: "Rock", badge: "Boulder Badge" },
  "misty-firered": { type: "Water", badge: "Cascade Badge" },
  "lt-surge-firered": { type: "Electric", badge: "Thunder Badge" },
  "erika-firered": { type: "Grass", badge: "Rainbow Badge" },
  "koga-firered": { type: "Poison", badge: "Soul Badge" },
  "sabrina-firered": { type: "Psychic", badge: "Marsh Badge" },
  "blaine-firered": { type: "Fire", badge: "Volcano Badge" },
  "giovanni-firered": { type: "Ground", badge: "Earth Badge" },
  // Johto, HeartGold and SoulSilver
  "falkner-heartgold": { type: "Flying", badge: "Zephyr Badge" },
  "bugsy-heartgold": { type: "Bug", badge: "Hive Badge" },
  "whitney-heartgold": { type: "Normal", badge: "Plain Badge" },
  "morty-heartgold": { type: "Ghost", badge: "Fog Badge" },
  "chuck-heartgold": { type: "Fighting", badge: "Storm Badge" },
  "jasmine-heartgold": { type: "Steel", badge: "Mineral Badge" },
  "pryce-heartgold": { type: "Ice", badge: "Glacier Badge" },
  "clair-heartgold": { type: "Dragon", badge: "Rising Badge" },
  // Hoenn, Emerald
  "roxanne-emerald": { type: "Rock", badge: "Stone Badge" },
  "brawly-emerald": { type: "Fighting", badge: "Knuckle Badge" },
  "wattson-emerald": { type: "Electric", badge: "Dynamo Badge" },
  "flannery-emerald": { type: "Fire", badge: "Heat Badge" },
  "norman-emerald": { type: "Normal", badge: "Balance Badge" },
  "winona-emerald": { type: "Flying", badge: "Feather Badge" },
  "tate-liza-emerald": { type: "Psychic", badge: "Mind Badge" },
  "juan-emerald": { type: "Water", badge: "Rain Badge" },
  // Sinnoh, Platinum
  "roark-platinum": { type: "Rock", badge: "Coal Badge" },
  "gardenia-platinum": { type: "Grass", badge: "Forest Badge" },
  "fantina-platinum": { type: "Ghost", badge: "Relic Badge" },
  "maylene-platinum": { type: "Fighting", badge: "Cobble Badge" },
  "crasher-wake-platinum": { type: "Water", badge: "Fen Badge" },
  "byron-platinum": { type: "Steel", badge: "Mine Badge" },
  "candice-platinum": { type: "Ice", badge: "Icicle Badge" },
  "volkner-platinum": { type: "Electric", badge: "Beacon Badge" },
  // Unova, Black
  "cilan-black": { type: "Grass", badge: "Trio Badge" },
  "lenora-black": { type: "Normal", badge: "Basic Badge" },
  "burgh-black": { type: "Bug", badge: "Insect Badge" },
  "elesa-black": { type: "Electric", badge: "Bolt Badge" },
  "clay-black": { type: "Ground", badge: "Quake Badge" },
  "skyla-black": { type: "Flying", badge: "Jet Badge" },
  "brycen-black": { type: "Ice", badge: "Freeze Badge" },
  "drayden-black": { type: "Dragon", badge: "Legend Badge" },
  // Kalos, X and Y
  "viola-x": { type: "Bug", badge: "Bug Badge" },
  "grant-x": { type: "Rock", badge: "Cliff Badge" },
  "korrina-x": { type: "Fighting", badge: "Rumble Badge" },
  "ramos-x": { type: "Grass", badge: "Plant Badge" },
  "clemont-x": { type: "Electric", badge: "Voltage Badge" },
  "valerie-x": { type: "Fairy", badge: "Fairy Badge" },
  "olympia-x": { type: "Psychic", badge: "Psychic Badge" },
  "wulfric-x": { type: "Ice", badge: "Iceberg Badge" },
  // Galar, Sword
  "milo-sword": { type: "Grass", badge: "Grass Badge" },
  "nessa-sword": { type: "Water", badge: "Water Badge" },
  "kabu-sword": { type: "Fire", badge: "Fire Badge" },
  "bea-sword": { type: "Fighting", badge: "Fighting Badge" },
  "opal-sword": { type: "Fairy", badge: "Fairy Badge" },
  "gordie-sword": { type: "Rock", badge: "Rock Badge" },
  "piers-sword": { type: "Dark", badge: "Dark Badge" },
  "raihan-sword": { type: "Dragon", badge: "Dragon Badge" },
  // Paldea, Scarlet and Violet (the Gyms can be taken in any order; this is the road's)
  "katy-scarlet": { type: "Bug", badge: "Bug Badge" },
  "brassius-scarlet": { type: "Grass", badge: "Grass Badge" },
  "iono-scarlet": { type: "Electric", badge: "Electric Badge" },
  "kofu-scarlet": { type: "Water", badge: "Water Badge" },
  "larry-scarlet": { type: "Normal", badge: "Normal Badge" },
  "ryme-scarlet": { type: "Ghost", badge: "Ghost Badge" },
  "tulip-scarlet": { type: "Psychic", badge: "Psychic Badge" },
  "grusha-scarlet": { type: "Ice", badge: "Ice Badge" },
};
