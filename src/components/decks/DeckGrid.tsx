"use client";

/**
 * Filterable deck grid for the hub. Client component (the tier filter is
 * stateful). Cards are plain data passed from the server route so no
 * content loading happens here. Multi-tier: a deck can carry several tier
 * badges and shows under EVERY tier it belongs to ("contains" filter).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@empac/cascadeds";
import {
  DECK_TIERS,
  DECK_TIER_LABEL,
  orderedTierBadges,
  type DeckTier,
} from "@/lib/decks/types";
import { DeckCardFan } from "@/components/tcg/DeckCardFan";
import type { TcgCard } from "@/lib/scrydex/types";

export interface DeckCardData {
  slug: string;
  archetype: string;
  tiers: DeckTier[];
  deck_type: string;
  win_rate: string | null;
  win_rate_source: string | null;
  cost_estimate: string;
  difficulty: string;
  meta_description: string;
  /** Top marquee cards for the fanned imagery (empty if none populated). */
  fan?: TcgCard[];
}

type Filter = "all" | DeckTier;

export function DeckGrid({ decks }: { decks: DeckCardData[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const tiersPresent = useMemo(() => {
    const set = new Set(decks.flatMap((d) => d.tiers));
    return DECK_TIERS.filter((t) => set.has(t));
  }, [decks]);

  const shown = useMemo(
    () =>
      filter === "all" ? decks : decks.filter((d) => d.tiers.includes(filter)),
    [decks, filter],
  );

  return (
    <div>
      <div className="deck-filter" role="tablist" aria-label="Filter by tier">
        <button
          type="button"
          role="tab"
          aria-selected={filter === "all"}
          className={`tcg-deck-filter__chip${filter === "all" ? " is-active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All decks
        </button>
        {tiersPresent.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={filter === t}
            className={`tcg-deck-filter__chip${filter === t ? " is-active" : ""}`}
            onClick={() => setFilter(t)}
          >
            {DECK_TIER_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="deck-grid">
        {shown.map((d) => (
          <Link
            key={d.slug}
            href={`/pokemon-tcg/decks/${d.slug}`}
            className="deck-tile"
          >
            {d.fan?.length ? <DeckCardFan cards={d.fan} /> : null}
            <div className="deck-tile__badges">
              {orderedTierBadges(d.tiers).map((b) => (
                <Badge key={b.tier} variant={b.variant} size="small">
                  {b.label}
                </Badge>
              ))}
              {d.win_rate && d.win_rate_source ? (
                <Badge variant="success" size="small">
                  {shortWinRate(d.win_rate)}
                </Badge>
              ) : null}
            </div>
            <h3 className="deck-tile__name">{d.archetype}</h3>
            <p className="deck-tile__desc">{d.meta_description}</p>
            <div className="deck-tile__meta">
              {d.cost_estimate} · {d.difficulty}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** The win_rate frontmatter is a full sentence; the hub badge wants a
 *  glanceable number. Pull the leading percentage if there is one. */
function shortWinRate(win: string): string {
  const m = win.match(/([0-9]+(?:\.[0-9]+)?%)/);
  return m ? `${m[1]} win` : "Meta data";
}
