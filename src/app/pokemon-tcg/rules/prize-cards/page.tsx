import type { Metadata } from "next";
import Link from "next/link";
import { RulesArticle, type Faq } from "@/components/tcg/rules/RulesArticle";
import { rulePage, ruleUrl } from "@/data/tcg-rules";
import { ruleMetadata } from "@/lib/tcg/ruleMeta";

const page = rulePage("prize-cards")!;

export const metadata: Metadata = ruleMetadata(page);

const faq: Faq[] = [
  { q: "How many Prize cards do you start with?", a: "Six. During setup each player puts the top 6 cards of their deck face down to the side; those are their Prize cards." },
  { q: "How many Prize cards is a Pokémon ex worth?", a: "Two. Knocking Out a Pokémon ex gives the other player 2 Prize cards. A Mega Evolution Pokémon ex gives 3." },
  { q: "What happens if both players take their last Prize card at once?", a: "Both players win at the same time, so play a short sudden death game: set up a new game with 1 Prize card each, and whoever takes it first wins." },
  { q: "Can you win without taking all your Prize cards?", a: "Yes. You also win if your opponent has no Pokémon left in play, or if they have no cards to draw at the start of their turn." },
  { q: "Do you pick which Prize card to take?", a: "Yes, you choose which of your face-down Prize cards to take, without looking at them first, and put them into your hand." },
];

export default function PrizeCardsPage() {
  return (
    <RulesArticle
      page={page}
      lede={<>Prize cards are how you win: each time you Knock Out one of your opponent&apos;s Pokémon, you take some. Take your last one and the game is yours. Here&apos;s how many each Knock Out gives, and the two other ways to win.</>}
      faq={faq}
    >
      <h2 id="setup">Six to start</h2>
      <p>During setup, after both players have placed their first Pokémon, each player puts the <strong>top 6 cards</strong> of their deck face down. Those are your Prize cards. Every Knock Out lets you take one or more and put them in your hand, so Prize cards are also extra cards to play with.</p>

      <h2 id="how-many">How many a Knock Out gives</h2>
      <div className="rules-page__table" role="region" aria-label="Prize cards by Pokémon" tabIndex={0}>
        <table>
          <thead><tr><th>Knocked Out Pokémon</th><th>Prize cards</th></tr></thead>
          <tbody>
            <tr><td>Most Pokémon (Basic, Stage 1, Stage 2)</td><td>1</td></tr>
            <tr><td>Pokémon ex (including Tera Pokémon ex)</td><td>2</td></tr>
            <tr><td>Mega Evolution Pokémon ex</td><td>3</td></tr>
            <tr><td>Older cards: Pokémon EX, GX, V and VSTAR</td><td>2</td></tr>
            <tr><td>Older cards: VMAX, TAG TEAM and V-UNION</td><td>3</td></tr>
          </tbody>
        </table>
      </div>
      <p>That&apos;s why decks built on single-Prize Pokémon can trade well against big ex Pokémon: your opponent needs more Knock Outs to take all six. The <Link href="/pokemon-tcg/decks/single-prize-underdog-deck-standard-2026">single prize deck guide</Link> is built on exactly that.</p>

      <h2 id="ways-to-win">Three ways to win</h2>
      <ol>
        <li><strong>Take your last Prize card.</strong></li>
        <li><strong>Your opponent has no Pokémon in play</strong> after a Knock Out (no Active and nothing on the Bench to replace it).</li>
        <li><strong>Your opponent can&apos;t draw</strong> a card at the start of their turn because their deck is empty.</li>
      </ol>
      <p>If both players win at the same moment, play sudden death: a new game with 1 Prize card each.</p>

      <h2 id="tracking">Tracking Prize cards</h2>
      <p>Prize cards stay face down, so it&apos;s easy to lose count mid-game. The <Link href="/pokemon-tcg-companion">GameShuffle TCG Companion</Link> keeps both players&apos; count, takes the right number on a Knock Out (it knows an ex is worth 2 from the card), and ends the game when someone takes their last one. See also <Link href={ruleUrl("damage-counters")}>when a Pokémon is Knocked Out</Link>.</p>
    </RulesArticle>
  );
}
