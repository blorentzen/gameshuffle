/**
 * Copy for the free bracket tools' pages (search pages round, picks
 * 2026-10-20): one URL per format, each with its own title, steps, notes and
 * questions. The searches: bracket maker 14,800 a month, tournament bracket
 * generator 12,100, bracket generator 8,100; round robin and Swiss have their
 * own smaller ones.
 */

import type { ToolPage } from "@/components/brackets/BracketTool";

export interface BracketToolCopy {
  page: ToolPage;
  path: string;
  /** The h1. */
  name: string;
  metaTitle: string;
  description: string;
  lede: string;
  steps: { name: string; text: string }[];
  notes: { title: string; body: string[] }[];
  faq: { q: string; a: string }[];
}

export const BRACKET_TOOLS: Record<ToolPage, BracketToolCopy> = {
  elim: {
    page: "elim",
    path: "/bracket-generator",
    name: "Bracket generator",
    metaTitle: "Bracket Maker: Free Tournament Bracket Generator",
    description: "Free bracket maker for single and double elimination tournaments, up to 64 players or teams. Paste names, tap winners through, print it or share a link. No sign-up.",
    lede: "Paste your players or teams, pick single or double elimination, then tap the winners through. Print it or send a link.",
    steps: [
      { name: "Paste the names", text: "One per line, up to 64. The first name is the top seed, or press Shuffle for a random draw." },
      { name: "Pick the format", text: "Single elimination is out after one loss. Double elimination gives everyone a second life in the losers bracket." },
      { name: "Tap the winners", text: "Each winner moves to the next round. Tap again to take a result back; later rounds fix themselves." },
    ],
    notes: [
      {
        title: "Single or double elimination?",
        body: [
          "Single elimination is the quickest: every match knocks someone out, so 16 players need 15 matches over 4 rounds. It's the classic for a short night or a big field.",
          "Double elimination takes about twice as long but nobody goes home after one bad game. Losers drop into a losers bracket, its winner meets the winners bracket champion in the grand final, and if the losers side wins that, one more match decides it.",
        ],
      },
      {
        title: "Seeding and byes",
        body: [
          "Seeds are placed the standard way: 1 plays the last seed, 2 plays the second last, and the top two can only meet in the final. When the field isn't 4, 8, 16, 32 or 64, the top seeds get byes into round two so everyone else still has a full first round.",
          "Want a random draw instead? Press Shuffle the order before you make the bracket.",
        ],
      },
      {
        title: "Printing and sharing",
        body: [
          "Print fits the whole bracket on a landscape page with the results so far, or print it blank to fill in by hand. Copy link sends a link that opens the same bracket with every result in it; nothing is saved on our side.",
        ],
      },
    ],
    faq: [
      { q: "How do byes work in a bracket?", a: "When the number of players isn't a power of two (4, 8, 16, 32, 64), the bracket rounds up and the extra seats are byes. Byes go to the top seeds, who move straight to round two. A 12-player bracket is drawn as 16 with 4 byes, so seeds 1 to 4 skip round one." },
      { q: "How many matches are in a single elimination bracket?", a: "Always one fewer than the number of players, because every match knocks out exactly one player. 8 players play 7 matches, 32 players play 31." },
      { q: "How many matches are in a double elimination bracket?", a: "About twice as many: double the players minus two, or minus one when the grand final needs its second match. 8 players play 14 or 15 matches." },
      { q: "Can I make a double elimination bracket for any number of players?", a: "Yes, from 4 to 64. Like single elimination, a field that isn't a power of two gets byes for the top seeds." },
      { q: "Can I print the bracket?", a: "Yes. Print fits it on a landscape page with the results so far. Make it and print straight away for a blank bracket to fill in by hand." },
      { q: "Do I need an account?", a: "No. The bracket stays in this browser and in its link. An account only matters if you run it as a live tournament, where players join from their phones and report their own results." },
      { q: "Can players report their own results?", a: "In a live tournament, yes. Press Run it live and your names come along as guests; players can join from a link, the bracket updates for everyone and there's a TV display for the room." },
    ],
  },
  roundrobin: {
    page: "roundrobin",
    path: "/round-robin-generator",
    name: "Round robin generator",
    metaTitle: "Round Robin Generator: Free Schedule Maker",
    description: "Free round robin generator: everyone plays everyone, split into rounds, with live standings. Up to 64 players or teams; print it or share a link.",
    lede: "Paste your players or teams and get a round-by-round schedule where everyone plays everyone. Enter results and the standings keep up.",
    steps: [
      { name: "Paste the names", text: "One per line, from 3 to 64 players or teams." },
      { name: "Choose the options", text: "Play everyone once or twice, and say whether ties count." },
      { name: "Play the rounds", text: "Tap each match's winner. The standings sort by points as you go." },
    ],
    notes: [
      {
        title: "How the schedule works",
        body: [
          "The schedule uses the circle method, the same one sports leagues use: every round, everyone plays at the same time, and by the end everyone has met everyone exactly once. With an odd number of players, one player sits out each round, and everyone sits out exactly once.",
          "Play everyone twice adds a second leg in the same order with the sides swapped.",
        ],
      },
      {
        title: "Standings",
        body: [
          "A win is 3 points and a tie is 1. Level on points? If exactly two players are level, the one who did better against the other goes first, then more wins, then the original order.",
        ],
      },
    ],
    faq: [
      { q: "How many rounds does a round robin have?", a: "One fewer than the number of players when the number is even (8 players play 7 rounds), and as many rounds as players when it's odd, because someone sits out each round (7 players play 7 rounds)." },
      { q: "How many matches are in a round robin?", a: "Players × (players − 1) ÷ 2. 6 players play 15 matches, 10 players play 45. Playing everyone twice doubles it." },
      { q: "What happens with an odd number of players?", a: "One player sits out each round, and everyone sits out exactly once, so it stays fair." },
      { q: "How are ties in the standings broken?", a: "Points first (3 for a win, 1 for a tie). If exactly two are level, head-to-head decides, then the number of wins." },
      { q: "Can I print the schedule?", a: "Yes. Print shows the standings and every round on landscape pages." },
      { q: "Do I need an account?", a: "No. The schedule and results stay in this browser and in its link." },
    ],
  },
  swiss: {
    page: "swiss",
    path: "/swiss-pairing-generator",
    name: "Swiss pairing generator",
    metaTitle: "Swiss Pairing Generator: Free Swiss Tournament Tool",
    description: "Free Swiss pairing generator: pairs each round by record with no rematches, handles byes and tiebreakers, and adds a top cut. Up to 64 players.",
    lede: "Paste your players and pair round 1. Enter results, pair the next round, and the standings and tiebreakers work themselves out.",
    steps: [
      { name: "Paste the names", text: "One per line, from 4 to 64. The suggested rounds and top cut follow the size of the field." },
      { name: "Play a round", text: "Tap each table's winner. Pairings can be redone until the first result is in." },
      { name: "Pair the next one", text: "Players meet someone on the same record, never twice. Then the top cut decides it." },
    ],
    notes: [
      {
        title: "How Swiss pairing works",
        body: [
          "Round 1 is random. After that, players are paired at random within the same record, starting from the top, and nobody plays the same person twice. With an odd number, someone from the lowest record gets a bye (it counts as a win), and nobody gets two.",
          "These are the rules the Play! Pokémon handbook uses, and most chess, card game and video game locals run Swiss the same way.",
        ],
      },
      {
        title: "Rounds, tiebreakers and the top cut",
        body: [
          "The suggested rounds and top cut follow the handbook's table: 8 players play 3 rounds, 9 to 12 play 4 and a Top 4, 21 to 32 play 5 and a Top 8. Change either before round 1.",
          "Level on points, players are sorted by their opponents' win percentage, then their opponents' opponents' win percentage, then head-to-head. Byes don't count toward anyone's win percentage.",
        ],
      },
    ],
    faq: [
      { q: "How many rounds of Swiss should I play?", a: "Enough that one undefeated player can emerge: about log2 of the field. The tool suggests the Play! Pokémon numbers: 3 rounds for up to 8 players, 4 for 9 to 12, 5 for 13 to 32 and 6 for 33 to 64, with a Top 4 or Top 8 cut from 9 players." },
      { q: "What are the tiebreakers in Swiss?", a: "Opponents' win percentage (how well the people you played did), then opponents' opponents' win percentage, then head-to-head when exactly two players are level. Each win percentage counts at least 25%." },
      { q: "How are byes handled?", a: "With an odd number of players, one player sits out the round and gets a win. It goes to someone on the lowest record, and nobody gets two byes." },
      { q: "Can a player drop out?", a: "Yes. Between rounds, press Drop next to their name in the standings; they keep their record and aren't paired again." },
      { q: "Can I redo a round's pairings?", a: "Yes, until the first result of the round is in. Press Pair again." },
      { q: "Does it work for Pokémon, Magic or chess?", a: "Yes. It follows the Play! Pokémon pairing rules, which match how most card game and chess clubs run Swiss. Results are a win, a loss or a tie." },
      { q: "Do I need an account?", a: "No. The event stays in this browser and in its link. Run it as a live tournament and players report their own results from their phones, with a round clock and deck lists for Pokémon TCG." },
    ],
  },
};

export const BRACKET_TOOL_LIST = [BRACKET_TOOLS.elim, BRACKET_TOOLS.roundrobin, BRACKET_TOOLS.swiss];
