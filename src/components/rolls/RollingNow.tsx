"use client";

/**
 * Rolling now (round two picks 6A, 7A, 2026-11-06): a carousel of the rolls people shared in a game space and the
 * rolls on stream in its games, two at a time on wide screens and one on a phone, with arrows and dots to move through
 * them (Britton: room to breathe, and navigation as part of the trip; never a packed grid). Each opens its post (to
 * react and comment) or the stream.
 */

import Link from "next/link";
import { CarouselItem } from "@empac/cascadeds";
import { LabeledCarousel } from "@/components/ui/LabeledCarousel";
import { UserAvatar } from "@/components/UserAvatar";
import { RollCard } from "@/components/rolls/RollCard";
import type { RollItem } from "@/lib/games/spaceData";

export type RollingCard = RollItem;

export function RollingNow({ items, label }: { items: RollingCard[]; label: string }) {
  return (
    <LabeledCarousel label={label} wrapperClassName="rolling-now" slidesToShow={{ mobile: 1, tablet: 2, desktop: 2 }} gap={16} showArrows={items.length > 2} showDots={items.length > 2} arrowPosition="bottom" touch keyboard>
      {items.map((it) => (
        <CarouselItem key={it.id}>
          <Link href={it.href} className="rolling-item">
            <RollCard compact roll={it.roll} head={
              <div className="rolling-item__who">
                {it.avatar ? <UserAvatar user={it.avatar} size={36} /> : <span className="rolling-item__blank" aria-hidden="true">{it.who.charAt(0)}</span>}
                <span><b>{it.who}</b> {it.verb}{it.live && <> <span className="person-row__live">Live</span></>}<span className="rolling-item__when">{it.when}</span></span>
              </div>
            } />
            {(it.reactions > 0 || it.comments > 0) && (
              <span className="rolling-item__foot">
                {[it.reactions ? `${it.reactions} ${it.reactions === 1 ? "reaction" : "reactions"}` : null, it.comments ? `${it.comments} ${it.comments === 1 ? "comment" : "comments"}` : null].filter(Boolean).join(" · ")}
              </span>
            )}
          </Link>
        </CarouselItem>
      ))}
    </LabeledCarousel>
  );
}
