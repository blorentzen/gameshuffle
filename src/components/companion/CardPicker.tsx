"use client";

/**
 * Card picker for the Companion: your cards first, the whole catalog once
 * you type 3 letters. Tiles show each card's art window with its name, HP and
 * prizes, so a card is recognisable at a glance. Calls `onPick(card)`; the
 * parent decides what happens (place a new piece, evolve one). Renders
 * nothing for guests or modes without a catalog (they add by name).
 */

import { useEffect, useRef, useState } from "react";
import { Input } from "@empac/cascadeds";
import { IconSearch } from "@tabler/icons-react";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import { prizeValue } from "@/lib/companion/pokemonRules";
import type { TcgCard, UserCard } from "@/lib/scrydex/types";
import type { PlayerId } from "@/lib/companion/types";
import { CardArt } from "./glyphs";
import { TablerIcon } from "./TablerIcon";

const CARD_DEBOUNCE_MS = 400;
const CARD_MIN_CHARS = 3;
const SHOWN = 12;

export function CardPicker({ onPick, selectedId, label = "Your cards", player }: { onPick: (card: TcgCard) => void; selectedId?: string | null; label?: string; player?: PlayerId }) {
  const { isAuthenticated, decks } = useSession();
  const deck = player ? decks[player] : undefined;
  const mode = useMode();
  const enabled = isAuthenticated && mode.slotThemes.length > 0;

  const [collection, setCollection] = useState<UserCard[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TcgCard[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);

  // Your collection, loaded once (the default list).
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/tcg/collection");
        const next = res.ok ? (((await res.json())?.cards as UserCard[]) ?? []) : [];
        if (active) setCollection(next);
      } catch {
        if (active) setCollection([]);
      }
    })();
    return () => { active = false; };
  }, [enabled]);

  // The whole catalog once the query is long enough (debounced).
  useEffect(() => {
    if (!enabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < CARD_MIN_CHARS) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++reqSeq.current;
      try {
        const res = await fetch(`/api/tcg/search?q=${encodeURIComponent(q)}`);
        const body = await res.json().catch(() => ({}));
        if (seq !== reqSeq.current) return;
        setResults(res.ok ? ((body.cards as TcgCard[]) ?? []) : []);
      } finally {
        if (seq === reqSeq.current) setSearching(false);
      }
    }, CARD_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, enabled]);

  if (!enabled) return null;

  const searchingCatalog = query.trim().length >= CARD_MIN_CHARS;
  const pokemonOnly = (c: TcgCard | null | undefined): c is TcgCard => !!c && c.supertype !== "Trainer" && c.supertype !== "Energy";
  // The player's deck list (if they picked one) leads, then their cards without repeats.
  const fromDeck = searchingCatalog ? [] : (deck?.cards ?? []).filter(pokemonOnly);
  const deckIds = new Set(fromDeck.map((c) => c.id));
  const mine = (collection ?? []).map((uc) => uc.card).filter(pokemonOnly).filter((c, i, all) => !deckIds.has(c.id) && all.findIndex((x) => x.id === c.id) === i);
  const cards = searchingCatalog ? results : mine;
  const loading = searchingCatalog ? searching : collection === null;

  const tile = (card: TcgCard) => {
    const img = card.images?.medium ?? card.images?.small ?? null;
    const prizes = prizeValue(card.subtypes ?? []);
    const on = selectedId === card.id;
    return (
      <button
        key={card.id}
        type="button"
        className={`companion-cards__tile${on ? " is-on" : ""}`}
        aria-pressed={selectedId !== undefined ? on : undefined}
        onClick={() => onPick(card)}
      >
        {img ? <CardArt src={img} className="companion-cards__art" /> : <span className="companion-cards__art companion-cards__art--none" aria-hidden="true" />}
        <span className="companion-cards__name">{card.name}</span>
        <span className="companion-cards__facts">
          {card.hp && <span><TablerIcon name="heart" size="12" color="#ff8fa3" />{card.hp}</span>}
          {prizes > 1 && <span><TablerIcon name="cards" size="12" color="#f5c518" />{prizes}</span>}
          {card.expansion_name && <span className="companion-cards__set">{card.expansion_name}</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="companion-cards">
      <Input
        type="search"
        iconBefore={IconSearch}
        fullWidth
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find any card"
        aria-label="Find any card"
      />
      {fromDeck.length > 0 && (
        <>
          <span className="companion-cards__label">From {deck!.name}</span>
          <div className="companion-cards__grid">{fromDeck.slice(0, SHOWN).map(tile)}</div>
        </>
      )}
      <span className="companion-cards__label">{searchingCatalog ? "Cards" : label}</span>
      {loading ? (
        <div className="companion-cards__grid" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <span key={i} className="companion-cards__tile companion-cards__tile--loading" />)}
        </div>
      ) : cards.length > 0 ? (
        <div className="companion-cards__grid">{cards.slice(0, SHOWN).map(tile)}</div>
      ) : (
        <p className="companion-cards__note">{searchingCatalog ? "No cards found." : "Cards you add to My Cards show up here. Search above for any card."}</p>
      )}
    </div>
  );
}
