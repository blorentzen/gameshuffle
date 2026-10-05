import type { HeroGame } from "@/lib/heroes/types";

/**
 * Marvel Rivals hero roulette data. Generated from
 * specs/research/2026-10-05-randomizers/marvel-rivals.json (Fandom wiki,
 * cross-checked with turbosmurfs). Deadpool counts as every role ("all").
 * Team-Ups follow the July 2026 system: a pair of heroes, where `partners` is
 * the hero who equips it and `anchor` the partner who switches on its extra
 * effect. Maps are the 18 core 6v6 maps. Names only, no art.
 */
export const MARVEL_RIVALS: HeroGame = {
  slug: "marvel-rivals",
  label: "Marvel Rivals",
  short: "Marvel Rivals",
  checkedOn: "2026-10-05",
  teamSize: 6,
  roles: [
    { id: "vanguard", label: "Vanguard", color: "#2f6fd6", icon: "shield" },
    { id: "duelist", label: "Duelist", color: "#c8413b", icon: "sword" },
    { id: "strategist", label: "Strategist", color: "#22936a", icon: "heart" },
  ],
  heroes: [
  {
    "name": "Doctor Strange",
    "role": "vanguard",
    "released": "2024-12-06"
  },
  {
    "name": "Hulk",
    "role": "vanguard",
    "released": "2024-12-06"
  },
  {
    "name": "Iron Man",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Spider-Man",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Luna Snow",
    "role": "strategist",
    "released": "2024-12-06"
  },
  {
    "name": "Namor",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Loki",
    "role": "strategist",
    "released": "2024-12-06"
  },
  {
    "name": "Black Panther",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Magik",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Rocket Raccoon",
    "role": "strategist",
    "released": "2024-12-06"
  },
  {
    "name": "Groot",
    "role": "vanguard",
    "released": "2024-12-06"
  },
  {
    "name": "Peni Parker",
    "role": "vanguard",
    "released": "2024-12-06"
  },
  {
    "name": "Storm",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Magneto",
    "role": "vanguard",
    "released": "2024-12-06"
  },
  {
    "name": "Star-Lord",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Mantis",
    "role": "strategist",
    "released": "2024-12-06"
  },
  {
    "name": "The Punisher",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Scarlet Witch",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Hela",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Venom",
    "role": "vanguard",
    "released": "2024-12-06"
  },
  {
    "name": "Adam Warlock",
    "role": "strategist",
    "released": "2024-12-06"
  },
  {
    "name": "Thor",
    "role": "vanguard",
    "released": "2024-12-06"
  },
  {
    "name": "Jeff the Land Shark",
    "role": "strategist",
    "released": "2024-12-06"
  },
  {
    "name": "Winter Soldier",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Captain America",
    "role": "vanguard",
    "released": "2024-12-06"
  },
  {
    "name": "Psylocke",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Moon Knight",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Hawkeye",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Squirrel Girl",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Iron Fist",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Black Widow",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Cloak & Dagger",
    "role": "strategist",
    "released": "2024-12-06"
  },
  {
    "name": "Wolverine",
    "role": "duelist",
    "released": "2024-12-06"
  },
  {
    "name": "Mister Fantastic",
    "role": "duelist",
    "released": "2025-01-10"
  },
  {
    "name": "Invisible Woman",
    "role": "strategist",
    "released": "2025-01-10"
  },
  {
    "name": "Human Torch",
    "role": "duelist",
    "released": "2025-02-21"
  },
  {
    "name": "The Thing",
    "role": "vanguard",
    "released": "2025-02-21"
  },
  {
    "name": "Emma Frost",
    "role": "vanguard",
    "released": "2025-04-11"
  },
  {
    "name": "Ultron",
    "role": "strategist",
    "released": "2025-05-30"
  },
  {
    "name": "Phoenix",
    "role": "duelist",
    "released": "2025-07-11"
  },
  {
    "name": "Blade",
    "role": "duelist",
    "released": "2025-08-08"
  },
  {
    "name": "Angela",
    "role": "vanguard",
    "released": "2025-09-12"
  },
  {
    "name": "Daredevil",
    "role": "duelist",
    "released": "2025-10-10"
  },
  {
    "name": "Gambit",
    "role": "strategist",
    "released": "2025-11-14"
  },
  {
    "name": "Rogue",
    "role": "vanguard",
    "released": "2025-12-12"
  },
  {
    "name": "Deadpool",
    "role": "all",
    "released": "2026-01-16"
  },
  {
    "name": "Elsa Bloodstone",
    "role": "duelist",
    "released": "2026-02-13"
  },
  {
    "name": "White Fox",
    "role": "strategist",
    "released": "2026-03-20"
  },
  {
    "name": "Black Cat",
    "role": "duelist",
    "released": "2026-04-17"
  },
  {
    "name": "Devil Dinosaur",
    "role": "vanguard",
    "released": "2026-05-15"
  },
  {
    "name": "Cyclops",
    "role": "duelist",
    "released": "2026-06-12"
  },
  {
    "name": "Jubilee",
    "role": "strategist",
    "released": "2026-07-10"
  },
  {
    "name": "The Hood",
    "role": "vanguard",
    "released": "2026-08-07"
  },
  {
    "name": "Gorr the God Butcher",
    "role": "duelist",
    "released": "2026-09-11"
  }
],
  teamUps: [
  {
    "name": "Gamma Maelstrom",
    "anchor": "Hulk",
    "partners": [
      "Doctor Strange"
    ]
  },
  {
    "name": "Psionic Vortex",
    "anchor": "Invisible Woman",
    "partners": [
      "Doctor Strange"
    ]
  },
  {
    "name": "Savage Slam",
    "anchor": "Captain America",
    "partners": [
      "Hulk"
    ]
  },
  {
    "name": "Gamma Fastball",
    "anchor": "Wolverine",
    "partners": [
      "Hulk"
    ]
  },
  {
    "name": "Gamma Charge",
    "anchor": "Hulk",
    "partners": [
      "Iron Man"
    ]
  },
  {
    "name": "Thunder Overdrive",
    "anchor": "Thor",
    "partners": [
      "Iron Man"
    ]
  },
  {
    "name": "Symbiote Bond",
    "anchor": "Venom",
    "partners": [
      "Spider-Man"
    ]
  },
  {
    "name": "Parker Power-Up",
    "anchor": "Peni Parker",
    "partners": [
      "Spider-Man"
    ]
  },
  {
    "name": "Atlas Bond",
    "anchor": "White Fox",
    "partners": [
      "Luna Snow"
    ]
  },
  {
    "name": "Duality Dance",
    "anchor": "Adam Warlock",
    "partners": [
      "Luna Snow"
    ]
  },
  {
    "name": "Chilling Charisma",
    "anchor": "Luna Snow",
    "partners": [
      "Namor"
    ]
  },
  {
    "name": "Gamma Monstro",
    "anchor": "Hulk",
    "partners": [
      "Namor"
    ]
  },
  {
    "name": "Vibrant Vitality",
    "anchor": "Mantis",
    "partners": [
      "Loki"
    ]
  },
  {
    "name": "Villain's Illusion",
    "anchor": "Hela",
    "partners": [
      "Loki"
    ]
  },
  {
    "name": "Damisa-Yao",
    "anchor": "Storm",
    "partners": [
      "Black Panther"
    ]
  },
  {
    "name": "Dimensional Shortcut",
    "anchor": "Magik",
    "partners": [
      "Black Panther"
    ]
  },
  {
    "name": "Chain of Cyttorak",
    "anchor": "Doctor Strange",
    "partners": [
      "Magik"
    ]
  },
  {
    "name": "Void Pentagram",
    "anchor": "The Hood",
    "partners": [
      "Magik"
    ]
  },
  {
    "name": "Planet X Pals",
    "anchor": "Groot",
    "partners": [
      "Rocket Raccoon"
    ]
  },
  {
    "name": "Mammalian Bond",
    "anchor": "Squirrel Girl",
    "partners": [
      "Rocket Raccoon"
    ]
  },
  {
    "name": "Wild Wall",
    "anchor": "Mantis",
    "partners": [
      "Groot"
    ]
  },
  {
    "name": "Bubble Buddies",
    "anchor": "Jeff the Land Shark",
    "partners": [
      "Groot"
    ]
  },
  {
    "name": "Vibranium Mech",
    "anchor": "Black Panther",
    "partners": [
      "Peni Parker"
    ]
  },
  {
    "name": "Rocket Network",
    "anchor": "Rocket Raccoon",
    "partners": [
      "Peni Parker"
    ]
  },
  {
    "name": "Gods of Thunder",
    "anchor": "Thor",
    "partners": [
      "Storm"
    ]
  },
  {
    "name": "Jaws of Fate",
    "anchor": "Jeff the Land Shark",
    "partners": [
      "Storm"
    ]
  },
  {
    "name": "Metallic Chaos",
    "anchor": "Scarlet Witch",
    "partners": [
      "Magneto"
    ]
  },
  {
    "name": "Magnetic Resonance",
    "anchor": "Emma Frost",
    "partners": [
      "Magneto"
    ]
  },
  {
    "name": "Flora Munitions",
    "anchor": "Groot",
    "partners": [
      "Star-Lord"
    ]
  },
  {
    "name": "Star-Soul",
    "anchor": "Adam Warlock",
    "partners": [
      "Star-Lord"
    ]
  },
  {
    "name": "Star Blossom",
    "anchor": "Star-Lord",
    "partners": [
      "Mantis"
    ]
  },
  {
    "name": "Vitality Pact",
    "anchor": "Adam Warlock",
    "partners": [
      "Mantis"
    ]
  },
  {
    "name": "Ammo Overload",
    "anchor": "Rocket Raccoon",
    "partners": [
      "The Punisher"
    ]
  },
  {
    "name": "Bestial Hunt",
    "anchor": "Daredevil",
    "partners": [
      "The Punisher"
    ]
  },
  {
    "name": "Sorcerers Supreme",
    "anchor": "Doctor Strange",
    "partners": [
      "Scarlet Witch"
    ]
  },
  {
    "name": "Hex Fireworks",
    "anchor": "Jubilee",
    "partners": [
      "Scarlet Witch"
    ]
  },
  {
    "name": "Hel Tendrils",
    "anchor": "Venom",
    "partners": [
      "Hela"
    ]
  },
  {
    "name": "Deep Wrath",
    "anchor": "Namor",
    "partners": [
      "Hela"
    ]
  },
  {
    "name": "Blood Leech",
    "anchor": "Blade",
    "partners": [
      "Venom"
    ]
  },
  {
    "name": "Abyssal Flames",
    "anchor": "Phoenix",
    "partners": [
      "Venom"
    ]
  },
  {
    "name": "Cosmic Cyclone",
    "anchor": "Storm",
    "partners": [
      "Adam Warlock"
    ]
  },
  {
    "name": "Flawless Design",
    "anchor": "Ultron",
    "partners": [
      "Adam Warlock"
    ]
  },
  {
    "name": "Ragnarok Rebirth",
    "anchor": "Hela",
    "partners": [
      "Thor"
    ]
  },
  {
    "name": "Divine Armory",
    "anchor": "Angela",
    "partners": [
      "Thor"
    ]
  },
  {
    "name": "Guardian of the Deep",
    "anchor": "Venom",
    "partners": [
      "Jeff the Land Shark"
    ]
  },
  {
    "name": "Mr. Pool's Interdimensional Toy Box",
    "anchor": "Deadpool",
    "partners": [
      "Jeff the Land Shark"
    ]
  },
  {
    "name": "Timeless Veterans",
    "anchor": "The Punisher",
    "partners": [
      "Winter Soldier"
    ]
  },
  {
    "name": "Expert Instinct",
    "anchor": "Elsa Bloodstone",
    "partners": [
      "Winter Soldier"
    ]
  },
  {
    "name": "Voltaic Union",
    "anchor": "Thor",
    "partners": [
      "Captain America"
    ]
  },
  {
    "name": "Stars Aligned",
    "anchor": "Winter Soldier",
    "partners": [
      "Captain America"
    ]
  },
  {
    "name": "Light & Dark Darts",
    "anchor": "Cloak & Dagger",
    "partners": [
      "Psylocke"
    ]
  },
  {
    "name": "Mental Projection",
    "anchor": "Emma Frost",
    "partners": [
      "Psylocke"
    ]
  },
  {
    "name": "Luminous Moon",
    "anchor": "Cloak & Dagger",
    "partners": [
      "Moon Knight"
    ]
  },
  {
    "name": "Blood Moon",
    "anchor": "Elsa Bloodstone",
    "partners": [
      "Moon Knight"
    ]
  },
  {
    "name": "Moonlit Slash",
    "anchor": "Cloak & Dagger",
    "partners": [
      "Hawkeye"
    ]
  },
  {
    "name": "Senbonzakura Strike",
    "anchor": "Psylocke",
    "partners": [
      "Hawkeye"
    ]
  },
  {
    "name": "Squirrel Missile",
    "anchor": "Iron Man",
    "partners": [
      "Squirrel Girl"
    ]
  },
  {
    "name": "ESU Alumnus",
    "anchor": "Spider-Man",
    "partners": [
      "Squirrel Girl"
    ]
  },
  {
    "name": "Kumiho Palm",
    "anchor": "White Fox",
    "partners": [
      "Iron Fist"
    ]
  },
  {
    "name": "Iron & Stone",
    "anchor": "The Thing",
    "partners": [
      "Iron Fist"
    ]
  },
  {
    "name": "Allied Agents",
    "anchor": "Hawkeye",
    "partners": [
      "Black Widow"
    ]
  },
  {
    "name": "Burning Bullets",
    "anchor": "Phoenix",
    "partners": [
      "Black Widow"
    ]
  },
  {
    "name": "Oblivion Shroud",
    "anchor": "The Hood",
    "partners": [
      "Cloak & Dagger"
    ]
  },
  {
    "name": "Frozen Haven",
    "anchor": "Luna Snow",
    "partners": [
      "Cloak & Dagger"
    ]
  },
  {
    "name": "Pair of Threes",
    "anchor": "Gambit",
    "partners": [
      "Wolverine"
    ]
  },
  {
    "name": "Blast Slash",
    "anchor": "Cyclops",
    "partners": [
      "Wolverine"
    ]
  },
  {
    "name": "Fantastic Amplifier",
    "anchor": "Rocket Raccoon",
    "partners": [
      "Mister Fantastic"
    ]
  },
  {
    "name": "Clobberin' Research Dept.",
    "anchor": "The Thing",
    "partners": [
      "Mister Fantastic"
    ]
  },
  {
    "name": "United Siblings",
    "anchor": "Human Torch",
    "partners": [
      "Invisible Woman"
    ]
  },
  {
    "name": "First Family",
    "anchor": "Mister Fantastic",
    "partners": [
      "Invisible Woman"
    ]
  },
  {
    "name": "Fiery Sparks",
    "anchor": "Jubilee",
    "partners": [
      "Human Torch"
    ]
  },
  {
    "name": "Storming Ignition",
    "anchor": "Storm",
    "partners": [
      "Human Torch"
    ]
  },
  {
    "name": "Two-In-One",
    "anchor": "Human Torch",
    "partners": [
      "The Thing"
    ]
  },
  {
    "name": "Unbreakable Forces",
    "anchor": "Invisible Woman",
    "partners": [
      "The Thing"
    ]
  },
  {
    "name": "Iced Out Diamond",
    "anchor": "Luna Snow",
    "partners": [
      "Emma Frost"
    ]
  },
  {
    "name": "Spirit Breaker",
    "anchor": "Mantis",
    "partners": [
      "Emma Frost"
    ]
  },
  {
    "name": "Stark Protocol",
    "anchor": "Iron Man",
    "partners": [
      "Ultron"
    ]
  },
  {
    "name": "SP//dr Sync",
    "anchor": "Peni Parker",
    "partners": [
      "Ultron"
    ]
  },
  {
    "name": "Circle of Life",
    "anchor": "Hela",
    "partners": [
      "Phoenix"
    ]
  },
  {
    "name": "Telekinetic Beatdown",
    "anchor": "Rogue",
    "partners": [
      "Phoenix"
    ]
  },
  {
    "name": "Blade of Khonshu",
    "anchor": "Moon Knight",
    "partners": [
      "Blade"
    ]
  },
  {
    "name": "Bleed for Battle",
    "anchor": "Captain America",
    "partners": [
      "Blade"
    ]
  },
  {
    "name": "Odin's Unacknowledged",
    "anchor": "Loki",
    "partners": [
      "Angela"
    ]
  },
  {
    "name": "Asgardians of the Galaxy",
    "anchor": "Star-Lord",
    "partners": [
      "Angela"
    ]
  },
  {
    "name": "Comprehensive Defense",
    "anchor": "Iron Fist",
    "partners": [
      "Daredevil"
    ]
  },
  {
    "name": "Devilish Affair",
    "anchor": "Black Widow",
    "partners": [
      "Daredevil"
    ]
  },
  {
    "name": "Favorable Odds",
    "anchor": "Magneto",
    "partners": [
      "Gambit"
    ]
  },
  {
    "name": "Sparkling Staff",
    "anchor": "Jubilee",
    "partners": [
      "Gambit"
    ]
  },
  {
    "name": "Mr. & Mrs. X",
    "anchor": "Gambit",
    "partners": [
      "Rogue"
    ]
  },
  {
    "name": "Explosive Entanglement",
    "anchor": "Magneto",
    "partners": [
      "Rogue"
    ]
  },
  {
    "name": "Gumbo Chimichangas",
    "anchor": "Gambit",
    "partners": [
      "Deadpool"
    ]
  },
  {
    "name": "Hel-Yeah, Honey",
    "anchor": "Hela",
    "partners": [
      "Deadpool"
    ]
  },
  {
    "name": "Prehistoric Trap",
    "anchor": "Devil Dinosaur",
    "partners": [
      "Elsa Bloodstone"
    ]
  },
  {
    "name": "Loudmouth Mercs",
    "anchor": "Deadpool",
    "partners": [
      "Elsa Bloodstone"
    ]
  },
  {
    "name": "Lucky Loan",
    "anchor": "Black Cat",
    "partners": [
      "White Fox"
    ]
  },
  {
    "name": "Psionic Fox",
    "anchor": "Psylocke",
    "partners": [
      "White Fox"
    ]
  },
  {
    "name": "Feline Alliance",
    "anchor": "Black Panther",
    "partners": [
      "Black Cat"
    ]
  },
  {
    "name": "Binding Ties",
    "anchor": "Spider-Man",
    "partners": [
      "Black Cat"
    ]
  },
  {
    "name": "Surf & Turf",
    "anchor": "Jeff the Land Shark",
    "partners": [
      "Devil Dinosaur"
    ]
  },
  {
    "name": "Primal Punishment",
    "anchor": "The Punisher",
    "partners": [
      "Devil Dinosaur"
    ]
  },
  {
    "name": "Slim and Red",
    "anchor": "Phoenix",
    "partners": [
      "Cyclops"
    ]
  },
  {
    "name": "Kinetic Kin",
    "anchor": "Gambit",
    "partners": [
      "Cyclops"
    ]
  },
  {
    "name": "Hellfire Sparks",
    "anchor": "The Hood",
    "partners": [
      "Jubilee"
    ]
  },
  {
    "name": "Vampiric Kin",
    "anchor": "Blade",
    "partners": [
      "Jubilee"
    ]
  },
  {
    "name": "Chaos Collision",
    "anchor": "Scarlet Witch",
    "partners": [
      "The Hood"
    ]
  },
  {
    "name": "New Moon's Shadow",
    "anchor": "Moon Knight",
    "partners": [
      "The Hood"
    ]
  },
  {
    "name": "Ragnarök",
    "anchor": "Hela",
    "partners": [
      "Gorr the God Butcher"
    ]
  },
  {
    "name": "Hive Mind",
    "anchor": "Venom",
    "partners": [
      "Gorr the God Butcher"
    ]
  }
],
  maps: [
  {
    "name": "Klyntar: Symbiotic Surface",
    "mode": "Convergence"
  },
  {
    "name": "Tokyo 2099: Shin-Shibuya",
    "mode": "Convergence"
  },
  {
    "name": "Intergalactic Empire of Wakanda: Hall of Djalia",
    "mode": "Convergence"
  },
  {
    "name": "Empire of Eternal Night: Central Park",
    "mode": "Convergence"
  },
  {
    "name": "K'un-Lun: Heart of Heaven",
    "mode": "Convergence"
  },
  {
    "name": "Lower Manhattan",
    "mode": "Convergence"
  },
  {
    "name": "Yggsgard: Yggdrasill Path",
    "mode": "Convoy"
  },
  {
    "name": "Tokyo 2099: Spider-Islands",
    "mode": "Convoy"
  },
  {
    "name": "Empire of Eternal Night: Midtown",
    "mode": "Convoy"
  },
  {
    "name": "Hellfire Gala: Arakko",
    "mode": "Convoy"
  },
  {
    "name": "Museum of Contemplation",
    "mode": "Convoy"
  },
  {
    "name": "Thebes",
    "mode": "Convoy"
  },
  {
    "name": "Yggsgard: Royal Palace",
    "mode": "Domination"
  },
  {
    "name": "Hydra Charteris Base: Hell's Heaven",
    "mode": "Domination"
  },
  {
    "name": "Intergalactic Empire of Wakanda: Birnin T'Challa",
    "mode": "Domination"
  },
  {
    "name": "Hellfire Gala: Krakoa",
    "mode": "Domination"
  },
  {
    "name": "Klyntar: Celestial Husk",
    "mode": "Domination"
  },
  {
    "name": "God Quarry",
    "mode": "Domination"
  }
],
};
