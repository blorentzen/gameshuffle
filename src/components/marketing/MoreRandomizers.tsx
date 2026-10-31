"use client";

/**
 * "More game randomizers" under each randomizer: a small CDS Carousel of
 * picture cards (four across on desktop, two on phones) instead of a row of
 * text links. The server passes the entries, so hidden games never reach it.
 * It shows a handful picked for this page and ends on a card for all of them
 * (`allCount`), rather than every randomizer and a long row of dots.
 */

import { Badge, Card } from "@empac/cascadeds";
import { IconLayoutGrid } from "@tabler/icons-react";
import { LabeledCarousel } from "@/components/ui/LabeledCarousel";
import { ImageComingSoon } from "@/components/ImageComingSoon";
import { EventHeaderArt, type ArtCategory } from "@/components/events/EventHeaderArt";
import { EVENTS, tagged } from "@/lib/analytics/events";

export interface MoreRandomizerEntry { slug: string; href: string; title: string; image?: string; art?: { category: ArtCategory; ramp?: [string, string] }; isNew?: boolean }

export function MoreRandomizers({ entries, allCount }: { entries: MoreRandomizerEntry[]; /** Adds the last card, "All N randomizers". */ allCount?: number }) {
  if (!entries.length) return null;
  return (
    <div className="more-rand">
      <LabeledCarousel label="More game randomizers" slidesToShow={{ mobile: 2, tablet: 3, desktop: 4 }} gap={12} showArrows arrowPosition="bottom" showDots touch keyboard>
        {entries.map((e) => (
          <Card key={e.slug} variant="outlined" padding="none" href={e.href} className={`more-rand__card ${tagged(EVENTS.randomizerCardClicked, { to: e.slug, from: "more" })}`}>
            <span className="more-rand__media">
              {/* eslint-disable-next-line @next/next/no-img-element -- CDN key art, same as the randomizer index */}
              {e.image ? <img src={e.image} alt="" loading="lazy" /> : e.art ? <EventHeaderArt category={e.art.category} ramp={e.art.ramp} seed={e.slug} motion="hover" className="more-rand__art" /> : <ImageComingSoon compact />}
              {e.isNew && <span className="more-rand__new"><Badge variant="info" size="small">New</Badge></span>}
            </span>
            <span className="more-rand__title">{e.title}</span>
          </Card>
        ))}
        {allCount ? (
          <Card key="all" variant="outlined" padding="none" href="/randomizers" className={`more-rand__card more-rand__card--all ${tagged(EVENTS.randomizerCardClicked, { to: "all", from: "more" })}`}>
            <span className="more-rand__media more-rand__media--all">
              <span className="more-rand__all-tile" aria-hidden><IconLayoutGrid size={28} stroke={2} /></span>
            </span>
            <span className="more-rand__title">Check out all {allCount} randomizers</span>
          </Card>
        ) : null}
      </LabeledCarousel>
    </div>
  );
}
