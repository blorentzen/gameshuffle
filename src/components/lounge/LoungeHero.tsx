import type { CSSProperties, ReactNode } from "react";
import { Container } from "@empac/cascadeds";
import { IconField } from "@/components/events/EventHeaderArt";
import { MmrEmblem } from "@/components/mmr/MmrEmblem";
import { divisionLook } from "@/lib/mmr/look";
import { heroColors } from "@/lib/lounge/season";

/**
 * A lounge player's header (lounge page picks, 2026-10-20, option A): the band wears the
 * division's two colors and the division emblem sits large at its edge as the header's art,
 * the way box art does on event pages. On phones the emblem fades behind the text. It is
 * the site's browse hero (same classes, glyph field, veil and curve) with the division's
 * colors in place of a pillar accent. Text colors are worked out to pass AA on the band
 * (`heroColors`).
 */
export function LoungeHero({ eyebrow, division, title, line, actions }: {
  /** One short label (a past season's "Season 2"); left out when the division label says enough. */
  eyebrow?: string | null;
  /** The division's name: the band's colors, the emblem and the small label over the name. Null = no division label. */
  division: string | null;
  title: string;
  line?: ReactNode;
  /** Buttons under the line (Compare, Share). */
  actions?: ReactNode;
}) {
  const look = divisionLook(division ?? "Placement");
  const col = heroColors(look.c, look.c2);
  const style = {
    "--lh-deep": col.deep,
    "--lh-mid": col.mid,
    "--lh-edge": col.edge,
    "--lh-label": col.label,
    "--lh-glow": col.glow,
    "--browse-hero-base": col.glow2,
    "--browse-hero-accent": col.glow,
  } as CSSProperties;
  return (
    <header className="browse-hero browse-hero--compact lounge-hero" style={style}>
      <IconField category="compete" seed="hero-compete" opacity={0.07} className="browse-hero__field" />
      <span className="browse-hero__veil" aria-hidden />
      <Container>
        <div className="lounge-hero__wrap">
          <div className="browse-hero__inner lounge-hero__inner">
            {eyebrow && <p className="marketing-eyebrow">{eyebrow}</p>}
            {division && <p className="lounge-hero__division">{division}</p>}
            <h1 className="browse-hero__title">{title}</h1>
            {line && <div className="browse-hero__sub lounge-hero__line">{line}</div>}
            {actions && <div className="lounge-hero__actions">{actions}</div>}
          </div>
          <span className="lounge-hero__emblem" aria-hidden><MmrEmblem d={look} frame="tile" /></span>
        </div>
      </Container>
      <svg className="browse-hero__curve" viewBox="0 0 1440 72" preserveAspectRatio="none" aria-hidden>
        <path d="M0,72 H1440 V34 C 940,2 520,70 0,30 Z" fill="var(--browse-hero-curve, var(--background-primary))" />
      </svg>
    </header>
  );
}
