"use client";

/**
 * The room's people rail (context + rooms picks 2026-11-05, 4A): it stays put as you scroll, like X's side column.
 * When it fits under the nav it sticks at the top; when it's taller than the window it scrolls with the page until its
 * foot shows, then stays there (a top worked out from its height), so it never needs a scrollbar of its own.
 */

import { useLayoutEffect, useRef, type ReactNode } from "react";

export function StickyRail({ blocks, children }: { blocks: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const room = window.innerHeight - 64 - 32;
      const tall = el.offsetHeight > room;
      el.style.setProperty("--rail-top", tall ? `${window.innerHeight - el.offsetHeight - 16}px` : "");
      el.toggleAttribute("data-tall", tall);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);
  return <div ref={ref} className="room-rail" data-blocks={blocks}>{children}</div>;
}
