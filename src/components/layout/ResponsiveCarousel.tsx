"use client";

/**
 * A row of cards that becomes a CDS Carousel on phones. On wider screens the
 * children render unchanged inside `className` (the section's own grid), so
 * desktop keeps every card in view; on a phone the same cards swipe one at a
 * time, with arrows beside the dots, instead of a page-long stack. The server
 * renders the grid, then phones switch after hydration.
 */

import { Children, useSyncExternalStore, type ReactNode } from "react";
import { Carousel } from "@empac/cascadeds";
import { useCarouselA11y } from "@/components/ui/LabeledCarousel";

const QUERY = "(max-width: 640px)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function ResponsiveCarousel({ children, className, perSlide = 1, label }: {
  children: ReactNode;
  /** The grid class used above the phone breakpoint. */
  className?: string;
  /** Cards per slide on a phone (2 for small tiles). */
  perSlide?: number;
  /** Accessible name for the carousel region. */
  label?: string;
}) {
  const phone = useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
  const ref = useCarouselA11y<HTMLDivElement>(label);
  const items = Children.toArray(children);
  if (!phone || items.length < 2) return <div className={className}>{children}</div>;
  // The CDS carousel is the region; it takes `label` as its name (no second region around it).
  return (
    <div className="responsive-carousel" ref={ref}>
      <Carousel slidesToShow={perSlide} gap={12} showDots showArrows arrowPosition="bottom" touch keyboard>
        {items}
      </Carousel>
    </div>
  );
}
