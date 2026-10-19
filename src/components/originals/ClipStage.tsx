"use client";

/**
 * The 9:16 stage behind the "tool moment" social videos (Britton's picks,
 * 2026-10-17; /social/clip): the hint videos' ground (social.css) with a hook
 * on top, a GameShuffle page running inside a phone-sized window, and a pill
 * with where to find it. The page is our own (same origin), shown at phone
 * width and scaled to fit; the site's navbar, footer and cookie banner are
 * hidden inside it. The recorder (scripts/.tmp/rec/social-clip.cjs) drives the
 * page through `iframe.contentWindow` while it films: taps, rolls, scrolls.
 *
 * Timing is CSS from `go`, like the other stages: the hook, then the window,
 * then the pill at --cta-at: the window shrinks up and the pill lands under it
 * (Britton's pick, 2026-10-19: nothing covers the page). `pageWidth` renders
 * the page narrower so it shows bigger. `data-ready` = the page inside has loaded and
 * been tidied, so the recorder can prepare it before filming.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { IconField, type ArtCategory } from "@/components/events/EventHeaderArt";

/** The width the page inside renders at (a common phone), before scaling. */
const PAGE_WIDTH = 390;

/** Hidden inside the framed page: the site's chrome. */
const TIDY = ".gs-nav-shell, .site-footer, .cookie-banner, nextjs-portal, .policy-banner { display: none !important; } html { scroll-behavior: auto !important; }";

export function ClipStage({ src, hook, cta, sub, accent, field, ctaAt, paused, pageWidth = PAGE_WIDTH }: {
  src: string; hook: string; cta: string; sub?: string | null; accent: string; field: ArtCategory; ctaAt: number; paused: boolean; pageWidth?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(700);
  const [ready, setReady] = useState(false);

  // The page renders at phone width and is scaled to the window's width; its height fills the window.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => {
      const s = box.clientWidth / pageWidth;
      setScale(s);
      setHeight(Math.round(box.clientHeight / s));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [pageWidth]);

  // Hide the site's chrome inside the page once it loads. The page can finish loading before
  // React hydrates (it's in the server HTML), so listen natively and also tidy one that's
  // already loaded; a reload by the recorder re-runs it.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const tidy = () => {
      const doc = frame.contentDocument;
      if (!doc?.head || doc.URL === "about:blank") return;
      if (!doc.getElementById("clip-tidy")) {
        const style = doc.createElement("style");
        style.id = "clip-tidy";
        style.textContent = TIDY;
        doc.head.append(style);
      }
      setReady(true);
    };
    const onLoad = () => { setReady(false); window.setTimeout(tidy, 50); };
    frame.addEventListener("load", onLoad);
    if (frame.contentDocument?.readyState === "complete") void Promise.resolve().then(tidy);
    return () => frame.removeEventListener("load", onLoad);
  }, []);

  return (
    <main
      className={`social-stage clip-stage browse-hero browse-hero--${accent}${paused ? "" : " go"}`}
      style={{ "--cta-at": `${ctaAt}s` } as CSSProperties}
      data-ready={ready ? "1" : undefined}
    >
      <IconField category={field} seed={`hero-${field}`} opacity={0.085} className="browse-hero__field" />
      <div className="clip-stage__top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="social-stage__logo clip-stage__logo" src="/images/fg/logos/gameshuffle-wht.svg" alt="GameShuffle" />
        <p className="clip-stage__hook">{hook}</p>
      </div>
      <div className="clip-stage__window" ref={boxRef}>
        <iframe
          ref={frameRef}
          className="clip-stage__page"
          src={src}
          title="GameShuffle"
          style={{ width: pageWidth, height, transform: `scale(${scale})` }}
        />
      </div>
      <div className="clip-stage__cta">
        <span className="social-stage__pill">{cta}</span>
        {sub && <p className="social-stage__sub">{sub}</p>}
      </div>
    </main>
  );
}
