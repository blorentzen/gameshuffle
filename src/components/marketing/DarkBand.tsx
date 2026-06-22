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
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** Wrap children in a CDS Container (default). Set false to manage width. */
  contained?: boolean;
}) {
  return (
    <section id={id} className={`marketing-dark-band ${className ?? ""}`.trim()}>
      {contained ? <Container>{children}</Container> : children}
    </section>
  );
}
