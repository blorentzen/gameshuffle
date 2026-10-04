import type { PartyGame } from "@/lib/party/types";

/**
 * Mario Party 3 (Nintendo 64), played today on Nintendo Switch Online +
 * Expansion Pack. Generated from specs/research/2026-10-04-randomizers/
 * mario-party-n64.json (Super Mario Wiki, pulled 2026-10-04); minigame names
 * use the N64 spellings. Board art isn't pulled yet (`artReady` false, so boards render as tiles);
 * characters reuse the Mario Party Superstars art (absolute `img` URLs).
 *
 * On Nintendo Switch Online + Expansion Pack since Oct 26, 2023 (US) / Oct 27, 2023 elsewhere. First re-release ever (it never came to Virtual Console).
 * Controllers: N64 controller for Switch, Pro Controller, Joy-Con pair, or one sideways Joy-Con per player.
 * Online play with friends through the NSO N64 app.
 */
export const MARIO_PARTY_3: PartyGame = {
  "slug": "mario-party-3",
  "label": "Mario Party 3",
  "shortLabel": "Mario Party 3",
  "editions": null,
  "seats": 4,
  "minutesPerTurn": 3.5,
  "assetBase": "https://cdn.empac.co/gameshuffle/images/mario-party-3/",
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
    },
    {
      "name": "Daisy",
      "img": "https://cdn.empac.co/gameshuffle/images/mario-party-superstars/characters/daisy.webp",
      "color": "#f5a623"
    },
    {
      "name": "Waluigi",
      "img": "https://cdn.empac.co/gameshuffle/images/mario-party-superstars/characters/waluigi.webp",
      "color": "#6b3fa0"
    }
  ],
  "boards": [
    {
      "id": "chilly-waters",
      "name": "Chilly Waters",
      "blurb": "Ice board with an icy five-way junction and Action Time.",
      "difficulty": 1,
      "color": "#7cc3e8",
      "img": "boards/chilly-waters.png"
    },
    {
      "id": "deep-bloober-sea",
      "name": "Deep Bloober Sea",
      "blurb": "Undersea board with two Action Times and Happening-heavy middle paths.",
      "difficulty": 1,
      "color": "#2f5fa8",
      "img": "boards/deep-bloober-sea.png"
    },
    {
      "id": "spiny-desert",
      "name": "Spiny Desert",
      "blurb": "Two Millennium Stars, one of them a mirage.",
      "difficulty": 2,
      "color": "#e2b25a",
      "img": "boards/spiny-desert.png"
    },
    {
      "id": "woody-woods",
      "name": "Woody Woods",
      "blurb": "Forest junction arrows force your direction.",
      "difficulty": 2,
      "color": "#4d8a3a",
      "img": "boards/woody-woods.png"
    },
    {
      "id": "creepy-cavern",
      "name": "Creepy Cavern",
      "blurb": "The Whomp King blocks the middle passage.",
      "difficulty": 3,
      "color": "#6a5a8c",
      "img": "boards/creepy-cavern.png"
    },
    {
      "id": "waluigis-island",
      "name": "Waluigi's Island",
      "blurb": "Isle-hopping board with a spinning circle and a coin-counting island.",
      "difficulty": 3,
      "color": "#6b3fa0",
      "img": "boards/waluigis-island.png",
      "unlockable": true,
      "unlockHint": "Finish first on it in Story Mode (the last Battle Royale board)"
    }
  ],
  "rulesets": [
    {
      "id": "battle-royale",
      "label": "Battle Royale",
      "blurb": "Four seats; up to three items held; Stars cost 20 coins.",
      "turns": [
        10,
        15,
        20,
        25,
        30,
        35,
        40,
        45,
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
      "blurb": "No Bonus Stars (mariopartylegacy: also turns off Hidden Blocks on Blue Spaces)."
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
      "id": "battle-royale",
      "label": "Party Mode: Battle Royale",
      "blurb": "The board game.",
      "minPlayers": 1,
      "maxPlayers": 4,
      "minutes": 75,
      "board": true
    },
    {
      "id": "duel",
      "label": "Party Mode: Duel",
      "blurb": "One-on-one on a Duel board.",
      "minPlayers": 2,
      "maxPlayers": 2,
      "minutes": 30,
      "board": true
    },
    {
      "id": "free-play",
      "label": "Mini-Game Mode",
      "blurb": "Every minigame you've collected, by type.",
      "minPlayers": 1,
      "maxPlayers": 4,
      "minutes": 20
    },
    {
      "id": "battle-room",
      "label": "Battle Room",
      "blurb": "A random run of minigames to a points target, by type.",
      "minPlayers": 2,
      "maxPlayers": 4,
      "minutes": 20
    },
    {
      "id": "game-guy-room",
      "label": "Game Guy's Room",
      "blurb": "Single-player gambling run to 1,000 coins.",
      "minPlayers": 1,
      "maxPlayers": 1,
      "minutes": 20,
      "unlockable": true,
      "unlockHint": "Story Mode rank Miracle Star (mostly S ranks; Super Mario Wiki: at least eight S rankings)"
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
      "players": "4 players",
      "board": true
    },
    {
      "id": "duel",
      "label": "Duel",
      "players": "1 vs 1",
      "board": true
    },
    {
      "id": "item",
      "label": "Item",
      "players": "1 player",
      "board": true
    },
    {
      "id": "rare",
      "label": "Rare",
      "players": "varies",
      "board": false
    },
    {
      "id": "gameguy",
      "label": "Game Guy",
      "players": "1 player (bets coins)",
      "board": true
    }
  ],
  "minigames": [
    {
      "name": "Treadmill Grill",
      "category": "ffa"
    },
    {
      "name": "Ice Rink Risk",
      "category": "ffa"
    },
    {
      "name": "Parasol Plummet",
      "category": "ffa",
      "coin": true
    },
    {
      "name": "Messy Memory",
      "category": "ffa"
    },
    {
      "name": "Picture Imperfect",
      "category": "ffa"
    },
    {
      "name": "M.P.I.Q.",
      "category": "ffa"
    },
    {
      "name": "Curtain Call",
      "category": "ffa"
    },
    {
      "name": "Cheep Cheep Chase",
      "category": "ffa"
    },
    {
      "name": "Snowball Summit",
      "category": "ffa"
    },
    {
      "name": "Toadstool Titan",
      "category": "ffa"
    },
    {
      "name": "Aces High",
      "category": "ffa"
    },
    {
      "name": "Bounce 'n' Trounce",
      "category": "ffa"
    },
    {
      "name": "Chip Shot Challenge",
      "category": "ffa"
    },
    {
      "name": "Mario's Puzzle Party",
      "category": "ffa"
    },
    {
      "name": "The Beat Goes On",
      "category": "ffa"
    },
    {
      "name": "Water Whirled",
      "category": "ffa"
    },
    {
      "name": "Frigid Bridges",
      "category": "ffa"
    },
    {
      "name": "Awful Tower",
      "category": "ffa"
    },
    {
      "name": "Pipe Cleaners",
      "category": "ffa"
    },
    {
      "name": "Rockin' Raceway",
      "category": "ffa"
    },
    {
      "name": "Coconut Conk",
      "category": "1v3"
    },
    {
      "name": "Spotlight Swim",
      "category": "1v3"
    },
    {
      "name": "Boulder Ball",
      "category": "1v3"
    },
    {
      "name": "Crazy Cogs",
      "category": "1v3"
    },
    {
      "name": "Hide and Sneak",
      "category": "1v3"
    },
    {
      "name": "River Raiders",
      "category": "1v3",
      "coin": true
    },
    {
      "name": "Tidal Toss",
      "category": "1v3"
    },
    {
      "name": "Hand, Line and Sinker",
      "category": "1v3"
    },
    {
      "name": "Ridiculous Relay",
      "category": "1v3"
    },
    {
      "name": "Thwomp Pull",
      "category": "1v3"
    },
    {
      "name": "Eatsa Pizza",
      "category": "2v2"
    },
    {
      "name": "Baby Bowser Broadside",
      "category": "2v2"
    },
    {
      "name": "Cosmic Coaster",
      "category": "2v2"
    },
    {
      "name": "Puddle Paddle",
      "category": "2v2",
      "coin": true
    },
    {
      "name": "Log Jam",
      "category": "2v2"
    },
    {
      "name": "Pump, Pump and Away",
      "category": "2v2"
    },
    {
      "name": "Hyper Hydrants",
      "category": "2v2"
    },
    {
      "name": "Picking Panic",
      "category": "2v2"
    },
    {
      "name": "Etch 'n' Catch",
      "category": "2v2"
    },
    {
      "name": "Slot Synch",
      "category": "2v2"
    },
    {
      "name": "Stacked Deck",
      "category": "battle"
    },
    {
      "name": "Three Door Monty",
      "category": "battle"
    },
    {
      "name": "Merry-Go-Chomp",
      "category": "battle"
    },
    {
      "name": "Slap Down",
      "category": "battle"
    },
    {
      "name": "Locked Out",
      "category": "battle"
    },
    {
      "name": "All Fired Up",
      "category": "battle"
    },
    {
      "name": "Storm Chasers",
      "category": "battle"
    },
    {
      "name": "Eye Sore",
      "category": "battle"
    },
    {
      "name": "Vine With Me",
      "category": "duel"
    },
    {
      "name": "Popgun Pick-Off",
      "category": "duel"
    },
    {
      "name": "End of the Line",
      "category": "duel"
    },
    {
      "name": "Baby Bowser Bonkers",
      "category": "duel"
    },
    {
      "name": "Silly Screws",
      "category": "duel"
    },
    {
      "name": "Crowd Cover",
      "category": "duel"
    },
    {
      "name": "Tick Tock Hop",
      "category": "duel"
    },
    {
      "name": "Bowser Toss",
      "category": "duel"
    },
    {
      "name": "Motor Rooter",
      "category": "duel"
    },
    {
      "name": "Fowl Play",
      "category": "duel"
    },
    {
      "name": "Winner's Wheel",
      "category": "item"
    },
    {
      "name": "Hey, Batter, Batter!",
      "category": "item"
    },
    {
      "name": "Bobbing Bow-loons",
      "category": "item"
    },
    {
      "name": "Dorrie Dip",
      "category": "item"
    },
    {
      "name": "Swinging with Sharks",
      "category": "item"
    },
    {
      "name": "Swing 'n' Swipe",
      "category": "item"
    },
    {
      "name": "Stardust Battle",
      "category": "rare"
    },
    {
      "name": "Dizzy Dinghies",
      "category": "rare"
    },
    {
      "name": "Mario's Puzzle Party Pro",
      "category": "rare"
    },
    {
      "name": "Game Guy's Magic Boxes",
      "category": "gameguy"
    },
    {
      "name": "Game Guy's Sweet Surprise",
      "category": "gameguy"
    },
    {
      "name": "Game Guy's Roulette",
      "category": "gameguy"
    },
    {
      "name": "Game Guy's Lucky 7",
      "category": "gameguy"
    }
  ]
};
