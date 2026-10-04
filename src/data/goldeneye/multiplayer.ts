/**
 * GoldenEye 007 multiplayer (N64; Nintendo Switch Online + Expansion Pack since
 * Jan 27, 2023). Names only: no art (the James Bond trademark), so slots show the
 * "Image coming soon" placeholder. Researched 2026-10-04 from the game's own
 * multiplayer tables (n64decomp), the GoldenEye Wiki and StrategyWiki; full
 * notes in specs/research/2026-10-04-randomizers/goldeneye-mp.json.
 *
 *   maps          11; 6 open on a fresh save; some cap players at 3 or 2
 *   scenarios     8; team ones need exactly 4 (2v2, 3v1) or 3 (2v1) players
 *   weapon sets   14, all open from the start; Golden Gun forces its own set
 *   characters    8 at the start, 33 once Cradle is finished (duplicate names
 *                 listed once; a button code adds 31 cosmetic extras)
 *   lengths       Last Alive is You Only Live Twice only; Flag Tag allows time limits only
 */

export interface GoldenEyeMap { id: string; name: string; freshSave: boolean; maxPlayers: number; unlock?: string }
export interface GoldenEyeScenario { id: string; name: string; minPlayers: number; maxPlayers: number; teams: boolean; lengths: "noLastAlive" | "lastAlive" | "timeOnly"; blurb: string; forcesWeaponSet?: string; split?: number[] }
export interface GoldenEyeWeaponSet { id: string; name: string; weapons: string[] }
export interface GoldenEyeLength { id: string; label: string; minutes?: number; points?: number }
export interface GoldenEyeCharacter { name: string; start: boolean; group: "main" | "villain" | "extra" }

export const GOLDENEYE_MAPS: GoldenEyeMap[] = [
  {
    "id": "temple",
    "name": "Temple",
    "freshSave": true,
    "maxPlayers": 4
  },
  {
    "id": "complex",
    "name": "Complex",
    "freshSave": true,
    "maxPlayers": 4
  },
  {
    "id": "caves",
    "name": "Caves",
    "freshSave": true,
    "maxPlayers": 4
  },
  {
    "id": "library",
    "name": "Library",
    "freshSave": true,
    "maxPlayers": 4
  },
  {
    "id": "basement",
    "name": "Basement",
    "freshSave": true,
    "maxPlayers": 4
  },
  {
    "id": "stack",
    "name": "Stack",
    "freshSave": true,
    "maxPlayers": 4
  },
  {
    "id": "facility",
    "name": "Facility",
    "freshSave": false,
    "maxPlayers": 4,
    "unlock": "Reach Facility in Solo (finish Dam)"
  },
  {
    "id": "bunker",
    "name": "Bunker",
    "freshSave": false,
    "maxPlayers": 3,
    "unlock": "Reach the second Bunker mission in Solo (finish Surface 2)"
  },
  {
    "id": "archives",
    "name": "Archives",
    "freshSave": false,
    "maxPlayers": 3,
    "unlock": "Reach Archives in Solo (finish Statue)"
  },
  {
    "id": "caverns",
    "name": "Caverns",
    "freshSave": false,
    "maxPlayers": 3,
    "unlock": "Reach Caverns in Solo (finish Control)"
  },
  {
    "id": "egyptian",
    "name": "Egyptian",
    "freshSave": false,
    "maxPlayers": 2,
    "unlock": "Finish the Egyptian bonus mission (itself unlocked by finishing every mission on 00 Agent, Aztec included)"
  }
];

