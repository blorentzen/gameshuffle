"use client";

/**
 * "More game randomizers" under each randomizer: a small CDS Carousel of
 * picture cards (four across on desktop, two on phones) instead of a row of
 * text links. The server passes the entries, so hidden games never reach it.
 */

import { Badge, Card, Carousel } from "@empac/cascadeds";
import { ImageComingSoon } from "@/components/ImageComingSoon";

export interface MoreRandomizerEntry { slug: string; href: string; title: string; image?: string; beta?: boolean }

export function MoreRandomizers({ entries }: { entries: MoreRandomizerEntry[] }) {
  if (!entries.length) return null;
  return (
    <div className="more-rand" role="region" aria-label="More game randomizers">
      <Carousel slidesToShow={{ mobile: 2, tablet: 3, desktop: 4 }} gap={12} showArrows arrowPosition="bottom" showDots touch keyboard>
        {entries.map((e) => (
          <Card key={e.slug} variant="outlined" padding="none" href={e.href} className="more-rand__card">
            <span className="more-rand__media">
              {/* eslint-disable-next-line @next/next/no-img-element -- CDN key art, same as the randomizer index */}
              {e.image ? <img src={e.image} alt="" loading="lazy" /> : <ImageComingSoon compact />}
              {e.beta && <span className="more-rand__beta"><Badge variant="info" size="small">Beta</Badge></span>}
            </span>
            <span className="more-rand__title">{e.title}</span>
          </Card>
        ))}
      </Carousel>
    </div>
  );
}
