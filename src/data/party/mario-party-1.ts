import type { PartyGame } from "@/lib/party/types";

/**
 * Mario Party (Nintendo 64), played today on Nintendo Switch Online +
 * Expansion Pack. Generated from specs/research/2026-10-04-randomizers/
 * mario-party-n64.json (Super Mario Wiki, pulled 2026-10-04); minigame names
 * use the N64 spellings. Board art isn't pulled yet (`artReady` false, so boards render as tiles);
 * characters reuse the Mario Party Superstars art (absolute `img` URLs).
 *
 * On Nintendo Switch Online + Expansion Pack (Nintendo 64 app, now 'Nintendo 64 - Nintendo Classics') since Nov 1, 2022 (US) / Nov 2, 2022 (EU, JP, AU), alongside Mario Party 2.
 * The analog-stick spinning minigames were NOT changed or removed. Instead a caution screen at boot says to rotate the stick with your thumb, not your palm.
 * Stick-spinning minigames (Super Mario Wiki): Tug o' War (1-vs-3), Paddle Battle (1-vs-3), Pedal Power (1-Player). The Mecha Fly Guy shop item also counts stick rotations. Superstars adds a palm warning to Cast Aways too, so it may count as a spinning game here (verify).
 */
export const MARIO_PARTY: PartyGame = {
  "slug": "mario-party",
  "label": "Mario Party",
  "shortLabel": "Mario Party 1",
  "editions": null,
  "seats": 4,
  "minutesPerTurn": 3.5,
  "assetBase": "https://cdn.empac.co/gameshuffle/images/legacy-mario-party/mario-party/",
  "artReady": false,
  "characters": [
    {
      "name": "Mario",
      "img": "https://cdn.empac.co/gameshuffle/images/mario-party-superstars/characters/mario.png",
      "color": "#e52521"
    },
    {
      "name": "Luigi",
      "img": "https://cdn.empac.co/gameshuffle/images/mario-party-superstars/characters/luigi.png",
      "color": "#3fa34d"
    },
    {
      "name": "Peach",
      "img": "https://cdn.empac.co/gameshuffle/images/mario-party-superstars/characters/peach.png",
      "color": "#f06ba8"
    },
    {
      "name": "Yoshi",
      "img": "https://cdn.empac.co/gameshuffle/images/mario-party-superstars/characters/yoshi.png",
      "color": "#5fb93f"
    },
    {
      "name": "Wario",
      "img": "https://cdn.empac.co/gameshuffle/images/mario-party-superstars/characters/wario.png",
      "color": "#f2c80f"
    },
    {
      "name": "Donkey Kong",
      "img": "https://cdn.empac.co/gameshuffle/images/mario-party-superstars/characters/donkey-kong.png",
      "color": "#8b5a2b"
    }
  ],
  "boards": [
    {
      "id": "dks-jungle-adventure",
      "name": "DK's Jungle Adventure",
      "blurb": "Jungle ruins where Whomps charge 10 coins to pass and a boulder rolls on Happening Spaces.",
      "difficulty": 1,
      "color": "#4d8a3a",
      "img": "boards/dks-jungle-adventure.png"
    },
    {
      "id": "peachs-birthday-cake",
      "name": "Peach's Birthday Cake",
      "blurb": "The smallest board, with Goomba's seed lottery that can send you to Bowser.",
      "difficulty": 2,
      "color": "#e889b0",
      "img": "boards/peachs-birthday-cake.png"
    },
    {
      "id": "yoshis-tropical-island",
      "name": "Yoshi's Tropical Island",
      "blurb": "Two fruit islands; Happening Spaces swap Toad and Bowser between them.",
      "difficulty": 2,
      "color": "#3fa7c9",
      "img": "boards/yoshis-tropical-island.png"
    },
    {
      "id": "warios-battle-canyon",
      "name": "Wario's Battle Canyon",
      "blurb": "Four plateaus linked by cannons, with Bowser in the middle.",
      "difficulty": 2,
      "color": "#c9772f",
      "img": "boards/warios-battle-canyon.png"
    },
    {
      "id": "luigis-engine-room",
      "name": "Luigi's Engine Room",
      "blurb": "Red and blue doors flip every turn and change the paths.",
      "difficulty": 3,
      "color": "#3d6fb0",
      "img": "boards/luigis-engine-room.png"
    },
    {
      "id": "marios-rainbow-castle",
      "name": "Mario's Rainbow Castle",
      "blurb": "The Star stays on the castle tower, which turns to reveal Bowser.",
      "difficulty": 1,
      "color": "#70bdea",
      "img": "boards/marios-rainbow-castle.png"
    },
    {
      "id": "bowsers-magma-mountain",
      "name": "Bowser's Magma Mountain",
      "blurb": "A volcano with stone-head shortcuts; Happening Spaces turn Blue Spaces red.",
      "difficulty": 3,
      "color": "#c2402a",
      "img": "boards/bowsers-magma-mountain.png",
      "unlockable": true,
      "unlockHint": "Buy it in the Mushroom Shop for 980 coins after every other board has been played at least once"
    },
    {
      "id": "eternal-star",
      "name": "Eternal Star",
      "blurb": "Win Stars from seven Baby Bowsers by out-rolling them; lose and they take one.",
      "difficulty": 3,
      "color": "#3a2f7a",
      "img": "boards/eternal-star.png",
      "unlockable": true,
      "unlockHint": "Collect 100 Stars (banked) and finish every board at least once"
    }
  ],
  "rulesets": [
    {
      "id": "party",
      "label": "Party Mode",
      "blurb": "Four seats on a board; 1-10 Dice Block; Stars cost 20 coins.",
      "turns": [
        20,
        35,
        50
      ],
      "bonus": [
        "always"
      ],
      "turnLabels": {
        "20": "Lite Play",
        "35": "Standard Play",
        "50": "Full Play"
      }
    }
  ],
  "bonusModes": [
    {
      "id": "always",
      "label": "Bonus Stars (always on)",
      "blurb": "Mario Party has no Bonus Star switch: three are always awarded."
    }
  ],
  "bonusStars": [
    {
      "name": "Mini-Game Star",
      "rewards": "Most coins won in minigames"
    },
    {
      "name": "Coin Star",
      "rewards": "Most coins held at one time"
    },
    {
      "name": "Happening Star",
      "rewards": "Most Happening Spaces landed on"
    }
  ],
  "modes": [
    {
      "id": "mario-party",
      "label": "Party Mode",
      "blurb": "The board game.",
      "minPlayers": 1,
      "maxPlayers": 4,
      "minutes": 75,
      "board": true
    },
    {
      "id": "free-play",
      "label": "Mini-Game House: Free Play",
      "blurb": "Minigames bought from Puff, played as often as you like.",
      "minPlayers": 1,
      "maxPlayers": 4,
      "minutes": 20
    },
    {
      "id": "mini-game-stadium",
      "label": "Mini-Game Stadium (Pot o' Skills)",
      "blurb": "A 24-space star board where coins only come from minigames.",
      "minPlayers": 1,
      "maxPlayers": 4,
      "minutes": 30
    },
    {
      "id": "mini-game-island",
      "label": "Mini-Game Island",
      "blurb": "Single-player run through every minigame.",
      "minPlayers": 1,
      "maxPlayers": 1,
      "minutes": 60
    }
  ],
  "minigameCategories": [
    {
      "id": "ffa",
      "label": "4-Player",
      "players": "4 players",
      "board": true
    },
    {
      "id": "1v3",
      "label": "1-vs-3",
      "players": "1 vs 3",
      "board": true
    },
    {
      "id": "2v2",
      "label": "2-vs-2",
      "players": "2 vs 2",
      "board": true
    },
    {
      "id": "1p",
      "label": "1-Player",
      "players": "1 player",
      "board": true
    },
    {
      "id": "special",
      "label": "Special",
      "players": "1 player",
      "board": false
    }
  ],
  "minigames": [
    {
      "name": "Buried Treasure",
      "category": "ffa"
    },
    {
      "name": "Treasure Divers",
      "category": "ffa",
      "coin": true
    },
    {
      "name": "Hot Bob-omb",
      "category": "ffa"
    },
    {
      "name": "Musical Mushroom",
      "category": "ffa"
    },
    {
      "name": "Crazy Cutter",
      "category": "ffa"
    },
    {
      "name": "Face Lift",
      "category": "ffa"
    },
    {
      "name": "Balloon Burst",
      "category": "ffa"
    },
    {
      "name": "Coin Block Blitz",
      "category": "ffa",
      "coin": true
    },
    {
      "name": "Skateboard Scamper",
      "category": "ffa"
    },
    {
      "name": "Box Mountain Mayhem",
      "category": "ffa",
      "coin": true
    },
    {
      "name": "Platform Peril",
      "category": "ffa"
    },
    {
      "name": "Mushroom Mix-Up",
      "category": "ffa"
    },
    {
      "name": "Grab Bag",
      "category": "ffa",
      "coin": true
    },
    {
      "name": "Bumper Balls",
      "category": "ffa"
    },
    {
      "name": "Tipsy Tourney",
      "category": "ffa"
    },
    {
      "name": "Bombs Away",
      "category": "ffa"
    },
    {
      "name": "Mario Bandstand",
      "category": "ffa"
    },
    {
      "name": "Shy Guy Says",
      "category": "ffa"
    },
    {
      "name": "Cast Aways",
      "category": "ffa",
      "coin": true
    },
    {
      "name": "Key-pa-Way",
      "category": "ffa"
    },
    {
      "name": "Running of the Bulb",
      "category": "ffa"
    },
    {
      "name": "Hot Rope Jump",
      "category": "ffa"
    },
    {
      "name": "Hammer Drop",
      "category": "ffa",
      "coin": true
    },
    {
      "name": "Slot Car Derby",
      "category": "ffa"
    },
    {
      "name": "Pipe Maze",
      "category": "1v3",
      "coin": true
    },
    {
      "name": "Bash 'n' Cash",
      "category": "1v3",
      "coin": true
    },
    {
      "name": "Bowl Over",
      "category": "1v3"
    },
    {
      "name": "Coin Block Bash",
      "category": "1v3",
      "coin": true
    },
    {
      "name": "Tightrope Treachery",
      "category": "1v3"
    },
    {
      "name": "Crane Game",
      "category": "1v3",
      "coin": true
    },
    {
      "name": "Piranha's Pursuit",
      "category": "1v3"
    },
    {
      "name": "Tug o' War",
      "category": "1v3",
      "stickSpin": true
    },
    {
      "name": "Paddle Battle",
      "category": "1v3",
      "coin": true,
      "stickSpin": true
    },
    {
      "name": "Coin Shower Flower",
      "category": "1v3",
      "coin": true
    },
    {
      "name": "Bobsled Run",
      "category": "2v2"
    },
    {
      "name": "Desert Dash",
      "category": "2v2"
    },
    {
      "name": "Bombsketball",
      "category": "2v2"
    },
    {
      "name": "Handcar Havoc",
      "category": "2v2"
    },
    {
      "name": "Deep Sea Divers",
      "category": "2v2",
      "coin": true
    },
    {
      "name": "Memory Match",
      "category": "1p"
    },
    {
      "name": "Slot Machine",
      "category": "1p"
    },
    {
      "name": "Shell Game",
      "category": "1p"
    },
    {
      "name": "Ghost Guess",
      "category": "1p"
    },
    {
      "name": "Pedal Power",
      "category": "1p",
      "stickSpin": true
    },
    {
      "name": "Whack-a-Plant",
      "category": "1p",
      "coin": true
    },
    {
      "name": "Ground Pound",
      "category": "1p"
    },
    {
      "name": "Teetering Towers",
      "category": "1p"
    },
    {
      "name": "Knock Block Tower",
      "category": "1p"
    },
    {
      "name": "Limbo Dance",
      "category": "1p"
    },
    {
      "name": "Bumper Ball Maze",
      "category": "special"
    }
  ]
};
