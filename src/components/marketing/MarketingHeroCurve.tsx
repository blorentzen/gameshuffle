/**
 * Curved bottom edge for the shared `.marketing-hero` band — the section below
 * flows up into the hero via an organic bezier, matching the homepage video
 * hero and the curved dark bands. Drop it as the last child of a
 * `.marketing-hero` section. `color` is the color of the section BELOW the hero
 * (defaults to the page surface); the curve paints that color so the two blend.
 */
export function MarketingHeroCurve({
  color = "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))",
}: {
  color?: string;
}) {
  return (
    <svg
      className="marketing-hero__curve"
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* Asymmetric sweep so it doesn't read as a plain arc. */}
      <path d="M0,120 L0,58 C 500,116 1000,14 1440,66 L1440,120 Z" style={{ fill: color }} />
    </svg>
  );
}
