/**
 * The Pokémon TCG rules section (`/pokemon-tcg/rules`): plain-words answers to
 * what players search for, each with a tool from the companion built in.
 * Rules in our own words (no rulebook text). Titles stay at 46 characters or
 * less so " | GameShuffle" keeps the full title under 60. Plan:
 * https://claude.ai/artifact/Y6p1rHtuSAQiDmJkz6cPSi
 */

export interface RulePage {
  slug: string;
  /** Short label for links and the breadcrumb. */
  label: string;
  /** Search title (46 characters or less). */
  title: string;
  h1: string;
  description: string;
  /** One line for the rules hub's list. */
  summary: string;
}

export const RULES_PATH = "/pokemon-tcg/rules";
/** Last time the rules were checked against the current rulebook (Pacific). */
export const RULES_CHECKED = "2026-10-11";

export const RULE_PAGES: RulePage[] = [
  {
    slug: "damage-counters",
    label: "Damage counters",
    title: "Pokémon TCG Damage Counters, Explained",
    h1: "Pokémon TCG damage counters",
    description: "What damage counters are in the Pokémon TCG, how 10, 50 and 100 counters work, when a Pokémon is Knocked Out, and a free counter tray you can use right now.",
    summary: "What each counter is worth, when a Pokémon is Knocked Out, and a counter tray to use at the table.",
  },
  {
    slug: "special-conditions",
    label: "Special Conditions",
    title: "Pokémon TCG Special Conditions Guide",
    h1: "Pokémon TCG Special Conditions",
    description: "Poison, Burn, Asleep, Paralyzed and Confused in the Pokémon TCG: what each one does, how to mark it, what happens between turns, and how to get rid of it.",
    summary: "Poison, Burn, Asleep, Paralyzed and Confused, and what happens to each between turns.",
  },
  {
    slug: "weakness-and-resistance",
    label: "Weakness and Resistance",
    title: "Pokémon TCG Weakness and Resistance",
    h1: "Weakness and Resistance in the Pokémon TCG",
    description: "How Weakness (×2) and Resistance (−30) change damage in the Pokémon TCG, the order damage is worked out in, and a damage calculator to check an attack.",
    summary: "×2 and −30, the order damage is worked out in, and a calculator to check an attack.",
  },
  {
    slug: "prize-cards",
    label: "Prize cards",
    title: "Pokémon TCG Prize Cards and How to Win",
    h1: "Prize cards and how to win",
    description: "How Prize cards work in the Pokémon TCG: six to start, how many a Knock Out gives (ex 2, Mega Evolution ex 3), and the three ways to win a game.",
    summary: "Six to start, what a Knock Out gives (ex 2, Mega ex 3), and the three ways to win.",
  },
  {
    slug: "how-to-play",
    label: "How to play",
    title: "How to Play the Pokémon TCG: A Turn",
    h1: "How to play the Pokémon TCG",
    description: "How to play the Pokémon Trading Card Game: setting up, what you can do on your turn, attacking, what happens between turns, and the first-turn rules.",
    summary: "Setting up, everything you can do on a turn, attacking, and the first-turn rules.",
  },
];

export const rulePage = (slug: string) => RULE_PAGES.find((p) => p.slug === slug);
export const ruleUrl = (slug: string) => `${RULES_PATH}/${slug}`;
