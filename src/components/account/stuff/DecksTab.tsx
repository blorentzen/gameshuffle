"use client";

/**
 * My Stuff ▸ Decks: your own Chance cards, missions and house rules for game
 * nights and live nights (GS Pro). Moved here from Streaming ▸ Game defaults,
 * since cards are dealt at the table, not in chat. Starts with what each kind
 * of card does, then the shared DeckEditor with "Make cards with AI".
 */

import { IconCards, IconTargetArrow, IconGavel } from "@tabler/icons-react";
import { AdminScreen, AdminSection } from "@/components/account/admin/AdminKit";
import { DeckEditor } from "@/components/party/DeckEditor";
import { ProTrialPrompt } from "@/components/billing/ProTrialPrompt";

const KINDS = [
  { icon: IconCards, title: "Chance cards", text: "Dealt to one player: a help that gives them an edge, or a crutch that holds them back for a few turns." },
  { icon: IconTargetArrow, title: "Missions", text: "A secret goal worth 1 to 3 points. The table confirms it when it happens." },
  { icon: IconGavel, title: "House rules", text: "A twist everyone plays by, or one player does. Mild or spicy." },
];

export function DecksTab({ isPro }: { isPro: boolean }) {
  return (
    <AdminScreen
      title="Decks"
      intro="Your own cards for Mario Party and Smash nights. They're dealt on your game nights and live nights whenever cards are on, and your mods can edit them from your mod page."
    >
      <ul className="decks-kinds" aria-label="Kinds of cards">
        {KINDS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="decks-kinds__item">
            <span className="decks-kinds__icon" aria-hidden><Icon size={20} /></span>
            <strong>{title}</strong>
            <span>{text}</span>
          </li>
        ))}
      </ul>
      {isPro ? (
        <AdminSection
          title="Your cards"
          intro="New cards start as drafts. Publish one to put it in the deck. Stuck for ideas? Make cards with AI, then edit the drafts before you publish."
        >
          <DeckEditor scope="me" ai />
        </AdminSection>
      ) : (
        <ProTrialPrompt title="Your own cards are part of GS Pro" from="decks">
          Write house rules, Chance cards and missions for your crew, or have AI draft them for you. Until then, your nights use the GameShuffle deck.
        </ProTrialPrompt>
      )}
    </AdminScreen>
  );
}
