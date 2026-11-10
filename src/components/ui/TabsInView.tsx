"use client";

/**
 * CDS Tabs' tab bar scrolls sideways when the tabs don't fit (phones), but it opens scrolled to the start, so a
 * selected tab past the edge is hidden and no tab looks chosen (admin sweep, 2026-11-09: Tokens ▸ Rules, Originals ▸
 * Trivia, Time trials' inner tabs). Mounted once in the root layout, this scrolls each bar so its selected tab is in
 * view whenever the selected tab changes or a bar first appears. It leaves a bar alone after that, so it never fights
 * someone scrolling the bar by hand. CascadeDS gap: Tabs should do this itself (on the CDS fix list).
 */

import { useEffect } from "react";

export function TabsInView() {
  useEffect(() => {
    const seen = new WeakMap<HTMLElement, Element>();
    let frame = 0;
    const fit = () => {
      frame = 0;
      for (const bar of document.querySelectorAll<HTMLElement>(".empac-tabs__header")) {
        const tab = bar.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
        if (!tab || !bar.clientWidth || seen.get(bar) === tab) continue;
        seen.set(bar, tab);
        if (bar.scrollWidth <= bar.clientWidth + 1) continue;
        const b = bar.getBoundingClientRect();
        const t = tab.getBoundingClientRect();
        if (t.left >= b.left && t.right <= b.right) continue;
        bar.scrollLeft += t.left - b.left - (b.width - t.width) / 2;
      }
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(fit); };
    queue();
    const watch = new MutationObserver(queue);
    watch.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-selected"] });
    return () => { watch.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);
  return null;
}
