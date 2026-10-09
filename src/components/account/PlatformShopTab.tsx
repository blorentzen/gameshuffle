"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Checkbox, Drawer, EmptyState, IconButton, Input } from "@empac/cascadeds";
import { IconArrowDown, IconArrowUp, IconCards, IconPlus } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { SortableList, moveWithin } from "@/components/ui/SortableList";
import { AdminHeader, AdminRowMenu, AdminSection } from "@/components/account/admin/AdminKit";
import { CardImage } from "@/components/tcg/CardImage";
import { CardGridSkeleton } from "@/components/tcg/CardGridSkeleton";
import type { FeaturedShopCard } from "@/lib/shop/featuredCards";
import type { TcgCard } from "@/lib/scrydex/types";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { gsDay, gsDayStart } from "@/lib/time/gsClock";

/**
 * Platform admin ▸ Shop ▸ Featured cards (staff/admin): the single cards we
 * sell on TCGplayer, shown on the public TCG page, plus its "Recently sold"
 * strip.
 *   - Add a card (drawer): browse or search the catalog, pick one, add its
 *     TCGplayer link (or add it as a past sale with a date)
 *   - reorder (drag or arrows), mark sold / available, edit the sold date,
 *     show first, remove (confirmed)
 */

const DEBOUNCE_MS = 400;
/** Recently sold can run to dozens; the latest few are what staff adjust. */
const SOLD_SHOWN = 10;
const MIN_CHARS = 3;

/** ISO timestamp → its Pacific YYYY-MM-DD for a native date input. */
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return gsDay(new Date(iso));
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

function PickerGrid({
  cards,
  onPick,
}: {
  cards: TcgCard[];
  onPick: (c: TcgCard) => void;
}) {
  return (
    <div className="platform-shop__grid">
      {cards.map((c) => (
        <PickerCard key={c.id} card={c} onPick={onPick} />
      ))}
    </div>
  );
}

