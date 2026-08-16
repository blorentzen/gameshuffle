"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Carousel,
  CarouselItem,
  Input,
} from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CardImage } from "@/components/tcg/CardImage";
import { CardGridSkeleton } from "@/components/tcg/CardGridSkeleton";
import type { FeaturedShopCard } from "@/lib/shop/featuredCards";
import type { TcgCard } from "@/lib/scrydex/types";

/**
 * Platform Shop admin tab (staff/admin). Manage the storefront's featured
 * high-value cards + the "Recently Sold" surface:
 *   - browse/search the catalog (visual picker) → pick a card
 *   - add its TCGplayer link (optionally as an already-sold backfill w/ date)
 *   - reorder, mark sold (with an editable sold date), remove
 */

const DEBOUNCE_MS = 400;
const MIN_CHARS = 3;

/** ISO timestamp → YYYY-MM-DD for a native date input. */
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function PickerCard({
  card,
  onPick,
}: {
  card: TcgCard;
  onPick: (c: TcgCard) => void;
}) {
  return (
    <button
      type="button"
      className="platform-shop__pick"
      onClick={() => onPick(card)}
    >
      <CardImage images={card.images} name={card.name} size="medium" />
      <span className="platform-shop__pick-name">{card.name}</span>
      <span className="platform-shop__muted">
        {card.rarity ?? ""}
        {card.rarity && card.expansion_id ? " · " : ""}
        {card.expansion_id ?? ""}
      </span>
    </button>
  );
}

function PickerCarousel({
  cards,
  onPick,
}: {
  cards: TcgCard[];
  onPick: (c: TcgCard) => void;
}) {
  return (
    <div className="platform-shop__picker">
      <Carousel
        slidesToShow={{ mobile: 2, tablet: 3, desktop: 4 }}
        gap={16}
        showArrows
        arrowPosition="bottom"
      >
        {cards.map((c) => (
          <CarouselItem key={c.id}>
            <PickerCard card={c} onPick={onPick} />
          </CarouselItem>
        ))}
      </Carousel>
    </div>
  );
}

/** A draggable Featured (available) row. Only the grip handle initiates a drag,
 *  so the row's link + action buttons stay clickable. */
