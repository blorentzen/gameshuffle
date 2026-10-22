import Link from "next/link";
import { Badge, Card, CardContent, Icon } from "@empac/cascadeds";
import type { IconName } from "@empac/cascadeds";
import { IconTile, type TileTone } from "@/components/ui/IconTile";
import { ARROW_HOST_CLASS, ArrowCue } from "@/components/ui/ArrowLink";

/**
 * Marketing feature card. Two variants:
 *   - `compact` — homepage / GS Pro teaser grid (icon + title + one-liner)
 *   - `full`    — /features deep-dive sections (adds a "Why it matters"
 *                 body + an anchor `id` so teasers can deep-link)
 *
 * Built on CDS `Card` + `Icon` (kebab-case registry). The icon sits on the
 * shared IconTile, which the card's free-form `accent` maps to the nearest of
 * the seven tile colors (design round 3, 2026-10-20: it was a pale tinted
 * chip). When `href` is set the whole card is an interactive link and its cta
 * arrow moves when the card is hovered or focused.
 */

/** The tile color nearest an accent hex, by hue (a grey or missing accent is blue). */
function toneForAccent(accent?: string): TileTone {
  const m = accent?.match(/^#([0-9a-f]{6})$/i);
  if (!m) return "blue";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.08) return "blue";
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  const anchors: [TileTone, number][] = [["red", 0], ["orange", 30], ["green", 135], ["teal", 172], ["blue", 222], ["violet", 260], ["magenta", 315], ["red", 360]];
  let best: TileTone = "blue", gap = Infinity;
  for (const [tone, at] of anchors) { const dist = Math.abs(hue - at); if (dist < gap) { gap = dist; best = tone; } }
  return best;
}

interface FeatureCardProps {
  variant?: "compact" | "full";
  /** CDS registry icon. Ignored when `iconSrc` is set. */
  icon?: IconName;
  /**
   * Image-based icon (e.g. a brand SVG with no CDS glyph, like Discord).
   * Rendered as a CSS mask so it inherits the icon chip's color and stays
   * visually consistent with the CDS icons. Takes precedence over `icon`.
   */
  iconSrc?: string;
  title: string;
  description: string;
  /** Extra "why it matters" paragraph — rendered in `full` only. */
  detail?: string;
  /** Anchor id for deep-linking (used on /features). */
  id?: string;
  /** When set, the card becomes a link. */
  href?: string;
  /** Availability label, e.g. "Pro" or "Free". */
  availability?: string;
  /** Base color for the icon (adds per-card variety): mapped to the nearest tile color. Defaults to blue. */
  accent?: string;
  /**
   * Visible call-to-action shown at the bottom of the card (e.g. "Try it"; the arrow is drawn for you).
   * Rendered as a link-styled affordance — the whole card is already the link,
   * so this is a visual cue, not a nested anchor. Only shown when `href` is set.
   */
  cta?: string;
}

export function FeatureCard({
  variant = "compact",
  icon,
  iconSrc,
  title,
  description,
  detail,
  id,
  href,
  availability,
  accent,
  cta,
}: FeatureCardProps) {
  const isFull = variant === "full";
  return (
    <Card
      variant="elevated"
      padding={isFull ? "large" : "medium"}
      interactive={!!href}
      href={href}
      className={href ? `marketing-feature-card ${ARROW_HOST_CLASS}` : undefined}
      style={{ height: "100%", scrollMarginTop: "6rem", display: "flex", flexDirection: "column" }}
      {...(id ? { "aria-label": title } : {})}
    >
      {/* The id lives on a wrapper span so the anchor target works even
          when Card renders as an <a>. */}
      {id ? <span id={id} /> : null}
      <CardContent style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <div className="feature-card__head">
          <IconTile tone={toneForAccent(accent)} className="feature-card__tile">
            {iconSrc ? (
              <span className="feature-card__mask" style={{ WebkitMaskImage: `url(${iconSrc})`, maskImage: `url(${iconSrc})` }} />
            ) : icon ? (
              <Icon name={icon} size="24" />
            ) : null}
          </IconTile>
          <h3
            style={{
              margin: 0,
              fontSize: isFull ? "var(--font-size-20)" : "var(--font-size-18)",
              fontWeight: "var(--font-weight-semibold)",
              lineHeight: "var(--line-height-tight)",
            }}
          >
            {title}
          </h3>
        </div>

        <p
          style={{
            margin: "var(--spacing-12) 0 0",
            fontSize: isFull ? "var(--font-size-16)" : "var(--font-size-14)",
            color: "var(--text-secondary)",
            lineHeight: "var(--line-height-relaxed)",
          }}
        >
          {description}
        </p>

        {isFull && detail ? (
          <p
            style={{
              margin: "var(--spacing-12) 0 0",
              fontSize: "var(--font-size-14)",
              color: "var(--text-tertiary)",
              lineHeight: "var(--line-height-relaxed)",
            }}
          >
            <strong style={{ color: "var(--text-secondary)" }}>
              Why it matters:{" "}
            </strong>
            {detail}
          </p>
        ) : null}

        {availability ? (
          <div style={{ marginTop: "var(--spacing-16)" }}>
            <Badge
              variant={availability.toLowerCase() === "free" ? "success" : "info"}
              size="small"
            >
              {availability}
            </Badge>
          </div>
        ) : null}

        {cta && href ? (
          <div aria-hidden="true" className="feature-card__cta">
            <ArrowCue>{cta.replace(/\s*→\s*$/, "")}</ArrowCue>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Re-export for callers that want to link a compact card to an anchor
 *  without making the whole card a link (e.g. inline text CTA). */
export function FeatureCardLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} style={{ color: "var(--primary-ink-600)" }}>
      {children}
    </Link>
  );
}
