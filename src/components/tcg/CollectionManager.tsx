"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  ToastContainer,
  type ToastProps,
} from "@empac/cascadeds";
import { CardImage } from "./CardImage";
import { CardGridSkeleton } from "./CardGridSkeleton";
import { FeaturedShowcaseEditor } from "./FeaturedShowcaseEditor";
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
  const [collectionLoaded, setCollectionLoaded] = useState(false);

  // Transient toasts for add / remove / showcase feedback (replaces the old
  // inline status line). Auto-dismiss after 4s; monotonic counter id.
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const toastSeq = useRef(0);
  const pushToast = useCallback(
    (variant: ToastProps["variant"], message: string) => {
      const id = `mycards-toast-${toastSeq.current++}`;
      const dismiss = () =>
        setToasts((prev) => prev.filter((t) => t.id !== id));
      setToasts((prev) => [...prev, { id, variant, message, onClose: dismiss }]);
      window.setTimeout(dismiss, 4000);
    },
    [],
  );

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
        pushToast(
          "error",
          body.code === TCG_ERROR.RATE_LIMITED
            ? "Slow down a moment — too many searches."
            : "Search is unavailable right now.",
        );
        setResults([]);
        return;
      }
      setResults((body.cards as TcgCard[]) ?? []);
    } finally {
      if (seq === reqSeq.current) setSearching(false);
    }
  }, [pushToast]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      setResults([]);
      setSearching(false);
      return;
    }
    // Show the loading skeleton immediately (through the debounce window too),
    // so a long query never briefly flashes the "no cards found" empty state.
    setSearching(true);
    debounceRef.current = setTimeout(() => runSearch(q), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  // ── Collection ────────────────────────────────────────────────────────
  const loadCollection = useCallback(async () => {
    if (!isPro) {
      setCollectionLoaded(true);
      return;
    }
    const res = await fetch("/api/tcg/collection");
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      setCollection((body.cards as UserCard[]) ?? []);
    }
    setCollectionLoaded(true);
  }, [isPro]);

  useEffect(() => {
    loadCollection();
  }, [loadCollection]);

  const addCard = async (card: TcgCard) => {
    const res = await fetch("/api/tcg/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id }),
    });
    if (res.status === 403) {
      pushToast("error", "Adding cards to your collection is a GS Pro feature.");
      return;
    }
    if (!res.ok) {
      pushToast("error", "Couldn't add that card. Try again.");
      return;
    }
    pushToast("success", `Added ${card.name}.`);
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
    const name = row.card?.name ?? row.card_id;
    const res = await fetch(`/api/tcg/collection/${row.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      pushToast("success", `Removed ${name}.`);
      loadCollection();
    } else {
      pushToast("error", "Couldn't remove that card.");
    }
  };

  const toggleShowcase = async (row: UserCard) => {
    const on = !row.showcased_at;
    const name = row.card?.name ?? row.card_id;
    const res = await fetch(`/api/tcg/collection/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showcase: on }),
    });
    if (res.ok) {
      if (on) pushToast("success", `${name} added to favorites.`);
      loadCollection();
    } else {
      pushToast("error", "Couldn't update your favorites.");
    }
  };

  // Persist a new favorite order (drag/drop). Optimistically reassign ranks so
  // the grid reorders instantly, then save; revert by reloading on failure.
  const handleReorder = async (orderedIds: string[]) => {
    setCollection((prev) =>
      prev.map((c) => {
        const idx = orderedIds.indexOf(c.id);
        return idx === -1 ? c : { ...c, showcase_rank: idx };
      }),
    );
    const res = await fetch("/api/tcg/collection/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: orderedIds }),
    });
    if (!res.ok) {
      pushToast("error", "Couldn't save the new order.");
      loadCollection();
    }
  };

  // Profile spotlight capacity — how many featured slots are used / left.
  const isSearching = query.trim().length >= MIN_CHARS;
  // Favorites in the user's chosen order (showcase_rank) — surfaced up top,
  // drag-to-reorder; the top MAX_SHOWCASE render on the public profile.
  const favorites = collection
    .filter((c) => c.showcased_at)
    .sort((a, b) => (a.showcase_rank ?? 0) - (b.showcase_rank ?? 0));
  // The rest of the collection — favorites live only in the Favorites section
  // above, never duplicated here.
  const unfavorited = collection.filter((c) => !c.showcased_at);

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
      </section>

      {/* Favorites — drag to reorder; the top MAX_SHOWCASE render on the
          public profile (marked by the cutoff line). Hidden while searching. */}
      {!isSearching && favorites.length > 0 && (
        <section className="tcg-collection__section">
          <h3 className="tcg-collection__heading">
            Favorites ({favorites.length})
          </h3>
          <p className="tcg-collection__featured-note">
            Drag to reorder. Your top {MAX_SHOWCASE} appear on your public
            profile; the rest stay private. Tap the ★ to remove a favorite.
          </p>
          <FeaturedShowcaseEditor
            cards={favorites}
            onReorder={handleReorder}
            onRemove={toggleShowcase}
          />
        </section>
      )}

      {/* Results */}
      {query.trim().length >= MIN_CHARS && searching ? (
        <section className="tcg-collection__section">
          <h3 className="tcg-collection__heading">Results</h3>
          <CardGridSkeleton count={6} />
        </section>
      ) : results.length > 0 ? (
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
          Your collection{unfavorited.length ? ` (${unfavorited.length})` : ""}
        </h3>
        {isPro && unfavorited.length > 0 ? (
          <p className="tcg-collection__spotlight">
            <span className="tcg-collection__spotlight-star" aria-hidden="true">
              ★
            </span>
            Tap the star on any card to add it to your favorites.
          </p>
        ) : null}
        {!collectionLoaded ? (
          <CardGridSkeleton count={6} />
        ) : !isPro ? (
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
        ) : unfavorited.length === 0 ? (
          <EmptyState
            title={collection.length === 0 ? "No cards yet" : "All favorited"}
            description={
              collection.length === 0
                ? "Search above and add the cards you own."
                : "Every card you own is in Favorites above."
            }
          />
        ) : (
          <div className="tcg-card-grid">
            {unfavorited.map((row) => (
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

      <ToastContainer toasts={toasts} />
    </div>
  );
}
