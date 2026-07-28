"use client";

/**
 * My Cards preview — a read-only peek at the user's card collection inside the
 * account "My Stuff" tab. Shows owned card art (with quantities) so the
 * collection is visible without leaving the account; searching / adding /
 * removing lives on the full page at /pokemon-tcg/my-cards (the canonical
 * home). Self-fetches `/api/tcg/collection` (auth-gated; free capability) so
 * it stays out of the account page's big load effect.
 */

import { useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";
import { CardImage } from "@/components/tcg/CardImage";
import type { UserCard } from "@/lib/scrydex/types";

const PREVIEW_LIMIT = 12;
const MY_CARDS_HREF = "/pokemon-tcg/my-cards";

export function MyCardsPreview() {
  // null = still loading; [] = loaded-empty. Only set after the await so we
  // never call setState synchronously in the effect body.
  const [cards, setCards] = useState<UserCard[] | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/tcg/collection");
        const next = res.ok
          ? (((await res.json())?.cards as UserCard[]) ?? [])
          : [];
        if (active) setCards(next);
      } catch {
        if (active) setCards([]);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const total = cards?.length ?? 0;
  const shown = cards?.slice(0, PREVIEW_LIMIT) ?? [];
  const extra = total - shown.length;

  return (
    <div className="account-card">
      <div className="my-cards-preview__head">
        <h2>My Cards</h2>
        <a href={MY_CARDS_HREF}>
          <Button variant="primary" size="small">
            {total > 0 ? "Manage My Cards" : "View My Cards"}
          </Button>
        </a>
      </div>

      {cards === null ? (
        <p className="my-cards-preview__muted">Loading your cards…</p>
      ) : total === 0 ? (
        <p className="my-cards-preview__muted">
          Search the Pokémon catalog and track the cards you own. Add cards to
          play with them in the TCG Companion.
        </p>
      ) : (
        <div className="my-cards-preview__grid">
          {shown.map((row) => (
            <div key={row.id} className="my-cards-preview__cell">
              <CardImage
                images={row.card?.images}
                name={row.card?.name ?? row.card_id}
                size="small"
              />
              {row.quantity > 1 ? (
                <span className="my-cards-preview__qty">×{row.quantity}</span>
              ) : null}
            </div>
          ))}
          {extra > 0 ? (
            <a href={MY_CARDS_HREF} className="my-cards-preview__more">
              +{extra} more
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}
