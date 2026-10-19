"use client";

/**
 * The Daily Dex's card of the day (Britton's picks, 2026-10-16,
 * https://claude.ai/artifact/2Unkdkq8byWUot4Z7yPc7K): once the game is over,
 * a real Pokémon TCG card of today's answer, the same showcase pick used
 * across GameShuffle (best English Special Illustration / Illustration Rare,
 * else another English printing). The whole card, with Add to My Cards and a
 * link to our TCGplayer store. A day whose Pokémon has no card yet shows
 * nothing. Website only for now: Discord's Activity can't load Scrydex's
 * images until a URL mapping is added there.
 */

import { useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";
import { CardImage } from "@/components/tcg/CardImage";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";
import { OriginalsLink } from "@/components/originals/OriginalsHost";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, tagged, track } from "@/lib/analytics/events";
import { TCG_SHOP_URL } from "@/data/shop";
import type { TcgCardImages } from "@/lib/scrydex/types";

interface ShowcaseCard { id: string; name: string; set: string | null; number: string | null; rarity: string | null; images: TcgCardImages | null }

/**
 * `credits={false}`: the page shows the card credits at its foot instead (the
 * Daily Dex, so they replace its fan-made line rather than sit in the card).
 * `onCard` says whether today has a card, so the page knows which line to show.
 */
export function DexCardOfDay({ dex, signedIn, credits = true, onCard }: { dex: number; signedIn: boolean; credits?: boolean; onCard?: (has: boolean) => void }) {
  const toast = useToast();
  const [card, setCard] = useState<ShowcaseCard | null>(null);
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/tcg/showcase?dex=${dex}`).then((r) => (r.ok ? r.json() : null)).then((d: { card?: ShowcaseCard | null } | null) => {
      if (!alive) return;
      if (d?.card) setCard(d.card);
      onCard?.(!!d?.card);
    }).catch(() => { /* no card today */ });
    return () => { alive = false; };
  }, [dex, onCard]);

  if (!card) return null;

  const add = async () => {
    setBusy(true);
    const res = await fetch("/api/tcg/collection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: card.id }) }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { ok?: boolean; code?: string; limit?: number } | null;
    setBusy(false);
    if (d?.ok) {
      setAdded(true);
      track(EVENTS.cardCollected, { from: "daily-dex" });
      toast.success("Added to My Cards");
    } else if (d?.code === "collection_full") {
      toast.error(`My Cards holds ${d.limit ?? 250} different cards on a free account. GS Pro has no limit.`);
    } else {
      toast.error("Couldn't add the card. Try again.");
    }
  };

  const meta = [card.set, card.number, card.rarity].filter(Boolean).join(" · ");
  return (
    <section className="dex-cotd" aria-labelledby="dex-cotd-title">
      <div className="dex-cotd__card"><CardImage images={card.images} name={card.name} size="medium" /></div>
      <div className="dex-cotd__body">
        <span className="dex-cotd__kicker">Card of the day</span>
        <h2 id="dex-cotd-title" className="dex-cotd__name">{card.name}</h2>
        {meta && <p className="dex-cotd__meta">{meta}</p>}
        <span className="party-row">
          {signedIn
            ? <Button variant="primary" size="small" disabled={busy || added} onClick={() => void add()}>{added ? "In My Cards" : "Add to My Cards"}</Button>
            : <OriginalsLink href="/login?redirect=/daily-dex"><Button variant="primary" size="small">Add to My Cards</Button></OriginalsLink>}
          <a href={TCG_SHOP_URL} target="_blank" rel="noopener noreferrer" className={tagged(EVENTS.tcgStoreClicked, { from: "daily-dex" })}>
            <Button variant="secondary" size="small">Shop our Pokémon cards</Button>
          </a>
        </span>
        {credits && <TcgAttribution className="dex-cotd__attr" />}
      </div>
    </section>
  );
}
