import type { CSSProperties } from "react";
import { CardImage } from "./CardImage";
import type { TcgCard } from "@/lib/scrydex/types";

/**
 * Fanned foreground imagery for a deck's promotional card — the deck's top
 * cards overlapping left-to-right with subtle contact shadows, the main card
 * (index 0) upright and on top of the stack. Server component (CardImage is
 * the only client piece). Positioning uses a per-card `--i` custom prop so the
 * fan math lives in CSS (deck-fan* in decks.css); built on CDS radius/shadow
 * tokens.
 */
export function DeckCardFan({
  cards,
  variant = "tile",
}: {
  cards: TcgCard[];
  /** "tile" = compact promo-card fan (4 cards); "header" = bigger page hero
   *  (up to 5 cards, larger art). */
  variant?: "tile" | "header";
}) {
  const count = variant === "header" ? 5 : 4;
  const fan = cards.slice(0, count);
  if (fan.length === 0) return null;
  return (
    <div
      className={`deck-fan${variant === "header" ? " deck-fan--header" : ""}`}
      aria-hidden="true"
    >
      {fan.map((c, i) => (
        <div
          key={c.id}
          className="deck-fan__card"
          style={{ "--i": i } as CSSProperties}
        >
          <CardImage
            images={c.images}
            name={c.name}
            size={variant === "header" ? "medium" : "small"}
          />
        </div>
      ))}
    </div>
  );
}
