import Link from "next/link";

/**
 * Persistent attribution line for any surface rendering TCG card data
 * (spec Phase 6, placement #1). Users pay for TOOLING, never for card art or
 * card data — this line makes ownership explicit. Exact Scrydex attribution
 * wording is pending confirmation (spec open item A4); copy here reflects the
 * required substance and links to the standalone attribution page.
 */
export function TcgAttribution({ className }: { className?: string }) {
  return (
    <p className={`tcg-attribution ${className ?? ""}`}>
      Card names, images, and game text are &copy; The Pokémon Company
      International, Nintendo, Creatures Inc., and GAME FREAK inc. GameShuffle is
      not affiliated with or endorsed by them and claims no ownership of card
      imagery or game text. Card data provided by Scrydex.{" "}
      <Link href="/legal/tcg-attribution">Full attribution &amp; rights info</Link>.
    </p>
  );
}
