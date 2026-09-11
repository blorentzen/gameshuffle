/**
 * Marquee feature spotlight row — a hand-built representation on one side, copy
 * on the other, sides alternating via `reverse`. Used on /gs-pro to give the
 * big features real presence instead of identical cards.
 */
import Link from "next/link";
import { Button } from "@empac/cascadeds";

export function ProSpotlight({
  eyebrow,
  title,
  body,
  media,
  reverse = false,
  cta,
}: {
  eyebrow: string;
  title: string;
  body: string;
  media: React.ReactNode;
  reverse?: boolean;
  cta?: { label: string; href: string };
}) {
  return (
    <section className={`pro-spotlight${reverse ? " pro-spotlight--reverse" : ""}`}>
      <div className="pro-spotlight__media">{media}</div>
      <div className="pro-spotlight__copy">
        <p className="marketing-eyebrow">{eyebrow}</p>
        <h3 className="pro-spotlight__title">{title}</h3>
        <p className="pro-spotlight__body">{body}</p>
        {cta && (
          <div style={{ marginTop: "var(--spacing-16)" }}>
            <Link href={cta.href} style={{ textDecoration: "none" }}>
              <Button variant="secondary">{cta.label}</Button>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
