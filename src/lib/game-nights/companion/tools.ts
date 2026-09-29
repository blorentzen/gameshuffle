import type { ComponentType } from "react";
import { IconCards, IconCircleNumber1, IconUserQuestion, IconHandFinger, IconTrophy, IconTornado, IconDice6, IconDice3, IconDice5, IconFlag, IconGridDots, IconHeart, IconMoon, IconNotebook, IconSearch, IconStack2, IconStopwatch, IconTargetArrow } from "@tabler/icons-react";

/**
 * Companion-tools registry — digital versions of the physical bits a board-game
 * night needs (score sheets, deduction grids, and more). Ids are generic so a
 * display name can change without touching state/storage keys. This drives the
 * cards on the tools hub; each tool is its own route + client component.
 *
 * `about` + `howToPlay` power the "How it works" explainer on every tool page —
 * always assume someone has never played the game, and explain the rules, not
 * just the tool. `usesRoster` tools render the shared RosterBar (players cascade
 * across every sheet); team- or catalog-based tools set it false.
 */

export interface CompanionTool {
  id: string;
  name: string;
  description: string;
  href: string;
  /** Tabler component for the tool's card. */
  icon: ComponentType<{ size?: number | string; stroke?: number }>;
  /** One-line intro shown under the page title. */
  tagline: string;
  /** Whether this tool reads the shared player roster (renders RosterBar). */
  usesRoster: boolean;
  /** Plain-language "what is this / what's the game" for people who've never played. */
  about: string;
  /** Step-by-step: how the game is played and/or how to use the tool. */
  howToPlay: string[];
}