function SortableAvailableRow({
  row,
  onSold,
  onRemove,
  onToggleFeatured,
}: {
  row: FeaturedShopCard;
  onSold: (row: FeaturedShopCard) => void;
  onRemove: (id: string, name: string) => void;
  onToggleFeatured: (row: FeaturedShopCard) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 1 : undefined,
  };
  const name = row.label ?? row.card?.name ?? row.card_id;

  return (
    <li ref={setNodeRef} style={style} className="platform-shop__row">
      <button
        type="button"
        className="platform-shop__drag"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <div className="platform-shop__row-card">
        <CardImage images={row.card?.images} name={name} size="small" />
      </div>
      <div className="platform-shop__row-info">
        <strong>{name}</strong>
        <a
          href={row.product_url}
          target="_blank"
          rel="noopener noreferrer"
          className="platform-shop__muted platform-shop__url"
        >
          {row.product_url}
        </a>
      </div>
      <div className="platform-shop__row-actions">
        <label
          className="platform-shop__feature"
          title="Show this card first in the storefront carousel"
        >
          <input type="checkbox" checked={row.is_featured} onChange={() => onToggleFeatured(row)} />
          ⭐ Featured
        </label>
        <Button variant="secondary" size="small" onClick={() => onSold(row)}>
          Mark sold
        </Button>
        <button
          type="button"
          className="platform-shop__link-btn platform-shop__remove"
          onClick={() => onRemove(row.id, name)}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

export function PlatformShopTab() {
  const [cards, setCards] = useState<FeaturedShopCard[]>([]);
  const [loading, setLoading] = useState(true);

  // Global toast for add / sold / available / remove feedback.
  const toast = useToast();

  // Add flow
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TcgCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [browse, setBrowse] = useState<TcgCard[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [picked, setPicked] = useState<TcgCard | null>(null);
  const [productUrl, setProductUrl] = useState("");
  const [label, setLabel] = useState("");
  const [variantName, setVariantName] = useState("");
  const [addAsSold, setAddAsSold] = useState(false);
  const [addSoldDate, setAddSoldDate] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/shop-cards");
    if (res.ok) {
      const body = await res.json();
      setCards((body.cards as FeaturedShopCard[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const [listRes, browseRes] = await Promise.all([
        fetch("/api/admin/shop-cards"),
        fetch("/api/tcg/catalog/browse"),
      ]);
      if (!active) return;
      if (listRes.ok) {
        const b = await listRes.json();
        setCards((b.cards as FeaturedShopCard[]) ?? []);
      }
      setLoading(false);
      if (browseRes.ok) {
        const b = await browseRes.json();
        setBrowse((b.cards as TcgCard[]) ?? []);
      }
      setBrowseLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const runSearch = useCallback(async (q: string) => {
    const seq = ++reqSeq.current;
    setSearching(true);
    try {
      const res = await fetch(`/api/tcg/search?q=${encodeURIComponent(q)}`);
      const body = await res.json().catch(() => ({}));
      if (seq !== reqSeq.current) return;
      setResults(res.ok ? ((body.cards as TcgCard[]) ?? []) : []);
    } finally {
      if (seq === reqSeq.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < MIN_CHARS) return;
    debounceRef.current = setTimeout(() => runSearch(q), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const resetAddForm = () => {
    setPicked(null);
    setQuery("");
    setResults([]);
    setProductUrl("");
    setLabel("");
    setVariantName("");
    setAddAsSold(false);
    setAddSoldDate("");
  };

  const add = async () => {
    if (!picked || !productUrl.trim()) return;
    const name = picked.name;
    const res = await fetch("/api/admin/shop-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: picked.id,
        productUrl: productUrl.trim(),
        label: label.trim() || null,
        variantName: variantName.trim() || null,
        isSold: addAsSold,
        soldAt:
          addAsSold && addSoldDate
            ? new Date(addSoldDate).toISOString()
            : null,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(
        body.error === "invalid_product_url"
          ? "Product URL must be a tcgplayer.com link."
          : "Couldn't add that card.",
      );
      return;
    }
    resetAddForm();
    toast.success(`Added ${name}.`);
    load();
  };

  const patch = async (
    id: string,
    body: Record<string, unknown>,
  ): Promise<boolean> => {
    const res = await fetch(`/api/admin/shop-cards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      load();
      return true;
    }
    return false;
  };

  const remove = async (id: string, name: string) => {
    const res = await fetch(`/api/admin/shop-cards/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(`Removed ${name}.`);
      load();
    } else {
      toast.error("Couldn't remove that card.");
    }
  };

  const rowName = (row: FeaturedShopCard) =>
    row.label ?? row.card?.name ?? row.card_id;

  // Toast wrappers for the sold/available transitions (reorder + inline date
  // edits stay silent — they give their own visual feedback).
  const markSold = async (row: FeaturedShopCard) => {
    if (await patch(row.id, { isSold: true }))
      toast.success(`Marked ${rowName(row)} sold.`);
    else toast.error("Couldn't update that card.");
  };
  const markAvailable = async (row: FeaturedShopCard) => {
    if (await patch(row.id, { isSold: false }))
      toast.success(`Marked ${rowName(row)} available.`);
    else toast.error("Couldn't update that card.");
  };
  const toggleFeatured = async (row: FeaturedShopCard) => {
    const next = !row.is_featured;
    if (await patch(row.id, { isFeatured: next }))
      toast.success(next ? `Featured ${rowName(row)}.` : `Unfeatured ${rowName(row)}.`);
    else toast.error("Couldn't update that card.");
  };

  const available = cards.filter((c) => !c.is_sold);
  const sold = cards
    .filter((c) => c.is_sold)
    .sort((a, b) => {
      const ta = a.sold_at ? Date.parse(a.sold_at) : 0;
      const tb = b.sold_at ? Date.parse(b.sold_at) : 0;
      return tb - ta;
    });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const persistOrder = async (ids: string[]) => {
    const res = await fetch("/api/admin/shop-cards/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      toast.error("Couldn't save the new order.");
      load(); // revert to server truth
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = available.findIndex((c) => c.id === active.id);
    const newIndex = available.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(available, oldIndex, newIndex);
    // Optimistic: available in new order, sold rows untouched.
    setCards([...reordered, ...cards.filter((c) => c.is_sold)]);
    persistOrder(reordered.map((c) => c.id));
  };

  const isSearching = query.trim().length >= MIN_CHARS;

  const rowCard = (row: FeaturedShopCard) => (
    <div className="platform-shop__row-card">
      <CardImage
        images={row.card?.images}
        name={row.label ?? row.card?.name ?? row.card_id}
        size="small"
      />
    </div>
  );

  return (
    <div className="platform-shop">
      <h2 className="account-tab__heading">Featured Shop Cards</h2>
      <p className="platform-shop__intro">
        The high-value cards showcased on the public GameShuffle TCG page. Browse
        or search the catalog to pull a card&rsquo;s art, add its TCGplayer link,
        and mark cards sold (with a date) as they go. Sold cards move to the
        public &ldquo;Recently Sold&rdquo; strip.
      </p>

      {/* Add flow */}
      <section className="platform-shop__add">
        <h3 className="platform-shop__heading">Add a card</h3>
        {picked ? (
          <div className="platform-shop__picked">
            <div className="platform-shop__picked-card">
              <CardImage images={picked.images} name={picked.name} size="small" />
              <div>
                <strong>{picked.name}</strong>
                <div className="platform-shop__muted">
                  {picked.rarity ?? ""} · {picked.id}
                </div>
                <button
                  type="button"
                  className="platform-shop__link-btn"
                  onClick={() => setPicked(null)}
                >
                  Change card
                </button>
              </div>
            </div>
            <div className="platform-shop__fields">
              <Input
                fullWidth
                placeholder="TCGplayer product URL (required)"
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
              />
              <Input
                fullWidth
                placeholder="Display label (optional, e.g. Umbreon: Master Ball Pattern)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <Input
                fullWidth
                placeholder="Variant name (optional)"
                value={variantName}
                onChange={(e) => setVariantName(e.target.value)}
              />
              <label className="platform-shop__checkbox">
                <input
                  type="checkbox"
                  checked={addAsSold}
                  onChange={(e) => setAddAsSold(e.target.checked)}
                />
                Add as already sold (backfill a past sale)
              </label>
              {addAsSold ? (
                <label className="platform-shop__date-field">
                  Sold date
                  <Input
                    type="date"
                    value={addSoldDate}
                    onChange={(e) => setAddSoldDate(e.target.value)}
                  />
                </label>
              ) : null}
              <Button
                variant="primary"
                onClick={add}
                disabled={!productUrl.trim()}
              >
                {addAsSold ? "Add to recently sold" : "Add to featured"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Input
              type="search"
              fullWidth
              placeholder="Search cards by name (e.g. Charizard, Umbreon)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {isSearching ? (
              searching ? (
                <CardGridSkeleton count={4} />
              ) : results.length > 0 ? (
                <PickerCarousel cards={results} onPick={setPicked} />
              ) : (
                <p className="platform-shop__muted platform-shop__picker-note">
                  No cards found for &ldquo;{query.trim()}&rdquo;. Try a
                  different name.
                </p>
              )
            ) : browseLoading ? (
              <CardGridSkeleton count={4} />
            ) : browse.length > 0 ? (
              <>
                <p className="platform-shop__muted platform-shop__picker-note">
                  Recent cards in the catalog. Or search above for a specific
                  card.
                </p>
                <PickerCarousel cards={browse} onPick={setPicked} />
              </>
            ) : (
              <p className="platform-shop__muted platform-shop__picker-note">
                Search for a card by name to get started.
              </p>
            )}
          </>
        )}
      </section>

      {/* Available (featured) */}
      <section className="platform-shop__list-section">
        <h3 className="platform-shop__heading">
          Featured (available){available.length ? ` (${available.length})` : ""}
        </h3>
        {loading ? (
          <p className="platform-shop__muted">Loading…</p>
        ) : available.length === 0 ? (
          <p className="platform-shop__muted">No available featured cards yet.</p>
        ) : (
          <>
            <p className="platform-shop__muted platform-shop__reorder-hint">
              Drag the <span aria-hidden="true">⠿</span> handle to reorder. The
              order here is the order shown on the public page.
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={available.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="platform-shop__list">
                  {available.map((row) => (
                    <SortableAvailableRow
                      key={row.id}
                      row={row}
                      onSold={markSold}
                      onRemove={remove}
                      onToggleFeatured={toggleFeatured}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </>
        )}
      </section>

      {/* Recently sold */}
      <section className="platform-shop__list-section">
        <h3 className="platform-shop__heading">
          Recently sold{sold.length ? ` (${sold.length})` : ""}
        </h3>
        {!loading && sold.length === 0 ? (
          <p className="platform-shop__muted">
            No sold cards yet. Mark a featured card sold, or add a past sale
            above.
          </p>
        ) : (
          <ul className="platform-shop__list">
            {sold.map((row) => (
              <li key={row.id} className="platform-shop__row is-sold">
                {rowCard(row)}
                <div className="platform-shop__row-info">
                  <div className="platform-shop__row-title">
                    <strong>{row.label ?? row.card?.name ?? row.card_id}</strong>
                    <Badge variant="error" size="small">
                      Sold
                    </Badge>
                  </div>
                  <a
                    href={row.product_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="platform-shop__muted platform-shop__url"
                  >
                    {row.product_url}
                  </a>
                </div>
                <div className="platform-shop__row-actions">
                  <Input
                    type="date"
                    size="small"
                    aria-label="Sold date"
                    title="Sold date"
                    className="platform-shop__date-input"
                    value={toDateInput(row.sold_at)}
                    onChange={(e) =>
                      patch(row.id, {
                        soldAt: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      })
                    }
                  />
                  <label
                    className="platform-shop__feature"
                    title="Show this sale first in Recently Sold"
                  >
                    <input type="checkbox" checked={row.is_featured} onChange={() => toggleFeatured(row)} />
                    ⭐ Featured
                  </label>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => markAvailable(row)}
                  >
                    Mark available
                  </Button>
                  <button
                    type="button"
                    className="platform-shop__link-btn platform-shop__remove"
                    onClick={() => remove(row.id, rowName(row))}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