export function PlatformShopTab() {
  const [cards, setCards] = useState<FeaturedShopCard[]>([]);
  const [loading, setLoading] = useState(true);

  // Global toast for add / sold / available / remove feedback.
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [allSold, setAllSold] = useState(false);

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
    setAdding(false);
    toast.success(`Added ${name}`);
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
    const ok = await confirm({ title: `Remove ${name}?`, body: "It comes off the public TCG page. The TCGplayer listing isn't touched.", confirmLabel: "Remove" });
    if (!ok) return;
    const res = await fetch(`/api/admin/shop-cards/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(`Removed ${name}`);
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
      toast.success(`Marked ${rowName(row)} sold`);
    else toast.error("Couldn't update that card.");
  };
  const markAvailable = async (row: FeaturedShopCard) => {
    if (await patch(row.id, { isSold: false }))
      toast.success(`Marked ${rowName(row)} for sale`);
    else toast.error("Couldn't update that card.");
  };
  const toggleFeatured = async (row: FeaturedShopCard) => {
    const next = !row.is_featured;
    if (await patch(row.id, { isFeatured: next }))
      toast.success(next ? `${rowName(row)} shows first` : `${rowName(row)} no longer shows first`);
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

  // Drag and the arrow buttons both land here, so the order is saved one way.
  const reorder = (next: FeaturedShopCard[]) => {
    setCards([...next, ...cards.filter((c) => c.is_sold)]);
    persistOrder(next.map((c) => c.id));
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
  const rowLink = (row: FeaturedShopCard) => (
    <a href={row.product_url} target="_blank" rel="noopener noreferrer" className="platform-shop__url">
      View on TCGplayer<span className="sr-only"> (opens in a new tab)</span>
    </a>
  );

  return (
    <div className="account-card admin-screen platform-shop">
      <AdminHeader
        title="Featured cards"
        intro="Single cards we sell on TCGplayer, shown on the public TCG page. Mark one sold when it goes and it moves to the Recently sold strip."
        actions={<Button variant="primary" size="small" iconBefore={IconPlus} onClick={() => setAdding(true)}>Add a card</Button>}
      />

      <AdminSection
        title={`For sale${available.length ? ` (${available.length})` : ""}`}
        intro={available.length > 1 ? "Drag a card by its handle, or use the arrows. This is the order on the public page." : undefined}
      >
        {loading ? (
          <LoadingLines label="Loading" />
        ) : available.length === 0 ? (
          <EmptyState
            variant="bordered"
            icon={<IconCards size={28} />}
            title="No cards for sale on the page"
            description="Add a card with its TCGplayer link and it shows on the public TCG page."
            action={<Button variant="secondary" size="small" iconBefore={IconPlus} onClick={() => setAdding(true)}>Add a card</Button>}
          />
        ) : (
          <SortableList
            items={available}
            getId={(c) => c.id}
            onReorder={reorder}
            handleLabel={(c) => `Reorder ${rowName(c)}`}
            className="platform-shop__list"
          >
            {(row, handle, i) => (
              <div className="platform-shop__row">
                {handle}
                {rowCard(row)}
                <div className="platform-shop__row-info">
                  <div className="platform-shop__row-title">
                    <strong>{rowName(row)}</strong>
                    {row.is_featured && <Badge variant="info" size="small">Shows first</Badge>}
                  </div>
                  {rowLink(row)}
                </div>
                <div className="platform-shop__row-actions">
                  <Button variant="secondary" size="small" onClick={() => markSold(row)}>Mark sold</Button>
                  <IconButton variant="tertiary" size="small" aria-label={`Move ${rowName(row)} up`} disabled={i === 0} onClick={() => reorder(moveWithin(available, i, -1))}><IconArrowUp size={16} aria-hidden /></IconButton>
                  <IconButton variant="tertiary" size="small" aria-label={`Move ${rowName(row)} down`} disabled={i === available.length - 1} onClick={() => reorder(moveWithin(available, i, 1))}><IconArrowDown size={16} aria-hidden /></IconButton>
                  <AdminRowMenu
                    label={`More for ${rowName(row)}`}
                    items={[
                      { label: row.is_featured ? "Stop showing first" : "Show first in the carousel", onClick: () => void toggleFeatured(row) },
                      { type: "divider" },
                      { label: "Remove from the page", danger: true, onClick: () => void remove(row.id, rowName(row)) },
                    ]}
                  />
                </div>
              </div>
            )}
          </SortableList>
        )}
      </AdminSection>

      <AdminSection title={`Recently sold${sold.length ? ` (${sold.length})` : ""}`} intro={sold.length ? "Newest sale first. Change a date if it was entered wrong." : undefined}>
        {loading ? null : sold.length === 0 ? (
          <EmptyState variant="bordered" icon={<IconCards size={28} />} title="No sales yet" description="Mark a card sold, or add a past sale with Add a card." />
        ) : (
          <ul className="platform-shop__list">
            {(allSold ? sold : sold.slice(0, SOLD_SHOWN)).map((row) => (
              <li key={row.id} className="platform-shop__row is-sold">
                {rowCard(row)}
                <div className="platform-shop__row-info">
                  <div className="platform-shop__row-title">
                    <strong>{rowName(row)}</strong>
                    {row.is_featured && <Badge variant="info" size="small">Shows first</Badge>}
                  </div>
                  {rowLink(row)}
                </div>
                <div className="platform-shop__row-actions">
                  <div className="platform-shop__date">
                    <Input
                      type="date"
                      size="small"
                      fullWidth
                      floatingLabel="Sold on"
                      value={toDateInput(row.sold_at)}
                      onChange={(e) => patch(row.id, { soldAt: e.target.value ? gsDayStart(e.target.value).toISOString() : null })}
                    />
                  </div>
                  <Button variant="secondary" size="small" onClick={() => markAvailable(row)}>Mark for sale</Button>
                  <AdminRowMenu
                    label={`More for ${rowName(row)}`}
                    items={[
                      { label: row.is_featured ? "Stop showing first" : "Show first in Recently sold", onClick: () => void toggleFeatured(row) },
                      { type: "divider" },
                      { label: "Remove from the page", danger: true, onClick: () => void remove(row.id, rowName(row)) },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {sold.length > SOLD_SHOWN && (
          <div>
            <Button variant="ghost" size="small" onClick={() => setAllSold((v) => !v)}>{allSold ? "Show the latest 10" : `Show all ${sold.length}`}</Button>
          </div>
        )}
      </AdminSection>

      <Drawer
        open={adding}
        onClose={() => { setAdding(false); resetAddForm(); }}
        title="Add a card"
        subtitle={picked ? "Add its TCGplayer link." : "Pick the card from the catalog."}
        size="standard"
      >
        <div className="platform-shop__drawer">
          {picked ? (
            <form className="platform-shop__fields" onSubmit={(e) => { e.preventDefault(); void add(); }}>
              <div className="platform-shop__picked-card">
                <CardImage images={picked.images} name={picked.name} size="small" />
                <div>
                  <strong>{picked.name}</strong>
                  <div className="platform-shop__muted">{picked.rarity ?? ""}{picked.rarity ? " · " : ""}{picked.id}</div>
                  <Button type="button" variant="ghost" size="small" onClick={() => setPicked(null)}>Choose another card</Button>
                </div>
              </div>
              <Input fullWidth required type="url" floatingLabel="TCGplayer product link" value={productUrl} onChange={(e) => setProductUrl(e.target.value)} />
              <Input fullWidth floatingLabel="Name on the page (optional)" placeholder="Umbreon, Master Ball Pattern" value={label} onChange={(e) => setLabel(e.target.value)} />
              <Input fullWidth floatingLabel="Variant (optional)" value={variantName} onChange={(e) => setVariantName(e.target.value)} />
              <Checkbox label="Already sold (adding a past sale)" checked={addAsSold} onChange={(e) => setAddAsSold(e.target.checked)} />
              {addAsSold && <Input type="date" floatingLabel="Sold on" value={addSoldDate} onChange={(e) => setAddSoldDate(e.target.value)} />}
              <Button type="submit" variant="primary" disabled={!productUrl.trim()}>{addAsSold ? "Add to Recently sold" : "Add to the page"}</Button>
            </form>
          ) : (
            <>
              <Input type="search" fullWidth floatingLabel="Search cards by name" placeholder="Charizard, Umbreon" value={query} onChange={(e) => setQuery(e.target.value)} />
              {isSearching ? (
                searching ? <CardGridSkeleton count={4} />
                  : results.length > 0 ? <PickerGrid cards={results} onPick={setPicked} />
                  : <p className="platform-shop__muted">No cards found for &ldquo;{query.trim()}&rdquo;. Try another name.</p>
              ) : browseLoading ? (
                <CardGridSkeleton count={4} />
              ) : browse.length > 0 ? (
                <>
                  <p className="platform-shop__muted">Recently added to the catalog:</p>
                  <PickerGrid cards={browse} onPick={setPicked} />
                </>
              ) : (
                <p className="platform-shop__muted">Search for a card by name to get started.</p>
              )}
            </>
          )}
        </div>
      </Drawer>
    </div>
  );
}