export const GOLDENEYE_SCENARIOS: GoldenEyeScenario[] = [
  {
    "id": "normal",
    "name": "Normal",
    "minPlayers": 2,
    "maxPlayers": 4,
    "teams": false,
    "lengths": "noLastAlive",
    "blurb": "Standard deathmatch: score by kills."
  },
  {
    "id": "yolt",
    "name": "You Only Live Twice",
    "minPlayers": 2,
    "maxPlayers": 4,
    "teams": false,
    "lengths": "lastAlive",
    "blurb": "Two lives each; last one standing wins."
  },
  {
    "id": "tld",
    "name": "The Living Daylights (Flag Tag)",
    "minPlayers": 2,
    "maxPlayers": 4,
    "teams": false,
    "lengths": "timeOnly",
    "blurb": "Hold the flag longest. The carrier can't use weapons or items."
  },
  {
    "id": "mwtgg",
    "name": "The Man with the Golden Gun",
    "minPlayers": 2,
    "maxPlayers": 4,
    "teams": false,
    "lengths": "noLastAlive",
    "blurb": "One Golden Gun (one-shot kills); kill its holder to take it.",
    "forcesWeaponSet": "golden-gun"
  },
  {
    "id": "ltk",
    "name": "License to Kill",
    "minPlayers": 2,
    "maxPlayers": 4,
    "teams": false,
    "lengths": "noLastAlive",
    "blurb": "Every hit kills, and handicaps are locked off."
  },
  {
    "id": "team-2v2",
    "name": "Team: 2 vs 2",
    "minPlayers": 4,
    "maxPlayers": 4,
    "teams": true,
    "lengths": "noLastAlive",
    "blurb": "Two teams of two; team kills score.",
    "split": [
      2,
      2
    ]
  },
  {
    "id": "team-3v1",
    "name": "Team: 3 vs 1",
    "minPlayers": 4,
    "maxPlayers": 4,
    "teams": true,
    "lengths": "noLastAlive",
    "blurb": "Three players against one.",
    "split": [
      3,
      1
    ]
  },
  {
    "id": "team-2v1",
    "name": "Team: 2 vs 1",
    "minPlayers": 3,
    "maxPlayers": 3,
    "teams": true,
    "lengths": "noLastAlive",
    "blurb": "Two players against one.",
    "split": [
      2,
      1
    ]
  }
];

export const GOLDENEYE_WEAPON_SETS: GoldenEyeWeaponSet[] = [
  {
    "id": "slappers-only",
    "name": "Slappers Only!",
    "weapons": []
  },
  {
    "id": "pistols",
    "name": "Pistols",
    "weapons": [
      "DD44 Dostovei",
      "PP7 (Silenced)",
      "Cougar Magnum"
    ]
  },
  {
    "id": "throwing-knives",
    "name": "Throwing Knives",
    "weapons": [
      "Throwing Knives"
    ]
  },
  {
    "id": "automatics",
    "name": "Automatics",
    "weapons": [
      "PP7 (Silenced)",
      "DD44 Dostovei",
      "Klobb",
      "D5K Deutsche"
    ]
  },
  {
    "id": "power-weapons",
    "name": "Power Weapons",
    "weapons": [
      "DD44 Dostovei",
      "Cougar Magnum",
      "RC-P90",
      "Automatic Shotgun"
    ]
  },
  {
    "id": "sniper-rifles",
    "name": "Sniper Rifles",
    "weapons": [
      "DD44 Dostovei",
      "Cougar Magnum",
      "Klobb",
      "Sniper Rifle"
    ]
  },
  {
    "id": "grenades",
    "name": "Grenades",
    "weapons": [
      "DD44 Dostovei",
      "Klobb",
      "KF7 Soviet",
      "Hand Grenade"
    ]
  },
  {
    "id": "remote-mines",
    "name": "Remote Mines",
    "weapons": [
      "PP7 Special Issue",
      "ZMG (9mm)",
      "US AR33 Assault Rifle",
      "Remote Mine"
    ]
  },
  {
    "id": "grenade-launchers",
    "name": "Grenade Launchers",
    "weapons": [
      "DD44 Dostovei",
      "Klobb",
      "KF7 Soviet",
      "Grenade Launcher"
    ]
  },
  {
    "id": "timed-mines",
    "name": "Timed Mines",
    "weapons": [
      "PP7 Special Issue",
      "ZMG (9mm)",
      "US AR33 Assault Rifle",
      "Timed Mine"
    ]
  },
  {
    "id": "proximity-mines",
    "name": "Proximity Mines",
    "weapons": [
      "PP7 Special Issue",
      "ZMG (9mm)",
      "US AR33 Assault Rifle",
      "Proximity Mine"
    ]
  },
  {
    "id": "rockets",
    "name": "Rockets",
    "weapons": [
      "DD44 Dostovei",
      "Klobb",
      "KF7 Soviet",
      "Rocket Launcher"
    ]
  },
  {
    "id": "lasers",
    "name": "Lasers",
    "weapons": [
      "DD44 Dostovei",
      "Klobb",
      "KF7 Soviet",
      "Moonraker Laser"
    ]
  },
  {
    "id": "golden-gun",
    "name": "Golden Gun",
    "weapons": [
      "DD44 Dostovei",
      "Klobb",
      "KF7 Soviet",
      "PP7 (Silenced)",
      "Golden Gun"
    ]
  }
];

