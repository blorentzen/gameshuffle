/**
 * The drifting glyph field, for the marketing heroes.
 *
 * `.marketing-hero` bands were flat gradient, so a pillar's landing page and
 * the cards it links to shared no visual language. This is the same component
 * the event cards use, at hero opacity — the band and the things in it are
 * made of the same material, and an icon-set change carries to both.
 *
 * Quieter than a card (there is 60px type over it) and veiled toward the
 * centre, because these heroes are centre-aligned rather than left.
 */

import { IconField, type ArtCategory } from "@/components/events/EventHeaderArt";

export function MarketingHeroField({ category }: { category: ArtCategory }) {
  return (
    <>
      <IconField category={category} seed={`mk-${category}`} opacity={0.07} className="mhero__field" />
      <span className="mhero__veil" aria-hidden />
    </>
  );
}
