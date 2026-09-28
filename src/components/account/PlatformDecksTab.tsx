"use client";

import { DeckEditor } from "@/components/party/DeckEditor";

/**
 * PlatformDecksTab — staff/admin editor for the official card decks (house
 * rules, Chance cards, missions, card moments) behind game meta layers.
 * Mario Party first. The API refuses anyone who isn't staff or admin.
 */
export function PlatformDecksTab() {
  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Decks</h2>
      <DeckEditor
        scope="official"
        intro={
          <p className="account-tab__intro">
            The official Mario Party deck. New cards start as drafts; publishing makes them dealable everywhere within
            a minute. Cards are retired rather than deleted, because saved setups and points history refer to them.
            The numbers on each card show how often it has been dealt, played and completed in live nights.
          </p>
        }
      />
    </div>
  );
}
