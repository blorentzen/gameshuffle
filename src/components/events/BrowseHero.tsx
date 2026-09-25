import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { Button, Container } from "@empac/cascadeds";
import { IconField, type ArtCategory } from "./EventHeaderArt";
import { lifestyle, type LifestyleSlot } from "@/data/lifestyle-imagery";

/**
 * The dark opener both browse pages share.
 *
 * It existed only on /game-nights, so the two halves of the same product read
 * as different tiers of thing: one had an aurora hero and a stated promise,
 * the other opened on a 24px heading above a filter bar. Same object, same
 * card, same browser underneath — the entrance is what set them apart.
 *
 * Accent is the one axis of difference. The indigo base is the GameShuffle
 * ground; the second aurora is the pillar's own colour, so the two pages are
 * recognisably siblings rather than recognisably the same page.
 */
export interface BrowseHeroProps {
  eyebrow: string;
  title: string;
  sub: ReactNode;
  /** Warm gold for the tabletop half, cyan for the competitive half. */
  accent: "gold" | "cyan";
  /**
   * Which glyph family drifts behind the copy, when there is no photo. Matches
   * the cards below it.
   */
  field: ArtCategory;
  /**
   * Optional lifestyle photo. Absent is the designed state, not a gap — the
   * gradient, aurora and glyph field stand on their own, so a half-filled
   * photo library ships without looking broken.
   */
  photo?: LifestyleSlot;
  primary?: { href: string; label: string } | null;
  secondary?: { href: string; label: string } | null;
}

export function BrowseHero({ eyebrow, title, sub, accent, field, photo, primary, secondary }: BrowseHeroProps) {
  const shot = photo ? lifestyle(photo) : null;
  return (
    <header className={`browse-hero browse-hero--${accent}`}>
      {shot && (
        /* Under the aurora and the glyph field, not over them: the photo is
           ground for the brand layers, so the band stays recognisably ours
           whichever photo is in it. Priority because it is above the fold. */
        <span className="browse-hero__photo" aria-hidden>
          <Image
            src={shot.src}
            alt={shot.alt}
            width={shot.width}
            height={shot.height}
            priority
            sizes="100vw"
            style={shot.focus ? { objectPosition: shot.focus } : undefined}
          />
        </span>
      )}
      {/* The glyph field is what a band wears when it has no photograph. With
          one, it is a screen door over someone's face: two competing textures
          fighting for the same surface, and the photo loses. */}
      {!shot && (
        <IconField category={field} seed={`hero-${field}`} opacity={0.085} className="browse-hero__field" />
      )}
      {/* Veils the field under the copy column only. The pattern is welcome on
          the empty right-hand side; behind a 60px headline it is just noise. */}
      <span className="browse-hero__veil" aria-hidden />
      <Container>
        <div className="browse-hero__inner">
          <p className="marketing-eyebrow">{eyebrow}</p>
          <h1 className="browse-hero__title">{title}</h1>
          <p className="browse-hero__sub">{sub}</p>
          {(primary || secondary) && (
            <div className="browse-hero__cta">
              {primary && (
                <Link href={primary.href} style={{ textDecoration: "none" }}>
                  <Button variant="primary" size="large">{primary.label}</Button>
                </Link>
              )}
              {secondary && (
                <Link href={secondary.href} style={{ textDecoration: "none" }}>
                  <Button variant="secondary" size="large">{secondary.label}</Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </Container>
      <svg className="browse-hero__curve" viewBox="0 0 1440 72" preserveAspectRatio="none" aria-hidden>
        <path d="M0,72 H1440 V34 C 940,2 520,70 0,30 Z" fill="var(--background-primary)" />
      </svg>
    </header>
  );
}
