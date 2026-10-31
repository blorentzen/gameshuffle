import { TCG_COMPANION_MARKETING_HREF } from "@/data/tcg-hub";
import { ArrowLink } from "@/components/ui/ArrowLink";

/**
 * A short pointer from a deck guide (or a Battle Box) to the free TCG
 * Companion's landing page. Rendered once by the page component, next to the
 * guide's play section, so the 13 MDX files don't each carry the link.
 * Same look as the Battle Box note on the deck pages.
 */
export function CompanionNote({
  lead = "Track damage, conditions and prizes for this deck in the free GameShuffle TCG Companion.",
}: {
  lead?: string;
}) {
  return (
    // A plain block, not an <aside>: inside <main> an aside is a nested
    // complementary landmark, which axe flags.
    <div className="deck-battlebox-note deck-companion-note">
      <p className="deck-battlebox-note__lead">{lead}</p>
      <div className="deck-battlebox-note__links">
        <ArrowLink href={TCG_COMPANION_MARKETING_HREF}>See how the Pokémon TCG Companion works</ArrowLink>
      </div>
    </div>
  );
}

/**
 * Splits a guide's markdown so the companion note can sit right after the
 * section on how to play: after the first heading that matches `after`, at the
 * next `## ` heading (or the end). Without that section it goes before
 * `before` (a later heading such as "What to Buy" or "Related"), else at the
 * end. Returns the two halves; the second may be empty.
 */
export function splitAfterSection(
  markdown: string,
  after: RegExp,
  before?: RegExp,
): [string, string] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => after.test(l));
  let cut = -1;
  if (start >= 0) {
    const next = lines.findIndex((l, i) => i > start && /^## /.test(l));
    cut = next >= 0 ? next : lines.length;
  } else if (before) {
    cut = lines.findIndex((l) => before.test(l));
  }
  if (cut < 0) cut = lines.length;
  return [lines.slice(0, cut).join("\n").trim(), lines.slice(cut).join("\n").trim()];
}
