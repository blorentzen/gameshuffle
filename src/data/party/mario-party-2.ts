import type { PartyGame } from "@/lib/party/types";

/**
 * Mario Party 2 (Nintendo 64), played today on Nintendo Switch Online +
 * Expansion Pack. Generated from specs/research/2026-10-04-randomizers/
 * mario-party-n64.json (Super Mario Wiki, pulled 2026-10-04); minigame names
 * use the N64 spellings. Board art isn't pulled yet (`artReady` false, so boards render as tiles);
 * characters reuse the Mario Party Superstars art (absolute `img` URLs).
 *
 * On Nintendo Switch Online + Expansion Pack since Nov 1, 2022 (US) / Nov 2, 2022 elsewhere, alongside Mario Party.
 * No stick-spinning minigames (they were dropped after Mario Party 1), so no warning screen.
 * Controllers: N64 controller for Switch, Pro Controller, Joy-Con pair, or one sideways Joy-Con per player.
 */
export const MARIO_PARTY_2: PartyGame = {
  "slug": "mario-party-2",
  "label": "Mario Party 2",
  "shortLabel": "Mario Party 2",
  "editions": null,
  "seats": 4,
  "minutesPerTurn": 3.5,
  "assetBase": "https://cdn.empac.co/gameshuffle/images/legacy-mario-party/mario-party-2/",
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
      "id": "pirate-land",
      "name": "Pirate Land",
      "blurb": "Pirate cove: Sushi ferries you between docks; Happening Spaces fire a cannon back to start.",
      "difficulty": 1,
      "color": "#2f7fb5",
      "img": "boards/pirate-land.png"
    },
    {
      "id": "western-land",
      "name": "Western Land",
      "blurb": "Ride Steamer the train for 5 coins; get hit and you go back to start.",
      "difficulty": 1,
      "color": "#f2b07a",
      "img": "boards/western-land.png"
    },
    {
      "id": "space-land",
      "name": "Space Land",
      "blurb": "A Bowser junction counts down to a laser that wipes out coins.",
      "difficulty": 2,
      "color": "#3d4a9c",
      "img": "boards/space-land.png"
    },
    {
      "id": "mystery-land",
      "name": "Mystery Land",
      "blurb": "Four islands; Happening Spaces move you to the next one.",
      "difficulty": 2,
      "color": "#c9a24a",
      "img": "boards/mystery-land.png"
    },
    {
      "id": "horror-land",
      "name": "Horror Land",
      "blurb": "Day turns to night every two turns, and the Boos come out.",
      "difficulty": 3,
      "color": "#5b3c7d",
      "img": "boards/horror-land.png"
    },
    {
      "id": "bowser-land",
      "name": "Bowser Land",
      "blurb": "Banks lend instead of take, Baby Bowser forces sales and the Bowser Parade rolls every five turns.",
      "difficulty": 3,
      "color": "#a83226",
      "img": "boards/bowser-land.png",
      "unlockable": true,
      "unlockHint": "Play every other board at least once"
    }
  ],
  "rulesets": [
    {
      "id": "party",
      "label": "Party Mode",
      "blurb": "Items arrive (one held at a time); Battle, Item and Duel minigames join the rotation.",
      "turns": [
        20,
        35,
        50
      ],
      "bonus": [
        "on",
        "off"
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
      "id": "on",
      "label": "Bonus Stars",
      "blurb": "Mini-Game, Coin and Happening Stars at the end."
    },
    {
      "id": "off",
      "label": "No Bonus",
      "blurb": "No end-of-game Bonus Stars."
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
      "id": "mini-game-park",
      "label": "Mini-Game Park (Free Play)",
      "blurb": "Minigames bought from Woody, by type tree.",
      "minPlayers": 1,
      "maxPlayers": 4,
      "minutes": 20
    },
    {
      "id": "mini-game-battle",
      "label": "Mini-Game Stadium: Mini-Game Battle",
      "blurb": "Minigames for coins on a stadium board.",
      "minPlayers": 1,
      "maxPlayers": 4,
      "minutes": 30
    },
    {
      "id": "mini-game-duel",
      "label": "Mini-Game Stadium: Mini-Game Duel",
      "blurb": "Duel minigames, first to 3, 5 or 7 wins; pick or random.",
      "minPlayers": 2,
      "maxPlayers": 2,
      "minutes": 10,
      "options": {
        "label": "First to",
        "values": [
          "3 wins",
          "5 wins",
          "7 wins"
        ]
      },
      "unlockable": true,
      "unlockHint": "Unlock at least three Duel minigames"
    },
    {
      "id": "mini-game-coaster",
      "label": "Mini-Game Coaster",
      "blurb": "Single-player run (with a CPU partner) through 9 worlds.",
      "minPlayers": 1,
      "maxPlayers": 1,
      "minutes": 60,
      "unlockable": true,
      "unlockHint": "Buy every 4-Player, 1-vs-3 and 2-vs-2 minigame"
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
      "id": "battle",
      "label": "Battle",
      "players": "4 players (coin pot, 70/30 split)",
      "board": true
    },
    {
      "id": "item",
      "label": "Item",
      "players": "1 player",
      "board": true
    },
    {
      "id": "duel",
      "label": "Duel",
      "players": "1 vs 1",
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
      "name": "Lava Tile Isle",
      "category": "ffa"
    },
    {
      "name": "Hot Rope Jump",
      "category": "ffa"
    },
    {
      "name": "Shell Shocked",
      "category": "ffa"
    },
    {
      "name": "Toad in the Box",
      "category": "ffa"
    },
    {
      "name": "Mecha-Marathon",
      "category": "ffa"
    },
    {
      "name": "Roll Call",
      "category": "ffa"
    },
    {
      "name": "Abandon Ship",
      "category": "ffa"
    },
    {
      "name": "Platform Peril",
      "category": "ffa"
    },
    {
      "name": "Totem Pole Pound",
      "category": "ffa"
    },
    {
      "name": "Bumper Balls",
      "category": "ffa"
    },
    {
      "name": "Bombs Away",
      "category": "ffa"
    },
    {
      "name": "Tipsy Tourney",
      "category": "ffa"
    },
    {
      "name": "Honeycomb Havoc",
      "category": "ffa"
    },
    {
      "name": "Hexagon Heat",
      "category": "ffa"
    },
    {
      "name": "Skateboard Scamper",
      "category": "ffa"
    },
    {
      "name": "Slot Car Derby",
      "category": "ffa"
    },
    {
      "name": "Shy Guy Says",
      "category": "ffa"
    },
    {
      "name": "Sneak 'n' Snore",
      "category": "ffa"
    },
    {
      "name": "Dizzy Dancing",
      "category": "ffa"
    },
    {
      "name": "Tile Driver",
      "category": "ffa"
    },
    {
      "name": "Deep Sea Salvage",
      "category": "ffa",
      "coin": true
    },
    {
      "name": "Bowl Over",
      "category": "1v3"
    },
    {
      "name": "Crane Game",
      "category": "1v3"
    },
    {
      "name": "Move to the Music",
      "category": "1v3"
    },
    {
      "name": "Bob-omb Barrage",
      "category": "1v3"
    },
    {
      "name": "Look Away",
      "category": "1v3"
    },
    {
      "name": "Shock, Drop or Roll",
      "category": "1v3"
    },
    {
      "name": "Lights Out",
      "category": "1v3"
    },
    {
      "name": "Filet Relay",
      "category": "1v3"
    },
    {
      "name": "Archer-ival",
      "category": "1v3"
    },
    {
      "name": "Quicksand Cache",
      "category": "1v3",
      "coin": true
    },
    {
      "name": "Rainbow Run",
      "category": "1v3"
    },
    {
      "name": "Toad Bandstand",
      "category": "2v2"
    },
    {
      "name": "Bobsled Run",
      "category": "2v2"
    },
    {
      "name": "Handcar Havoc",
      "category": "2v2"
    },
    {
      "name": "Balloon Burst",
      "category": "2v2"
    },
    {
      "name": "Sky Pilots",
      "category": "2v2"
    },
    {
      "name": "Speed Hockey",
      "category": "2v2"
    },
    {
      "name": "Cake Factory",
      "category": "2v2"
    },
    {
      "name": "Magnet Carta",
      "category": "2v2",
      "coin": true
    },
    {
      "name": "Looney Lumberjacks",
      "category": "2v2"
    },
    {
      "name": "Torpedo Targets",
      "category": "2v2"
    },
    {
      "name": "Destruction Duet",
      "category": "2v2"
    },
    {
      "name": "Dungeon Dash",
      "category": "2v2"
    },
    {
      "name": "Grab Bag",
      "category": "battle"
    },
    {
      "name": "Bumper Balloon Cars",
      "category": "battle"
    },
    {
      "name": "Rakin' 'em In",
      "category": "battle"
    },
    {
      "name": "Day at the Races",
      "category": "battle"
    },
    {
      "name": "Face Lift",
      "category": "battle"
    },
    {
      "name": "Crazy Cutters",
      "category": "battle"
    },
    {
      "name": "Hot Bob-omb",
      "category": "battle"
    },
    {
      "name": "Bowser's Big Blast",
      "category": "battle"
    },
    {
      "name": "Roll Out the Barrels",
      "category": "item"
    },
    {
      "name": "Give Me a Brake!",
      "category": "item"
    },
    {
      "name": "Hammer Slammer",
      "category": "item"
    },
    {
      "name": "Mallet-Go-Round",
      "category": "item"
    },
    {
      "name": "Coffin Congestion",
      "category": "item"
    },
    {
      "name": "Bowser Slots",
      "category": "item"
    },
    {
      "name": "Saber Swipes",
      "category": "duel"
    },
    {
      "name": "Quick Draw Corks",
      "category": "duel"
    },
    {
      "name": "Time Bomb",
      "category": "duel"
    },
    {
      "name": "Psychic Safari",
      "category": "duel"
    },
    {
      "name": "Mushroom Brew",
      "category": "duel"
    },
    {
      "name": "Rock, Paper, Mario",
      "category": "duel"
    },
    {
      "name": "Driver's Ed",
      "category": "special"
    }
  ]
};
