import { Card, CardContent } from "@empac/cascadeds";
import { Button } from "@empac/cascadeds";

interface AppCardProps {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  href?: string;
  comingSoon?: boolean;
}

export function AppCard({
  title,
  description,
  imageSrc,
  imageAlt,
  href,
  comingSoon = false,
}: AppCardProps) {
  return (
    <Card variant="elevated" padding="none">
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
      <CardContent>
        <h2 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
          {title}
        </h2>
        <p style={{ fontWeight: 500 }}>{description}</p>
        {href ? (
          <a href={href} style={{ marginTop: "1rem", display: "inline-block" }}>
            <Button variant="primary">Check it out</Button>
          </a>
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
