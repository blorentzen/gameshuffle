import type { CardMoment, PartyCard } from "@/data/party/cards";
import type { Deck } from "@/lib/party/deck";

/**
 * The Smash deck (meta_decks family "smash"). Same card shape as Mario Party;
 * `{n}` counts games (matches) in a night, not turns. Ids start with "s" so
 * they never collide with Mario Party's in the shared card store. Retire,
 * never renumber. Family-safe; "spicy" only means more disruptive.
 */

export const SMASH_FAMILY = "smash";

export const SMASH_CARDS: PartyCard[] = [
  // House rules
  { id: "sr01", kind: "rule", scope: "table", tone: "mild", title: "Taunt tax", text: "Taunt after every KO you take. Everyone watches." },
  { id: "sr02", kind: "rule", scope: "table", tone: "spicy", title: "Shields down", text: "Nobody shields this game." },
  { id: "sr03", kind: "rule", scope: "table", tone: "spicy", title: "Specials only", text: "Special moves only this game. No regular attacks." },
  { id: "sr04", kind: "rule", scope: "table", tone: "mild", title: "Grounded", text: "Nobody double jumps this game." },
  { id: "sr05", kind: "rule", scope: "table", tone: "mild", title: "Winner stays", text: "Whoever wins keeps their fighter; everyone else rerolls." },
  { id: "sr06", kind: "rule", scope: "table", tone: "mild", title: "Loser picks", text: "Whoever finished last picks the next stage." },
  { id: "sr07", kind: "rule", scope: "player", tone: "mild", title: "Main character energy", text: "Play your least-used fighter this game." },
  { id: "sr08", kind: "rule", scope: "table", tone: "spicy", title: "No ledge", text: "Nobody grabs the ledge this game. Recover straight to the stage." },
  { id: "sr09", kind: "rule", scope: "table", tone: "mild", title: "Costume party", text: "Everyone plays their fighter's most ridiculous costume." },
  { id: "sr10", kind: "rule", scope: "table", tone: "mild", title: "Commentary booth", text: "Whoever is out of the game commentates the rest of it." },
  { id: "sr11", kind: "rule", scope: "table", tone: "spicy", title: "Swap sticks", text: "Everyone passes their controller one seat to the left between games." },
  { id: "sr12", kind: "rule", scope: "player", tone: "mild", title: "Echo chamber", text: "If your fighter has an Echo Fighter, play the echo instead." },

  // Chance cards: crutches
  { id: "sc01", starter: true, kind: "chance", scope: "player", effect: "crutch", title: "No up special", text: "{player} can't use up special to recover for their next stock." },
  { id: "sc02", starter: true, kind: "chance", scope: "player", effect: "crutch", title: "Random fighter", text: "{player} plays a random fighter for the next {n} games.", turns: [1, 3] },
  { id: "sc03", starter: true, kind: "chance", scope: "player", effect: "crutch", title: "Handicap", text: "{player} starts the next game at 50%." },
  { id: "sc04", kind: "chance", scope: "player", effect: "crutch", title: "One stock short", text: "{player} plays the next game with one stock fewer than everyone else." },
  { id: "sc05", starter: true, kind: "chance", scope: "player", effect: "crutch", title: "Target locked", text: "{player} can only attack {rival} next game." },
  { id: "sc06", kind: "chance", scope: "player", effect: "crutch", title: "Off hand", text: "{player} holds the controller upside down for the next game." },
  { id: "sc07", kind: "chance", scope: "player", effect: "crutch", title: "No smash attacks", text: "{player} can't use smash attacks for the next {n} games.", turns: [1, 2] },
  { id: "sc08", kind: "chance", scope: "player", effect: "crutch", title: "Stage picked for you", text: "{rival} picks {player}'s next stage and fighter." },

  // Chance cards: helps
  { id: "sh01", starter: true, kind: "chance", scope: "player", effect: "help", title: "Pick the stage", text: "{player} picks the next stage." },
  { id: "sh02", starter: true, kind: "chance", scope: "player", effect: "help", title: "Veto", text: "{player} can veto one stage or one house rule, any time tonight." },
  { id: "sh03", kind: "chance", scope: "player", effect: "help", title: "Truce", text: "{rival} can't attack {player} for their first stock next game.", rivalObeys: true },
  { id: "sh04", starter: true, kind: "chance", scope: "player", effect: "help", title: "Main pick", text: "{player} plays their main next game, whatever the randomizer says." },
  { id: "sh05", starter: true, kind: "chance", scope: "player", effect: "help", title: "Extra life", text: "{player} gets one extra stock next game." },
  { id: "sh06", kind: "chance", scope: "player", effect: "help", title: "Reroll", text: "{player} can reroll their fighter once in the next {n} games.", turns: [1, 3] },

  // Missions
  { id: "sm01", starter: true, kind: "mission", scope: "player", worth: 1, title: "Taunt victory", text: "Win a game and taunt before the results screen." },
  { id: "sm02", starter: true, kind: "mission", scope: "player", worth: 2, title: "Meteor", text: "Take a stock with a meteor smash (a spike)." },
  { id: "sm03", starter: true, kind: "mission", scope: "player", worth: 2, title: "Final Smash finish", text: "Take a stock with a Final Smash." },
  { id: "sm04", kind: "mission", scope: "player", worth: 3, title: "Flawless", text: "Win a game without losing a stock." },
  { id: "sm05", starter: true, kind: "mission", scope: "player", worth: 1, title: "Comeback", text: "Win a game after being a stock behind." },
  { id: "sm06", kind: "mission", scope: "player", worth: 2, title: "Counterpick", text: "Win a game on a stage your opponent picked." },
  { id: "sm07", starter: true, kind: "mission", scope: "player", worth: 1, title: "Stylish", text: "Take a stock with a down throw or back throw." },
  { id: "sm08", kind: "mission", scope: "player", worth: 2, title: "Rival down", text: "Take two stocks from {rival} in one game." },
  { id: "sm09", starter: true, kind: "mission", scope: "player", worth: 1, title: "Sharpshooter", text: "Take a stock with a projectile." },
  { id: "sm10", kind: "mission", scope: "player", worth: 3, title: "Three for three", text: "Win three games in a row." },
  { id: "sm11", kind: "mission", scope: "player", worth: 2, title: "Random hero", text: "Win a game with a fighter you've never played before." },
  { id: "sm12", starter: true, kind: "mission", scope: "player", worth: 1, title: "Last one standing", text: "Win a free-for-all with four or more players." },
];

export const SMASH_MOMENTS: CardMoment[] = [
  { id: "catch-up", title: "Catch-up", text: "Every five games, whoever has won least draws a help and whoever has won most draws a crutch." },
  { id: "homestretch", title: "Final stretch", text: "For the last five games of the night, every player draws a Chance card." },
  { id: "loser-draw", title: "Loser's pick", text: "Lose three games in a row and draw a help." },
  { id: "intermission", title: "Intermission", text: "Between parts of the night, every player draws a Chance card." },
];

export const SMASH_CODE_DECK: Deck = { cards: SMASH_CARDS, moments: SMASH_MOMENTS };
