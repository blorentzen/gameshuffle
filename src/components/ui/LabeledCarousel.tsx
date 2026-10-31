"use client";

import { useCallback, useRef, type ComponentProps, type RefCallback } from "react";
import { Carousel } from "@empac/cascadeds";

/**
 * Fixes two accessibility gaps in the CDS Carousel (raise both with CascadeDS):
 *   - Every carousel is named "Carousel", so a page with several has
 *     duplicate landmarks (axe landmark-unique). This names it `label`.
 *     When the section around it already carries that same name (a swipe row
 *     right under its heading), the carousel becomes a plain group instead of
 *     a second region with the same name.
 *   - Off-screen slides get aria-hidden but their links and buttons stay in
 *     the tab order, so a keyboard user lands on things they can't see (axe
 *     aria-hidden-focus, WCAG 4.1.2). This makes hidden slides inert until
 *     they slide into view.
 * Put the ref on an element wrapping a CDS Carousel, or use <LabeledCarousel>.
 */
export function useCarouselA11y<T extends HTMLElement>(label: string | undefined): RefCallback<T> {
  const stop = useRef<(() => void) | null>(null);
  // A callback ref, so it also catches a carousel that mounts later (ResponsiveCarousel switches on phones after hydration).
  return useCallback((root: T | null) => {
    stop.current?.();
    stop.current = null;
    if (!root) return;
    const sync = () => {
      const carousel = root.querySelector(".empac-carousel");
      if (carousel && label && carousel.getAttribute("aria-label") !== label) carousel.setAttribute("aria-label", label);
      if (carousel && label && carousel.getAttribute("role") === "region" && sameNameAsSection(root, label)) carousel.setAttribute("role", "group");
      root.querySelectorAll<HTMLElement>(".empac-carousel__slide").forEach((slide) => {
        const hidden = slide.getAttribute("aria-hidden") === "true";
        if (slide.inert !== hidden) slide.inert = hidden;
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-hidden", "aria-label", "role"] });
    stop.current = () => observer.disconnect();
  }, [label]);
}

/** The nearest labelled section around `el` is named `label` too. */
function sameNameAsSection(el: HTMLElement, label: string): boolean {
  const section = el.parentElement?.closest<HTMLElement>("section[aria-labelledby], section[aria-label], nav[aria-labelledby], nav[aria-label]");
  if (!section) return false;
  const byId = section.getAttribute("aria-labelledby");
  const name = byId ? document.getElementById(byId)?.textContent : section.getAttribute("aria-label");
  return (name ?? "").trim().toLowerCase() === label.trim().toLowerCase();
}

/** A CDS Carousel with a real name and keyboard-safe hidden slides. */
export function LabeledCarousel({ label, wrapperClassName, ...props }: ComponentProps<typeof Carousel> & { label: string; wrapperClassName?: string }) {
  const ref = useCarouselA11y<HTMLDivElement>(label);
  return <div ref={ref} className={wrapperClassName}><Carousel {...props} /></div>;
}
