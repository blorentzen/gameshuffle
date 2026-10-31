"use client";

/**
 * "Play with a deck": pick one of your saved deck lists for each player (or
 * just yours in a shared game). The deck's Pokémon then lead the card picker
 * when that player places or evolves a Pokémon. Signed in, with decks saved;
 * renders nothing otherwise.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Select } from "@empac/cascadeds";
import { useSession } from "@/lib/companion/SessionContext";
import type { PlayerId } from "@/lib/companion/types";

interface Choice { id: string; name: string }

const NONE = "none";

export function DeckChoice() {
  const { isAuthenticated, state, decks, chooseDeck, live, bottom } = useSession();
  const [choices, setChoices] = useState<Choice[] | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/tcg/decks", { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as { ready?: boolean; decks?: { id: string; name: string }[] };
        if (active) setChoices(res.ok && body.ready ? (body.decks ?? []).map((d) => ({ id: d.id, name: d.name })) : []);
      } catch {
        if (active) setChoices([]);
      }
    })();
    return () => { active = false; };
  }, [isAuthenticated]);

  if (!isAuthenticated || choices === null) return null;
  if (choices.length === 0) {
    return (
      <p className="companion-deckchoice__none">
        Have a deck list? <Link href="/account/stuff?tab=tcg-decks">Save it in My Collection</Link> and its Pokémon come first when you place a card.
      </p>
    );
  }

  // In a shared game each phone picks for its own player.
  const players: PlayerId[] = live ? [bottom] : ["p1", "p2"];
  const options = [{ value: NONE, label: "No deck" }, ...choices.map((c) => ({ value: c.id, label: c.name }))];

  return (
    <div className="companion-deckchoice">
      <span className="companion-deckchoice__label">Play with a deck</span>
      <div className="companion-deckchoice__row">
        {players.map((p) => (
          <Select
            key={p}
            floatingLabel={`${state.playerNames[p]}'s deck`}
            value={decks[p]?.id ?? NONE}
            options={options}
            onChange={(v) => {
              const id = String(v);
              void chooseDeck(p, id === NONE ? null : choices.find((c) => c.id === id) ?? null);
            }}
          />
        ))}
      </div>
      <p className="companion-deckchoice__note">Its Pokémon come first when that player places a card.</p>
    </div>
  );
}
