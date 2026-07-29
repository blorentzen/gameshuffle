"use client";

/**
 * Shared card picker for the Companion. Two sources, no gate beyond sign-in:
 * the player's collection ("your cards", the default quick-pick) AND the full
 * catalog (searched once the query is long enough). Calls `onPick(card)` with
 * the chosen card — the parent decides what to do (place a new piece, evolve an
 * existing one). Renders nothing for guests / modes without a card catalog.
 */

import { useEffect, useRef, useState } from "react";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import { CardImage } from "@/components/tcg/CardImage";
import { CardGridSkeleton } from "@/components/tcg/CardGridSkeleton";
import type { TcgCard, UserCard } from "@/lib/scrydex/types";

const CARD_DEBOUNCE_MS = 400;
const CARD_MIN_CHARS = 3;

export function CardPicker({ onPick }: { onPick: (card: TcgCard) => void }) {
  const { isAuthenticated } = useSession();
  const mode = useMode();
  const enabled = isAuthenticated && mode.slotThemes.length > 0;

  const [collection, setCollection] = useState<UserCard[] | null>(null);
  const [cardQuery, setCardQuery] = useState("");
  const [libraryResults, setLibraryResults] = useState<TcgCard[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);

  // Load the player's collection once (the default quick-pick source).
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/tcg/collection");
        const next = res.ok
          ? (((await res.json())?.cards as UserCard[]) ?? [])
          : [];
        if (active) setCollection(next);
      } catch {
        if (active) setCollection([]);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [enabled]);

  // Search the whole catalog once the query is long enough (debounced).
  useEffect(() => {
    if (!enabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = cardQuery.trim();
    if (query.length < CARD_MIN_CHARS) {
      setLibraryResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++reqSeq.current;
      try {
        const res = await fetch(`/api/tcg/search?q=${encodeURIComponent(query)}`);
        const body = await res.json().catch(() => ({}));
        if (seq !== reqSeq.current) return;
        setLibraryResults(res.ok ? ((body.cards as TcgCard[]) ?? []) : []);
      } finally {
        if (seq === reqSeq.current) setSearching(false);
      }
    }, CARD_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [cardQuery, enabled]);

  if (!enabled) return null;

  const isSearchingLibrary = cardQuery.trim().length >= CARD_MIN_CHARS;

  return (
    <div className="companion-place__mycards">
      <input
        type="search"
        className="companion-place__mycards-search"
        value={cardQuery}
        onChange={(e) => setCardQuery(e.target.value)}
        placeholder="Search all Pokémon cards…"
      />
      {isSearchingLibrary ? (
        searching ? (
          <CardGridSkeleton
            count={6}
            containerClassName="companion-place__mycards-grid"
          />
        ) : libraryResults.length > 0 ? (
          <div className="companion-place__mycards-grid">
            {libraryResults.slice(0, 12).map((card) => (
              <button
                key={card.id}
                type="button"
                className="companion-place__mycard"
                title={card.name}
                onClick={() => onPick(card)}
              >
                <CardImage images={card.images} name={card.name} size="small" />
              </button>
            ))}
          </div>
        ) : (
          <p className="companion-place__mycards-note">No cards found.</p>
        )
      ) : collection === null ? (
        <CardGridSkeleton
          count={6}
          containerClassName="companion-place__mycards-grid"
        />
      ) : collection.length > 0 ? (
        <>
          <span className="companion-place__mycards-sub">Your cards</span>
          <div className="companion-place__mycards-grid">
            {collection.slice(0, 12).map((uc) => (
              <button
                key={uc.id}
                type="button"
                className="companion-place__mycard"
                title={uc.card?.name ?? uc.card_id}
                onClick={() => uc.card && onPick(uc.card)}
              >
                <CardImage
                  images={uc.card?.images}
                  name={uc.card?.name ?? uc.card_id}
                  size="small"
                />
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="companion-place__mycards-note">
          Search above to find any card.
        </p>
      )}
    </div>
  );
}
