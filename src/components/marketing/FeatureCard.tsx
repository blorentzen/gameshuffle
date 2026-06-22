import Link from "next/link";
import { Badge, Card, CardContent, Icon, Stack } from "@empac/cascadeds";
import type { IconName } from "@empac/cascadeds";

/**
 * Marketing feature card. Two variants:
 *   - `compact` — homepage / GS Pro teaser grid (icon + title + one-liner)
 *   - `full`    — /features deep-dive sections (adds a "Why it matters"
 *                 body + an anchor `id` so teasers can deep-link)
 *
 * Built on CDS `Card` + `Icon` (kebab-case registry) — no external icon
 * dependency. When `href` is set the whole card is an interactive link.
 */

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
}: FeatureCardProps) {
  const isFull = variant === "full";
  const glyphSize = isFull ? 24 : 20;

  return (
    <Card
      variant="elevated"
      padding={isFull ? "large" : "medium"}
      interactive={!!href}
      href={href}
      style={{ height: "100%", scrollMarginTop: "6rem" }}
      {...(id ? { "aria-label": title } : {})}
    >
      {/* The id lives on a wrapper span so the anchor target works even
          when Card renders as an <a>. */}
      {id ? <span id={id} /> : null}
      <CardContent>
        <Stack direction="horizontal" gap={12} align="center">
          <span
            style={{
              width: isFull ? 44 : 36,
              height: isFull ? 44 : 36,
              borderRadius: "var(--radius-md, 0.5rem)",
              background: "var(--surface-brand, var(--primary-100))",
              color: "var(--primary-700)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {iconSrc ? (
              <span
                aria-hidden="true"
                style={{
                  width: glyphSize,
                  height: glyphSize,
                  backgroundColor: "currentColor",
                  WebkitMaskImage: `url(${iconSrc})`,
                  maskImage: `url(${iconSrc})`,
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                  display: "inline-block",
                }}
              />
            ) : icon ? (
              <Icon name={icon} size={isFull ? "24" : "20"} />
            ) : null}
          </span>
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
        </Stack>

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
    <Link href={href} style={{ color: "var(--primary-600)" }}>
      {children}
    </Link>
  );
}
