import Link from "next/link";
import { Badge, Card, CardContent } from "@empac/cascadeds";
import { Button } from "@empac/cascadeds";

interface AppCardProps {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  href?: string;
  /** Optional marketing "Learn more" page for this app. */
  learnMoreHref?: string;
  comingSoon?: boolean;
  beta?: boolean;
  /** Override the primary CTA label (defaults to "Check it out"). */
  ctaLabel?: string;
  /** External `href` — opens in a new tab with rel="noopener". */
  external?: boolean;
  /** Optional secondary CTA button (rendered beside the primary). Distinct
   *  from `learnMoreHref` so a card can offer a real second action, e.g. an
   *  external "Buy now" alongside an internal "Explore". */
  secondaryHref?: string;
  secondaryLabel?: string;
  /** External `secondaryHref` — opens in a new tab. */
  secondaryExternal?: boolean;
}

export function AppCard({
  title,
  description,
  imageSrc,
  imageAlt,
  href,
  learnMoreHref,
  comingSoon = false,
  beta = false,
  ctaLabel,
  external = false,
  secondaryHref,
  secondaryLabel,
  secondaryExternal = false,
}: AppCardProps) {
  return (
    <Card variant="elevated" padding="none">
      <div style={{ position: "relative" }}>
        <img
          src={imageSrc}
          alt={imageAlt}
          style={{
            width: "100%",
            aspectRatio: "16/9",
            objectFit: "cover",
            display: "block",
          }}
        />
        {beta && (
          <span
            style={{
              position: "absolute",
              top: "var(--spacing-8)",
              left: "var(--spacing-8)",
              borderRadius: "var(--radius-8, 0.5rem)",
              boxShadow: "0 1px 4px rgba(0, 0, 0, 0.28)",
            }}
          >
            <Badge variant="info" size="small">
              Beta
            </Badge>
          </span>
        )}
      </div>
      <CardContent>
        <h2 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
          {title}
        </h2>
        <p style={{ fontWeight: 500 }}>{description}</p>
        {href ? (
          <div
            style={{
              marginTop: "var(--spacing-16)",
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-16)",
              flexWrap: "wrap",
            }}
          >
            <a
              href={href}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              <Button variant="primary">{ctaLabel ?? "Check it out"}</Button>
            </a>
            {secondaryHref ? (
              secondaryExternal ? (
                <a
                  href={secondaryHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="secondary">
                    {secondaryLabel ?? "Learn more"}
                  </Button>
                </a>
              ) : (
                <Link href={secondaryHref} style={{ textDecoration: "none" }}>
                  <Button variant="secondary">
                    {secondaryLabel ?? "Learn more"}
                  </Button>
                </Link>
              )
            ) : null}
            {learnMoreHref ? (
              // Demoted to a text link (not a second button) so each card has a
              // single clear primary action.
              <Link href={learnMoreHref} className="app-card__learn">
                Learn more →
              </Link>
            ) : null}
          </div>
        ) : comingSoon ? (
          <span
            style={{
              marginTop: "1rem",
              display: "inline-block",
              fontWeight: 700,
              textTransform: "uppercase",
              fontSize: "0.875rem",
            }}
          >
            Coming Soon
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}