export const GOLDENEYE_LENGTHS: GoldenEyeLength[] = [
  {
    "id": "unlimited",
    "label": "No limit"
  },
  {
    "id": "5min",
    "label": "5 minutes",
    "minutes": 5
  },
  {
    "id": "10min",
    "label": "10 minutes",
    "minutes": 10
  },
  {
    "id": "20min",
    "label": "20 minutes",
    "minutes": 20
  },
  {
    "id": "5pt",
    "label": "First to 5 points",
    "points": 5
  },
  {
    "id": "10pt",
    "label": "First to 10 points",
    "points": 10
  },
  {
    "id": "20pt",
    "label": "First to 20 points",
    "points": 20
  },
  {
    "id": "last-alive",
    "label": "Last person alive"
  }
];

export const GOLDENEYE_CHARACTERS: GoldenEyeCharacter[] = [
  {
    "name": "James Bond",
    "start": true,
    "group": "main"
  },
  {
    "name": "Natalya",
    "start": true,
    "group": "main"
  },
  {
    "name": "Trevelyan",
    "start": true,
    "group": "main"
  },
  {
    "name": "Xenia",
    "start": true,
    "group": "main"
  },
  {
    "name": "Ourumov",
    "start": true,
    "group": "main"
  },
  {
    "name": "Boris",
    "start": true,
    "group": "main"
  },
  {
    "name": "Valentin",
    "start": true,
    "group": "main"
  },
  {
    "name": "Mishkin",
    "start": true,
    "group": "main"
  },
  {
    "name": "Mayday",
    "start": false,
    "group": "villain"
  },
  {
    "name": "Jaws",
    "start": false,
    "group": "villain"
  },
  {
    "name": "Oddjob",
    "start": false,
    "group": "villain"
  },
  {
    "name": "Baron Samedi",
    "start": false,
    "group": "villain"
  },
  {
    "name": "Russian Soldier",
    "start": false,
    "group": "extra"
  },
  {
    "name": "Russian Infantry",
    "start": false,
    "group": "extra"
  },
  {
    "name": "Scientist",
    "start": false,
    "group": "extra"
  },
  {
    "name": "Russian Commandant",
    "start": false,
    "group": "extra"
  },
  {
    "name": "Janus Marine",
    "start": false,
    "group": "extra"
  },
  {
    "name": "Naval Officer",
    "start": false,
    "group": "extra"
  },
  {
    "name": "Helicopter Pilot",
    "start": false,
    "group": "extra"
  },
  {
    "name": "St. Petersburg Guard",
    "start": false,
    "group": "extra"
  },
  {
    "name": "Civilian",
    "start": false,
    "group": "extra"
  },
  {
    "name": "Siberian Guard",
    "start": false,
    "group": "extra"
  },
  {
    "name": "Arctic Commando",
    "start": false,
    "group": "extra"
  },
  {
    "name": "Siberian Special Forces",
    "start": false,
    "group": "extra"
  },
  {
    "name": "Jungle Commando",
    "start": false,
    "group": "extra"
  },
  {
    "name": "Janus Special Forces",
    "start": false,
    "group": "extra"
  },
  {
    "name": "Moonraker Elite",
    "start": false,
    "group": "extra"
  }
];

/** Health handicaps, as the menu lists them. */
export const GOLDENEYE_HANDICAPS: string[] = ["Health -10 (Hero)", "Health -4 (Veteran)", "Health -3 (Veteran)", "Health -2 (Veteran)", "Health -1 (Veteran)", "Health +0 (Normal)", "Health +1 (Novice)", "Health +2 (Novice)", "Health +3 (Novice)", "Health +4 (Novice)", "Health +10 (Rookie)"];

/** Multiplayer cheats (each unlocked in Solo). */
export const GOLDENEYE_CHEATS: string[] = ["Invincible", "Infinite Ammo", "DK Mode", "Paintball Mode", "No Radar (Multi)", "Turbo Mode"];
