"use client";

/**
 * On phones a tab bar scrolls sideways, and the selected tab can sit off screen (Settings ▸ Profile has eight tabs;
 * the Host and Studio bars have six). After each page change this scrolls every sideways-scrolling tab bar so its
 * selected tab is in the middle. It only moves the bar itself, never the page. The home's "What's happening" band
 * moves its own pills.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const ACTIVE = ".empac-tabs__tab--active, .empac-subnav__item--active";

function scroller(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p).overflowX;
    if ((o === "auto" || o === "scroll") && p.scrollWidth > p.clientWidth + 1) return p;
  }
  return null;
}

export function ActiveTabInView() {
  const path = usePathname();
  useEffect(() => {
    const t = window.setTimeout(() => {
      for (const el of document.querySelectorAll<HTMLElement>(ACTIVE)) {
        if (el.closest(".band")) continue;
        const box = scroller(el);
        if (!box) continue;
        const a = el.getBoundingClientRect(), b = box.getBoundingClientRect();
        box.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
      }
    }, 60);
    return () => window.clearTimeout(t);
  }, [path]);
  return null;
}
