"use client";

/**
 * Tiny hook for sections that live inside a CDS Accordion item AND
 * load their own data async. CDS measures the content's scrollHeight
 * when `item.content` (the React node reference) changes; it also
 * re-measures on window `resize`. Sections that fetch internally
 * never bump the content reference, so the accordion gets stuck at
 * whatever height the loading state had.
 *
 * This hook attaches a ResizeObserver to a ref'd root element and
 * dispatches a coalesced `window.resize` whenever the element's
 * size changes. CDS's existing resize listener picks it up and
 * re-measures the accordion content's actual height. Any other
 * window-resize listeners on the page run too, but they're all
 * written to be idempotent (or read-only) so there's no risk of
 * loops or surprise side-effects.
 *
 * Usage:
 *   const ref = useNotifyAccordionResize<HTMLDivElement>();
 *   return <div ref={ref}>…</div>;
 */

import { useEffect, useRef } from "react";

export function useNotifyAccordionResize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let rafId: number | null = null;
    const observer = new ResizeObserver(() => {
      // rAF-coalesce so a flurry of layout changes during a single
      // render commit fires one resize, not N.
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        window.dispatchEvent(new Event("resize"));
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);
  return ref;
}
