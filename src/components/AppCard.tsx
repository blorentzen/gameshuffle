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
  /** Live status — green "Live" badge (mutually exclusive with `beta`). */
  live?: boolean;
  /** Override the primary CTA label (defaults to "Check it out"). */
  ctaLabel?: string;
  /** External `href` — opens in a new tab with rel="noopener". */
  external?: boolean;
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
  live = false,
  ctaLabel,
  external = false,
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
        {(beta || live) && (
          <span
            style={{
              position: "absolute",
              top: "var(--spacing-8)",
              left: "var(--spacing-8)",
              borderRadius: "var(--radius-8, 0.5rem)",
              boxShadow: "0 1px 4px rgba(0, 0, 0, 0.28)",
            }}
          >
            <Badge variant={beta ? "info" : "success"} size="small">
              {beta ? "Beta" : "Live"}
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
            {learnMoreHref ? (
              <Link href={learnMoreHref} style={{ textDecoration: "none" }}>
                <Button variant="secondary">Learn more</Button>
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
