"use client";

/**
 * Container units for browsers without them. OBS before version 31 (and other streaming apps) draws browser sources
 * with Chromium 103, which has no cqw: the MMR card and the war overlay size everything from their frame's width, and
 * there they fell apart (reported 2026-11-06). On those browsers only, this measures each frame and sets `--cq` (a
 * hundredth of its width, in px); the stylesheets' `@supports not (width: 1cqw)` blocks read it, and use the window's
 * width until it's set. Modern browsers return at once.
 */

import { useEffect } from "react";

/** Every element that's a size container in an OBS source. */
const FRAMES = ".mmr, .war-obs__frame, .war-piece__frame";

export function ContainerUnitsFallback() {
  useEffect(() => {
    if (typeof CSS === "undefined" || CSS.supports("width: 1cqw") || typeof ResizeObserver === "undefined") return;
    const sizes = new ResizeObserver((entries) => {
      for (const e of entries) (e.target as HTMLElement).style.setProperty("--cq", `${e.contentRect.width / 100}px`);
    });
    const seen = new WeakSet<Element>();
    const scan = () => {
      for (const el of document.querySelectorAll(FRAMES)) if (!seen.has(el)) { seen.add(el); sizes.observe(el); }
    };
    scan();
    // Pieces come and go as the stream runs (a card appears, a war starts).
    const added = new MutationObserver(scan);
    added.observe(document.body, { childList: true, subtree: true });
    return () => { sizes.disconnect(); added.disconnect(); };
  }, []);
  return null;
}
