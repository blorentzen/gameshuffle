"use client";

import { IconBolt, IconCards, IconGavel, IconTargetArrow } from "@tabler/icons-react";
import { AdminScreen, AdminSection } from "@/components/account/admin/AdminKit";
import { DeckEditor } from "@/components/party/DeckEditor";

/**
 * PlatformDecksTab: staff/admin editor for the official card decks (house
 * rules, Chance cards, missions, card moments) behind game meta layers, one
 * deck per game family (Mario Party, Smash). The API refuses anyone who isn't
 * staff or admin. Framed like My Stuff ▸ Decks: what each kind of card does,
 * then the shared DeckEditor (which is left as it is: other pages use it too).
 */

const KINDS = [
  { icon: IconCards, title: "Chance cards", text: "Dealt to one player: a help that gives them an edge, or a crutch that holds them back for a few turns." },
  { icon: IconTargetArrow, title: "Missions", text: "A secret goal worth 1 to 3 points. The table confirms it when it happens." },
  { icon: IconGavel, title: "House rules", text: "A twist everyone plays by, or one player does. Mild or spicy." },
  { icon: IconBolt, title: "Card moments", text: "The points in a game that deal a Chance card, like landing on a Bowser Space or the final five turns." },
];

export function PlatformDecksTab() {
  return (
    <AdminScreen
      title="Card decks"
      intro="The official cards dealt on game nights and live nights for Mario Party and Smash. GS Pro members with their own deck can deal these alongside theirs or leave them out."
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
      <AdminSection
        title="Official cards"
        intro="New cards start as drafts, and publishing one makes it dealable everywhere within a minute. Cards are retired rather than deleted, because saved setups and points history still point to them. The numbers on a card show how often it has been dealt, played and completed on live nights."
      >
        <DeckEditor scope="official" />
      </AdminSection>
    </AdminScreen>
  );
}
