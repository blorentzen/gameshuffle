import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/tcg-deck-lists";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { siteName: "GameShuffle", title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <HelpArticle href={HREF}>
      <h1>Pokémon TCG deck lists</h1>
      <p>
        Keep your Pokémon TCG deck lists in{" "}
        <strong>Account &rsaquo; Pokémon &rsaquo; Deck lists</strong>. Each list is checked against the rules, matched
        against the cards in My Cards so you can see what you already own, and ready to play in the{" "}
        <Link href="/help/apps/tcg-companion">TCG Companion</Link>. You need to be signed in.
      </p>

      <h2>Add a list</h2>
      <h3>Paste one</h3>
      <ol>
        <li>Press <strong>Paste a deck list</strong>.</li>
        <li>Paste a list from Pokémon TCG Live (its Export to clipboard), Limitless, or a message from a friend.</li>
        <li>Press <strong>Check this list</strong>. You&apos;ll see the checks, plus any lines that didn&apos;t read as a card.</li>
        <li>Name the deck (it suggests one from the first Pokémon) and press <strong>Save this deck</strong>.</li>
      </ol>
      <p>
        Lists read the way Pokémon TCG Live writes them: a count, the card name, the set code and the number, like{" "}
        <code>4 Pikachu ex ASC 57</code>, under headings such as <code>Pokémon: 12</code>. A line without a set code still
        works, matched by name. The same card on two lines adds up, and basic Energy can be written as{" "}
        <code>Basic {"{L}"} Energy</code>, <code>Basic Lightning Energy</code>{" "}or <code>Lightning Energy</code>.
      </p>

      <h3>Start from a guide</h3>
      <p>
        Open one of our <Link href="/pokemon-tcg/decks">deck guides</Link>{" "}and press <strong>Save to my decks</strong>. Signed
        out, the button asks you to sign in and brings you back to the guide.
      </p>

      <h2>The checks</h2>
      <ul>
        <li>Exactly 60 cards.</li>
        <li>No more than 4 copies of a card with the same name. Basic Energy can be any number.</li>
        <li>No more than 1 ACE SPEC.</li>
        <li>At least one Basic Pokémon.</li>
        <li>Every card is legal in Standard, going by its regulation mark. An older printing counts when a reprint with the same name is in Standard.</li>
      </ul>
      <p>Each deck gets one badge:</p>
      <ul>
        <li><strong>Standard legal:</strong> every check passes.</li>
        <li><strong>1 problem</strong>{" "}(or more): a check failed. The deck window says which cards and why.</li>
        <li><strong>Check by hand:</strong> some cards couldn&apos;t be matched to our catalog, so we can&apos;t check them. They&apos;re named in the checks and marked &ldquo;not matched&rdquo; in the list. A list is never called illegal for this.</li>
      </ul>
      <p>
        Checks run again every time you open your decks, so a deck&apos;s badge changes on its own when Standard rotates.
      </p>

      <h2>What you own</h2>
      <p>
        Each deck shows how many of its cards you have in My Cards, like &ldquo;You own 41 of 60&rdquo;, and the deck window
        shows it card by card. A Pokémon only counts when you have that exact card. Trainers and Energy count any printing
        with the same name. When you&apos;re short, <strong>Shop the singles</strong>{" "}opens our TCGplayer store.
      </p>

      <h2>The deck window</h2>
      <p>Press <strong>Open</strong>{" "}on a deck to see the full list by Pokémon, Trainer and Energy, then:</p>
      <ul>
        <li><strong>Play in the companion</strong>{" "}opens the TCG Companion with this deck for your side.</li>
        <li><strong>Copy for TCG Live</strong>{" "}copies the list in Pokémon TCG Live&apos;s format. In the game, import it from the clipboard.</li>
        <li><strong>Rename</strong>{" "}or <strong>Delete</strong>. Deleting a deck doesn&apos;t touch your cards in My Cards.</li>
      </ul>

      <h2>Play it in the companion</h2>
      <p>
        In the companion&apos;s <strong>New Game</strong>{" "}window, <strong>Play with a deck</strong>{" "}lets you pick one of your
        lists for each player. In a game you play together on two phones, you pick for your own side. When that player places
        or evolves a Pokémon, the deck&apos;s Pokémon come first in the card picker. The deck isn&apos;t saved with the game.
      </p>

      <h2>Deck lists in tournaments</h2>
      <p>
        Pokémon TCG tournaments can ask for a deck list to join or before round 1. You send one of your saved lists, or paste a
        new one, and it&apos;s checked against the tournament&apos;s format. See{" "}
        <Link href="/help/tournaments/swiss-and-deck-lists">Swiss tournaments and deck lists</Link>.
      </p>

      <h2>Free and GS Pro</h2>
      <p>A free account keeps 3 deck lists. <Link href="/gs-pro">GS Pro</Link>{" "}keeps as many as you like.</p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
