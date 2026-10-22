/**
 * Daily Duel test fixtures: a small card set, pool and trainers shaped like the real data
 * (src/data/originals/duel/, made by another script). Numbers are close to the real cards but
 * these are only for tests and for building days before the real data exists.
 */

import type { DuelCard, DuelTrainer, EnergyType } from "../src/lib/originals/duel/types";

const G: EnergyType = "Grass", R: EnergyType = "Fire", W: EnergyType = "Water", L: EnergyType = "Lightning", P: EnergyType = "Psychic";
const F: EnergyType = "Fighting", K: EnergyType = "Darkness", M: EnergyType = "Metal", X: EnergyType = "Colorless";

function card(id: string, name: string, t: EnergyType, hp: number, weak: EnergyType | null, moves: [string, EnergyType[], number][], ex = false): DuelCard {
  const short = name.replace(/^.*?'s\s+/, "");
  return { id, name, short, t, hp, weak, ex, img: null, moves: moves.map(([n, cost, d]) => ({ n, cost, d })) };
}

// The mockup's Cynthia and pool (solve.cjs), plus more of each so packs vary.
const LIST: DuelCard[] = [
  // Cynthia (champion)
  card("me2pt5-244", "Spiritomb", K, 70, G, [["Raging Curse", [X], 10]]),
  card("sv10-184", "Roserade", G, 130, R, [["Leaf Step", [G, X, X], 80]]),
  card("me2pt5-235", "Togekiss", P, 140, M, [["Speed Wing", [X, X, X], 140]]),
  card("me2pt5-113", "Mega Lucario ex", F, 340, P, [["Aura Jab", [F], 130], ["Mega Brave", [F, F], 270]], true),
  card("sv10-53", "Milotic", W, 130, L, [["Aqua Split", [W, X], 60]]),
  card("sv10-232", "Cynthia's Garchomp ex", F, 330, G, [["Corkscrew Dive", [F], 100], ["Draconic Buster", [F, F], 260]], true),
  // Brock (gym)
  card("fx-geodude", "Geodude", F, 80, G, [["Rock Throw", [F], 20], ["Tackle", [F, X], 40]]),
  card("fx-graveler", "Graveler", F, 110, G, [["Rock Slide", [F, X], 50]]),
  card("fx-onix", "Brock's Onix", F, 140, G, [["Tackle", [X, X], 30], ["Heavy Impact", [F, F, X], 110]]),
  // Misty (gym)
  card("fx-staryu", "Staryu", W, 70, L, [["Water Gun", [W], 20]]),
  card("fx-psyduck", "Psyduck", W, 70, L, [["Headache", [X], 10], ["Water Splash", [W, X], 40]]),
  card("fx-starmie", "Misty's Starmie", W, 110, L, [["Swift", [W, X], 60], ["Star Burst", [W, W, X], 100]]),
  // Lorelei (elite)
  card("fx-dewgong", "Dewgong", W, 130, M, [["Aurora Beam", [W, X], 50], ["Ice Beam", [W, W, X], 100]]),
  card("fx-cloyster", "Cloyster", W, 120, M, [["Spike Cannon", [W, X], 60]]),
  card("fx-slowbro", "Slowbro", P, 130, K, [["Psychic", [P, X], 50], ["Big Splash", [P, X, X], 100]]),
  card("fx-jynx", "Jynx", P, 100, K, [["Ice Punch", [P, X], 60]]),
  card("fx-lapras", "Lorelei's Lapras", W, 140, M, [["Body Slam", [X, X], 40], ["Blizzard", [W, W, X], 110]]),
  // Blue (rival)
  card("fx-pidgeot", "Pidgeot", X, 140, L, [["Gust", [X, X], 50], ["Hurricane", [X, X, X], 120]]),
  card("fx-alakazam", "Alakazam", P, 130, K, [["Psybeam", [P, X], 60], ["Psychic", [P, P, X], 110]]),
  card("fx-rhydon", "Rhydon", F, 150, G, [["Horn Attack", [F, X], 60], ["Rock Smash", [F, F, X], 120]]),
  card("fx-gyarados", "Gyarados", W, 180, L, [["Waterfall", [W, X, X], 90], ["Hyper Beam", [W, W, X, X], 160]]),
  card("fx-arcanine", "Blue's Arcanine", R, 150, W, [["Bite", [X, X], 40], ["Flare Blitz", [R, R, X], 130]]),
  // the pool
  card("rsv10pt5-167", "Keldeo ex", W, 210, L, [["Gale Thrust", [W, X], 30], ["Sonic Edge", [W, X, X], 120]], true),
  card("me1-135", "Exeggutor", G, 140, R, [["Guard Press", [G], 30], ["Stomping Wood", [X, X, X], 60]]),
  card("sv3pt5-105", "Marowak", F, 120, G, [["Bone Throw", [F], 30], ["Boundless Power", [F, X], 120]]),
  card("svp-122", "Snorlax", X, 160, F, [["Lazy Press", [X, X, X, X], 120]]),
  card("me1-93", "Steelix", M, 200, R, [["Welcoming Tail", [X, X], 40], ["Skull Bash", [M, M, X, X], 140]]),
  card("sv9-73", "Grimmsnarl", P, 170, M, [["Shadowy Knot", [P], 50], ["Mega Punch", [P, X], 120]]),
  card("rsv10pt5-20", "Reshiram ex", R, 230, W, [["Slash", [X, X], 50], ["Blazing Burst", [R, R, X], 130]], true),
  card("sv4-248", "Iron Hands ex", L, 230, F, [["Arm Press", [L, L, X], 160], ["Amp You Very Much", [L, X, X, X], 120]], true),
  card("fx-venusaur", "Venusaur", G, 180, R, [["Razor Leaf", [G, X], 60], ["Solar Beam", [G, G, X], 140]]),
  card("fx-raichu", "Raichu", L, 120, F, [["Quick Attack", [L], 30], ["Thunderbolt", [L, L], 120]]),
  card("fx-machamp", "Machamp", F, 170, P, [["Karate Chop", [F], 50], ["Cross Chop", [F, F, X], 150]]),
  card("fx-gengar", "Gengar", P, 130, K, [["Shadow Ball", [P, X], 70], ["Nightmare", [P, P], 110]]),
  card("fx-umbreon", "Umbreon", K, 130, G, [["Bite", [K], 40], ["Dark Pulse", [K, X], 90]]),
  card("fx-scizor", "Scizor", M, 140, R, [["Metal Claw", [M], 40], ["Bullet Punch", [M, X], 90]]),
  card("fx-blastoise", "Blastoise", W, 180, L, [["Water Gun", [W], 30], ["Hydro Pump", [W, W, X], 140]]),
  card("fx-charizard", "Charizard", R, 180, W, [["Slash", [X, X], 60], ["Fire Spin", [R, R, X], 160]]),
  card("fx-dragonite", "Dragonite", "Dragon", 180, null, [["Wing Attack", [X, X], 60], ["Outrage", [W, L, X], 160]]),
  card("fx-zapdos-ex", "Zapdos ex", L, 200, F, [["Pierce", [L], 30], ["Thunder", [L, L, X], 180]], true),
  card("fx-lucario", "Lucario", F, 130, P, [["Aura Sphere", [F, X], 80]]),
  card("fx-pikachu", "Pikachu", L, 70, F, [["Thunder Shock", [L], 20], ["Electro Ball", [L, X], 60]]),
];

export const FIX_CARDS: Record<string, DuelCard> = Object.fromEntries(LIST.map((c) => [c.id, c]));

export const FIX_POOL: string[] = [
  "rsv10pt5-167", "me1-135", "sv3pt5-105", "svp-122", "me1-93", "sv9-73", "rsv10pt5-20", "sv4-248",
  "fx-venusaur", "fx-raichu", "fx-machamp", "fx-gengar", "fx-umbreon", "fx-scizor", "fx-blastoise", "fx-charizard",
  "fx-dragonite", "fx-zapdos-ex", "fx-lucario", "fx-pikachu",
];

/** The mockup's eight-card pool against Cynthia (solve.cjs). */
export const MOCKUP_POOL: string[] = ["rsv10pt5-167", "me1-135", "sv3pt5-105", "svp-122", "me1-93", "sv9-73", "rsv10pt5-20", "sv4-248"];

export const FIX_TRAINERS: DuelTrainer[] = [
  { id: "brock-red", name: "Brock", title: "Pewter City Gym Leader", game: "Pokémon Red and Blue", tier: "gym", team: ["fx-geodude", "fx-graveler", "fx-onix"], signature: { title: "Brock's rock-solid defense", effect: "heal50" } },
  { id: "misty-red", name: "Misty", title: "Cerulean City Gym Leader", game: "Pokémon Red and Blue", tier: "gym", team: ["fx-staryu", "fx-psyduck", "fx-starmie"], signature: { title: "Misty's tidal wave", effect: "boost30" } },
  { id: "lorelei-red", name: "Lorelei", title: "Elite Four", game: "Pokémon Red and Blue", tier: "elite", team: ["fx-dewgong", "fx-cloyster", "fx-slowbro", "fx-jynx", "fx-lapras"], signature: { title: "Lorelei's ice wall", effect: "heal50" } },
  { id: "blue-red", name: "Blue", title: "Rival", game: "Pokémon Red and Blue", tier: "rival", team: ["fx-pidgeot", "fx-alakazam", "fx-rhydon", "fx-gyarados", "fx-arcanine"], signature: { title: "Blue's smell ya later", effect: "energy2" } },
  { id: "cynthia-platinum", name: "Cynthia", title: "Champion of Sinnoh", game: "Pokémon Platinum", tier: "champion", team: ["me2pt5-244", "sv10-184", "me2pt5-235", "me2pt5-113", "sv10-53", "sv10-232"], signature: { title: "Cynthia's resolve", effect: "energy2" } },
];
