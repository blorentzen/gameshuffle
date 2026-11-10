/**
 * The outline a page shows the moment it's tapped, while it loads (tap feedback picks, 2026-11-09, all as
 * recommended): the page's own header, then grey blocks where its content will land. A page's loading.tsx renders it;
 * pages with a BrowseHero pass the same header settings their page uses (a `hero.ts` beside the page), so the header
 * never jumps when the page arrives. Without a header, `band` draws a plain one in the page's place (Home, a game
 * space, a profile). Blocks are CDS Skeletons. One screen reader line says it's loading; the blocks are hidden.
 *
 * Loading screens stream before the page, so a page whose own code redirects or answers "not found" would lose its
 * true status: give an outline only to pages that don't (time trials redirects old links, so it has none).
 */

import type { ReactNode } from "react";
import { Container, Skeleton } from "@empac/cascadeds";
import "@/styles/page-outline.css";

export type OutlineBody = "daily" | "cards" | "list" | "space" | "profile" | "home" | "lounge";

const lines = (widths: string[]) => widths.map((w, i) => <Skeleton key={i} variant="text" width={w} className="outline__line" />);

function CardRow({ count = 3 }: { count?: number }) {
  return (
    <div className="outline__cards">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="outline__card">
          <Skeleton variant="rectangular" className="outline__box" />
          <div className="outline__card-text">{lines(["70%", "90%", "55%"])}</div>
        </div>
      ))}
    </div>
  );
}

const BODIES: Record<OutlineBody, ReactNode> = {
  daily: (
    <>
      <div className="outline__pills">{[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rectangular" className="outline__pill" />)}</div>
      <Skeleton variant="rectangular" className="outline__panel" />
      <div className="outline__text">{lines(["60%", "85%", "40%"])}</div>
    </>
  ),
  cards: (
    <>
      <Skeleton variant="text" width="14rem" className="outline__heading" />
      <CardRow count={4} />
      <Skeleton variant="text" width="18rem" className="outline__heading" />
      <CardRow count={2} />
    </>
  ),
  list: (
    <div className="outline__list">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="outline__row">
          <Skeleton variant="circular" width="4rem" height="4rem" />
          <div className="outline__card-text">{lines([`${60 + ((i * 13) % 30)}%`, "85%"])}</div>
        </div>
      ))}
    </div>
  ),
  space: (
    <>
      <div className="outline__space-head">
        <Skeleton variant="rectangular" className="outline__boxart" />
        <div className="outline__card-text">{lines(["70%", "35%"])}</div>
      </div>
      <div className="outline__btns"><Skeleton variant="rectangular" className="outline__btn" /><Skeleton variant="rectangular" className="outline__btn" /></div>
      <div className="outline__tabs">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} variant="text" width="5rem" />)}</div>
      <Skeleton variant="rectangular" className="outline__panel" />
    </>
  ),
  profile: (
    <>
      <div className="outline__profile-head">
        <Skeleton variant="circular" width="9.6rem" height="9.6rem" className="outline__avatar" />
        <div className="outline__card-text">{lines(["55%", "35%"])}</div>
      </div>
      <div className="outline__text">{lines(["90%", "70%"])}</div>
      <CardRow count={2} />
    </>
  ),
  home: (
    <>
      <div className="outline__tiles">{[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rectangular" className="outline__tile" />)}</div>
      <Skeleton variant="text" width="10rem" className="outline__heading" />
      <div className="outline__list">
        {[0, 1, 2].map((i) => (
          <div key={i} className="outline__row">
            <Skeleton variant="rectangular" width="4rem" height="4rem" />
            <div className="outline__card-text">{lines([`${55 + i * 12}%`, "40%"])}</div>
          </div>
        ))}
      </div>
      <Skeleton variant="text" width="12rem" className="outline__heading" />
      <Skeleton variant="rectangular" className="outline__panel outline__panel--short" />
    </>
  ),
  lounge: (
    <>
      <div className="outline__text">{lines(["75%"])}</div>
      <div className="outline__pills">{[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rectangular" className="outline__pill" />)}</div>
      <div className="outline__list">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="outline__row">
            <Skeleton variant="text" width="2.4rem" />
            <div className="outline__card-text">{lines([`${50 + ((i * 17) % 35)}%`])}</div>
            <Skeleton variant="text" width="6rem" />
          </div>
        ))}
      </div>
    </>
  ),
};

export function PageOutline({ body, hero, band, className }: {
  body: OutlineBody;
  /** The page's own header (its BrowseHero with the page's settings). */
  hero?: ReactNode;
  /** No header of its own: a plain dark band in its place ("tall" for Home's welcome). */
  band?: "short" | "tall";
  className?: string;
}) {
  return (
    <main className={`page-outline${className ? ` ${className}` : ""}`}>
      <p className="sr-only" role="status">Loading the page</p>
      {hero}
      {!hero && band && (
        <div className={`outline__band outline__band--${band}`} aria-hidden="true">
          <Container className="outline__band-inner">
            {band === "tall" ? (
              <>
                <div className="outline__profile-head">
                  <Skeleton variant="circular" width="6.4rem" height="6.4rem" />
                  <div className="outline__card-text">{lines(["60%", "40%"])}</div>
                </div>
              </>
            ) : null}
          </Container>
        </div>
      )}
      <div aria-hidden="true"><Container className="outline__body">{BODIES[body]}</Container></div>
    </main>
  );
}
