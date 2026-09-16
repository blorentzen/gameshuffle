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
  emoji: string;
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
    href: "/board-game-nights/tools/score-pad",
    emoji: "📝",
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
    href: "/board-game-nights/tools/yahtzee",
    emoji: "🎲",
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
    href: "/board-game-nights/tools/deduction",
    emoji: "🔎",
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
    href: "/board-game-nights/tools/game-picker",
    emoji: "🎯",
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
    href: "/board-game-nights/tools/turn-timer",
    emoji: "⏱️",
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
    href: "/board-game-nights/tools/counters",
    emoji: "🔢",
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
    id: "werewolf",
    name: "Werewolf Moderator",
    description: "Deal secret roles by passing the phone, then run the night and day phases.",
    href: "/board-game-nights/tools/werewolf",
    emoji: "🐺",
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
    href: "/board-game-nights/tools/cribbage",
    emoji: "🃏",
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
    href: "/board-game-nights/tools/hearts",
    emoji: "♥️",
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
    href: "/board-game-nights/tools/farkle",
    emoji: "🎲",
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
    href: "/board-game-nights/tools/euchre",
    emoji: "🂡",
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
    href: "/board-game-nights/tools/golf",
    emoji: "⛳",
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
    href: "/board-game-nights/tools/rummy",
    emoji: "🃏",
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
