"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, EmptyState, Input } from "@empac/cascadeds";
import { CardImage } from "./CardImage";
import {
  MAX_SHOWCASE,
  TCG_ERROR,
  type TcgCard,
  type UserCard,
} from "@/lib/scrydex/types";

/**
 * "My Cards" collection surface: search the Scrydex-backed catalog and attach
 * cards you own to your account. Both require a signed-in account but are free
 * (the `companion.collection` capability is currently granted to all tiers).
 * `isPro` reflects that capability and is presentation only — the server
 * enforces it on every /collection route. If collecting is ever re-gated to
 * Pro, `isPro` goes false for free users and they see the upgrade prompt
 * instead of Add; that path stays wired.
 *
 * Cost discipline baked in: search is debounced 400ms and never fires below
 * 3 characters, so "charizard" is at most one API call.
 */

const DEBOUNCE_MS = 400;
const MIN_CHARS = 3;

export function CollectionManager({ isPro }: { isPro: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TcgCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [collection, setCollection] = useState<UserCard[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);

  // ── Search (debounced, ≥3 chars) ──────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    const seq = ++reqSeq.current;
    setSearching(true);
    try {
      const res = await fetch(`/api/tcg/search?q=${encodeURIComponent(q)}`);
      const body = await res.json().catch(() => ({}));
      if (seq !== reqSeq.current) return; // stale response, ignore
      if (!res.ok) {
        setStatus(
          body.code === TCG_ERROR.RATE_LIMITED
            ? "Slow down a moment — too many searches."
            : "Search is unavailable right now.",
        );
        setResults([]);
        return;
      }
      setResults((body.cards as TcgCard[]) ?? []);
      setStatus(null);
    } finally {
      if (seq === reqSeq.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      setResults([]);
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(q), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  // ── Collection ────────────────────────────────────────────────────────
  const loadCollection = useCallback(async () => {
    if (!isPro) return;
    const res = await fetch("/api/tcg/collection");
    if (!res.ok) return;
    const body = await res.json().catch(() => ({}));
    setCollection((body.cards as UserCard[]) ?? []);
  }, [isPro]);

  useEffect(() => {
    loadCollection();
  }, [loadCollection]);

  const addCard = async (card: TcgCard) => {
    setStatus(null);
    const res = await fetch("/api/tcg/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id }),
    });
    if (res.status === 403) {
      setStatus("Adding cards to your collection is a GS Pro feature.");
      return;
    }
    if (!res.ok) {
      setStatus("Couldn't add that card. Try again.");
      return;
    }
    setStatus(`Added ${card.name}.`);
    loadCollection();
  };

  const setQuantity = async (row: UserCard, quantity: number) => {
    const res = await fetch(`/api/tcg/collection/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    if (res.ok) loadCollection();
  };

  const removeCard = async (row: UserCard) => {
    const res = await fetch(`/api/tcg/collection/${row.id}`, {
      method: "DELETE",
    });
    if (res.ok) loadCollection();
  };

  const toggleShowcase = async (row: UserCard) => {
    const on = !row.showcased_at;
    const res = await fetch(`/api/tcg/collection/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showcase: on }),
    });
    if (res.ok) {
      setStatus(on ? "Featured on your profile." : null);
      loadCollection();
      return;
    }
    const body = await res.json().catch(() => ({}));
    setStatus(
      body.reason === "showcase_full"
        ? `You can feature up to ${MAX_SHOWCASE} cards on your profile. Unstar one first.`
        : "Couldn't update your showcase.",
    );
  };

  // Profile spotlight capacity — how many featured slots are used / left.
  const featuredCount = collection.filter((c) => c.showcased_at).length;
  const spotsLeft = MAX_SHOWCASE - featuredCount;

  return (
    <div className="tcg-collection">
      {/* Search */}
      <section className="tcg-collection__search">
        <Input
          type="search"
          fullWidth
          placeholder="Search Pokémon cards by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search cards"
        />
        {query.trim().length > 0 && query.trim().length < MIN_CHARS ? (
          <p className="tcg-collection__hint">Keep typing…</p>
        ) : null}
        {status ? <p className="tcg-collection__status">{status}</p> : null}
      </section>

      {/* Results */}
      {results.length > 0 ? (
        <section className="tcg-collection__section">
          <h3 className="tcg-collection__heading">Results</h3>
          <div className="tcg-card-grid">
            {results.map((card) => (
              <div key={card.id} className="tcg-card-cell">
                <CardImage images={card.images} name={card.name} size="medium" />
                <div className="tcg-card-cell__name">{card.name}</div>
                {card.rarity ? (
                  <Badge variant="default" size="small">
                    {card.rarity}
                  </Badge>
                ) : null}
                {isPro ? (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => addCard(card)}
                  >
                    Add
                  </Button>
                ) : (
                  <a href="/gs-pro" className="tcg-card-cell__pro">
                    Pro to collect
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : query.trim().length >= MIN_CHARS && !searching ? (
        <EmptyState
          title="No cards found"
          description="Try a different name or check the spelling."
        />
      ) : null}

      {/* Collection */}
      <section className="tcg-collection__section">
        <h3 className="tcg-collection__heading">
          Your collection{collection.length ? ` (${collection.length})` : ""}
        </h3>
        {isPro && collection.length > 0 ? (
          <p
            className={`tcg-collection__spotlight${spotsLeft === 0 ? " is-full" : ""}`}
          >
            <span className="tcg-collection__spotlight-star" aria-hidden="true">
              ★
            </span>
            {`${featuredCount} of ${MAX_SHOWCASE} profile spotlight ${featuredCount === 1 ? "card" : "cards"}`}
            {spotsLeft > 0
              ? ` — ${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left`
              : " — all spots full"}
          </p>
        ) : null}
        {!isPro ? (
          <EmptyState
            variant="bordered"
            title="Collections are a GS Pro feature"
            description="Browse cards free. Upgrade to attach the cards you own to your account and build decks from them."
            action={
              <a href="/gs-pro">
                <Button variant="primary">See GS Pro</Button>
              </a>
            }
          />
        ) : collection.length === 0 ? (
          <EmptyState
            title="No cards yet"
            description="Search above and add the cards you own."
          />
        ) : (
          <div className="tcg-card-grid">
            {collection.map((row) => (
              <div key={row.id} className="tcg-card-cell">
                <button
                  type="button"
                  className={`tcg-card-cell__star${row.showcased_at ? " is-on" : ""}`}
                  onClick={() => toggleShowcase(row)}
                  aria-pressed={!!row.showcased_at}
                  title={
                    row.showcased_at
                      ? "Featured on your public profile — click to remove"
                      : "Feature this card on your public profile"
                  }
                >
                  {row.showcased_at ? "★" : "☆"}
                </button>
                <CardImage
                  images={row.card?.images}
                  name={row.card?.name ?? row.card_id}
                  size="medium"
                />
                <div className="tcg-card-cell__name">
                  {row.card?.name ?? row.card_id}
                </div>
                <div className="tcg-card-cell__qty">
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setQuantity(row, row.quantity - 1)}
                    aria-label="Decrease quantity"
                  >
                    −
                  </Button>
                  <span className="tcg-card-cell__qty-value">
                    {row.quantity}
                  </span>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setQuantity(row, row.quantity + 1)}
                    aria-label="Increase quantity"
                  >
                    +
                  </Button>
                </div>
                <button
                  type="button"
                  className="tcg-card-cell__remove"
                  onClick={() => removeCard(row)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
