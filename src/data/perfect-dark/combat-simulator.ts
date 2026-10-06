import type { PdData } from "@/lib/perfectdark/types";

/**
 * Perfect Dark Combat Simulator data (N64, Nintendo Switch Online + Expansion
 * Pack since 2024-06-18). Generated from
 * specs/research/2026-10-05-randomizers/perfect-dark-mp.json: unlock rules from
 * the n64decomp/perfect_dark decompilation, cross-checked with Perfect Dark
 * Recon and two guides. "start" = open on a new save; everything else opens
 * through Combat Simulator challenges (or, for weapons, by picking it up in Solo).
 * Characters: main = Joanna's outfits and the named story characters;
 * additional = guards, agents and staff (Jonathan, never selectable, and the
 * four identical Dinner Jacket bodies are left out). Chaos options are the
 * match-wide modifiers worth rolling.
 */
export const PERFECT_DARK: PdData = {
  "arenas": [
    {
      "id": "skedar",
      "name": "Skedar",
      "available": "start",
      "unlock": null,
      "goldeneyeClassic": false
    },
    {
      "id": "pipes",
      "name": "Pipes",
      "available": "start",
      "unlock": null,
      "goldeneyeClassic": false
    },
    {
      "id": "ravine",
      "name": "Ravine",
      "available": "unlock",
      "unlock": "Finish 5 Combat Simulator challenges (it opens together with Challenge 9)",
      "goldeneyeClassic": false
    },
    {
      "id": "g5-building",
      "name": "G5 Building",
      "available": "unlock",
      "unlock": "Finish 9 Combat Simulator challenges (it opens together with Challenge 13)",
      "goldeneyeClassic": false
    },
    {
      "id": "sewers",
      "name": "Sewers",
      "available": "unlock",
      "unlock": "Finish 16 Combat Simulator challenges (it opens together with Challenge 20)",
      "goldeneyeClassic": false
    },
    {
      "id": "warehouse",
      "name": "Warehouse",
      "available": "unlock",
      "unlock": "Finish 3 Combat Simulator challenges (it opens together with Challenge 7)",
      "goldeneyeClassic": false
    },
    {
      "id": "grid",
      "name": "Grid",
      "available": "unlock",
      "unlock": "Finish 11 Combat Simulator challenges (it opens together with Challenge 15)",
      "goldeneyeClassic": false
    },
    {
      "id": "ruins",
      "name": "Ruins",
      "available": "unlock",
      "unlock": "Finish 22 Combat Simulator challenges (it opens together with Challenge 26)",
      "goldeneyeClassic": false
    },
    {
      "id": "area-52",
      "name": "Area 52",
      "available": "start",
      "unlock": null,
      "goldeneyeClassic": false
    },
    {
      "id": "base",
      "name": "Base",
      "available": "unlock",
      "unlock": "Finish 18 Combat Simulator challenges (it opens together with Challenge 22)",
      "goldeneyeClassic": false
    },
    {
      "id": "fortress",
      "name": "Fortress",
      "available": "unlock",
      "unlock": "Finish 20 Combat Simulator challenges (it opens together with Challenge 24)",
      "goldeneyeClassic": false
    },
    {
      "id": "villa",
      "name": "Villa",
      "available": "unlock",
      "unlock": "Finish 14 Combat Simulator challenges (it opens together with Challenge 18)",
      "goldeneyeClassic": false
    },
    {
      "id": "car-park",
      "name": "Car Park",
      "available": "unlock",
      "unlock": "Finish 17 Combat Simulator challenges (it opens together with Challenge 21)",
      "goldeneyeClassic": false
    },
    {
      "id": "temple",
      "name": "Temple",
      "available": "unlock",
      "unlock": "Finish 6 Combat Simulator challenges (it opens together with Challenge 10)",
      "goldeneyeClassic": true
    },
    {
      "id": "complex",
      "name": "Complex",
      "available": "unlock",
      "unlock": "Finish 1 Combat Simulator challenge (it opens together with Challenge 5)",
      "goldeneyeClassic": true
    },
    {
      "id": "felicity",
      "name": "Felicity",
      "available": "unlock",
      "unlock": "Finish 12 Combat Simulator challenges (it opens together with Challenge 16)",
      "goldeneyeClassic": true
    }
  ],
  "scenarios": [
    {
      "id": "combat",
      "name": "Combat",
      "blurb": "Score a point for every kill, either every player for themselves or in teams.",
      "teams": "optional",
      "minPlayers": 2,
      "available": "start"
    },
    {
      "id": "hold-the-briefcase",
      "name": "Hold the Briefcase",
      "blurb": "Grab the briefcase and stay alive: you score a point for every 30 seconds you hold it.",
      "teams": "optional",
      "minPlayers": 2,
      "available": "unlock"
    },
    {
      "id": "hacker-central",
      "name": "Hacker Central",
      "blurb": "Take the Data Uplink to the terminal and finish a 20 second download for 2 points.",
      "teams": "optional",
      "minPlayers": 2,
      "available": "unlock"
    },
    {
      "id": "pop-a-cap",
      "name": "Pop a Cap",
      "blurb": "One random player is the victim: killing them is worth 2 points, and the victim earns 1 point for every minute they survive.",
      "teams": "optional",
      "minPlayers": 2,
      "available": "unlock"
    },
    {
      "id": "king-of-the-hill",
      "name": "King of the Hill",
      "blurb": "Hold the glowing room with your team until the timer runs out; everyone on the team inside scores a point.",
      "teams": "required",
      "minPlayers": 2,
      "available": "start"
    },
    {
      "id": "capture-the-case",
      "name": "Capture the Case",
      "blurb": "Steal another team's briefcase from its base and bring it home to your own base for 3 points.",
      "teams": "required",
      "minPlayers": 2,
      "available": "unlock"
    }
  ],
  "weaponSets": [
    {
      "id": "pistols",
      "name": "Pistols",
      "weapons": [
        "Falcon 2",
        "MagSec 4",
        "Phoenix",
        "Mauler",
        "Shield"
      ],
      "available": "start"
    },
    {
      "id": "automatics",
      "name": "Automatics",
      "weapons": [
        "Falcon 2",
        "CMP150",
        "Laptop Gun",
        "AR34",
        "Shield"
      ],
      "available": "start"
    },
    {
      "id": "power",
      "name": "Power",
      "weapons": [
        "MagSec 4",
        "DY357 Magnum",
        "Shotgun",
        "RC-P120",
        "Shield"
      ],
      "available": "start"
    },
    {
      "id": "farsight",
      "name": "FarSight",
      "weapons": [
        "Phoenix",
        "Cyclone",
        "Callisto NTG",
        "FarSight XR-20",
        "Shield"
      ],
      "available": "unlock"
    },
    {
      "id": "tranquilizer",
      "name": "Tranquilizer",
      "weapons": [
        "Falcon 2",
        "CMP150",
        "Dragon",
        "Tranquilizer",
        "Shield"
      ],
      "available": "unlock"
    },
    {
      "id": "heavy",
      "name": "Heavy",
      "weapons": [
        "Mauler",
        "K7 Avenger",
        "Reaper",
        "SuperDragon",
        "Shield"
      ],
      "available": "unlock"
    },
    {
      "id": "golden-magnum",
      "name": "Golden Magnum",
      "weapons": [
        "Falcon 2 (silencer)",
        "Grenade",
        "CMP150",
        "DY357-LX",
        "Shield"
      ],
      "available": "unlock"
    },
    {
      "id": "explosive",
      "name": "Explosive",
      "weapons": [
        "Devastator",
        "Devastator",
        "SuperDragon",
        "SuperDragon",
        "Shield"
      ],
      "available": "unlock"
    },
    {
      "id": "grenade-launcher",
      "name": "Grenade Launcher",
      "weapons": [
        "MagSec 4",
        "CMP150",
        "AR34",
        "Devastator",
        "Shield"
      ],
      "available": "unlock"
    },
    {
      "id": "rocket-launcher",
      "name": "Rocket Launcher",
      "weapons": [
        "Mauler",
        "Cyclone",
        "Dragon",
        "Rocket Launcher",
        "Shield"
      ],
      "available": "start"
    },
    {
      "id": "proximity-mine",
      "name": "Proximity Mine",
      "weapons": [
        "MagSec 4",
        "Laptop Gun",
        "K7 Avenger",
        "Proximity Mine",
        "Shield"
      ],
      "available": "unlock"
    },
    {
      "id": "close-combat",
      "name": "Close Combat",
      "weapons": [
        "Combat Knife",
        "Combat Knife",
        "Timed Mine",
        "Crossbow",
        "Shield"
      ],
      "available": "start"
    }
  ],
  "simulants": {
    "difficulties": [
      "Meat",
      "Easy",
      "Normal",
      "Hard",
      "Perfect",
      "Dark"
    ],
    "specialTypes": [
      {
        "name": "PeaceSim",
        "behavior": "Collects weapons and ammo but never shoots; at most it tries to disarm you up close.",
        "available": "start"
      },
      {
        "name": "ShieldSim",
        "behavior": "Gets a full shield before it fights and backs off when the shield runs low.",
        "available": "start"
      },
      {
        "name": "RocketSim",
        "behavior": "Prefers explosive weapons, even when it gets caught in its own blasts.",
        "available": "start"
      },
      {
        "name": "KazeSim",
        "behavior": "Charges straight at its target without keeping any distance, explosives and all.",
        "available": "start"
      },
      {
        "name": "FistSim",
        "behavior": "Fights with its fists only, punching and disarming up close.",
        "available": "start"
      },
      {
        "name": "PreySim",
        "behavior": "Picks on players who just respawned, carry weak weapons or are low on health.",
        "available": "start"
      },
      {
        "name": "CowardSim",
        "behavior": "Runs away and only attacks when its weapon beats yours.",
        "available": "start"
      },
      {
        "name": "JudgeSim",
        "behavior": "Goes after whoever is winning.",
        "available": "start"
      },
      {
        "name": "FeudSim",
        "behavior": "Picks one player at the start and hunts that player all match.",
        "available": "start"
      },
      {
        "name": "SpeedSim",
        "behavior": "Runs faster than everyone else.",
        "available": "start"
      },
      {
        "name": "TurtleSim",
        "behavior": "Moves slower but carries a double-strength shield.",
        "available": "start"
      },
      {
        "name": "VengeSim",
        "behavior": "Goes after the last player who killed it.",
        "available": "start"
      }
    ],
    "maxSimulants": 8,
    "maxSimulantsFreshSave": 4,
    "freshDifficulties": ["Meat", "Easy", "Normal"],
    "maxPlayersPlusSims": 12
  },
  "characters": [
    {
      "name": "Joanna Combat",
      "group": "main",
      "available": "start"
    },
    {
      "name": "Joanna Trench Coat",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "Joanna Party Frock",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "Joanna Frock (Ripped)",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "Joanna Stewardess",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "Joanna Leather",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "Joanna Negotiator",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "Joanna Wet Suit",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "Joanna Aqualung",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "Joanna Arctic",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "Joanna Lab Tech.",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "Elvis",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "Maian",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "Elvis (Waistcoat)",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "Daniel Carrington",
      "group": "main",
      "available": "start"
    },
    {
      "name": "Carrington Evening Wear",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "Mr. Blonde",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "Cassandra De Vries",
      "group": "main",
      "available": "start"
    },
    {
      "name": "Trent Easton",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "CI Male Lab Technician",
      "group": "additional",
      "available": "start"
    },
    {
      "name": "CI Female Lab Technician",
      "group": "additional",
      "available": "start"
    },
    {
      "name": "CI Soldier",
      "group": "additional",
      "available": "start"
    },
    {
      "name": "dataDyne Shock Trooper",
      "group": "additional",
      "available": "start"
    },
    {
      "name": "dataDyne Female Guard",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "dataDyne Security",
      "group": "additional",
      "available": "start"
    },
    {
      "name": "dataDyne Infantry",
      "group": "additional",
      "available": "start"
    },
    {
      "name": "dataDyne Trooper",
      "group": "additional",
      "available": "start"
    },
    {
      "name": "Secretary",
      "group": "additional",
      "available": "start"
    },
    {
      "name": "Office Suit",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "Office Casual",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "Negotiator",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "dataDyne Sniper",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "G5 Guard",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "G5 SWAT Guard",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "CIA Agent",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "FBI Agent",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "Area 51 Guard",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "Area 51 Trooper",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "Pilot",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "Overalls",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "NSA Bodyguard",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "Male Lab Technician",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "Female Lab Technician",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "dataDyne Lab Technician",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "Biotechnician",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "Alaskan Guard",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "Air Force One Pilot",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "Steward",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "Stewardess",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "Head Stewardess",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "The President",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "NSA Lackey",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "Presidential Security",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "President's Clone",
      "group": "main",
      "available": "unlock"
    },
    {
      "name": "Pelagic II Guard",
      "group": "additional",
      "available": "unlock"
    },
    {
      "name": "Maian Soldier",
      "group": "additional",
      "available": "unlock"
    }
  ],
  "limits": {
    "time": [
      "5 Min",
      "10 Min",
      "15 Min",
      "20 Min",
      "30 Min",
      "No Limit"
    ],
    "score": [
      "5",
      "10",
      "15",
      "20",
      "25",
      "50",
      "No Limit"
    ]
  },
  "options": [
    {
      "name": "One-Hit Kills",
      "available": "unlock"
    },
    {
      "name": "Slow Motion",
      "available": "unlock"
    },
    {
      "name": "Fast Movement",
      "available": "start"
    },
    {
      "name": "No Radar",
      "available": "start"
    },
    {
      "name": "No Auto-Aim",
      "available": "start"
    },
    {
      "name": "Paintball",
      "available": "start"
    }
  ]
};
