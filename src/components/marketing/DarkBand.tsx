import { Container } from "@empac/cascadeds";

/**
 * Full-bleed dark section for marketing pages. Marketing routes are
 * forced-light (see `src/lib/theme/app-routes.ts`), so "dark mode" here
 * is an intentional dark band painted with primitive gray tokens (which
 * don't flip between themes) plus light text — not the app theme.
 *
 * Styling lives in `.marketing-dark-band` in globals.css so nested
 * headings / paragraphs / plain links inherit light colors. Used for the
 * homepage Pro band, the GS Pro pricing module, and CTA modules across
 * the marketing pages.
 */
export function DarkBand({
  children,
  className,
  id,
  contained = true,
  premium = false,
  curved = false,
  curveEdges = "both",
  curveColor,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** Wrap children in a CDS Container (default). Set false to manage width. */
  contained?: boolean;
  /**
   * Apply the "grand" GS Pro treatment (the M1 hero look): a rich dark radial
   * plus a slow-drifting aurora behind the content. Use for every GS
   * Pro-related module so they read as one premium family. Pair the module's
   * main heading with `className="pro-band__title"` for the shimmer headline.
   */
  premium?: boolean;
  /**
   * Curve the band's top + bottom edges so the (animated) background flows into
   * the transition instead of butting a flat line — page-colored curve masks
   * that let the band's own aurora fill the curve. `curveColor` is the color of
   * the adjacent sections (defaults to the page background).
   */
  curved?: boolean;
  /** Which edges to curve when `curved`. Use "top" for a bottom-of-page band
   *  that meets the (dark) footer, so only the light content above flows in. */
  curveEdges?: "top" | "bottom" | "both";
  curveColor?: string;
}) {
  const classes = [
    "marketing-dark-band",
    premium ? "marketing-dark-band--premium" : "",
    curved ? "marketing-dark-band--curved" : "",
    curved && curveEdges === "top" ? "marketing-dark-band--curve-top" : "",
    curved && curveEdges === "bottom" ? "marketing-dark-band--curve-bottom" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const fill = curveColor ?? "var(--background-primary)";
  return (
    <section id={id} className={classes}>
      {curved && curveEdges !== "bottom" && (
        <svg
          className="marketing-dark-band__curve marketing-dark-band__curve--top"
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path d="M0,0 H1440 V56 C 980,112 460,2 0,64 Z" style={{ fill }} />
        </svg>
      )}
      {contained ? <Container>{children}</Container> : children}
      {curved && curveEdges !== "top" && (
        <svg
          className="marketing-dark-band__curve marketing-dark-band__curve--bottom"
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path d="M0,120 H1440 V66 C 940,6 520,118 0,60 Z" style={{ fill }} />
        </svg>
      )}
    </section>
  );
}
