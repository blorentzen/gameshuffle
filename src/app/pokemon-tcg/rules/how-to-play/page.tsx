import type { Metadata } from "next";
import Link from "next/link";
import { RulesArticle, type Faq } from "@/components/tcg/rules/RulesArticle";
import { rulePage, ruleUrl } from "@/data/tcg-rules";
import { ruleMetadata } from "@/lib/tcg/ruleMeta";

const page = rulePage("how-to-play")!;

export const metadata: Metadata = ruleMetadata(page);

const faq: Faq[] = [
  { q: "Can you attack on the first turn in the Pokémon TCG?", a: "Not if you go first. The player who goes first can't attack or play a Supporter on their very first turn. The second player can do both on their first turn." },
  { q: "How many Energy can you attach per turn?", a: "One Energy card from your hand, to any one of your Pokémon. Card effects can attach more." },
  { q: "When can a Pokémon evolve?", a: "Not on either player's first turn, and not on the turn the Pokémon was played or already evolved. After that, one evolution per Pokémon per turn." },
  { q: "How many cards are in a Pokémon deck?", a: "Exactly 60, with no more than 4 copies of any card by name (basic Energy cards are the exception). You need at least one Basic Pokémon to play." },
  { q: "What is a mulligan?", a: "If you draw no Basic Pokémon in your opening 7 cards, show your hand, shuffle it back and draw 7 again. Your opponent may draw one extra card for each mulligan you take." },
];

export default function HowToPlayPage() {
  return (
    <RulesArticle
      page={page}
      lede={<>A game of the Pokémon TCG is two players taking turns: set up your Pokémon, power them up with Energy, attack, and be first to take all six <Link href={ruleUrl("prize-cards")}>Prize cards</Link>. Here&apos;s a whole game in plain words.</>}
      faq={faq}
    >
      <h2 id="setup">Setting up</h2>
      <ol>
        <li>Each player shuffles a 60-card deck and draws <strong>7 cards</strong>.</li>
        <li>Put one <strong>Basic Pokémon</strong> face down as your Active Pokémon, and up to five more face down on your Bench. No Basic Pokémon? Take a mulligan (see the questions below).</li>
        <li>Each player puts the top <strong>6 cards</strong> of their deck face down as Prize cards.</li>
        <li>Flip a coin. The winner chooses who goes first. Turn your Pokémon face up and start.</li>
      </ol>

      <h2 id="your-turn">Your turn</h2>
      <p><strong>Draw a card.</strong> Then do any of these, in any order, as many times as allowed:</p>
      <ul>
        <li><strong>Put Basic Pokémon on your Bench</strong> (up to 5 there).</li>
        <li><strong>Evolve</strong> a Pokémon by placing its Stage 1 or Stage 2 on top. Not on anyone&apos;s first turn, and not the turn the Pokémon came into play.</li>
        <li><strong>Attach one Energy</strong> card from your hand to one of your Pokémon. Once a turn.</li>
        <li><strong>Play Trainer cards:</strong> Items as often as you like; one <strong>Supporter</strong> a turn; one <strong>Stadium</strong> a turn; a <strong>Tool</strong> on a Pokémon that doesn&apos;t have one.</li>
        <li><strong>Retreat</strong> your Active Pokémon once: discard Energy from it equal to its Retreat Cost and swap it with a Benched Pokémon.</li>
        <li><strong>Use Abilities</strong> written on your Pokémon.</li>
      </ul>

      <h2 id="attack">Attack, and your turn ends</h2>
      <p>When you&apos;re ready, choose one of your Active Pokémon&apos;s attacks that it has the Energy for. Work out the damage (<Link href={ruleUrl("weakness-and-resistance")}>Weakness and Resistance</Link>), put <Link href={ruleUrl("damage-counters")}>damage counters</Link> on the defender, and do what the attack&apos;s text says. Attacking ends your turn; you can also end it without attacking.</p>
      <p>If you Knock Out a Pokémon, take your Prize cards, and your opponent picks a new Active Pokémon from their Bench.</p>

      <h2 id="between-turns">Between turns: Pokémon Checkup</h2>
      <p>Before the next player begins, check both Active Pokémon for <Link href={ruleUrl("special-conditions")}>Special Conditions</Link>: Poison and Burn add damage, Asleep flips a coin to wake, and Paralysis wears off after its owner&apos;s turn.</p>

      <h2 id="first-turn">First-turn rules</h2>
      <ul>
        <li>The player who goes <strong>first</strong> can&apos;t attack or play a Supporter on their first turn.</li>
        <li><strong>Neither</strong> player can evolve on their first turn.</li>
      </ul>

      <h2 id="learn">Learn it in one game</h2>
      <p>The fastest way to learn is to play: pick up a beginner deck from the <Link href="/pokemon-tcg/decks">deck guides</Link> (the Battle Boxes are matched pairs for two new players) and open the <Link href="/pokemon-tcg-companion">GameShuffle TCG Companion</Link>. It tracks the turn, ticks off the once-a-turn plays, and gently reminds you when something breaks the rules, without stopping the game.</p>
    </RulesArticle>
  );
}