export const COMPANION_TOOLS: CompanionTool[] = [
  {
    id: "score-pad",
    name: "Score Pad",
    description: "Track scores across rounds for any game. Running totals, high or low wins.",
    href: "/game-nights/tools/score-pad",
    icon: IconNotebook,
    tagline: "A running scoreboard for any game, one row per round.",
    usesRoster: true,
    about: "A general-purpose scoreboard for any game that scores by rounds or hands. Use it when a game does not have its own sheet here.",
    howToPlay: [
      "Add everyone at the table to the roster above; the same players show up on every tool.",
      "Add a round each hand and type each player's score for that round.",
      "Running totals and the leader update as you go; the winner gets a crown.",
      "Switch to Tally mode to just tap a check per round (for counting rounds won), or turn on Lowest score wins for games where low is good.",
    ],
  },
  {
    id: "dice-scorecard",
    name: "Yahtzee",
    description: "A full dice scorecard with the upper-section bonus math done for you.",
    href: "/game-nights/tools/yahtzee",
    icon: IconDice5,
    tagline: "A digital Yahtzee scorecard with the bonuses and totals done for you.",
    usesRoster: true,
    about: "Yahtzee is a dice game. On your turn you roll five dice up to three times, keeping the ones you like between rolls, then must score the result in one of thirteen categories. Each category is used once; highest total wins.",
    howToPlay: [
      "Upper section (Aces through Sixes) scores the sum of the matching dice; reach 63 or more up there and you earn a 35-point bonus.",
      "Lower section: three/four of a kind score all five dice; full house is 25, small straight 30, large straight 40, Yahtzee (five of a kind) 50, and Chance is the sum of all dice.",
      "Roll a second Yahtzee and you get a 100-point bonus each time; use the Extra Yahtzees stepper for those.",
      "In the tool, type the number categories; the fixed-value combos are a tap to score them, tap again to scratch (a zero when you can't fill it), tap once more to clear.",
    ],
  },
  {
    id: "deduction",
    name: "Clue Notes",
    description: "The detective notepad, digital. Mark off suspects, weapons, and rooms per player.",
    href: "/game-nights/tools/deduction",
    icon: IconSearch,
    tagline: "The detective's notepad from Clue, digital and shareable across the table.",
    usesRoster: true,
    about: "Clue (Cluedo) is a whodunit. One suspect, one weapon, and one room are hidden in a secret envelope; you work out which by tracking what everyone else is holding.",
    howToPlay: [
      "Players take turns suggesting a suspect, weapon, and room; the next player who holds any of those must privately show one card to disprove it.",
      "Whenever you see a card, you know it's not in the envelope; the three cards nobody can ever show are the solution.",
      "In the tool, tap a cell to cycle its mark for that player: blank, then ✗ (ruled out), then ✓ (you know they hold it), then ? (a maybe).",
      "Playing a different deduction game? Tap Edit board to rename, add, or remove cards and whole sections.",
    ],
  },
  {
    id: "game-picker",
    name: "Game Picker",
    description: "Can't decide? Draw a random game from your pool or the popular catalog.",
    href: "/game-nights/tools/game-picker",
    icon: IconTargetArrow,
    tagline: "Can't agree on what to play? Let the wheel decide.",
    usesRoster: false,
    about: "A tie-breaker for the eternal 'what should we play?' debate. Draw a random pick from the games you own or a list of popular titles.",
    howToPlay: [
      "Add the games you're choosing between, or leave it empty to draw from a popular-titles list.",
      "Tap to draw a random game.",
      "Draw again if the table wants a re-vote.",
    ],
  },
  {
    id: "turn-timer",
    name: "Turn Timer",
    description: "A chess clock for the table. Tap to pass; keep slow turns honest.",
    href: "/game-nights/tools/turn-timer",
    icon: IconStopwatch,
    tagline: "A chess clock for the whole table, to keep slow turns honest.",
    usesRoster: true,
    about: "A shared timer for games where turns can drag. Works like a chess clock: only the active player's time runs, and passing the turn stops theirs and starts the next.",
    howToPlay: [
      "Tap a player to start their clock; tap the next player to pass the turn.",
      "Count up to see who's taking longest, or count down to give everyone a fixed time bank.",
      "Set a per-turn limit and a card flags anyone who runs long; in count-down mode a player who empties their bank is out of time.",
    ],
  },
  {
    id: "counters",
    name: "Counters",
    description: "Per-player counters for life, coins, or points, with quick +/- steps.",
    href: "/game-nights/tools/counters",
    icon: IconCircleNumber1,
    tagline: "Per-player counters for life totals, coins, or anything you track.",
    usesRoster: true,
    about: "A set of per-player counters for anything a game asks you to track: life totals (Magic, board-game health), coins, victory points, ammo, you name it.",
    howToPlay: [
      "Set the starting value everyone begins at.",
      "Use the +1 / -1 and +5 / -5 buttons to adjust each player's counter.",
      "Give each player a color so it's easy to find their counter across the table.",
    ],
  },
  {
    id: "the-gauntlet",
    name: "The Gauntlet",
    description: "A game night decathlon: 4 to 8 events, one scoreboard, one champion.",
    href: "/game-nights/tools/the-gauntlet",
    icon: IconTrophy,
    tagline: "A GameShuffle Original: string games together into one competition and crown a champion.",
    usesRoster: true,
    about: "The Gauntlet turns a game night into one big competition. Pick 4 to 8 events (Mario Kart races, Mario Party, and our phone games like Odd One Out and Tier Wars), and every event's placements feed a single scoreboard. Whoever has the most points at the end is the Gauntlet champion.",
    howToPlay: [
      "Add everyone to the roster above, then pick 4 to 8 events. Drag them into the order you want, or tap Surprise me.",
      "Start the Gauntlet. Everyone joins on their phone with the room code, and you can put the scoreboard on the TV.",
      "Play each event. Console games: the host taps in the finishing order. Phone games score themselves.",
      "Every event pays 10, 6, 3 and 1 points for the top four. Play in order or spin for the next event.",
      "End the night to crown the Gauntlet champion. With a free account, the points go on everyone's profile and season.",
    ],
  },
  {
    id: "chaos-cup",
    name: "Chaos Cup",
    description: "A Mario Kart cup where every race gets a modifier your chat can vote on.",
    href: "/game-nights/tools/chaos-cup",
    icon: IconTornado,
    tagline: "A GameShuffle Original: every race gets a twist, and chat can pick it.",
    usesRoster: true,
    about: "Chaos Cup is a Mario Kart cup with a twist before every race: an item rule, a race setting, or a handicap for whoever is leading. The host rolls three options and picks one, or lets their stream chat vote. Placements add up across the cup and the winner is crowned Chaos Cup champion.",
    howToPlay: [
      "Add everyone to the roster above, choose Mario Kart 8 Deluxe or Mario Kart World and how many races, then start the Chaos Cup.",
      "Everyone joins on their phone with the room code; put the scoreboard on the TV.",
      "Before each race the host rolls three modifiers and picks one, or taps Let chat vote to run a 45-second poll on stream.",
      "Race with the modifier, then tap in the finishing order. Every race pays 10, 6, 3 and 1 points.",
      "After the last race, end the night to crown the Chaos Cup champion.",
    ],
  },
  {
    id: "shuffle-dice",
    name: "Shuffle Dice (prototype)",
    description: "Our push-your-luck dice game: keep Stars and Coins, bank before the third Bomb.",
    href: "/game-nights/tools/shuffle-dice",
    icon: IconDice6,
    tagline: "A GameShuffle Original in playtesting: push your luck, but not past the third Bomb.",
    usesRoster: true,
    about: "Shuffle Dice is a push-your-luck dice game we're designing. Each of the five dice has a Star, two Coins, a Mushroom, a Shell and a Bomb. Keep scoring dice, re-roll the rest, and bank before you roll your third Bomb of the turn. It's a prototype: the rules may change after playtesting.",
    howToPlay: [
      "On your turn, roll all five dice. Bombs are set aside automatically.",
      "Tap the dice you want to keep (at least one), then Keep and roll to re-roll the rest. Set all five aside without busting and you roll all five again.",
      "Coins are worth 1 and Stars 3. Every third Mushroom in a turn is worth 5 more. Each Shell steals 1 point from the leader when you bank.",
      "Your third Bomb in a turn busts it: you lose that turn's points. Bank any time to lock in what you have.",
      "First to 40 wins.",
    ],
  },
  {
    id: "odd-one-out",
    name: "Odd One Out",
    description: "Everyone gets the same secret word but one. Hint, vote, and catch the faker.",
    href: "/game-nights/tools/odd-one-out",
    icon: IconUserQuestion,
    tagline: "A GameShuffle Original: one player doesn't know the word. Can you catch them before they catch on?",
    usesRoster: true,
    about: "Odd One Out is a quick social-deduction word game for 3 or more players, made by GameShuffle. Everyone gets the same secret word except one player, who only sees the category. The odd one out has to bluff along; everyone else has to spot them without giving the word away.",
    howToPlay: [
      "Pick a word pack and deal: pass the phone around and each player privately taps to see their word. One player instead sees \"You're the odd one out\" and the category.",
      "Starting with the named player, go around the room and everyone says one word that hints at the secret word. Too obvious and the odd one out figures it out; too vague and you look suspicious.",
      "Count to three and everyone points at who they think is faking it. Tap whoever got the most votes, then reveal.",
      "If the table caught the odd one out, they get one guess at the word. Everyone who voted for them scores 2; the odd one out scores 3 for getting away with it, or 2 for guessing the word.",
      "Play as many rounds as you like. With a free account you can host it on everyone's own phones instead, with the reveal and scoreboard on the TV.",
    ],
  },
  {
    id: "most-likely-to",
    name: "Most Likely To",
    description: "Who's most likely to rage quit? Read the prompt, count to three, everyone points.",
    href: "/game-nights/tools/most-likely-to",
    icon: IconHandFinger,
    tagline: "A GameShuffle Original: friendly prompts that get the whole table pointing at each other.",
    usesRoster: true,
    about: "Most Likely To is a quick party game for 3 or more. Someone reads a prompt like \"Who's most likely to demand a rematch immediately?\" and on the count of three everyone points at the person who fits it best. Our prompts are written to get laughs, not to embarrass anyone.",
    howToPlay: [
      "Pick a prompt pack (Game night, Gamers, or The group) and tap First prompt.",
      "Read it out loud, count to three, and everyone points at who they think fits. You can point at yourself.",
      "Tap Next prompt and keep going; prompts don't repeat until the pack runs out.",
      "With a free account you can host it on everyone's phones instead: votes are anonymous, the TV shows the reveal, and you score a point each time your vote matches the room's pick.",
    ],
  },
  {
    id: "werewolf",
    name: "Werewolf Moderator",
    description: "Deal secret roles by passing the phone, then run the night and day phases.",
    href: "/game-nights/tools/werewolf",
    icon: IconMoon,
    tagline: "Run a game of Werewolf without cards: deal secret roles and track the game.",
    usesRoster: true,
    about: "Werewolf (also called Mafia) is a social-deduction party game for a group. A hidden few are werewolves; everyone else is a villager. Each night the werewolves secretly pick someone to eliminate; each day the whole group debates and votes someone out. Werewolves win when they equal the villagers; the village wins when every werewolf is gone.",
    howToPlay: [
      "Pick how many werewolves and whether to include special roles (Seer, who can check one player's team each night; Doctor, who can protect one player).",
      "Deal roles by passing the phone: each player privately taps to see their own secret role, then hides it and passes on.",
      "Run the game: at night the werewolves choose a victim (and Seer/Doctor act); by day everyone discusses and votes to eliminate a suspect.",
      "As moderator you see everyone's role and tap a player to mark them out; keep going, night and day, until one side wins.",
    ],
  },
  {
    id: "cribbage",
    name: "Cribbage Board",
    description: "A digital peg board: race to 121, with the skunk and double-skunk lines marked.",
    href: "/game-nights/tools/cribbage",
    icon: IconGridDots,
    tagline: "A digital cribbage peg board, first to 121 with skunk lines marked.",
    usesRoster: true,
    about: "Cribbage is a classic 2-to-4-player card game scored on a pegboard. You score points from your cards and race to 121.",
    howToPlay: [
      "Each hand you score for combinations that add to fifteen, pairs, runs, flushes, and 'his nobs' (the jack of the turned-up suit), plus the dealer's extra 'crib' hand.",
      "Peg your points as you earn them; first player to 121 wins.",
      "If you win before your opponent passes 91 it's a 'skunk'; before 61 is a 'double skunk' (traditionally worth extra).",
      "In the tool, type each hand's total and tap Add; the skunk lines are marked on the track.",
    ],
  },
  {
    id: "hearts",
    name: "Hearts",
    description: "Round scoring with shoot-the-moon handled for you. Lowest score wins at 100.",
    href: "/game-nights/tools/hearts",
    icon: IconHeart,
    tagline: "A Hearts scorecard with shoot-the-moon handled for you.",
    usesRoster: true,
    about: "Hearts is a trick-taking card game where you want the fewest points, not the most. Every heart is worth 1 point and the Queen of Spades is worth 13, so each hand puts 26 points on the table.",
    howToPlay: [
      "Play out the hand; whoever takes tricks containing hearts or the Queen of Spades collects those points.",
      "The twist: 'shoot the moon' by taking all 26 points yourself, which instead gives every other player 26.",
      "Add up over many hands; the game ends when someone reaches 100, and the lowest score wins.",
      "In the tool, enter each player's points for the hand (they should total 26); the 🌙 control applies shoot-the-moon for the player you pick.",
    ],
  },
  {
    id: "farkle",
    name: "Farkle",
    description: "Bank each turn and race to 10,000, with the final round called automatically.",
    href: "/game-nights/tools/farkle",
    icon: IconDice3,
    tagline: "A Farkle scoreboard that calls the final round for you.",
    usesRoster: true,
    about: "Farkle is a push-your-luck dice game. You roll six dice and bank scoring dice, deciding each roll whether to stop or risk it all for more.",
    howToPlay: [
      "Single 1s are worth 100 and single 5s are worth 50; three of a kind and larger combos score more.",
      "After each roll, set aside at least one scoring die and choose to bank your points or reroll what's left for more.",
      "Roll and score nothing and you 'Farkle' — you lose everything unbanked that turn.",
      "First to 10,000 triggers a final round where everyone gets one more turn; highest score then wins. In the tool, tap the quick values or type a turn total and Bank it.",
    ],
  },
  {
    id: "euchre",
    name: "Euchre",
    description: "Two teams race to 10, with quick +1 / +2 / +4 for made hands, marches, and going alone.",
    href: "/game-nights/tools/euchre",
    icon: IconCards,
    tagline: "A two-team Euchre scoreboard with the point values built in.",
    usesRoster: false,
    about: "Euchre is a 4-player partnership trick-taking game played to 10 points. Two teams of two sit across from each other, and each hand one team names the trump suit and tries to win the majority of the five tricks.",
    howToPlay: [
      "The team that names trump must take at least 3 of the 5 tricks: 3 or 4 tricks scores 1 point, all 5 (a 'march') scores 2.",
      "A player may 'go alone' without their partner; taking all 5 alone scores 4.",
      "If the team that named trump fails to take 3, they are 'euchred' and the other team scores 2.",
      "In the tool, tap +1, +2, or +4 for the team that scored; first to 10 wins.",
    ],
  },
  {
    id: "golf",
    name: "Golf",
    description: "The card game: add a hole each round, lowest total wins.",
    href: "/game-nights/tools/golf",
    icon: IconFlag,
    tagline: "A Golf card-game scorecard, lowest total over the holes wins.",
    usesRoster: true,
    about: "Golf is a card game named after the sport: like real golf, the lowest score wins. It's played over a set number of rounds, each called a 'hole.'",
    howToPlay: [
      "Each hole, players swap and flip cards trying to end with the lowest-value layout in front of them.",
      "Score the hole for each player (low cards good, matches often cancel to zero depending on your house rules).",
      "Add a hole each round and enter everyone's score; totals carry across the holes.",
      "Lowest total when you finish the agreed number of holes wins.",
    ],
  },
  {
    id: "rummy",
    name: "Rummy",
    description: "Round scoring to a target (500 by default); first past it wins.",
    href: "/game-nights/tools/rummy",
    icon: IconStack2,
    tagline: "A Rummy scorecard that plays to a target you set.",
    usesRoster: true,
    about: "Rummy is a family of card games about forming 'melds' — sets of the same rank or runs of the same suit. It's usually played to a target score over several hands.",
    howToPlay: [
      "Each hand, players draw and discard trying to meld all their cards; when someone goes out, the hand is scored.",
      "Score by the melds you made (and, in many variants, minus the cards left in your hand).",
      "Add a round each hand and enter each player's points; the tool tracks totals to your target.",
      "First past the target (500 by default, change it to suit your group) wins.",
    ],
  },
];

export function getCompanionTool(id: string): CompanionTool | undefined {
  return COMPANION_TOOLS.find((t) => t.id === id);
}
